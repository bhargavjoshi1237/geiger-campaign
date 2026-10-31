import { resolveAudience, resolveAudienceDetailed } from "@/lib/audience/resolve";
import { getDailySendCap } from "@/lib/deliverability/warmup";
import { isEmailConfigured } from "@/lib/email/client";
import { loadConnection } from "@/lib/messaging/connections";
import { dispatch } from "@/lib/messaging/dispatch";
import { ApiError, badRequest, notConfigured, notFound } from "@/lib/server/http";
import { isSigningConfigured } from "@/lib/server/tokens";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { emitWebhook } from "@/lib/webhooks/emit";
import { abPlan, assignVariant, chooseWinner } from "./ab_send";
import { isCampaignApproved } from "./approvals";
import { campaignText, messageContext, recipientMessage, snapshotHtml, testMessage } from "./messages";
import { CONVERSION_EVENTS, refreshCampaignMetrics, selectAll } from "./metrics";
import { buildCampaignReport } from "./report";
import {
  DEFAULT_SEND_TIME,
  applyQuietHours,
  buildOpenProfiles,
  localTimeDueAt,
  nextLocalOccurrence,
  optimizedDueAt,
  parseLocalTime,
  safeTimeZone,
  zoneOffsetHours,
  zonedParts,
} from "./send_time";

// The campaign sending pipeline (server-only, service-role db). A launch creates a send job
// (campaign_sends) and snapshots the audience into a per-recipient outbox (campaign_send_recipients)
// with a due time per strategy; ticks claim due recipients in bounded batches and hand each to
// dispatch(), whose idempotency key (campaign:<id>:<contact>) guarantees a contact is never sent the
// same campaign twice — an uncertain provider outcome is recorded, never blindly resent.

export const LIVE_JOB = ["preparing", "sending", "waiting", "paused"];
const ACTIVE_JOB = ["preparing", "sending", "waiting"];
const BATCH = 50;
const CONCURRENCY = 5;
const CHUNK = 500;
// .in() filters travel in the URL; keep id lists short.
const IN_CHUNK = 150;
const STALE_CLAIM_MS = 10 * 60_000;
const HOUR_MS = 3_600_000;
const SENT_STATUSES = new Set(["sent", "delivered", "opened", "clicked", "read", "replied", "bounced", "complained", "unsubscribed"]);
const STARTABLE = new Set(["draft", "approved", "in_review", "scheduled", "cancelled", "failed"]);
const TESTABLE_CHANNELS = new Set(["email", "sms", "whatsapp"]);
const CHANNEL_LABEL = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", push: "Push", in_app: "In-app messaging", rcs: "RCS" };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9\s().-]{7,20}$/;

const conflict = (message, code = "conflict") => new ApiError(409, message, code);
const chunks = (items, size = CHUNK) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const iso = (value = Date.now()) => new Date(value).toISOString();

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// --- Loading -------------------------------------------------------------------------

export async function loadCampaign(db, projectId, campaignId) {
  const { data, error } = await db
    .from("campaigns")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", campaignId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ApiError(500, "Couldn't load the campaign.", "load_failed");
  if (!data) throw notFound("Campaign not found.");
  return data;
}

export async function loadSendTimeSettings(db, projectId) {
  const { data } = await db.from("send_time_settings").select("*").eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (!data) return { ...DEFAULT_SEND_TIME };
  return {
    enabled: !!data.enabled,
    strategy: data.strategy === "timezone" ? "timezone" : "optimized",
    fallbackHour: Number(data.fallback_hour ?? DEFAULT_SEND_TIME.fallbackHour),
    windowHours: Number(data.window_hours ?? DEFAULT_SEND_TIME.windowHours),
    minOpens: Number(data.min_opens ?? DEFAULT_SEND_TIME.minOpens),
    localTime: data.local_time || DEFAULT_SEND_TIME.localTime,
  };
}

