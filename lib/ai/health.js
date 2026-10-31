// Campaign health score (isomorphic, pure, deterministic): 0–100 for the workspace and each sent campaign,
// built from four components over real deliveries and tracked events —
//   deliverability: bounce / complaint / unsubscribe rates against fixed industry bands
//   engagement:     open and click rates (workspace: absolute bands; campaign: vs the workspace baseline)
//   conversion:     attributed conversion events per delivered message (skipped when nothing is tracked)
//   fatigue:        marketing sends per contact over the last 7 and 30 days against the frequency cap
// plus prioritized fixes. Inputs are normalized camelCase rows (lib/supabase/deliveries, tracked_events).

const DAY = 24 * 60 * 60 * 1000;

export const HEALTH_WEIGHTS = { deliverability: 0.35, engagement: 0.25, conversion: 0.2, fatigue: 0.2 };

export const HEALTH_BANDS = {
  bounceRate: { good: 0.02, bad: 0.05 },
  complaintRate: { good: 0.001, bad: 0.003 },
  unsubscribeRate: { good: 0.005, bad: 0.02 },
  openRate: { good: 0.3, bad: 0.1 },
  clickRate: { good: 0.03, bad: 0.005 },
  conversionRate: { good: 0.02, bad: 0.002 },
  relative: { good: 1.2, bad: 0.6 },
  overCapShare: { good: 0.05, bad: 0.25 },
  sendsPer30: { good: 8, bad: 16 },
};

export const DEFAULT_WEEKLY_CAP = 3;
export const LOW_CONFIDENCE_SENDS = 100;

const MARKETING = new Set(["campaign", "automation", "broadcast", "flow"]);
const NOT_SENT = new Set(["queued", "failed", "not_sent"]);
const OPENED = new Set(["opened", "clicked", "read", "replied"]);
const CONVERSION = /(order|purchase|checkout|convert|sign.?up|subscrib|form|lead|deal|booking|registration)/i;
const NOT_CONVERSION = /(open|click|view|visit|deliver|bounce|unsubscrib|page)/i;

const ts = (iso) => (iso ? new Date(iso).getTime() : NaN);
const sentTime = (d) => ts(d.sentAt || d.createdAt);
const ratio = (a, b) => (b > 0 ? a / b : null);
const isMarketing = (d) => MARKETING.has(d.sourceType || "campaign");

