import { graphRequest } from "@/lib/social/meta_graph";
import { AD_REFERRAL_EVENTS, referralContext } from "./catalog";
import { hashEmail, hashExternalId, hashName, hashPhone } from "./hash";
import { graphErrorMessage, isTransientGraphError } from "./meta_ads";

// Conversions API forwarder (server-only, service-role db). Scans tracked_events for the configured
// sources, builds Meta server events (hashed user_data, event_id dedup, action_source website /
// business_messaging with messaging_channel for chat-attributed conversions), queues them in capi_events
// and posts them to /{dataset-id}/events in batches with retries and backoff.

const DAY = 86_400_000;
const MAX_AGE_MS = 7 * DAY; // Meta rejects events older than 7 days.
const BATCH = 100;
const MAX_ATTEMPTS = 6;
const MESSAGING_CHANNELS = new Set(["whatsapp", "messenger", "instagram"]);

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)));

export async function loadCapiToken(db, config) {
  const { data } = await db.from("capi_secrets").select("secrets").eq("capi_config_id", config.id).maybeSingle();
  if (data?.secrets?.accessToken) return data.secrets.accessToken;
  if (!config.ad_account_id) return null;
  const { data: account } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", config.ad_account_id).maybeSingle();
  return account?.secrets?.accessToken || null;
}

const enabledMappings = (config) => (Array.isArray(config.events) ? config.events : []).filter((m) => m && m.enabled !== false && (m.sources || []).length);

function mappingFor(config, eventName) {
  return enabledMappings(config).find((m) => m.sources.includes(eventName)) || null;
}