async function liveJob(db, campaignId) {
  const { data } = await db
    .from("campaign_sends")
    .select("*")
    .eq("campaign_id", campaignId)
    .in("status", LIVE_JOB)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// The explicit strategy (saved + request override); the workspace default applies when none is set.
function resolveStrategy(saved = {}, override = {}, sto = DEFAULT_SEND_TIME) {
  const merged = { ...(saved || {}), ...(override || {}) };
  const mode = ["now", "scheduled", "timezone", "optimized"].includes(merged.mode)
    ? merged.mode
    : sto.enabled
      ? sto.strategy
      : "now";
  return {
    mode,
    localTime: merged.localTime || sto.localTime,
    windowHours: Number(merged.windowHours) || sto.windowHours,
    fallbackHour: Number.isFinite(Number(merged.fallbackHour)) ? Number(merged.fallbackHour) : sto.fallbackHour,
    minOpens: Number(merged.minOpens) || sto.minOpens,
    explicitLocalTime: Boolean(merged.localTime),
  };
}

// --- Preflight ---------------------------------------------------------------------------

function sendWarnings(campaign, settings, { recipients = 0, cap = null } = {}) {
  const warnings = [];
  if (campaign.channel === "email" && !settings.branding?.address) {
    warnings.push("Add your postal address in brand settings — marketing email must include it (CAN-SPAM).");
  }
  if (cap != null && recipients > cap) {
    warnings.push(`Your warm-up plan allows ${cap.toLocaleString("en-US")} sends a day, so this campaign will take about ${Math.ceil(recipients / Math.max(1, cap))} days.`);
  }
  return warnings;
}

// Throws the one thing that would make every send fail, before anything is queued.
async function preflight(db, projectId, campaign) {
  const channel = campaign.channel || "email";
  if (channel === "email") {
    if (!isEmailConfigured()) throw notConfigured("Email delivery isn't configured. Set GEIGER_EMAIL_API_KEY to a geiger-dash email API key.");
    if (!isSigningConfigured()) throw notConfigured("Set CAMPAIGN_SIGNING_SECRET so tracking and unsubscribe links can be signed.");
    if (process.env.NODE_ENV === "production" && !process.env.CAMPAIGN_PUBLIC_URL && !process.env.NEXT_PUBLIC_APP_URL) {
      throw notConfigured("Set CAMPAIGN_PUBLIC_URL so tracking and unsubscribe links point at this app.");
    }
    if (!String(campaign.subject || "").trim()) throw badRequest("Add a subject line before sending.");
    const blocks = campaign.content?.blocks;
    if (!(Array.isArray(blocks) && blocks.length) && !campaign.html) throw badRequest("Add content before sending.");
    return { connectionId: null };
  }
  const { connection } = await loadConnection(db, projectId, channel);
  if (!connection) throw conflict(`${CHANNEL_LABEL[channel] || channel} isn't connected. Connect it in Settings → Connections first.`, "not_connected");
  if (!campaignText(campaign).trim() && !campaign.content?.template) throw badRequest("Add a message before sending.");
  return { connectionId: connection.id };
}

function assertAudience(campaign) {
  const a = campaign.audience || {};
  if (!(a.all === true || a.listIds?.length || a.segmentIds?.length)) throw badRequest("Choose at least one list or segment to send to.");
}

async function assertApproved(db, projectId, campaignId) {
  const approval = await isCampaignApproved(db, projectId, campaignId);
  if (approval?.required && !approval?.approved) {
    throw conflict(approval.reason || "This campaign needs approval before it can be sent or scheduled.", "approval_required");
  }
}

// --- Estimate ------------------------------------------------------------------------------

export async function estimateCampaign(db, projectId, campaignId) {
  const campaign = await loadCampaign(db, projectId, campaignId);
  const channel = campaign.channel || "email";
  const [settings, estimate, cap] = await Promise.all([
    getWorkspaceSettings(db, projectId),
    resolveAudienceDetailed(db, projectId, campaign.audience || {}, { channel }),
    getDailySendCap(db, projectId, { channel }),
  ]);
  const recipients = estimate.recipients?.length || 0;
  return {
    recipients,
    candidates: estimate.candidates || 0,
    excluded: estimate.excluded,
    dailyCap: cap ?? null,
    warnings: sendWarnings(campaign, settings, { recipients, cap }),
  };
}

// --- Launch ----------------------------------------------------------------------------------

async function createJob(db, { campaign, plan, total, scheduledFor = null, userId = null, status = "preparing", error = null }) {
  const ab = abPlan(campaign);
  const { data, error: insertError } = await db
    .from("campaign_sends")
    .insert({
      project_id: campaign.project_id,
      campaign_id: campaign.id,
      channel: campaign.channel || "email",
      status,
      strategy: plan,
      ab: ab
        ? { enabled: true, phase: "testing", testPercent: ab.testPercent, metric: ab.winnerMetric, durationHours: ab.durationHours, variants: ab.keys }
        : {},
      total,
      scheduled_for: scheduledFor,
      error,
      created_by: userId,
      ...(status === "failed" ? { completed_at: iso() } : {}),
    })
    .select("*")
    .single();
  if (insertError) {
    if (insertError.code === "23505") throw conflict("This campaign already has a send in progress.", "already_sending");
    console.error("[campaigns.sender.createJob]", insertError.message);
    throw new ApiError(500, "Couldn't start the send.", "start_failed");
  }
  return data;
}

// POST …/send. Returns { response, run } — run() continues the send after the response (route's after()).
export async function startCampaignSend(db, { projectId, campaignId, mode = "now", scheduledAt = null, strategy = null, userId = null }) {
  const campaign = await loadCampaign(db, projectId, campaignId);
  if (campaign.status === "sending") throw conflict("This campaign is already sending.", "already_sending");
  if (campaign.status === "sent") throw conflict("This campaign has already been sent.", "already_sent");
  if (campaign.status === "paused") throw conflict("This campaign is paused — resume it instead.", "paused");
  if (!STARTABLE.has(campaign.status)) throw conflict(`A ${campaign.status} campaign can't be sent.`);
  if (mode !== "now" && mode !== "schedule") throw badRequest('mode must be "now" or "schedule".');

  assertAudience(campaign);
  await assertApproved(db, projectId, campaignId);
  const settings = await getWorkspaceSettings(db, projectId);
  await preflight(db, projectId, campaign);
  const sto = await loadSendTimeSettings(db, projectId);
  const savedStrategy = { ...(campaign.send_strategy || {}), ...(strategy || {}) };
  const plan = resolveStrategy(campaign.send_strategy, strategy, sto);

  const audience = await resolveAudience(db, projectId, campaign.audience || {}, { channel: campaign.channel || "email" });
  if (!audience?.length) throw conflict("No one in this audience can receive this campaign.", "empty_audience");
  const cap = await getDailySendCap(db, projectId, { channel: campaign.channel || "email" });
  const warnings = sendWarnings(campaign, settings, { recipients: audience.length, cap });

  if (mode === "schedule") {
    const at = Date.parse(scheduledAt || "");
    if (Number.isNaN(at)) throw badRequest("scheduledAt must be a valid date.");
    if (at < Date.now() + 60_000) throw badRequest("Pick a time at least a minute from now.");
    const { error } = await db
      .from("campaigns")
      .update({ status: "scheduled", scheduled_at: iso(at), send_strategy: savedStrategy })
      .eq("id", campaign.id);
    if (error) throw new ApiError(500, "Couldn't schedule the campaign.", "schedule_failed");
    return { response: { status: "scheduled", scheduledAt: iso(at), recipients: audience.length, warnings }, run: null };
  }

  const job = await createJob(db, { campaign, plan, total: audience.length, userId });
  const snapshot = snapshotHtml(campaign, settings);
  const { error } = await db
    .from("campaigns")
    .update({ status: "sending", scheduled_at: null, send_strategy: savedStrategy, ...(snapshot ? { html: snapshot } : {}) })
    .eq("id", campaign.id);
  if (error) {
    await db.from("campaign_sends").update({ status: "failed", error: "Couldn't mark the campaign as sending.", completed_at: iso() }).eq("id", job.id);
    throw new ApiError(500, "Couldn't start the send.", "start_failed");
  }
  return {
    response: { status: "sending", scheduledAt: null, recipients: audience.length, sendId: job.id, warnings },
    run: (deadline) => processSendJob(db, job.id, { deadline, audience }),
  };
}

// A scheduled campaign whose time has come (worker). Failures land on a failed job, visible in the report.
async function launchScheduled(db, campaign) {
  const sto = await loadSendTimeSettings(db, campaign.project_id);
  const plan = resolveStrategy(campaign.send_strategy, null, sto);
  const fail = async (message) => {
    await createJob(db, { campaign, plan, total: 0, scheduledFor: campaign.scheduled_at, status: "failed", error: message }).catch(() => null);
    await db.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return null;
  };
  try {
    assertAudience(campaign);
    await assertApproved(db, campaign.project_id, campaign.id);
    await preflight(db, campaign.project_id, campaign);
  } catch (error) {
    return fail(error instanceof ApiError ? error.message : "The campaign couldn't be prepared.");
  }
  let job;
  try {
    job = await createJob(db, { campaign, plan, total: 0, scheduledFor: campaign.scheduled_at });
  } catch {
    return null;
  }
  const settings = await getWorkspaceSettings(db, campaign.project_id);
  const snapshot = snapshotHtml(campaign, settings);
  await db.from("campaigns").update({ status: "sending", ...(snapshot ? { html: snapshot } : {}) }).eq("id", campaign.id);
  return job;
}

// When a scheduled campaign must be prepared: timezone sends start as soon as the earliest zone
// (UTC+14) reaches the chosen wall-clock time; everything else at scheduled_at.
function preparesAt(campaign, sto, workspaceZone) {
  const at = Date.parse(campaign.scheduled_at);
  const plan = resolveStrategy(campaign.send_strategy, null, sto);
  if (plan.mode !== "timezone") return at;
  return at - (14 - zoneOffsetHours(workspaceZone, at)) * HOUR_MS;
}

// --- Preparation (audience snapshot) ------------------------------------------------------

async function recentSendCounts(db, projectId, channel, contactIds) {
  const since = iso(Date.now() - 7 * 86_400_000);
  const counts = new Map();
  for (const ids of chunks(contactIds, IN_CHUNK)) {
    const { data } = await db
      .from("deliveries")
      .select("contact_id")
      .eq("project_id", projectId)
      .eq("channel", channel)
      .in("source_type", ["campaign", "broadcast"])
      .gte("created_at", since)
      .in("contact_id", ids)
      .limit(10_000);
    for (const row of data || []) counts.set(row.contact_id, (counts.get(row.contact_id) || 0) + 1);
  }
  return counts;
}

async function openProfiles(db, projectId, channel) {
  const since = iso(Date.now() - 180 * 86_400_000);
  const rows = await selectAll(
    () =>
      db
        .from("deliveries")
        .select("contact_id, opened_at")
        .eq("project_id", projectId)
        .eq("channel", channel)
        .not("opened_at", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false }),
    { max: 50_000 },
  );
  return buildOpenProfiles(rows);
}

