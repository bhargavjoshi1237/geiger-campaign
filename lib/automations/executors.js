// Per-node step executors for the automation engine (isomorphic, deps-injected). Each takes the step
// context and returns an outcome the engine applies and logs:
//   { type: "next", handle } | { type: "wait", until, waiting } | { type: "defer", until } | { type: "end", enrollmentStatus, reason }
// plus { action, status, detail, context?, silent? }. Server-only work (sending, webhooks, settings) goes through ctx.deps.

import { renderEmailDocument } from "@/lib/email/blocks";
import { applyMergeTags, contactMergeData } from "@/lib/email/merge_tags";
import { conditionNeeds, matchesConditions } from "@/lib/audience/segment_rules";
import { buildContextIndex } from "@/lib/audience/evaluate";
import { addressFor, emailDomain, phoneKey, toContactModel } from "@/lib/audience/contact_model";
import { MESSAGE_CHANNELS } from "./steps.js";
import { eventSubject, matchesPropertyFilters } from "./triggers.js";
import { isValidWebhookUrl } from "./validation.js";
import { composeEmailDocument } from "./email_doc.js";
import { addDays, addDuration, nextWeekdayTime, quietHoursEnd, safeTimeZone } from "./schedule.js";

const DAY = 86_400_000;
const CHANNEL_LABEL = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", push: "Push" };
const SENT = new Set(["sent", "delivered", "opened", "clicked", "read", "replied"]);

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const iso = (d) => new Date(d).toISOString();

export const next = (handle, action, detail = {}, extra = {}) => ({ type: "next", handle: handle || "out", action, status: "ok", detail, ...extra });
const waitFor = (until, waiting, action, detail = {}, extra = {}) => ({ type: "wait", until, waiting, action, status: "waiting", detail, ...extra });
const defer = (until, action, detail = {}) => ({ type: "defer", until, action, status: "deferred", detail });
const end = (enrollmentStatus, reason, action, detail = {}, extra = {}) => ({ type: "end", enrollmentStatus, reason, action, status: "ok", detail, ...extra });
const skipped = (action, detail) => next("out", action, detail, { status: "skipped" });
const failed = (action, detail) => next("out", action, detail, { status: "failed" });

export const stepIdempotencyKey = (enrollmentId, nodeId) => `automation:${enrollmentId}:${nodeId}`;

// Per-tick memo so a batch loads settings, saved conditions and goals once.
export function createCache() {
  return { settings: new Map(), conditionSets: new Map(), goals: new Map(), campaigns: new Map() };
}

async function memo(map, key, load) {
  if (map.has(key)) return map.get(key);
  const value = await load();
  map.set(key, value);
  return value;
}

export async function settingsFor(ctx) {
  return memo(ctx.cache.settings, ctx.automation.projectId, async () => {
    try {
      return (await ctx.deps.getSettings?.(ctx.db, ctx.automation.projectId)) || {};
    } catch (e) {
      console.error("[automations.settings]", e);
      return {};
    }
  });
}

async function contactTimeZone(ctx, mode = "contact") {
  const settings = await settingsFor(ctx);
  const workspace = safeTimeZone(settings.general?.timezone);
  return mode === "workspace" ? workspace : safeTimeZone(ctx.contact?.timezone || workspace);
}

function mergeDataFor(ctx, extra = {}) {
  return {
    ...contactMergeData(ctx.contact || {}),
    automation_name: ctx.automation.name || "",
    ...extra,
  };
}

// Tracked events for this contact named `name` since `since` (optionally until), matching property filters.
export async function findContactEvent(ctx, { name, filters = [], since, until = null }) {
  if (!name) return null;
  let query = ctx.db
    .from("tracked_events")
    .select("id, name, properties, source, url, campaign_id, revenue, occurred_at")
    .eq("project_id", ctx.automation.projectId)
    .eq("contact_id", ctx.contact.id)
    .eq("name", name)
    .is("deleted_at", null)
    .gte("occurred_at", iso(since))
    .order("occurred_at", { ascending: true })
    .limit(100);
  if (until) query = query.lte("occurred_at", iso(until));
  const { data, error } = await query;
  if (error) {
    console.error("[automations.findEvent]", error.message);
    return null;
  }
  return (data || []).find((e) => matchesPropertyFilters(eventSubject(e), filters)) || null;
}

