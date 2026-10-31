// Playground stand-ins for the campaign send routes (delivery engine), answered from the in-memory seed.
// The audience resolves through the real Audience resolver and reports/metrics/send-time analysis run
// the real builders. Nothing leaves the browser: a send writes delivery rows (provider "playground")
// and marks the campaign sent; a test send logs its deliveries the same way.

import { createMemoryClient } from "../memory_client.js";
import { getPlaygroundDb, PLAYGROUND_USER } from "../db.js";
import { playgroundRpc } from "../rpc.js";
import { json } from "../intercept_fetch.js";
import { resolveAudienceDetailed } from "../../audience/resolve.js";
import { abPlan, assignVariant } from "../../campaigns/ab_send.js";
import { rollupCampaignMetrics } from "../../campaigns/metrics.js";
import { buildCampaignReport } from "../../campaigns/report.js";
import { analyzeSendTimes, safeTimeZone } from "../../campaigns/send_time.js";

const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto.randomUUID();
const live = (row) => row && row.deleted_at == null;
const STARTABLE = new Set(["draft", "approved", "in_review", "scheduled", "cancelled", "failed"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9\s().-]{7,20}$/;

let client = null;

function campaignDb() {
  client ??= createMemoryClient({
    getDb: getPlaygroundDb,
    user: PLAYGROUND_USER,
    rpc: playgroundRpc,
    defaults: (_table, row) => ({ metadata: {}, deleted_at: null, ...row }),
  });
  return client.schema("campaign");
}

function findCampaign(projectId, campaignId) {
  return getPlaygroundDb().table("campaigns").find((c) => c.id === campaignId && c.project_id === projectId && live(c)) || null;
}

const notFound = () => json({ error: "Campaign not found.", code: "not_found" }, 404);
const conflict = (error, code = "conflict") => json({ error, code }, 409);
const invalid = (error) => json({ error, code: "invalid_input" }, 400);

function campaignRows(db, campaignId) {
  return {
    deliveries: db.table("deliveries").filter((d) => d.campaign_id === campaignId),
    events: db.table("tracked_events").filter((e) => e.campaign_id === campaignId),
  };
}

function refreshMetrics(db, campaign) {
  const { deliveries, events } = campaignRows(db, campaign.id);
  campaign.metrics = { ...rollupCampaignMetrics(deliveries, events), updatedAt: now() };
  campaign.updated_at = now();
  return campaign.metrics;
}

function hasAudience(campaign) {
  const a = campaign.audience || {};
  return a.all === true || a.listIds?.length > 0 || a.segmentIds?.length > 0;
}

function deliveryRow({ projectId, campaign, channel, to, contactId = null, variant = null, sourceType = "campaign", subject = null, idempotencyKey = null, metadata = {} }) {
  const at = now();
  return {
    id: uuid(),
    project_id: projectId,
    channel,
    status: "sent",
    contact_id: contactId,
    to_address: String(to),
    source_type: sourceType,
    source_id: campaign.id,
    campaign_id: sourceType === "test" ? null : campaign.id,
    variant,
    subject,
    provider: "playground",
    provider_id: null,
    connection_id: null,
    error: null,
    cost: 0,
    currency: "USD",
    open_count: 0,
    click_count: 0,
    idempotency_key: idempotencyKey,
    sent_at: at,
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    bounced_at: null,
    unsubscribed_at: null,
    metadata: { ...metadata, playground: true },
    created_by: null,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  };
}

function subjectFor(campaign, variant) {
  if (!variant || variant === "A") return campaign.subject || null;
  const v = (campaign.ab?.variants || []).find((x) => x?.key === variant);
  return campaign.ab?.testOn === "content" ? campaign.subject || null : v?.subject || campaign.subject || null;
}

async function send({ params, body }) {
  const db = getPlaygroundDb();
  const campaign = findCampaign(params.projectId, params.campaignId);
  if (!campaign) return notFound();
  if (campaign.status === "sending") return conflict("This campaign is already sending.", "already_sending");
  if (campaign.status === "sent") return conflict("This campaign has already been sent.", "already_sent");
  if (!STARTABLE.has(campaign.status)) return conflict(`A ${campaign.status} campaign can't be sent.`);
  if (!hasAudience(campaign)) return invalid("Choose at least one list or segment to send to.");
  const mode = body?.mode || "now";
  const channel = campaign.channel || "email";
  const strategy = { ...(campaign.send_strategy || {}), ...(body?.strategy || {}) };
  const { recipients } = await resolveAudienceDetailed(campaignDb(), params.projectId, campaign.audience || {}, { channel });
  if (!recipients.length) return conflict("No one in this audience can receive this campaign.", "empty_audience");

  if (mode === "schedule") {
    const at = Date.parse(body?.scheduledAt || "");
    if (Number.isNaN(at)) return invalid("scheduledAt must be a valid date.");
    if (at < Date.now() + 60_000) return invalid("Pick a time at least a minute from now.");
    Object.assign(campaign, { status: "scheduled", scheduled_at: new Date(at).toISOString(), send_strategy: strategy, updated_at: now() });
    return { status: "scheduled", scheduledAt: campaign.scheduled_at, recipients: recipients.length, warnings: [] };
  }

  const ab = abPlan(campaign);
  const sendId = uuid();
  let sent = 0;
  for (const contact of recipients) {
    const key = `campaign:${campaign.id}:${contact.id}`;
    if (db.table("deliveries").some((d) => d.idempotency_key === key)) continue;
    const { variant } = assignVariant(ab ? { ...ab, testPercent: 100 } : null, contact.id, campaign.id);
    db.table("deliveries").push(
      deliveryRow({ projectId: params.projectId, campaign, channel, to: contact.address, contactId: contact.id, variant, subject: channel === "email" ? subjectFor(campaign, variant) : null, idempotencyKey: key, metadata: { sendId } }),
    );
    sent += 1;
  }
  const at = now();
  db.table("campaign_sends").push({
    id: sendId,
    project_id: params.projectId,
    campaign_id: campaign.id,
    channel,
    status: "completed",
    strategy,
    ab: ab ? { enabled: true, phase: "testing", testPercent: 100, metric: ab.winnerMetric, durationHours: ab.durationHours, variants: ab.keys, decideAt: new Date(Date.now() + ab.durationHours * 3_600_000).toISOString() } : {},
    total: recipients.length,
    sent,
    failed: 0,
    skipped: recipients.length - sent,
    uncertain: 0,
    scheduled_for: null,
    started_at: at,
    completed_at: at,
    throttled_until: null,
    lease_until: null,
    last_tick_at: at,
    error: null,
    metadata: { playground: true },
    created_by: PLAYGROUND_USER.id,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  });
  Object.assign(campaign, { status: "sent", sent_at: at, scheduled_at: null, send_strategy: strategy });
  refreshMetrics(db, campaign);
  return { status: "sent", scheduledAt: null, recipients: recipients.length, sendId, warnings: ["Playground: deliveries were logged, nothing was emailed."] };
}

function test({ params, body }) {
  const db = getPlaygroundDb();
  const campaign = findCampaign(params.projectId, params.campaignId);
  if (!campaign) return notFound();
  const channel = campaign.channel || "email";
  if (!["email", "sms", "whatsapp"].includes(channel)) return invalid("Test sends are available for email, SMS and WhatsApp campaigns.");
  const list = [...new Set((Array.isArray(body?.to) ? body.to : [body?.to]).map((a) => String(a || "").trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return invalid("Add at least one address to send the test to.");
  if (list.length > 5) return invalid("Send a test to at most 5 addresses at a time.");
  const pattern = channel === "email" ? EMAIL : PHONE;
  const bad = list.filter((a) => !pattern.test(a));
  if (bad.length) return invalid(`Not a valid ${channel === "email" ? "email address" : "phone number"}: ${bad.join(", ")}`);
  for (const to of list) {
    db.table("deliveries").push(
      deliveryRow({ projectId: params.projectId, campaign, channel, to, sourceType: "test", subject: campaign.subject ? `[Test] ${campaign.subject}` : null, metadata: { test: true } }),
    );
  }
  return { sent: list.length, failed: 0, errors: [], playground: true };
}

function cancel({ params }) {
  const db = getPlaygroundDb();
  const campaign = findCampaign(params.projectId, params.campaignId);
  if (!campaign) return notFound();
  if (campaign.status === "scheduled") {
    Object.assign(campaign, { status: "draft", scheduled_at: null, updated_at: now() });
    return { status: "draft" };
  }
  if (!["sending", "paused"].includes(campaign.status)) return conflict("Only scheduled or sending campaigns can be cancelled.");
  for (const job of db.table("campaign_sends")) {
    if (job.campaign_id === campaign.id && ["preparing", "sending", "waiting", "paused"].includes(job.status)) {
      Object.assign(job, { status: "cancelled", completed_at: now(), updated_at: now() });
    }
  }
  Object.assign(campaign, { status: "cancelled", updated_at: now() });
  refreshMetrics(db, campaign);
  return { status: "cancelled" };
}

function transition(from, to, message) {
  return ({ params }) => {
    const db = getPlaygroundDb();
    const campaign = findCampaign(params.projectId, params.campaignId);
    if (!campaign) return notFound();
    if (campaign.status !== from) return conflict(message);
    for (const job of db.table("campaign_sends")) {
      if (job.campaign_id === campaign.id && job.status === (from === "sending" ? "sending" : "paused")) job.status = to === "paused" ? "paused" : "sending";
    }
    Object.assign(campaign, { status: to, updated_at: now() });
    return { status: to };
  };
}

async function estimate({ params }) {
  const campaign = findCampaign(params.projectId, params.campaignId);
  if (!campaign) return notFound();
  const { recipients, excluded, candidates } = await resolveAudienceDetailed(campaignDb(), params.projectId, campaign.audience || {}, {
    channel: campaign.channel || "email",
  });
  return { recipients: recipients.length, candidates, excluded, dailyCap: null, warnings: [] };
}

function report({ params }) {
  const db = getPlaygroundDb();
  const campaign = findCampaign(params.projectId, params.campaignId);
  if (!campaign) return notFound();
  const { deliveries, events } = campaignRows(db, campaign.id);
  const send = db
    .table("campaign_sends")
    .filter((s) => s.campaign_id === campaign.id && live(s))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  return buildCampaignReport({ campaign, deliveries, events, send: send || null });
}

function sendTime({ params, query }) {
  const db = getPlaygroundDb();
  const days = [30, 90, 180].includes(Number(query?.days)) ? Number(query.days) : 90;
  const settings = db.table("send_time_settings").find((s) => s.project_id === params.projectId && live(s));
  const minOpens = Math.min(20, Math.max(1, Number(query?.minOpens) || settings?.min_opens || 2));
  const workspace = db.table("workspace_settings").find((s) => s.project_id === params.projectId);
  const timeZone = safeTimeZone(workspace?.general?.timezone, "Europe/Lisbon");
  const since = Date.now() - days * 86_400_000;
  const rows = db
    .table("deliveries")
    .filter((d) => d.project_id === params.projectId && d.channel === "email" && Date.parse(d.created_at) >= since);
  return { days, minOpens, timeZone, truncated: false, analysis: analyzeSendTimes(rows, { timeZone, minOpens }) };
}

export const campaignsRoutes = [
  ["GET", "/api/projects/:projectId/campaigns/send-time", sendTime],
  ["POST", "/api/projects/:projectId/campaigns/:campaignId/send", send],
  ["POST", "/api/projects/:projectId/campaigns/:campaignId/test", test],
  ["POST", "/api/projects/:projectId/campaigns/:campaignId/cancel", cancel],
  ["POST", "/api/projects/:projectId/campaigns/:campaignId/pause", transition("sending", "paused", "Only a sending campaign can be paused.")],
  ["POST", "/api/projects/:projectId/campaigns/:campaignId/resume", transition("paused", "sending", "Only a paused campaign can be resumed.")],
  ["GET", "/api/projects/:projectId/campaigns/:campaignId/estimate", estimate],
  ["GET", "/api/projects/:projectId/campaigns/:campaignId/report", report],
];