// The instant one recipient is due under the job's strategy.
function dueFor(contact, { plan, start, profiles, workspaceZone, scheduledFor, quietHours, channel }) {
  const zone = safeTimeZone(contact.timezone, workspaceZone);
  let at;
  if (plan.mode === "timezone") {
    let date = null;
    let localTime = plan.localTime;
    if (scheduledFor) {
      const p = zonedParts(scheduledFor, workspaceZone);
      date = { year: p.year, month: p.month, day: p.day };
      if (!plan.explicitLocalTime) localTime = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    }
    at = localTimeDueAt({ start, localTime, date, timeZone: zone });
  } else if (plan.mode === "optimized") {
    at = optimizedDueAt({ contactId: contact.id, start, profiles, settings: plan, timeZone: zone }).at;
  } else {
    at = new Date(start);
  }
  if (channel !== "email" && quietHours) at = applyQuietHours(at, quietHours, zone);
  return at;
}

async function prepareJob(db, job, campaign, { audience = null } = {}) {
  const projectId = campaign.project_id;
  const channel = campaign.channel || "email";
  const settings = await getWorkspaceSettings(db, projectId);
  const rows = audience || (await resolveAudience(db, projectId, campaign.audience || {}, { channel }));
  if (!rows?.length) {
    await db.from("campaign_sends").update({ status: "failed", error: "No one in this audience can receive this campaign.", completed_at: iso() }).eq("id", job.id);
    await db.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return null;
  }
  const plan = job.strategy?.mode ? job.strategy : resolveStrategy(campaign.send_strategy, null, await loadSendTimeSettings(db, projectId));
  const workspaceZone = safeTimeZone(settings.general?.timezone);
  const scheduledFor = job.scheduled_for ? new Date(job.scheduled_for) : null;
  const start = new Date(Math.max(Date.now(), scheduledFor?.getTime() || 0));
  const profiles = plan.mode === "optimized" ? await openProfiles(db, projectId, channel) : null;
  const cap = Number(settings.sending?.weeklyFrequencyCap) || 0;
  const recent = cap ? await recentSendCounts(db, projectId, channel, rows.map((r) => r.id)) : null;
  const ab = abPlan(campaign);
  const now = iso();

  let skipped = 0;
  let lastTestDue = start.getTime();
  const records = rows.map((contact) => {
    const base = { project_id: projectId, send_id: job.id, campaign_id: campaign.id, contact_id: contact.id, address: String(contact.address) };
    if (recent && (recent.get(contact.id) || 0) >= cap) {
      skipped += 1;
      return { ...base, status: "skipped", error: "Weekly frequency cap reached.", processed_at: now };
    }
    const { variant, held } = assignVariant(ab, contact.id, campaign.id);
    if (held) return { ...base, status: "held", due_at: null };
    const due = dueFor(contact, { plan, start, profiles, workspaceZone, scheduledFor, quietHours: settings.sending?.quietHours, channel });
    lastTestDue = Math.max(lastTestDue, due.getTime());
    return { ...base, variant, status: "pending", due_at: iso(due) };
  });

  for (const batch of chunks(records)) {
    const { error } = await db.from("campaign_send_recipients").upsert(batch, { onConflict: "send_id,contact_id", ignoreDuplicates: true });
    if (error) {
      console.error("[campaigns.sender.prepare]", error.message);
      return null;
    }
  }

  const patch = { status: "sending", total: rows.length, skipped, started_at: job.started_at || now, strategy: plan };
  if (ab) patch.ab = { ...(job.ab || {}), decideAt: iso(lastTestDue + ab.durationHours * HOUR_MS) };
  const { data } = await db.from("campaign_sends").update(patch).eq("id", job.id).select("*").single();
  return data || { ...job, ...patch };
}