// Goal definition for a goal node: inline config or the saved automation_goals row.
export async function goalDefinition(ctx, node) {
  const c = obj(node?.data?.config);
  if (c.source === "saved" && c.goalId) {
    const row = await memo(ctx.cache.goals, c.goalId, async () => {
      const { data } = await ctx.db
        .from("automation_goals")
        .select("id, event_name, filters, window_days")
        .eq("id", c.goalId)
        .eq("project_id", ctx.automation.projectId)
        .is("deleted_at", null)
        .maybeSingle();
      return data || null;
    });
    if (!row) return null;
    return { goalId: row.id, event: row.event_name, filters: row.filters || [], windowDays: row.window_days };
  }
  if (!c.event) return null;
  return { goalId: null, event: c.event, filters: c.filters || [], windowDays: c.windowDays ?? null };
}

// The goal event the contact performed since entering (inside the window), or null.
export async function goalMet(ctx, def) {
  if (!def?.event) return null;
  const entered = new Date(ctx.enrollment.entered_at || ctx.now);
  const until = Number(def.windowDays) > 0 ? new Date(entered.getTime() + Number(def.windowDays) * DAY) : null;
  return findContactEvent(ctx, { name: def.event, filters: def.filters, since: entered, until });
}

const conversion = (ctx, node, def, event) => ({
  convertedAt: iso(ctx.now),
  goalNodeId: node.id,
  goalId: def?.goalId || null,
  goalEventId: event?.id || null,
});

// Quiet hours and frequency caps for message steps; returns an outcome to short-circuit, or null to send.
async function messageGuard(ctx, channel) {
  const key = stepIdempotencyKey(ctx.enrollment.id, ctx.node.id);
  const { data: existing } = await ctx.db.from("deliveries").select("id, status").eq("idempotency_key", key).maybeSingle();
  if (existing) return next("out", `${channel}.${SENT.has(existing.status) ? "sent" : existing.status}`, { deliveryId: existing.id, duplicate: true });

  const settings = await settingsFor(ctx);
  const automationQuiet = ctx.automation.settings.quietHours;
  if (!ctx.skipWaits) {
    const windows = [];
    if (automationQuiet?.enabled) windows.push({ ...automationQuiet, tz: await contactTimeZone(ctx, automationQuiet.timezone) });
    if (settings.sending?.quietHours) windows.push({ ...settings.sending.quietHours, tz: await contactTimeZone(ctx, "contact") });
    for (const w of windows) {
      const until = quietHoursEnd(ctx.now, w, w.tz);
      if (until) return defer(until, "deferred.quiet_hours", { until: iso(until), start: w.start, end: w.end });
    }
  }

  const count = async (since, filter) => {
    let q = ctx.db
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", ctx.automation.projectId)
      .eq("contact_id", ctx.contact.id)
      .gte("created_at", iso(since))
      .not("status", "in", "(failed,not_sent)");
    q = filter(q);
    const { count: n, error } = await q;
    if (error) console.error("[automations.frequencyCap]", error.message);
    return Number(n) || 0;
  };
  const cap = ctx.automation.settings.frequencyCap;
  if (cap?.enabled && Number(cap.max) >= 1) {
    const sent = await count(addDays(ctx.now, -(Number(cap.periodDays) || 7)), (q) => q.eq("source_type", "automation").eq("source_id", ctx.automation.id));
    if (sent >= Number(cap.max)) return skipped("skipped.frequency_cap", { reason: `Already sent ${sent} from this automation in ${cap.periodDays} days.`, cap: cap.max });
  }
  const weekly = Number(settings.sending?.weeklyFrequencyCap);
  if (weekly >= 1) {
    const sent = await count(addDays(ctx.now, -7), (q) => q.in("source_type", ["campaign", "automation", "broadcast"]));
    if (sent >= weekly) return skipped("skipped.frequency_cap", { reason: `Workspace cap of ${weekly} messages a week reached.`, cap: weekly });
  }
  return null;
}

