import { isConversionEvent, loadCampaignRows, rollupCampaignMetrics } from "./metrics.js";

// Campaign report (isomorphic): metrics, link clicks, the hourly opens/clicks timeline, per-variant
// results and send progress, built from raw snake_case rows. The report route loads the rows; the
// playground feeds the same builder from its in-memory tables.

const HOUR_MS = 3_600_000;
const TIMELINE_HOURS = 168;
const NOT_SENT = new Set(["queued", "failed", "not_sent"]);
const TRACKING_PARAMS = /^(utm_[a-z]+|gc_d)$/i;
const ratio = (part, whole) => (whole ? Math.round((part / whole) * 10_000) / 10_000 : 0);

// Groups clicks by the link as written in the email (tracking params stripped).
function linkKey(event) {
  const raw = event.properties?.url || event.url || "";
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return raw;
  }
}

function hourStart(time) {
  return time - (time % HOUR_MS);
}

export function summarizeSend(send) {
  if (!send) return null;
  return {
    id: send.id,
    status: send.status,
    strategy: send.strategy || {},
    total: Number(send.total) || 0,
    sent: Number(send.sent) || 0,
    failed: Number(send.failed) || 0,
    skipped: Number(send.skipped) || 0,
    uncertain: Number(send.uncertain) || 0,
    pending: Math.max(
      0,
      (Number(send.total) || 0) -
        (Number(send.sent) || 0) -
        (Number(send.failed) || 0) -
        (Number(send.skipped) || 0) -
        (Number(send.uncertain) || 0),
    ),
    ab: send.ab || {},
    scheduledFor: send.scheduled_for || null,
    startedAt: send.started_at || null,
    completedAt: send.completed_at || null,
    throttledUntil: send.throttled_until || null,
    error: send.error || null,
  };
}

export function buildCampaignReport({ campaign = null, deliveries = [], events = [], send = null, now = Date.now() } = {}) {
  const rows = deliveries.filter((d) => d && d.source_type !== "test" && !d.deleted_at);
  const metrics = rollupCampaignMetrics(rows, events);

  // Links
  const links = new Map();
  const clickEvents = events.filter((e) => e?.name === "email_clicked");
  for (const e of clickEvents) {
    const key = linkKey(e);
    if (!key) continue;
    const entry = links.get(key) || { url: key, clicks: 0, people: new Set() };
    entry.clicks += 1;
    entry.people.add(e.delivery_id || e.contact_id || e.id);
    links.set(key, entry);
  }
  const linkRows = [...links.values()]
    .map(({ url, clicks, people }) => ({ url, clicks, uniqueClicks: people.size }))
    .sort((a, b) => b.clicks - a.clicks || a.url.localeCompare(b.url));

  // Timeline: hourly opens/clicks for the first week after the send.
  const openEvents = events.filter((e) => e?.name === "email_opened");
  const opensAt = openEvents.length
    ? openEvents.map((e) => e.occurred_at)
    : rows.filter((d) => d.opened_at).map((d) => d.opened_at);
  const clicksAt = clickEvents.length
    ? clickEvents.map((e) => e.occurred_at)
    : rows.filter((d) => d.clicked_at).map((d) => d.clicked_at);
  const sentTimes = rows.map((d) => Date.parse(d.sent_at || "")).filter((t) => !Number.isNaN(t));
  const startTime = Date.parse(campaign?.sent_at || "") || (sentTimes.length ? Math.min(...sentTimes) : NaN);
  let timeline = [];
  if (!Number.isNaN(startTime)) {
    const first = hourStart(startTime);
    const buckets = new Map();
    const bump = (iso, key) => {
      const t = Date.parse(iso || "");
      if (Number.isNaN(t) || t < first) return;
      const index = Math.floor((t - first) / HOUR_MS);
      if (index >= TIMELINE_HOURS) return;
      const bucket = buckets.get(index) || { opens: 0, clicks: 0 };
      bucket[key] += 1;
      buckets.set(index, bucket);
    };
    opensAt.forEach((t) => bump(t, "opens"));
    clicksAt.forEach((t) => bump(t, "clicks"));
    const lastIndex = Math.max(-1, ...buckets.keys());
    const nowIndex = Math.floor((now - first) / HOUR_MS);
    const length = Math.min(TIMELINE_HOURS, Math.max(lastIndex + 1, Math.min(nowIndex + 1, 24)));
    timeline = Array.from({ length: Math.max(0, length) }, (_, i) => ({
      at: new Date(first + i * HOUR_MS).toISOString(),
      opens: buckets.get(i)?.opens || 0,
      clicks: buckets.get(i)?.clicks || 0,
    }));
  }

  // Variants
  const variantOf = new Map();
  const contactVariant = new Map();
  for (const d of rows) {
    if (!d.variant) continue;
    variantOf.set(d.id, d.variant);
    if (d.contact_id) contactVariant.set(d.contact_id, d.variant);
  }
  const groups = new Map();
  for (const d of rows) {
    if (!d.variant) continue;
    const g = groups.get(d.variant) || { key: d.variant, recipients: 0, sent: 0, bounces: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0 };
    g.recipients += 1;
    if (!NOT_SENT.has(d.status)) g.sent += 1;
    if (d.status === "bounced" || d.bounced_at) g.bounces += 1;
    if (d.opened_at) g.opens += 1;
    if (d.clicked_at) g.clicks += 1;
    groups.set(d.variant, g);
  }
  for (const e of events) {
    if (!isConversionEvent(e)) continue;
    const key = variantOf.get(e.delivery_id) || contactVariant.get(e.contact_id);
    const g = key && groups.get(key);
    if (!g) continue;
    g.conversions += 1;
    g.revenue += Number(e.revenue) || 0;
  }
  const variants = [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => {
      const delivered = Math.max(0, g.sent - g.bounces);
      return {
        key: g.key,
        sent: g.sent,
        opens: g.opens,
        clicks: g.clicks,
        conversions: g.conversions,
        revenue: Math.round(g.revenue * 100) / 100,
        openRate: ratio(g.opens, delivered),
        clickRate: ratio(g.clicks, delivered),
        conversionRate: ratio(g.conversions, delivered),
      };
    });

  const statuses = {};
  for (const d of rows) statuses[d.status || "queued"] = (statuses[d.status || "queued"] || 0) + 1;

  const summary = summarizeSend(send);
  return {
    metrics,
    links: linkRows,
    timeline,
    variants,
    winner: campaign?.ab?.winner || summary?.ab?.winner || null,
    statuses,
    send: summary,
  };
}

// Loads one campaign's rows (any db that can read them) and builds the report; null when missing.
export async function loadCampaignReport(db, projectId, campaignId) {
  const { data: campaign, error } = await db
    .from("campaigns")
    .select("id, name, channel, status, sent_at, ab")
    .eq("project_id", projectId)
    .eq("id", campaignId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) return null;
  const [{ deliveries, events }, { data: send }] = await Promise.all([
    loadCampaignRows(db, projectId, campaignId),
    db
      .from("campaign_sends")
      .select("*")
      .eq("campaign_id", campaignId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return buildCampaignReport({ campaign, deliveries, events, send: send || null });
}