// --- Processing ------------------------------------------------------------------------------

async function claimLease(db, jobId, until) {
  const now = iso();
  const { data } = await db
    .from("campaign_sends")
    .update({ lease_until: iso(until) })
    .eq("id", jobId)
    .in("status", ACTIVE_JOB)
    .or(`lease_until.is.null,lease_until.lt."${now}"`)
    .select("*")
    .maybeSingle();
  return data || null;
}

const isUncertain = (error) => /request_failed|outcome is unknown|timeout|aborted/i.test(String(error || ""));

function outcomeOf(result) {
  if (SENT_STATUSES.has(result?.status)) return "sent";
  if (result?.status === "queued") return "uncertain";
  if (result?.status === "failed" && isUncertain(result.error)) return "uncertain";
  return "failed";
}

// A claim left in "sending" by a crashed tick: reconcile from the delivery log, never resend blindly.
async function recoverStaleClaims(db, job) {
  const settled = { sent: 0, failed: 0, uncertain: 0 };
  const { data: stale } = await db
    .from("campaign_send_recipients")
    .select("id, contact_id")
    .eq("send_id", job.id)
    .eq("status", "sending")
    .lt("claimed_at", iso(Date.now() - STALE_CLAIM_MS))
    .limit(CHUNK);
  for (const r of stale || []) {
    const { data: delivery } = await db
      .from("deliveries")
      .select("id, status, error")
      .eq("idempotency_key", `campaign:${job.campaign_id}:${r.contact_id}`)
      .maybeSingle();
    const status = delivery ? outcomeOf(delivery) : "pending";
    await db
      .from("campaign_send_recipients")
      .update({
        status,
        delivery_id: delivery?.id || null,
        ...(status === "pending" ? { claimed_at: null } : { processed_at: iso() }),
        ...(status === "uncertain" ? { error: "The provider outcome is unknown. Check the message log before retrying." } : {}),
      })
      .eq("id", r.id)
      .eq("status", "sending");
    if (status !== "pending") settled[status] += 1;
  }
  if (!settled.sent && !settled.failed && !settled.uncertain) return job;
  const counters = {
    sent: (Number(job.sent) || 0) + settled.sent,
    failed: (Number(job.failed) || 0) + settled.failed,
    uncertain: (Number(job.uncertain) || 0) + settled.uncertain,
  };
  await db.from("campaign_sends").update(counters).eq("id", job.id);
  return { ...job, ...counters };
}