function eventValue(mapping, trackedEvent) {
  const from = mapping.valueFrom || "none";
  if (from === "none") return null;
  if (from === "revenue") return trackedEvent.revenue == null ? null : Number(trackedEvent.revenue);
  const key = String(from).replace(/^properties\./, "");
  const raw = bag(trackedEvent.properties)[key];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// The messaging identifiers Meta needs per channel, from the config overrides or the channel connection.
function messagingIds(config, connection) {
  const m = bag(config.messaging);
  const c = bag(connection?.config);
  return {
    wabaId: m.whatsappBusinessAccountId || c.wabaId || c.waba_id || c.businessAccountId || c.whatsappBusinessAccountId || null,
    pageId: m.pageId || (connection?.channel === "messenger" ? connection.external_id : null) || c.pageId || null,
    igAccountId: m.igAccountId || (connection?.channel === "instagram" ? connection.external_id : null) || c.igUserId || null,
  };
}

// Builds one server event; returns { event, actionSource, messagingChannel, value, currency } or { skip }.
export function buildServerEvent({ config, mapping, trackedEvent, contact, referral, connection, now = Date.now() }) {
  const props = bag(trackedEvent.properties);
  const occurred = new Date(trackedEvent.occurred_at || trackedEvent.created_at || now).getTime();
  if (now - occurred > MAX_AGE_MS) return { skip: "Older than 7 days — Meta only accepts events from the last 7 days." };

  const meta = bag(contact?.metadata);
  const identities = bag(meta.identities);
  const base = compact({
    em: [hashEmail(contact?.email || props.email)].filter(Boolean),
    ph: [hashPhone(contact?.phone || props.phone)].filter(Boolean),
    fn: [hashName(contact?.first_name)].filter(Boolean),
    ln: [hashName(contact?.last_name)].filter(Boolean),
    external_id: [hashExternalId(contact?.id || trackedEvent.anonymous_id)].filter(Boolean),
    fbc: props.fbc || props._fbc || meta.fbc || null,
    fbp: props.fbp || props._fbp || meta.fbp || null,
    client_ip_address: props.ip || props.clientIp || null,
    client_user_agent: props.userAgent || props.user_agent || null,
    lead_id: props.leadgenId || props.leadId || null,
  });

  // Chat-attributed: an ad referral in a messaging channel inside the attribution window.
  const channel = referral?.channel || (MESSAGING_CHANNELS.has(props.channel) ? props.channel : null);
  const ids = messagingIds(config, connection);
  let actionSource = null;
  let messagingChannel = null;
  let userData = base;
  if (referral && MESSAGING_CHANNELS.has(channel)) {
    if (channel === "whatsapp" && ids.wabaId && referral.ctwaClid) {
      userData = compact({ ...base, whatsapp_business_account_id: ids.wabaId, ctwa_clid: referral.ctwaClid });
    } else if (channel === "messenger" && ids.pageId && identities.messenger) {
      userData = compact({ ...base, page_id: ids.pageId, page_scoped_user_id: identities.messenger });
    } else if (channel === "instagram" && ids.igAccountId && identities.instagram) {
      userData = compact({ ...base, ig_account_id: ids.igAccountId, ig_sid: identities.instagram });
    } else {
      userData = null;
    }
    if (userData) {
      actionSource = "business_messaging";
      messagingChannel = channel;
    } else {
      userData = base;
    }
  }
  if (!actionSource) actionSource = trackedEvent.url && base.client_user_agent ? "website" : "system_generated";
  if (!Object.keys(userData).length) return { skip: "No customer information to match on." };

  const value = eventValue(mapping, trackedEvent);
  const currency = (trackedEvent.currency || bag(config.value_mapping).currency || "USD").toUpperCase();
  const eventName = actionSource === "business_messaging" ? mapping.messagingEvent || mapping.metaEvent : mapping.metaEvent;
  const event = compact({
    event_name: eventName,
    event_time: Math.floor(occurred / 1000),
    event_id: String(props.eventId || props.event_id || `ge_${trackedEvent.id}`),
    action_source: actionSource,
    messaging_channel: messagingChannel,
    event_source_url: actionSource === "website" ? trackedEvent.url : null,
    user_data: userData,
    custom_data: compact({
      value: value == null ? null : Math.round(value * 100) / 100,
      currency: value == null ? null : currency,
      order_id: props.orderId || props.order_id || null,
      content_name: props.formName || props.name || null,
    }),
  });
  return { event, actionSource, messagingChannel, value, currency: value == null ? null : currency };
}

// The latest ad referral per contact inside the attribution window.
async function referralsByContact(db, projectId, contactIds, windowDays, now) {
  const map = new Map();
  if (!contactIds.length) return map;
  const since = new Date(now - Math.max(1, windowDays) * DAY).toISOString();
  const { data } = await db
    .from("tracked_events")
    .select("contact_id, name, properties, occurred_at")
    .eq("project_id", projectId)
    .in("name", AD_REFERRAL_EVENTS)
    .in("contact_id", contactIds)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  for (const row of data || []) {
    if (map.has(row.contact_id)) continue;
    const ctx = referralContext(row.properties);
    map.set(row.contact_id, { ...ctx, channel: ctx.channel || row.properties?.channel || null, at: row.occurred_at });
  }
  return map;
}

async function connectionsByChannel(db, projectId) {
  const { data } = await db
    .from("channel_connections")
    .select("id, channel, external_id, config")
    .eq("project_id", projectId)
    .in("channel", [...MESSAGING_CHANNELS])
    .eq("status", "connected")
    .is("deleted_at", null);
  const map = new Map();
  for (const row of data || []) if (!map.has(row.channel)) map.set(row.channel, row);
  return map;
}

// Scans new tracked events since the config's cursor and queues them; returns how many were queued/skipped.
export async function enqueueConversions(db, config, { now = Date.now(), limit = 500 } = {}) {
  const mappings = enabledMappings(config);
  const sources = [...new Set(mappings.flatMap((m) => m.sources))];
  if (!sources.length) return { enqueued: 0, skipped: 0 };
  const cursor = config.cursor_at || new Date(now - DAY).toISOString();
  const { data: events, error } = await db
    .from("tracked_events")
    .select("*")
    .eq("project_id", config.project_id)
    .in("name", sources)
    .gt("created_at", cursor)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[ads.capi.scan]", error.message);
    return { enqueued: 0, skipped: 0, error: error.message };
  }
  if (!events?.length) return { enqueued: 0, skipped: 0 };

  const contactIds = [...new Set(events.map((e) => e.contact_id).filter(Boolean))];
  const [{ data: contacts }, referrals, connections] = await Promise.all([
    contactIds.length
      ? db.from("contacts").select("id, email, phone, first_name, last_name, metadata").in("id", contactIds)
      : Promise.resolve({ data: [] }),
    referralsByContact(db, config.project_id, contactIds, config.attribution_window_days || 7, now),
    connectionsByChannel(db, config.project_id),
  ]);
  const contactMap = new Map((contacts || []).map((c) => [c.id, c]));

  const rows = [];
  for (const trackedEvent of events) {
    const mapping = mappingFor(config, trackedEvent.name);
    if (!mapping) continue;
    const contact = contactMap.get(trackedEvent.contact_id) || null;
    const referral = contact ? referrals.get(contact.id) || null : null;
    const connection = referral?.channel ? connections.get(referral.channel) || null : null;
    const built = buildServerEvent({ config, mapping, trackedEvent, contact, referral, connection, now });
    rows.push({
      project_id: config.project_id,
      capi_config_id: config.id,
      tracked_event_id: trackedEvent.id,
      contact_id: trackedEvent.contact_id,
      event_name: built.event?.event_name || mapping.metaEvent,
      event_id: built.event?.event_id || `ge_${trackedEvent.id}`,
      action_source: built.actionSource || "website",
      messaging_channel: built.messagingChannel || null,
      status: built.skip ? "skipped" : "queued",
      error: built.skip || null,
      value: built.value ?? null,
      currency: built.currency ?? null,
      event_time: new Date(trackedEvent.occurred_at || trackedEvent.created_at).toISOString(),
      payload: built.event || {},
      next_attempt_at: new Date(now).toISOString(),
    });
  }
  if (rows.length) {
    const { error: insertError } = await db
      .from("capi_events")
      .upsert(rows, { onConflict: "capi_config_id,tracked_event_id", ignoreDuplicates: true });
    if (insertError) {
      console.error("[ads.capi.enqueue]", insertError.message);
      return { enqueued: 0, skipped: 0, error: insertError.message };
    }
  }
  await db.from("capi_configs").update({ cursor_at: events[events.length - 1].created_at }).eq("id", config.id);
  return { enqueued: rows.filter((r) => r.status === "queued").length, skipped: rows.filter((r) => r.status === "skipped").length };
}