export const pct = (v, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

export function isConversionEvent(e) {
  if (Number(e?.revenue) > 0) return true;
  const name = String(e?.name || "");
  return CONVERSION.test(name) && !NOT_CONVERSION.test(name);
}

// 0–100 by linear interpolation between a good and a bad value (either direction).
export function bandScore(value, { good, bad }) {
  if (value == null || Number.isNaN(value)) return null;
  if (good < bad) {
    if (value <= good) return 100;
    if (value >= bad) return 0;
    return Math.round((100 * (bad - value)) / (bad - good));
  }
  if (value >= good) return 100;
  if (value <= bad) return 0;
  return Math.round((100 * (value - bad)) / (good - bad));
}

export function healthLabel(score) {
  if (score == null) return { label: "Not enough data", variant: "neutral" };
  if (score >= 80) return { label: "Healthy", variant: "success" };
  if (score >= 60) return { label: "Fair", variant: "warning" };
  return { label: "At risk", variant: "danger" };
}

function tally(rows) {
  const t = { sent: 0, delivered: 0, bounces: 0, complaints: 0, unsubscribes: 0, emailDelivered: 0, opens: 0, clicks: 0 };
  for (const d of rows) {
    if (NOT_SENT.has(d.status)) continue;
    t.sent += 1;
    if (d.bouncedAt || d.status === "bounced") {
      t.bounces += 1;
      continue;
    }
    t.delivered += 1;
    if (d.status === "complained") t.complaints += 1;
    if (d.unsubscribedAt || d.status === "unsubscribed") t.unsubscribes += 1;
    if (d.channel === "email") {
      t.emailDelivered += 1;
      if (d.openedAt || d.openCount > 0 || OPENED.has(d.status)) t.opens += 1;
      if (d.clickedAt || d.clickCount > 0 || d.status === "clicked") t.clicks += 1;
    }
  }
  return {
    ...t,
    bounceRate: ratio(t.bounces, t.sent),
    complaintRate: ratio(t.complaints, t.delivered),
    unsubscribeRate: ratio(t.unsubscribes, t.delivered),
    openRate: ratio(t.opens, t.emailDelivered),
    clickRate: ratio(t.clicks, t.emailDelivered),
  };
}

function component(metrics) {
  const scored = metrics.filter((m) => m.score != null);
  if (!scored.length) return { score: null, metrics };
  const weight = scored.reduce((s, m) => s + m.weight, 0);
  return { score: Math.round(scored.reduce((s, m) => s + m.score * m.weight, 0) / weight), metrics };
}

function combine(components) {
  let weight = 0;
  let sum = 0;
  for (const [key, w] of Object.entries(HEALTH_WEIGHTS)) {
    const score = components[key]?.score;
    if (score == null) continue;
    sum += score * w;
    weight += w;
  }
  return weight ? Math.round(sum / weight) : null;
}

function deliverability(t) {
  if (!t.sent) return { score: null, metrics: [] };
  return component([
    { key: "bounceRate", label: "Bounce rate", value: t.bounceRate, display: pct(t.bounceRate), target: "under 2%", weight: 0.4, score: bandScore(t.bounceRate, HEALTH_BANDS.bounceRate) },
    { key: "complaintRate", label: "Spam complaints", value: t.complaintRate, display: pct(t.complaintRate, 2), target: "under 0.1%", weight: 0.4, score: bandScore(t.complaintRate, HEALTH_BANDS.complaintRate) },
    { key: "unsubscribeRate", label: "Unsubscribes", value: t.unsubscribeRate, display: pct(t.unsubscribeRate, 2), target: "under 0.5%", weight: 0.2, score: bandScore(t.unsubscribeRate, HEALTH_BANDS.unsubscribeRate) },
  ]);
}

// baseline: workspace tallies (campaign scope) or null (workspace scope, absolute bands).
function engagement(t, baseline) {
  if (!t.emailDelivered) return { score: null, metrics: [] };
  const relative = (value, base) => (baseline && base ? bandScore(value / base, HEALTH_BANDS.relative) : null);
  const openScore = baseline ? relative(t.openRate, baseline.openRate) : bandScore(t.openRate, HEALTH_BANDS.openRate);
  const clickScore = baseline ? relative(t.clickRate, baseline.clickRate) : bandScore(t.clickRate, HEALTH_BANDS.clickRate);
  return component([
    {
      key: "openRate",
      label: "Unique opens",
      value: t.openRate,
      display: pct(t.openRate),
      target: baseline ? `your average ${pct(baseline.openRate)}` : "30%+",
      weight: 0.5,
      score: openScore ?? bandScore(t.openRate, HEALTH_BANDS.openRate),
    },
    {
      key: "clickRate",
      label: "Clicks per delivered",
      value: t.clickRate,
      display: pct(t.clickRate, 2),
      target: baseline ? `your average ${pct(baseline.clickRate, 2)}` : "3%+",
      weight: 0.5,
      score: clickScore ?? bandScore(t.clickRate, HEALTH_BANDS.clickRate),
    },
  ]);
}

function conversion(conversions, delivered, baselineRate, tracked) {
  if (!tracked || !delivered) return { score: null, tracked, metrics: [] };
  const rate = conversions / delivered;
  const score = baselineRate ? bandScore(rate / baselineRate, HEALTH_BANDS.relative) : bandScore(rate, HEALTH_BANDS.conversionRate);
  return {
    ...component([
      {
        key: "conversionRate",
        label: "Conversions per delivered",
        value: rate,
        display: `${pct(rate, 2)} (${conversions})`,
        target: baselineRate ? `your average ${pct(baselineRate, 2)}` : "2%+",
        weight: 1,
        score,
      },
    ]),
    tracked,
  };
}

// Marketing sends per contact: share above the weekly cap in the 7 days to `at`, and the 30-day average.
function fatigue(marketing, at, cap, contactIds = null) {
  const end = at;
  const week = new Map();
  const month = new Map();
  for (const d of marketing) {
    if (!d.contactId || NOT_SENT.has(d.status)) continue;
    const t = sentTime(d);
    if (!(t <= end) || t < end - 30 * DAY) continue;
    month.set(d.contactId, (month.get(d.contactId) ?? 0) + 1);
    if (t >= end - 7 * DAY) week.set(d.contactId, (week.get(d.contactId) ?? 0) + 1);
  }
  const population = contactIds ? [...contactIds] : [...month.keys()];
  if (!population.length) return { score: null, metrics: [] };
  const overCap = population.filter((id) => (week.get(id) ?? 0) > cap).length;
  const share = overCap / population.length;
  const avg30 = population.reduce((s, id) => s + (month.get(id) ?? 0), 0) / population.length;
  return component([
    { key: "overCapShare", label: `Over ${cap} sends in 7 days`, value: share, display: `${pct(share)} of contacts`, target: "under 5%", weight: 0.6, score: bandScore(share, HEALTH_BANDS.overCapShare) },
    { key: "sendsPer30", label: "Sends per contact (30 days)", value: avg30, display: avg30.toFixed(1), target: "8 or fewer", weight: 0.4, score: bandScore(avg30, HEALTH_BANDS.sendsPer30) },
  ]);
}

const FIXES = {
  bounceRate: (m) => ({ title: "Clean bouncing addresses", detail: `${m.display} of sends bounced — keep it under 2%. Validate the list and suppress hard bounces.`, destination: "Email Validation" }),
  complaintRate: (m) => ({ title: "Cut spam complaints", detail: `${m.display} of delivered mail was reported as spam; Gmail and Yahoo start filtering above 0.3%. Send only to opted-in contacts.`, destination: "Suppression" }),
  unsubscribeRate: (m) => ({ title: "Reduce unsubscribes", detail: `${m.display} unsubscribed per delivered message (healthy is under 0.5%). Tighten targeting with segments.`, destination: "Segments" }),
  openRate: (m) => ({ title: "Lift open rates", detail: `Unique opens are ${m.display} (target ${m.target}). Test sharper subject lines and preheaders.`, destination: "Subject Lines" }),
  clickRate: (m) => ({ title: "Make the content earn clicks", detail: `Clicks are ${m.display} of delivered (target ${m.target}). Lead with one offer and one clear call to action.`, destination: "Copy Generator" }),
  conversionRate: (m) => ({ title: "Turn clicks into conversions", detail: `Conversions are ${m.display} of delivered (target ${m.target}). Check that the landing page matches the email's offer.`, destination: "Landing Pages" }),
  overCapShare: (m, ctx) => ({
    title: ctx.capSet ? "Contacts exceed your weekly cap" : "Set a weekly frequency cap",
    detail: `${m.display} received more than ${ctx.cap} marketing messages in 7 days.${ctx.capSet ? " Spread sends out on the calendar." : " Cap weekly sends per contact in sending defaults."}`,
    destination: ctx.capSet ? "Calendar" : "General",
  }),
  sendsPer30: (m) => ({ title: "Ease send volume per contact", detail: `Contacts averaged ${m.display} marketing messages in 30 days (healthy is 8 or fewer).`, destination: "Calendar" }),
};

function fixesFor(components, ctx) {
  const fixes = [];
  for (const [key, comp] of Object.entries(components)) {
    for (const m of comp?.metrics || []) {
      if (m.score == null || m.score >= 75 || !FIXES[m.key]) continue;
      fixes.push({
        id: `${key}.${m.key}`,
        component: key,
        severity: m.score < 30 ? "high" : m.score < 60 ? "medium" : "low",
        impact: Math.round(HEALTH_WEIGHTS[key] * m.weight * (100 - m.score)),
        ...FIXES[m.key](m, ctx),
      });
    }
  }
  if (components.conversion && components.conversion.tracked === false) {
    fixes.push({
      id: "conversion.tracking",
      component: "conversion",
      severity: "medium",
      impact: Math.round(HEALTH_WEIGHTS.conversion * 50),
      title: "Track conversions",
      detail: "No orders, sign-ups or form submissions are attributed to campaigns yet, so conversion isn't scored. Install event tracking.",
      destination: "Event Tracking",
    });
  }
  return fixes.sort((a, b) => b.impact - a.impact);
}

// { workspace, campaigns, windowDays, generatedAt }. frequencyCap: workspace sending.weeklyFrequencyCap.
export function computeHealth({ deliveries = [], events = [], campaigns = [], now = new Date(), windowDays = 30, frequencyCap = null } = {}) {
  const end = now.getTime();
  const since = end - windowDays * DAY;
  const cap = frequencyCap || DEFAULT_WEEKLY_CAP;
  const ctx = { cap, capSet: Boolean(frequencyCap) };
  const marketing = deliveries.filter(isMarketing);
  const inWindow = marketing.filter((d) => sentTime(d) >= since && sentTime(d) <= end);
  const tracked = events.some(isConversionEvent);
  const conversionsIn = (rows) => rows.filter((e) => e.campaignId && isConversionEvent(e) && ts(e.occurredAt) >= since).length;

  const base = tally(inWindow);
  const baseConversions = conversionsIn(events);
  const baseConversionRate = tracked && base.delivered ? baseConversions / base.delivered : null;

  const wsComponents = {
    deliverability: deliverability(base),
    engagement: engagement(base, null),
    conversion: conversion(baseConversions, base.delivered, null, tracked),
    fatigue: fatigue(marketing, end, cap),
  };
  const wsScore = combine(wsComponents);
  const workspace = {
    score: wsScore,
    ...healthLabel(wsScore),
    confidence: base.sent < LOW_CONFIDENCE_SENDS ? "low" : "normal",
    components: wsComponents,
    totals: { ...base, conversions: baseConversions, conversionRate: baseConversionRate },
    fixes: fixesFor(wsComponents, ctx),
  };

  const byCampaign = new Map();
  for (const d of inWindow) {
    if (!d.campaignId) continue;
    if (!byCampaign.has(d.campaignId)) byCampaign.set(d.campaignId, []);
    byCampaign.get(d.campaignId).push(d);
  }
  const campaignMeta = new Map(campaigns.map((c) => [c.id, c]));
  const eventsByCampaign = new Map();
  for (const e of events) {
    if (!e.campaignId) continue;
    if (!eventsByCampaign.has(e.campaignId)) eventsByCampaign.set(e.campaignId, []);
    eventsByCampaign.get(e.campaignId).push(e);
  }

  const campaignResults = [...byCampaign.entries()].map(([campaignId, rows]) => {
    const meta = campaignMeta.get(campaignId);
    const t = tally(rows);
    const sentAt = meta?.sentAt || rows.reduce((min, d) => (sentTime(d) < ts(min) || !min ? d.sentAt || d.createdAt : min), null);
    const conversions = (eventsByCampaign.get(campaignId) || []).filter(isConversionEvent).length;
    const recipients = new Set(rows.map((d) => d.contactId).filter(Boolean));
    const components = {
      deliverability: deliverability(t),
      engagement: engagement(t, base),
      conversion: conversion(conversions, t.delivered, baseConversionRate, tracked),
      fatigue: fatigue(marketing, ts(sentAt) || end, cap, recipients),
    };
    const score = combine(components);
    return {
      campaignId,
      name: meta?.name || "Untitled campaign",
      channel: meta?.channel || rows[0]?.channel || "email",
      sentAt,
      score,
      ...healthLabel(score),
      confidence: t.sent < LOW_CONFIDENCE_SENDS ? "low" : "normal",
      components,
      totals: { ...t, conversions },
      fixes: fixesFor(components, ctx),
    };
  });
  campaignResults.sort((a, b) => ts(b.sentAt) - ts(a.sentAt));

  return { workspace, campaigns: campaignResults, windowDays, generatedAt: now.toISOString() };
}

// Compact numeric summary for the LLM explanation (no rows, no personal data).
export function summarizeHealth(result, campaignId = null) {
  const scope = campaignId ? result.campaigns.find((c) => c.campaignId === campaignId) : result.workspace;
  if (!scope) return null;
  const components = Object.fromEntries(
    Object.entries(scope.components).map(([key, c]) => [
      key,
      { score: c.score, metrics: (c.metrics || []).map((m) => ({ label: m.label, value: m.display, target: m.target, score: m.score })) },
    ]),
  );
  return {
    scope: campaignId ? `campaign "${scope.name}"` : "workspace",
    windowDays: result.windowDays,
    score: scope.score,
    label: scope.label,
    confidence: scope.confidence,
    sends: scope.totals.sent,
    components,
    fixes: scope.fixes.map((f) => ({ title: f.title, detail: f.detail, severity: f.severity })),
  };
}