async function remainingCap(db, projectId, channel) {
  const cap = await getDailySendCap(db, projectId, { channel });
  if (cap == null) return null;
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("channel", channel)
    .neq("source_type", "test")
    .not("status", "in", "(not_sent)")
    .gte("created_at", midnight.toISOString());
  return Math.max(0, cap - (count || 0));
}

async function loadContacts(db, ids) {
  const map = new Map();
  for (const batch of chunks([...new Set(ids)], IN_CHUNK)) {
    const { data } = await db.from("contacts").select("*").in("id", batch);
    for (const row of data || []) map.set(row.id, row);
  }
  return map;
}

async function sendOne(db, recipient, contact, ctx) {
  const finish = async (status, extra = {}) => {
    await db
      .from("campaign_send_recipients")
      .update({ status, processed_at: iso(), ...extra })
      .eq("id", recipient.id);
    return status;
  };
  if (!contact || contact.deleted_at) return finish("skipped", { error: "The contact was deleted." });
  if (contact.status !== "subscribed") return finish("skipped", { error: `The contact is ${contact.status}.` });
  const { campaign } = ctx;
  const result = await dispatch({
    db,
    projectId: campaign.project_id,
    channel: campaign.channel || "email",
    to: recipient.address,
    contactId: contact.id,
    connectionId: ctx.connectionId,
    source: { type: "campaign", id: campaign.id },
    campaignId: campaign.id,
    variant: recipient.variant,
    idempotencyKey: `campaign:${campaign.id}:${contact.id}`,
    message: recipientMessage(ctx, contact, recipient.variant),
    metadata: { sendId: recipient.send_id },
  });
  return finish(outcomeOf(result), {
    delivery_id: result?.deliveryId || null,
    error: result?.error ? String(result.error).slice(0, 500) : null,
  });
}