async function isSuppressedAddress(ctx, channel, address) {
  const values = channel === "email" ? [address, emailDomain(address), `@${emailDomain(address)}`] : [address, phoneKey(address), `+${phoneKey(address)}`];
  const { data, error } = await ctx.db
    .from("suppressions")
    .select("kind, value, expires_at")
    .eq("project_id", ctx.automation.projectId)
    .is("deleted_at", null)
    .in("value", values.filter(Boolean))
    .limit(20);
  if (error) return false;
  return (data || []).some((s) => !s.expires_at || Date.parse(s.expires_at) > ctx.now.getTime());
}

// Latest consent status on a channel for this contact: "opted_in" | "opted_out" | "pending" | null.
async function latestConsent(ctx, channel) {
  const { data, error } = await ctx.db
    .from("contact_consents")
    .select("status, captured_at")
    .eq("project_id", ctx.automation.projectId)
    .eq("contact_id", ctx.contact.id)
    .eq("channel", channel)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(1);
  if (error) return { status: null, error: error.message };
  return { status: data?.[0]?.status ?? null };
}

function formatFrom(name, email) {
  if (!email) return undefined;
  const clean = String(name || "").replace(/["<>]/g, "").trim();
  if (!clean) return email;
  return /[,;:@()[\]\\]/.test(clean) ? `"${clean}" <${email}>` : `${clean} <${email}>`;
}

async function loadCampaign(ctx, id) {
  return memo(ctx.cache.campaigns, id, async () => {
    const { data } = await ctx.db
      .from("campaigns")
      .select("id, name, subject, preheader, content, html, from_name, from_email, reply_to")
      .eq("id", id)
      .eq("project_id", ctx.automation.projectId)
      .is("deleted_at", null)
      .maybeSingle();
    return data || null;
  });
}

async function sendEmail(ctx) {
  const c = obj(ctx.node.data?.config);
  const contact = ctx.contact;
  const to = addressFor(contact, "email");
  if (!to) return skipped("email.skipped", { reason: "The contact has no valid email address." });
  if (contact.status !== "subscribed") return skipped("email.skipped", { reason: `The contact is ${contact.status}.` });
  const consent = await latestConsent(ctx, "email");
  if (consent.status === "opted_out") return skipped("email.skipped", { reason: "The contact opted out of email." });
  if (await isSuppressedAddress(ctx, "email", to)) return skipped("email.skipped", { reason: "The address is suppressed." });
  const guard = await messageGuard(ctx, "email");
  if (guard) return guard;

  const campaign = c.source === "campaign" && c.campaignId ? await loadCampaign(ctx, c.campaignId) : null;
  if (c.source === "campaign" && !campaign) return failed("email.failed", { error: "The campaign this email reuses no longer exists." });
  const doc = campaign ? obj(campaign.content) : composeEmailDocument(c);
  const subjectTpl = String(c.subject || "").trim() || campaign?.subject || "";
  const preheaderTpl = String(c.preheader || "").trim() || campaign?.preheader || "";
  if (!subjectTpl) return failed("email.failed", { error: "The email has no subject line." });

  const settings = await settingsFor(ctx);
  const sending = settings.sending || {};
  const companyName = settings.branding?.companyName || settings.general?.name || "";
  const brand = { ...(settings.branding || {}), companyName };
  const from = formatFrom(c.fromName || campaign?.from_name || sending.fromName || companyName, c.fromEmail || campaign?.from_email || sending.fromEmail || "");
  const projectId = ctx.automation.projectId;
  let renderError = null;

  const message = async ({ deliveryId }) => {
    const links = ctx.deps.emailLinks ? ctx.deps.emailLinks({ deliveryId, contactId: contact.id, projectId }) : {};
    if (links?.error) {
      renderError = links.error;
      return {};
    }
    const mergeData = mergeDataFor(ctx, {
      unsubscribe_url: links?.unsubscribe || "",
      preferences_url: links?.preferences || "",
      ...(links?.webView ? { view_in_browser_url: links.webView } : {}),
      company_name: companyName,
      company_address: brand.address || "",
    });
    const subject = applyMergeTags(subjectTpl, mergeData).trim();
    const preheader = applyMergeTags(preheaderTpl, mergeData);
    const hasBlocks = Array.isArray(doc.blocks) && doc.blocks.length;
    let html = !hasBlocks && campaign?.html ? applyMergeTags(campaign.html, mergeData) : renderEmailDocument(doc, { mergeData, brand, preheader, subject }).html;
    if (ctx.deps.trackEmail) {
      html = ctx.deps.trackEmail(html, {
        deliveryId,
        links,
        tracking: settings.tracking,
        footer: { companyName, address: brand.address || "", footerText: brand.footerText || "" },
      });
    }
    return { subject, html, from, label: "campaign.automation" };
  };

  const res = await ctx.deps.dispatch({
    db: ctx.db,
    projectId,
    channel: "email",
    to,
    contactId: contact.id,
    source: { type: "automation", id: ctx.automation.id },
    idempotencyKey: stepIdempotencyKey(ctx.enrollment.id, ctx.node.id),
    message,
    metadata: { automationId: ctx.automation.id, enrollmentId: ctx.enrollment.id, nodeId: ctx.node.id, test: ctx.test || undefined },
  });
  const detail = { deliveryId: res?.deliveryId || null, to, ...(res?.error || renderError ? { error: renderError || res.error } : {}) };
  return SENT.has(res?.status) ? next("out", "email.sent", detail) : failed(`email.${res?.status || "failed"}`, detail);
}

async function sendText(ctx, channel) {
  const c = obj(ctx.node.data?.config);
  const contact = ctx.contact;
  const label = CHANNEL_LABEL[channel];
  const model = toContactModel(contact);
  const to = channel === "push" ? addressFor(model, "push") || String(contact.id) : addressFor(model, channel);
  if (!to) return skipped(`${channel}.skipped`, { reason: `The contact has no ${channel === "push" ? "push subscription" : "phone number"}.` });
  if (contact.status !== "subscribed") return skipped(`${channel}.skipped`, { reason: `The contact is ${contact.status}.` });
  const consent = await latestConsent(ctx, channel);
  if (consent.error) return skipped(`${channel}.skipped`, { reason: "Consent records aren't available, so nothing was sent." });
  if (consent.status !== "opted_in") return skipped(`${channel}.skipped`, { reason: `No ${label} opt-in on file.` });
  if (channel !== "push" && (await isSuppressedAddress(ctx, channel, to))) return skipped(`${channel}.skipped`, { reason: "The number is suppressed." });
  const guard = await messageGuard(ctx, channel);
  if (guard) return guard;

  const data = mergeDataFor(ctx);
  let body = applyMergeTags(c.body || "", data).trim();
  if (channel === "sms" && body && !/\bstop\b/i.test(body)) body = `${body}\n\nReply STOP to opt out.`;
  const message =
    channel === "push"
      ? { title: applyMergeTags(c.title || "", data), body, text: body, url: c.url || null, label: "campaign.automation" }
      : channel === "whatsapp"
        ? { body, text: body, templateName: c.templateName || null, template: c.templateName || null, language: c.language || "en", label: "campaign.automation" }
        : { body, text: body, label: "campaign.automation" };

  const res = await ctx.deps.dispatch({
    db: ctx.db,
    projectId: ctx.automation.projectId,
    channel,
    to,
    contactId: contact.id,
    connectionId: c.connectionId || null,
    source: { type: "automation", id: ctx.automation.id },
    idempotencyKey: stepIdempotencyKey(ctx.enrollment.id, ctx.node.id),
    message,
    metadata: { automationId: ctx.automation.id, enrollmentId: ctx.enrollment.id, nodeId: ctx.node.id, test: ctx.test || undefined },
  });
  const detail = { deliveryId: res?.deliveryId || null, to, ...(res?.error ? { error: res.error } : {}) };
  return SENT.has(res?.status) ? next("out", `${channel}.sent`, detail) : failed(`${channel}.${res?.status || "failed"}`, detail);
}

async function runWait(ctx) {
  const c = obj(ctx.node.data?.config);
  const waiting = obj(ctx.enrollment.context?.waiting);
  const resuming = waiting.nodeId === ctx.node.id;
  const nowIso = iso(ctx.now);

  if (c.mode === "event") {
    if (resuming || ctx.skipWaits) {
      const since = resuming ? waiting.since : ctx.enrollment.entered_at || nowIso;
      const found = await findContactEvent(ctx, { name: c.event, filters: c.filters, since });
      if (found) return next("event", "wait.event", { eventId: found.id, event: c.event });
      if (ctx.skipWaits || !resuming || ctx.now.getTime() >= Date.parse(waiting.until)) return next("timeout", "wait.timeout", { event: c.event });
      return waitFor(new Date(waiting.until), waiting, "wait.pending", {}, { silent: true });
    }
    const until = addDuration(ctx.now, c.timeoutAmount, c.timeoutUnit);
    return waitFor(until, { nodeId: ctx.node.id, kind: "event", since: nowIso, until: iso(until), event: c.event, filters: c.filters || [] }, "wait.started", {
      until: iso(until),
      event: c.event,
    });
  }

  if (resuming) {
    if (ctx.now.getTime() < Date.parse(waiting.until)) return waitFor(new Date(waiting.until), waiting, "wait.pending", {}, { silent: true });
    return next("out", "wait.done");
  }
  if (ctx.skipWaits) return next("out", "wait.skipped", { reason: "Test run skips waits." });
  const until = c.mode === "until" ? nextWeekdayTime(ctx.now, { weekdays: c.weekdays, time: c.time }, await contactTimeZone(ctx, c.timezone)) : addDuration(ctx.now, c.amount, c.unit);
  if (until.getTime() <= ctx.now.getTime()) return next("out", "wait.done");
  return waitFor(until, { nodeId: ctx.node.id, kind: c.mode === "until" ? "until" : "duration", since: nowIso, until: iso(until) }, "wait.started", { until: iso(until) });
}

// List memberships / events / deliveries a rule set needs, loaded for this one contact.
async function ruleContext(ctx, conditions) {
  const needs = conditionNeeds(conditions);
  const since = needs.allTime || !needs.sinceDays ? null : iso(ctx.now.getTime() - needs.sinceDays * DAY);
  const projectId = ctx.automation.projectId;
  const contactId = ctx.contact.id;
  const load = async (enabled, build, label) => {
    if (!enabled) return [];
    const { data, error } = await build();
    if (error) console.error(`[automations.ruleContext.${label}]`, error.message);
    return data || [];
  };
  const names = [...needs.eventNames].filter(Boolean);
  const [listMembers, events, deliveries] = await Promise.all([
    load(needs.lists, () => ctx.db.from("list_members").select("list_id, contact_id, status, deleted_at").eq("project_id", projectId).eq("contact_id", contactId).is("deleted_at", null), "lists"),
    load(names.length, () => {
      let q = ctx.db.from("tracked_events").select("id, contact_id, name, occurred_at, properties").eq("project_id", projectId).eq("contact_id", contactId).in("name", names).is("deleted_at", null).limit(2000);
      if (since) q = q.gte("occurred_at", since);
      return q;
    }, "events"),
    load(needs.deliveries, () => {
      let q = ctx.db.from("deliveries").select("id, contact_id, channel, status, sent_at, opened_at, clicked_at, created_at").eq("project_id", projectId).eq("contact_id", contactId).is("deleted_at", null).limit(2000);
      if (since) q = q.gte("created_at", since);
      return q;
    }, "deliveries"),
  ]);
  return buildContextIndex({ listMembers, events, deliveries, now: ctx.now.getTime() })(contactId);
}

async function runCondition(ctx) {
  const c = obj(ctx.node.data?.config);
  if (c.mode === "event") {
    const since = ctx.now.getTime() - (Number(c.withinDays) || 0) * DAY;
    const found = await findContactEvent(ctx, { name: c.event, filters: c.filters, since });
    const yes = c.performed === false ? !found : Boolean(found);
    return next(yes ? "yes" : "no", `condition.${yes ? "yes" : "no"}`, { event: c.event, matchedEventId: found?.id || null });
  }
  if (c.mode === "message") {
    const { data: delivery } = await ctx.db
      .from("deliveries")
      .select("id, status, opened_at, clicked_at, open_count, click_count")
      .eq("idempotency_key", stepIdempotencyKey(ctx.enrollment.id, c.messageNodeId))
      .maybeSingle();
    const clicked = Boolean(delivery && (delivery.clicked_at || Number(delivery.click_count) > 0 || delivery.status === "clicked"));
    const opened = Boolean(delivery && (clicked || delivery.opened_at || Number(delivery.open_count) > 0 || delivery.status === "opened" || delivery.status === "read"));
    const yes = c.engagement === "clicked" ? clicked : opened;
    return next(yes ? "yes" : "no", `condition.${yes ? "yes" : "no"}`, { messageNodeId: c.messageNodeId, deliveryId: delivery?.id || null, engagement: c.engagement || "opened" });
  }

  let rule = { match: c.match === "any" ? "any" : "all", conditions: Array.isArray(c.conditions) ? c.conditions : [] };
  if (c.source === "saved") {
    const saved = await memo(ctx.cache.conditionSets, c.conditionSetId, async () => {
      const { data } = await ctx.db
        .from("automation_conditions")
        .select("id, match, conditions")
        .eq("id", c.conditionSetId)
        .eq("project_id", ctx.automation.projectId)
        .is("deleted_at", null)
        .maybeSingle();
      return data || null;
    });
    if (!saved) return next("no", "condition.no", { error: "The saved condition no longer exists." }, { status: "failed" });
    rule = { match: saved.match === "any" ? "any" : "all", conditions: Array.isArray(saved.conditions) ? saved.conditions : [] };
  }
  const yes = matchesConditions(toContactModel(ctx.contact), rule, await ruleContext(ctx, rule.conditions));
  return next(yes ? "yes" : "no", `condition.${yes ? "yes" : "no"}`, { rules: rule.conditions.length, match: rule.match });
}

// FNV-1a: a stable 0..99 bucket per enrollment and node, so a re-run takes the same path.
export function splitBucket(seed) {
  let h = 0x811c9dc5;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

function runSplit(ctx) {
  const branches = (obj(ctx.node.data?.config).branches || []).filter((b) => b?.key);
  if (!branches.length) return next("out", "split.none");
  const bucket = splitBucket(`${ctx.enrollment.id}:${ctx.node.id}`);
  let edge = 0;
  for (const b of branches) {
    edge += Number(b.percent) || 0;
    if (bucket < edge) return next(b.key, `split.${b.key}`, { bucket, label: b.label || b.key });
  }
  const last = branches[branches.length - 1];
  return next(last.key, `split.${last.key}`, { bucket, label: last.label || last.key });
}

async function runUpdateContact(ctx) {
  const c = obj(ctx.node.data?.config);
  const contact = ctx.contact;
  const data = mergeDataFor(ctx);
  const patch = {};
  const tags = new Set(Array.isArray(contact.tags) ? contact.tags : []);
  const added = (c.addTags || []).map((t) => String(t).trim()).filter((t) => t && !tags.has(t));
  for (const t of added) tags.add(t);
  const removed = (c.removeTags || []).map((t) => String(t).trim()).filter((t) => t && tags.has(t));
  for (const t of removed) tags.delete(t);
  if (added.length || removed.length) patch.tags = [...tags];
  const fields = (c.fields || []).filter((f) => String(f?.key || "").trim());
  if (fields.length) {
    const attributes = { ...obj(contact.attributes) };
    for (const f of fields) attributes[String(f.key).trim()] = typeof f.value === "string" ? applyMergeTags(f.value, data) : f.value ?? null;
    patch.attributes = attributes;
  }
  const delta = Math.round(Number(c.leadScoreDelta) || 0);
  if (delta) patch.lead_score = (Number(contact.lead_score) || 0) + delta;
  if (!Object.keys(patch).length) return skipped("contact.unchanged", { reason: "Nothing to change." });

  const { data: updated, error } = await ctx.db.from("contacts").update(patch).eq("id", contact.id).eq("project_id", ctx.automation.projectId).select("*").maybeSingle();
  if (error) return failed("contact.failed", { error: error.message });
  return next("out", "contact.updated", { addedTags: added, removedTags: removed, fields: fields.map((f) => f.key), leadScoreDelta: delta || undefined }, { contact: updated || { ...contact, ...patch } });
}

async function runList(ctx) {
  const c = obj(ctx.node.data?.config);
  const projectId = ctx.automation.projectId;
  const { data: list } = await ctx.db.from("lists").select("id, name").eq("id", c.listId).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (!list) return failed("list.failed", { error: "That list no longer exists." });
  if (c.action === "remove") {
    const { error } = await ctx.db
      .from("list_members")
      .update({ status: "removed", deleted_at: iso(ctx.now) })
      .eq("list_id", list.id)
      .eq("contact_id", ctx.contact.id)
      .is("deleted_at", null);
    if (error) return failed("list.failed", { error: error.message });
    return next("out", "list.removed", { listId: list.id, list: list.name });
  }
  const { error } = await ctx.db
    .from("list_members")
    .upsert({ project_id: projectId, list_id: list.id, contact_id: ctx.contact.id, status: "subscribed", source: "automation", deleted_at: null }, { onConflict: "list_id,contact_id" });
  if (error) return failed("list.failed", { error: error.message });
  return next("out", "list.added", { listId: list.id, list: list.name });
}

function webhookPayload(ctx) {
  const contact = ctx.contact;
  return {
    automation: { id: ctx.automation.id, name: ctx.automation.name, kind: ctx.automation.kind },
    step: { id: ctx.node.id, type: ctx.node.type },
    enrollment: { id: ctx.enrollment.id, enteredAt: ctx.enrollment.entered_at, test: Boolean(ctx.test) },
    contact: {
      id: contact.id,
      email: contact.email || null,
      phone: contact.phone || null,
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      status: contact.status,
      tags: contact.tags || [],
      attributes: obj(contact.attributes),
    },
    occurredAt: iso(ctx.now),
  };
}

async function runWebhook(ctx) {
  const c = obj(ctx.node.data?.config);
  const payload = webhookPayload(ctx);
  if (c.target === "endpoints") {
    const event = String(c.event || "automation.step").trim();
    const queued = await ctx.deps.emitWebhook(ctx.db, ctx.automation.projectId, event, payload);
    return queued > 0 ? next("out", "webhook.queued", { event, queued }) : skipped("webhook.skipped", { event, reason: "No active endpoint is subscribed to this event." });
  }
  if (!isValidWebhookUrl(c.url)) return failed("webhook.failed", { error: "The webhook URL isn't a public http(s) address." });
  const res = await ctx.deps.postWebhook({ url: c.url, secret: c.secret || "", event: c.event || "automation.step", payload });
  return res?.ok ? next("out", "webhook.sent", { url: c.url, status: res.status }) : failed("webhook.failed", { url: c.url, status: res?.status ?? null, error: res?.error || "The endpoint didn't accept the request." });
}

const escapeHtml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function runNotify(ctx) {
  const c = obj(ctx.node.data?.config);
  const to = String(c.email || "").trim();
  if (!to) return failed("notify.failed", { error: "No teammate is selected." });
  const data = mergeDataFor(ctx);
  const subject = applyMergeTags(c.subject || `${ctx.automation.name}: a contact reached a step`, data).trim();
  const message = applyMergeTags(c.message || "", data).trim();
  const contact = ctx.contact;
  const who = [[contact.first_name, contact.last_name].filter(Boolean).join(" "), contact.email || contact.phone].filter(Boolean).join(" · ");
  const lines = [message, `Contact: ${who || contact.id}`, `Automation: ${ctx.automation.name}`].filter(Boolean);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#18181b">${lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  const res = await ctx.deps.sendSystemEmail({ to, subject, html, text: lines.join("\n\n"), label: "campaign.automation.notify" });
  return res?.ok ? next("out", "notify.sent", { to }) : failed("notify.failed", { to, error: res?.error || "The notification couldn't be sent." });
}

async function runGoal(ctx) {
  const c = obj(ctx.node.data?.config);
  const context = obj(ctx.enrollment.context);
  if (context.convertedAt && context.goalNodeId === ctx.node.id) return next("out", "goal.reached", { already: true });
  const def = await goalDefinition(ctx, ctx.node);
  if (!def) return failed("goal.failed", { error: "The goal is missing its event." });
  const event = await goalMet(ctx, def);
  if (event) return next("out", "goal.reached", { event: def.event, eventId: event.id }, { context: conversion(ctx, ctx.node, def, event) });

  const waiting = obj(context.waiting);
  if (waiting.nodeId === ctx.node.id) {
    if (ctx.now.getTime() >= Date.parse(waiting.until)) return end("exited", "goal_not_met", "goal.not_met", { event: def.event });
    return waitFor(new Date(waiting.until), waiting, "goal.pending", {}, { silent: true });
  }
  if (c.ifNotMet === "exit") return end("exited", "goal_not_met", "goal.not_met", { event: def.event });
  if (c.ifNotMet === "wait" && !ctx.skipWaits) {
    const until = addDays(ctx.now, Number(c.waitDays) || 7);
    return waitFor(until, { nodeId: ctx.node.id, kind: "goal", since: ctx.enrollment.entered_at || iso(ctx.now), until: iso(until), event: def.event, filters: def.filters }, "goal.waiting", {
      event: def.event,
      until: iso(until),
    });
  }
  return next("out", "goal.not_met", { event: def.event }, { status: "skipped" });
}

// ctx: { db, deps, automation (engine view), enrollment (row), contact (row), node, now (Date), skipWaits, test, cache }.
export async function executeNode(ctx) {
  const type = ctx.node?.type;
  if (type in MESSAGE_CHANNELS) {
    const channel = MESSAGE_CHANNELS[type];
    return channel === "email" ? sendEmail(ctx) : sendText(ctx, channel);
  }
  switch (type) {
    case "trigger":
      return next("out", "trigger", {}, { silent: true });
    case "wait":
      return runWait(ctx);
    case "condition":
      return runCondition(ctx);
    case "split":
      return runSplit(ctx);
    case "goal":
      return runGoal(ctx);
    case "exit":
      return end("completed", String(obj(ctx.node.data?.config).reason || "").trim() || "exit_step", "exit");
    case "update_contact":
      return runUpdateContact(ctx);
    case "list":
      return runList(ctx);
    case "webhook":
      return runWebhook(ctx);
    case "notify":
      return runNotify(ctx);
    default:
      return failed("unknown_step", { error: `Unknown step type "${type}".` });
  }
}

export { conversion as goalConversion };