async function postEvents(config, token, payloads, { testEventCode } = {}) {
  return graphRequest(`${config.dataset_id}/events`, {
    token,
    method: "POST",
    body: { data: payloads, ...(testEventCode ? { test_event_code: testEventCode } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
}

const backoff = (attempts) => Math.min(6 * 3_600_000, 2 ** attempts * 60_000);

async function markSent(db, rows, res) {
  const now = new Date().toISOString();
  const response = { events_received: res.data?.events_received ?? null, fbtrace_id: res.data?.fbtrace_id ?? null, messages: res.data?.messages || [] };
  const { error } = await db
    .from("capi_events")
    .update({ status: "sent", sent_at: now, response, error: null })
    .in("id", rows.map((r) => r.id));
  if (error) console.error("[ads.capi.markSent]", error.message);
}

async function markFailure(db, row, res, { final }) {
  const attempts = (row.attempts || 0) + 1;
  const giveUp = final || attempts >= MAX_ATTEMPTS;
  await db
    .from("capi_events")
    .update({
      status: giveUp ? "failed" : "queued",
      attempts,
      next_attempt_at: new Date(Date.now() + backoff(attempts)).toISOString(),
      error: graphErrorMessage(res, "Meta didn't accept the event."),
      response: { error: res.data?.error || null, status: res.status },
    })
    .eq("id", row.id);
  return giveUp;
}

// Posts queued events for one config. Transient failures back off and retry; a rejected batch is retried
// one event at a time so a single bad event doesn't block the rest.
export async function flushCapiQueue(db, config, token, { limit = 500, deadline = Infinity } = {}) {
  const { data: queued } = await db
    .from("capi_events")
    .select("*")
    .eq("capi_config_id", config.id)
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  let sent = 0;
  let failed = 0;
  let lastError = null;
  const testEventCode = config.test_mode ? config.test_event_code || null : null;
  for (let i = 0; i < (queued || []).length && Date.now() < deadline; i += BATCH) {
    const batch = queued.slice(i, i + BATCH);
    const res = await postEvents(config, token, batch.map((r) => r.payload), { testEventCode });
    if (res.ok) {
      await markSent(db, batch, res);
      sent += batch.length;
      continue;
    }
    lastError = graphErrorMessage(res);
    if (isTransientGraphError(res) || batch.length === 1) {
      for (const row of batch) if (await markFailure(db, row, res, { final: !isTransientGraphError(res) })) failed += 1;
      if (isTransientGraphError(res)) break;
      continue;
    }
    for (const row of batch) {
      const single = await postEvents(config, token, [row.payload], { testEventCode });
      if (single.ok) {
        await markSent(db, [row], single);
        sent += 1;
      } else {
        lastError = graphErrorMessage(single);
        if (await markFailure(db, row, single, { final: !isTransientGraphError(single) })) failed += 1;
      }
    }
  }
  if (sent || failed) {
    await db
      .from("capi_configs")
      .update({
        sent_count: (config.sent_count || 0) + sent,
        failed_count: (config.failed_count || 0) + failed,
        ...(sent ? { last_sent_at: new Date().toISOString() } : {}),
        last_error: failed ? lastError : null,
      })
      .eq("id", config.id);
  }
  return { sent, failed };
}

// One test event through Meta's Test Events tool: built from the latest matching tracked event when one
// exists in the last 7 days, otherwise a minimal labelled test event. Always carries test_event_code.
export async function sendCapiTestEvent(db, config, token) {
  const mappings = enabledMappings(config);
  const mapping = mappings[0] || { metaEvent: "Lead", messagingEvent: "LeadSubmitted", valueFrom: "none", sources: [] };
  const sources = [...new Set(mappings.flatMap((m) => m.sources))];
  let built = null;
  let trackedEvent = null;
  if (sources.length) {
    const { data } = await db
      .from("tracked_events")
      .select("*")
      .eq("project_id", config.project_id)
      .in("name", sources)
      .gte("occurred_at", new Date(Date.now() - MAX_AGE_MS + 3_600_000).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(1);
    trackedEvent = data?.[0] || null;
  }
  if (trackedEvent) {
    const { data: contact } = trackedEvent.contact_id
      ? await db.from("contacts").select("id, email, phone, first_name, last_name, metadata").eq("id", trackedEvent.contact_id).maybeSingle()
      : { data: null };
    const referrals = contact ? await referralsByContact(db, config.project_id, [contact.id], config.attribution_window_days || 7, Date.now()) : new Map();
    const referral = contact ? referrals.get(contact.id) || null : null;
    const connections = referral ? await connectionsByChannel(db, config.project_id) : new Map();
    built = buildServerEvent({
      config,
      mapping: mappingFor(config, trackedEvent.name) || mapping,
      trackedEvent,
      contact,
      referral,
      connection: referral ? connections.get(referral.channel) || null : null,
    });
    if (built.skip) built = null;
  }
  if (!built) {
    const event = {
      event_name: mapping.metaEvent,
      event_time: Math.floor(Date.now() / 1000),
      event_id: `ge_test_${crypto.randomUUID()}`,
      action_source: "system_generated",
      user_data: { external_id: [hashExternalId(`geiger-test-${config.id}`)] },
    };
    built = { event, actionSource: "system_generated", messagingChannel: null, value: null, currency: null };
  }
  const res = await postEvents(config, token, [built.event], { testEventCode: config.test_event_code });
  const now = new Date().toISOString();
  const { data: logged } = await db
    .from("capi_events")
    .insert({
      project_id: config.project_id,
      capi_config_id: config.id,
      tracked_event_id: null,
      contact_id: trackedEvent?.contact_id || null,
      event_name: built.event.event_name,
      event_id: `${built.event.event_id}_test_${Date.now()}`,
      action_source: built.actionSource,
      messaging_channel: built.messagingChannel,
      status: res.ok ? "sent" : "failed",
      is_test: true,
      attempts: 1,
      value: built.value,
      currency: built.currency,
      event_time: new Date(built.event.event_time * 1000).toISOString(),
      payload: built.event,
      response: res.ok ? res.data || {} : { error: res.data?.error || null, status: res.status },
      error: res.ok ? null : graphErrorMessage(res),
      sent_at: res.ok ? now : null,
      metadata: { testEventCode: config.test_event_code, sourceTrackedEventId: trackedEvent?.id || null },
    })
    .select("*")
    .single();
  return { ok: res.ok, error: res.ok ? null : graphErrorMessage(res), event: logged, response: res.data || null };
}

// Event Match Quality per event as Meta's Dataset Quality API reports it (score 0–10, match-key coverage).
const QUALITY_FIELDS = "web{event_name,event_match_quality,event_coverage,data_freshness}";
const pct = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function summarizeDatasetQuality(data) {
  const rows = Array.isArray(data?.web) ? data.web : [];
  return rows
    .map((r) => {
      const emq = bag(r.event_match_quality);
      return {
        eventName: String(r.event_name || ""),
        score: pct(emq.composite_score),
        matchKeys: (Array.isArray(emq.match_key_feedback) ? emq.match_key_feedback : [])
          .map((k) => ({ key: String(k?.identifier || ""), coverage: pct(k?.coverage?.percentage) }))
          .filter((k) => k.key),
        coverage: pct(bag(r.event_coverage).percentage),
        freshness: bag(r.data_freshness).upload_frequency || null,
      };
    })
    .filter((r) => r.eventName);
}

// Fetches match quality from Meta and keeps the latest report on the config (metadata.quality).
export async function fetchDatasetQuality(db, config, token) {
  const res = await graphRequest("dataset_quality", { token, query: { dataset_id: config.dataset_id, fields: QUALITY_FIELDS } });
  const previous = bag(bag(config.metadata).quality);
  const quality = res.ok
    ? { fetchedAt: new Date().toISOString(), events: summarizeDatasetQuality(res.data), error: null }
    : { ...previous, events: Array.isArray(previous.events) ? previous.events : [], error: graphErrorMessage(res, "Meta didn't return match quality.") };
  const { data } = await db
    .from("capi_configs")
    .update({ metadata: { ...bag(config.metadata), quality } })
    .eq("id", config.id)
    .select("*")
    .single();
  return { ok: res.ok, error: quality.error, config: data || config, quality };
}

// Worker entry: every active config with a dataset + token is scanned and flushed within the deadline.
export async function runCapiForwarder(db, { now = Date.now(), deadline = Infinity } = {}) {
  const { data: configs } = await db.from("capi_configs").select("*").eq("status", "active").is("deleted_at", null).limit(100);
  const summary = { configs: 0, enqueued: 0, skipped: 0, sent: 0, failed: 0 };
  for (const config of configs || []) {
    if (Date.now() > deadline) break;
    if (!config.dataset_id) continue;
    const token = await loadCapiToken(db, config);
    if (!token) continue;
    summary.configs += 1;
    const queued = await enqueueConversions(db, config, { now });
    summary.enqueued += queued.enqueued || 0;
    summary.skipped += queued.skipped || 0;
    const { data: fresh } = await db.from("capi_configs").select("*").eq("id", config.id).single();
    const flushed = await flushCapiQueue(db, fresh || config, token, { deadline });
    summary.sent += flushed.sent;
    summary.failed += flushed.failed;
  }
  return summary;
}