// After the test window: score variants from the deliveries so far and release the remainder.
async function decideWinner(db, job, campaign) {
  const plan = abPlan(campaign);
  const state = job.ab || {};
  if (!plan || !state.enabled || state.phase !== "testing" || !state.decideAt || Date.now() < Date.parse(state.decideAt)) return job;
  const { count: unsent } = await db
    .from("campaign_send_recipients")
    .select("id", { count: "exact", head: true })
    .eq("send_id", job.id)
    .in("status", ["pending", "sending"])
    .not("variant", "is", null);
  if (unsent) return job;

  const [deliveries, events] = await Promise.all([
    selectAll(() =>
      db
        .from("deliveries")
        .select("id, contact_id, status, source_type, variant, opened_at, clicked_at, bounced_at")
        .eq("campaign_id", campaign.id)
        .not("variant", "is", null),
    ),
    selectAll(() =>
      db.from("tracked_events").select("id, name, contact_id, delivery_id, revenue, properties").eq("campaign_id", campaign.id).in("name", CONVERSION_EVENTS),
    ),
  ]);
  const { variants } = buildCampaignReport({ deliveries, events });
  const winner = chooseWinner(plan, variants);
  const decidedAt = iso();

  const held = await selectAll(() => db.from("campaign_send_recipients").select("*").eq("send_id", job.id).eq("status", "held"));
  if (held.length) {
    const settings = await getWorkspaceSettings(db, campaign.project_id);
    const workspaceZone = safeTimeZone(settings.general?.timezone);
    const plan2 = job.strategy || {};
    const profiles = plan2.mode === "optimized" ? await openProfiles(db, campaign.project_id, campaign.channel || "email") : null;
    const contacts = plan2.mode === "optimized" || plan2.mode === "timezone" ? await loadContacts(db, held.map((r) => r.contact_id)) : new Map();
    const start = new Date();
    const released = held.map((r) => {
      const contact = contacts.get(r.contact_id) || { id: r.contact_id };
      const zone = safeTimeZone(contact.timezone, workspaceZone);
      const due =
        plan2.mode === "optimized"
          ? optimizedDueAt({ contactId: r.contact_id, start, profiles, settings: plan2, timeZone: zone }).at
          : plan2.mode === "timezone"
            ? nextLocalOccurrence(start, parseLocalTime(plan2.localTime), zone)
            : start;
      return { ...r, status: "pending", variant: winner.key, due_at: iso(due) };
    });
    for (const batch of chunks(released)) {
      await db.from("campaign_send_recipients").upsert(batch, { onConflict: "id" });
    }
  }

  const ab = { ...state, phase: "decided", winner: winner.key, uplift: winner.uplift, tied: winner.tied, decidedAt, results: variants };
  await db.from("campaign_sends").update({ ab }).eq("id", job.id);
  await db
    .from("campaigns")
    .update({ ab: { ...(campaign.ab || {}), winner: winner.key, decidedAt } })
    .eq("id", campaign.id);
  return { ...job, ab };
}

async function countRecipients(db, sendId, statuses, extra = (q) => q) {
  const { count } = await extra(
    db.from("campaign_send_recipients").select("id", { count: "exact", head: true }).eq("send_id", sendId).in("status", statuses),
  );
  return count || 0;
}

async function finishJob(db, job, campaign) {
  const metrics = await refreshCampaignMetrics(db, campaign.project_id, campaign.id);
  const allFailed = (Number(job.sent) || 0) === 0 && (Number(job.failed) || 0) > 0;
  const completedAt = iso();
  await db
    .from("campaign_sends")
    .update({
      status: allFailed ? "failed" : "completed",
      completed_at: completedAt,
      ...(allFailed ? { error: "Every send failed. Check the message log for the provider's errors." } : {}),
    })
    .eq("id", job.id);
  if (campaign.status === "cancelled") return;
  const sentAt = job.started_at || completedAt;
  await db
    .from("campaigns")
    .update({ status: allFailed ? "failed" : "sent", sent_at: allFailed ? campaign.sent_at : sentAt })
    .eq("id", campaign.id);
  if (!allFailed) {
    await emitWebhook(db, campaign.project_id, "campaign.sent", {
      campaignId: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      sentAt,
      recipients: Number(job.total) || 0,
      sent: Number(job.sent) || 0,
      failed: Number(job.failed) || 0,
      metrics,
    });
  }
}

// Processes one job until it is done, throttled, waiting, or the deadline (ms) is near.
export async function processSendJob(db, jobId, { deadline = Date.now() + 60_000, audience = null } = {}) {
  const summary = { sent: 0, failed: 0, skipped: 0, uncertain: 0, completed: false };
  let job = await claimLease(db, jobId, deadline + 60_000);
  if (!job) return { ...summary, leased: true };
  try {
    const { data: campaign } = await db.from("campaigns").select("*").eq("id", job.campaign_id).maybeSingle();
    if (!campaign || campaign.deleted_at || campaign.status === "cancelled") {
      await db.from("campaign_sends").update({ status: "cancelled", completed_at: iso() }).eq("id", job.id);
      await db.from("campaign_send_recipients").update({ status: "cancelled" }).eq("send_id", job.id).in("status", ["pending", "held"]);
      return summary;
    }
    if (job.status === "preparing") {
      job = await prepareJob(db, job, campaign, { audience });
      if (!job) return summary;
    }

    job = await recoverStaleClaims(db, job);
    job = await decideWinner(db, job, campaign);

    const settings = await getWorkspaceSettings(db, campaign.project_id);
    const { connection } = campaign.channel && campaign.channel !== "email" ? await loadConnection(db, campaign.project_id, campaign.channel) : { connection: null };
    const ctx = messageContext(campaign, settings, { connectionId: connection?.id || null });
    const throttled = job.throttled_until && Date.parse(job.throttled_until) > Date.now();
    let cap = throttled ? 0 : await remainingCap(db, campaign.project_id, campaign.channel || "email");
    let throttledUntil = null;

    while (!throttled && Date.now() < deadline - 5_000) {
      if (cap === 0) {
        const tomorrow = new Date();
        tomorrow.setUTCHours(24, 0, 0, 0);
        throttledUntil = tomorrow.toISOString();
        break;
      }
      const size = cap == null ? BATCH : Math.min(BATCH, cap);
      const now = iso();
      const { data: due } = await db
        .from("campaign_send_recipients")
        .select("id")
        .eq("send_id", job.id)
        .eq("status", "pending")
        .lte("due_at", now)
        .order("due_at")
        .limit(size);
      if (!due?.length) break;
      const { data: claimed } = await db
        .from("campaign_send_recipients")
        .update({ status: "sending", claimed_at: now })
        .in("id", due.map((r) => r.id))
        .eq("status", "pending")
        .select("*");
      if (!claimed?.length) break;
      const contacts = await loadContacts(db, claimed.map((r) => r.contact_id));
      const outcomes = await mapPool(claimed, CONCURRENCY, (r) => sendOne(db, r, contacts.get(r.contact_id), ctx));
      for (const outcome of outcomes) summary[outcome] = (summary[outcome] || 0) + 1;
      const attempted = outcomes.filter((o) => o !== "skipped").length;
      if (cap != null) cap = Math.max(0, cap - attempted);
      const counters = {
        sent: (Number(job.sent) || 0) + outcomes.filter((o) => o === "sent").length,
        failed: (Number(job.failed) || 0) + outcomes.filter((o) => o === "failed").length,
        skipped: (Number(job.skipped) || 0) + outcomes.filter((o) => o === "skipped").length,
        uncertain: (Number(job.uncertain) || 0) + outcomes.filter((o) => o === "uncertain").length,
      };
      await db.from("campaign_sends").update(counters).eq("id", job.id);
      job = { ...job, ...counters };
    }

    const open = await countRecipients(db, job.id, ["pending", "held", "sending"]);
    if (!open) {
      await finishJob(db, job, campaign);
      summary.completed = true;
      return summary;
    }
    const dueNow = await countRecipients(db, job.id, ["pending"], (q) => q.lte("due_at", iso()));
    await db
      .from("campaign_sends")
      .update({ status: dueNow && !throttledUntil ? "sending" : "waiting", ...(throttledUntil ? { throttled_until: throttledUntil } : {}) })
      .eq("id", job.id)
      .in("status", ACTIVE_JOB);
    return summary;
  } finally {
    await db.from("campaign_sends").update({ lease_until: null, last_tick_at: iso() }).eq("id", jobId);
  }
}

// --- Worker entry points --------------------------------------------------------------------

// Scheduled campaigns that are due -> send jobs. Returns the jobs created.
export async function launchDueCampaigns(db, { limit = 20 } = {}) {
  const horizon = iso(Date.now() + 27 * HOUR_MS);
  const { data: due } = await db
    .from("campaigns")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", horizon)
    .is("deleted_at", null)
    .order("scheduled_at")
    .limit(limit);
  const jobs = [];
  const zones = new Map();
  for (const campaign of due || []) {
    if (!campaign.scheduled_at) continue;
    if (!zones.has(campaign.project_id)) {
      const [settings, sto] = await Promise.all([getWorkspaceSettings(db, campaign.project_id), loadSendTimeSettings(db, campaign.project_id)]);
      zones.set(campaign.project_id, { zone: safeTimeZone(settings.general?.timezone), sto });
    }
    const { zone, sto } = zones.get(campaign.project_id);
    if (preparesAt(campaign, sto, zone) > Date.now()) continue;
    if (await liveJob(db, campaign.id)) continue;
    const job = await launchScheduled(db, campaign);
    if (job) jobs.push(job);
  }
  return jobs;
}

// Straight-split A/B tests (no held remainder) finish before their window ends; decide them afterwards.
export async function decideFinishedTests(db, { limit = 10 } = {}) {
  const { data: jobs } = await db
    .from("campaign_sends")
    .select("*")
    .eq("status", "completed")
    .eq("ab->>phase", "testing")
    .lte("ab->>decideAt", iso())
    .is("deleted_at", null)
    .limit(limit);
  let decided = 0;
  for (const job of jobs || []) {
    const { data: campaign } = await db.from("campaigns").select("*").eq("id", job.campaign_id).maybeSingle();
    if (!campaign) continue;
    const next = await decideWinner(db, job, campaign);
    if (next.ab?.phase === "decided") decided += 1;
  }
  return decided;
}

export async function listRunnableJobs(db, { limit = 10 } = {}) {
  const { data } = await db
    .from("campaign_sends")
    .select("id")
    .in("status", ACTIVE_JOB)
    .is("deleted_at", null)
    .or(`lease_until.is.null,lease_until.lt."${iso()}"`)
    .order("last_tick_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return (data || []).map((r) => r.id);
}

// --- Cancel / pause / resume ---------------------------------------------------------------------

export async function cancelCampaignSend(db, projectId, campaignId) {
  const campaign = await loadCampaign(db, projectId, campaignId);
  if (campaign.status === "scheduled") {
    const { error } = await db.from("campaigns").update({ status: "draft", scheduled_at: null }).eq("id", campaign.id);
    if (error) throw new ApiError(500, "Couldn't unschedule the campaign.", "cancel_failed");
    return { status: "draft" };
  }
  const job = await liveJob(db, campaign.id);
  if (!job && !["sending", "paused"].includes(campaign.status)) {
    throw conflict("Only scheduled or sending campaigns can be cancelled.");
  }
  if (job) {
    await db.from("campaign_send_recipients").update({ status: "cancelled", processed_at: iso() }).eq("send_id", job.id).in("status", ["pending", "held"]);
    await db.from("campaign_sends").update({ status: "cancelled", completed_at: iso() }).eq("id", job.id);
  }
  await db.from("campaigns").update({ status: "cancelled", sent_at: campaign.sent_at || job?.started_at || null }).eq("id", campaign.id);
  await refreshCampaignMetrics(db, projectId, campaign.id);
  return { status: "cancelled" };
}

export async function pauseCampaignSend(db, projectId, campaignId) {
  const campaign = await loadCampaign(db, projectId, campaignId);
  const job = await liveJob(db, campaign.id);
  if (!job || campaign.status !== "sending") throw conflict("Only a sending campaign can be paused.");
  await db.from("campaign_sends").update({ status: "paused" }).eq("id", job.id);
  await db.from("campaigns").update({ status: "paused" }).eq("id", campaign.id);
  return { status: "paused" };
}

export async function resumeCampaignSend(db, projectId, campaignId) {
  const campaign = await loadCampaign(db, projectId, campaignId);
  const job = await liveJob(db, campaign.id);
  if (!job || campaign.status !== "paused") throw conflict("Only a paused campaign can be resumed.");
  await assertApproved(db, projectId, campaignId);
  await db.from("campaign_sends").update({ status: "sending", lease_until: null }).eq("id", job.id);
  await db.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
  return { response: { status: "sending" }, run: (deadline) => processSendJob(db, job.id, { deadline }) };
}

// --- Test sends -----------------------------------------------------------------------------------

async function sampleContact(db, projectId, campaign, contactId) {
  if (contactId) {
    const { data } = await db.from("contacts").select("*").eq("project_id", projectId).eq("id", contactId).is("deleted_at", null).maybeSingle();
    if (data) return data;
  }
  const listIds = campaign.audience?.listIds || [];
  if (listIds.length) {
    const { data: member } = await db
      .from("list_members")
      .select("contact_id")
      .in("list_id", listIds)
      .eq("status", "subscribed")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (member) {
      const { data } = await db.from("contacts").select("*").eq("id", member.contact_id).maybeSingle();
      if (data) return data;
    }
  }
  const { data } = await db
    .from("contacts")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "subscribed")
    .is("deleted_at", null)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data || { id: null, first_name: "", last_name: "", email: "", attributes: {} };
}

// POST …/test: up to 5 addresses, [Test] subject, sample-contact merge data, logged as source "test".
export async function sendCampaignTest(db, { projectId, campaignId, to, contactId = null, variant = null }) {
  const campaign = await loadCampaign(db, projectId, campaignId);
  const channel = campaign.channel || "email";
  if (!TESTABLE_CHANNELS.has(channel)) throw badRequest("Test sends are available for email, SMS and WhatsApp campaigns.");
  const list = [...new Set((Array.isArray(to) ? to : [to]).map((a) => String(a || "").trim().toLowerCase()).filter(Boolean))];
  if (!list.length) throw badRequest("Add at least one address to send the test to.");
  if (list.length > 5) throw badRequest("Send a test to at most 5 addresses at a time.");
  const pattern = channel === "email" ? EMAIL_PATTERN : PHONE_PATTERN;
  const invalid = list.filter((a) => !pattern.test(a));
  if (invalid.length) throw badRequest(`Not a valid ${channel === "email" ? "email address" : "phone number"}: ${invalid.join(", ")}`);

  const { connectionId } = await preflight(db, projectId, campaign);
  const [settings, sample] = await Promise.all([getWorkspaceSettings(db, projectId), sampleContact(db, projectId, campaign, contactId)]);
  const ctx = messageContext(campaign, settings, { connectionId });
  const variantKey = variant && ctx.ab?.keys.includes(variant) ? variant : null;

  const results = await mapPool(list, CONCURRENCY, (address) =>
    dispatch({
      db,
      projectId,
      channel,
      to: address,
      connectionId,
      source: { type: "test", id: campaign.id },
      message: testMessage(ctx, sample, variantKey),
      metadata: { test: true, campaignId: campaign.id, variant: variantKey },
    }),
  );
  const sent = results.filter((r) => SENT_STATUSES.has(r?.status)).length;
  const errors = results.map((r, i) => (SENT_STATUSES.has(r?.status) ? null : { to: list[i], error: r?.error || "Send failed." })).filter(Boolean);
  return { sent, failed: list.length - sent, errors };
}
