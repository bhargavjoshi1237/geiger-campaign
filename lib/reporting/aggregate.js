// Pure aggregation over normalized (camelCase) rows — deliveries, tracked events, campaigns, contacts,
// lists — so every reporting screen works the same on the real database and the playground's in-memory one.

import { DAY, buildBuckets, bucketKey, inWindow, toTime, weekdayIndex } from "./ranges";

const SENT_STATUSES = new Set(["sent", "delivered", "opened", "clicked", "read", "replied", "bounced", "complained", "unsubscribed"]);
const OPENED_STATUSES = new Set(["opened", "clicked", "read", "replied"]);

// When the message left: the send timestamp, else the log row's creation.
export const sendTime = (d) => d.sentAt || d.createdAt || null;

// Outcome flags for one delivery row; a click implies an open (image-blocked opens are common).
export function deliveryFlags(d) {
  const status = d.status;
  const failed = status === "failed" || status === "not_sent";
  const bounced = Boolean(d.bouncedAt) || status === "bounced";
  const sent = !failed && (Boolean(d.sentAt) || SENT_STATUSES.has(status));
  const clicked = sent && (Boolean(d.clickedAt) || Number(d.clickCount) > 0 || status === "clicked");
  const opened = sent && (clicked || Boolean(d.openedAt) || Number(d.openCount) > 0 || OPENED_STATUSES.has(status));
  const complained = status === "complained" || Boolean(d.complainedAt);
  const unsubscribed = Boolean(d.unsubscribedAt) || status === "unsubscribed";
  return { sent, delivered: sent && !bounced, opened, clicked, bounced, complained, unsubscribed, failed };
}

export function emptyTotals() {
  return { sends: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, complaints: 0, unsubscribes: 0, failed: 0, totalOpens: 0, totalClicks: 0 };
}

export function addDelivery(totals, d, flags = deliveryFlags(d)) {
  if (flags.failed) totals.failed += 1;
  if (!flags.sent) return totals;
  totals.sends += 1;
  if (flags.delivered) totals.delivered += 1;
  if (flags.opened) totals.opens += 1;
  if (flags.clicked) totals.clicks += 1;
  if (flags.bounced) totals.bounces += 1;
  if (flags.complained) totals.complaints += 1;
  if (flags.unsubscribed) totals.unsubscribes += 1;
  totals.totalOpens += Math.max(Number(d.openCount) || 0, flags.opened ? 1 : 0);
  totals.totalClicks += Math.max(Number(d.clickCount) || 0, flags.clicked ? 1 : 0);
  return totals;
}

export function mergeTotals(a, b) {
  const out = { ...a };
  for (const key of Object.keys(b)) out[key] = (out[key] || 0) + (b[key] || 0);
  return out;
}

export const ratio = (num, den) => (den > 0 ? num / den : null);

// Rates every surface shows, from a totals object (plus optional conversions/revenue).
export function rates(t) {
  return {
    deliveryRate: ratio(t.delivered, t.sends),
    openRate: ratio(t.opens, t.delivered),
    clickRate: ratio(t.clicks, t.delivered),
    ctor: ratio(t.clicks, t.opens),
    bounceRate: ratio(t.bounces, t.sends),
    complaintRate: ratio(t.complaints, t.delivered),
    unsubscribeRate: ratio(t.unsubscribes, t.delivered),
    failureRate: ratio(t.failed, t.sends + t.failed),
    conversionRate: t.conversions == null ? null : ratio(t.conversions, t.delivered),
    revenuePerRecipient: t.revenue == null ? null : ratio(t.revenue, t.delivered),
  };
}

export function summarize(deliveries) {
  const totals = emptyTotals();
  for (const d of deliveries || []) addDelivery(totals, d);
  return { ...totals, ...rates(totals) };
}

// Deliveries whose send falls inside [start, end], optionally narrowed by channel/campaign/source type.
export function deliveriesInWindow(deliveries, start, end, { channels, campaignIds, sourceTypes } = {}) {
  const ch = channels?.length ? new Set(channels) : null;
  const camp = campaignIds?.length ? new Set(campaignIds) : null;
  const src = sourceTypes?.length ? new Set(sourceTypes) : null;
  return (deliveries || []).filter((d) => {
    if (ch && !ch.has(d.channel)) return false;
    if (camp && !camp.has(d.campaignId)) return false;
    if (src && !src.has(d.sourceType)) return false;
    return inWindow(sendTime(d), start, end);
  });
}

export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const keys = keyFn(row);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (key == null) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  return map;
}

// Daily/weekly/monthly series: sends dated by send time, opens/clicks/bounces/unsubscribes by their own timestamps.
export function deliverySeries(deliveries, range, bucket = range.bucket) {
  const buckets = buildBuckets(range, bucket);
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  const rows = buckets.map((b) => ({ key: b.key, label: b.label, ...emptyTotals() }));
  const bump = (at, field) => {
    if (!inWindow(at, range.start, range.end)) return;
    const i = index.get(bucketKey(at, bucket));
    if (i != null) rows[i][field] += 1;
  };
  for (const d of deliveries || []) {
    const f = deliveryFlags(d);
    if (f.failed) bump(sendTime(d), "failed");
    if (!f.sent) continue;
    bump(sendTime(d), "sends");
    if (f.delivered) bump(d.deliveredAt || sendTime(d), "delivered");
    if (f.opened) bump(d.openedAt || d.clickedAt || sendTime(d), "opens");
    if (f.clicked) bump(d.clickedAt || d.openedAt || sendTime(d), "clicks");
    if (f.bounced) bump(d.bouncedAt || sendTime(d), "bounces");
    if (f.complained) bump(d.complainedAt || sendTime(d), "complaints");
    if (f.unsubscribed) bump(d.unsubscribedAt || sendTime(d), "unsubscribes");
  }
  return rows;
}

// Per-bucket rates over the send cohort (messages sent in each bucket and what happened to them).
export function cohortRateSeries(deliveries, range, bucket = range.bucket) {
  const buckets = buildBuckets(range, bucket);
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  const totals = buckets.map(() => emptyTotals());
  for (const d of deliveries || []) {
    const at = sendTime(d);
    if (!inWindow(at, range.start, range.end)) continue;
    const i = index.get(bucketKey(at, bucket));
    if (i != null) addDelivery(totals[i], d);
  }
  return buckets.map((b, i) => ({ key: b.key, label: b.label, ...totals[i], ...rates(totals[i]) }));
}

// 7 × 24 matrix of opens or clicks by local weekday/hour of the interaction.
export function hourWeekdayMatrix(deliveries, kind = "opens", { start, end } = {}) {
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  let total = 0;
  for (const d of deliveries || []) {
    const f = deliveryFlags(d);
    const hit = kind === "clicks" ? f.clicked : f.opened;
    if (!hit) continue;
    const at = kind === "clicks" ? d.clickedAt || d.openedAt : d.openedAt || d.clickedAt;
    if (!at || (start && end && !inWindow(at, start, end))) continue;
    const date = new Date(at);
    matrix[weekdayIndex(date)][date.getHours()] += 1;
    total += 1;
  }
  return { matrix, total, max: Math.max(0, ...matrix.flat()) };
}

// --- Recipients ---------------------------------------------------------------------------------

export function recipientDomain(address) {
  const s = String(address || "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  return at > 0 ? s.slice(at + 1) : null;
}

const PROVIDER_RULES = [
  ["Gmail", /^(gmail\.com|googlemail\.com)$/],
  ["Outlook", /^(outlook\.[a-z.]+|hotmail\.[a-z.]+|live\.[a-z.]+|msn\.com|passport\.com)$/],
  ["Yahoo", /^(yahoo\.[a-z.]+|ymail\.com|rocketmail\.com|aol\.com|aim\.com)$/],
  ["iCloud", /^(icloud\.com|me\.com|mac\.com)$/],
  ["Proton", /^(proton\.me|protonmail\.(com|ch)|pm\.me)$/],
  ["GMX & Web.de", /^(gmx\.[a-z.]+|web\.de)$/],
  ["Zoho", /^zoho(mail)?\.[a-z.]+$/],
  ["Fastmail", /^(fastmail\.(com|fm)|fastmail\.[a-z.]+)$/],
  ["Yandex & Mail.ru", /^(yandex\.[a-z.]+|ya\.ru|mail\.ru|bk\.ru|inbox\.ru|list\.ru)$/],
];

// Mailbox provider family for a recipient domain; everything else is a business/custom domain.
export function providerGroup(domain) {
  if (!domain) return "Unknown";
  for (const [label, re] of PROVIDER_RULES) if (re.test(domain)) return label;
  return "Business & other";
}

// Delivery outcomes grouped by recipient domain (email only), largest first.
export function byRecipientDomain(deliveries) {
  const groups = groupBy(
    (deliveries || []).filter((d) => d.channel === "email"),
    (d) => recipientDomain(d.to),
  );
  return [...groups.entries()]
    .map(([domain, rows]) => ({ domain, provider: providerGroup(domain), ...summarize(rows) }))
    .sort((a, b) => b.sends - a.sends);
}

export function byProvider(deliveries) {
  const groups = groupBy(
    (deliveries || []).filter((d) => d.channel === "email"),
    (d) => providerGroup(recipientDomain(d.to)),
  );
  return [...groups.entries()].map(([provider, rows]) => ({ provider, ...summarize(rows) })).sort((a, b) => b.sends - a.sends);
}

// Engagement buckets for the subscribed audience, from each contact's latest open/click and latest receipt.
export function engagementMix(contacts, deliveries, now = new Date()) {
  const lastEngaged = new Map();
  const lastReceived = new Map();
  for (const d of deliveries || []) {
    if (!d.contactId) continue;
    const f = deliveryFlags(d);
    if (!f.sent) continue;
    const sent = toTime(sendTime(d));
    if (sent > (lastReceived.get(d.contactId) ?? -Infinity)) lastReceived.set(d.contactId, sent);
    if (f.opened || f.clicked) {
      const t = toTime(d.clickedAt || d.openedAt || sendTime(d));
      if (t > (lastEngaged.get(d.contactId) ?? -Infinity)) lastEngaged.set(d.contactId, t);
    }
  }
  const nowT = now.getTime();
  const out = { engaged: 0, lapsing: 0, unengaged: 0, unreached: 0, total: 0 };
  for (const c of contacts || []) {
    if (c.status !== "subscribed") continue;
    out.total += 1;
    const engaged = lastEngaged.get(c.id);
    const received = lastReceived.get(c.id);
    if (engaged != null && nowT - engaged <= 30 * DAY) out.engaged += 1;
    else if (engaged != null && nowT - engaged <= 90 * DAY) out.lapsing += 1;
    else if (received != null && nowT - received <= 90 * DAY) out.unengaged += 1;
    else out.unreached += 1;
  }
  return out;
}

// --- Links ----------------------------------------------------------------------------------------

const CLICK_EVENT = /click/i;

// Tracked link clicks: events with a URL that came from a message (delivery/campaign) or are named *click*.
export function isLinkClick(e) {
  return Boolean(e.url) && (CLICK_EVENT.test(e.name) || ((e.deliveryId || e.campaignId) && !e.revenue));
}

export function stripTracking(url) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|gc_|mc_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    const out = `${u.origin}${u.pathname}${u.search}`;
    return out.endsWith("/") && !u.search ? out.slice(0, -1) : out;
  } catch {
    return String(url || "");
  }
}

export function topLinks(events, { start, end, campaignIds } = {}) {
  const camp = campaignIds?.length ? new Set(campaignIds) : null;
  const groups = new Map();
  for (const e of events || []) {
    if (!isLinkClick(e)) continue;
    if (start && end && !inWindow(e.occurredAt, start, end)) continue;
    if (camp && !camp.has(e.campaignId)) continue;
    const url = stripTracking(e.url);
    if (!groups.has(url)) groups.set(url, { url, clicks: 0, people: new Set(), campaigns: new Set() });
    const g = groups.get(url);
    g.clicks += 1;
    g.people.add(e.contactId || e.anonymousId || e.deliveryId || e.id);
    if (e.campaignId) g.campaigns.add(e.campaignId);
  }
  return [...groups.values()]
    .map((g) => ({ url: g.url, clicks: g.clicks, uniqueClicks: g.people.size, campaignIds: [...g.campaigns] }))
    .sort((a, b) => b.clicks - a.clicks);
}

// --- Audience ---------------------------------------------------------------------------------------

// New contacts and unsubscribes per bucket, plus the window totals.
export function audienceSeries(contacts, range, bucket = range.bucket) {
  const buckets = buildBuckets(range, bucket);
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  const rows = buckets.map((b) => ({ key: b.key, label: b.label, added: 0, unsubscribed: 0, net: 0 }));
  for (const c of contacts || []) {
    if (inWindow(c.createdAt, range.start, range.end)) {
      const i = index.get(bucketKey(c.createdAt, bucket));
      if (i != null) rows[i].added += 1;
    }
    if (c.unsubscribedAt && inWindow(c.unsubscribedAt, range.start, range.end)) {
      const i = index.get(bucketKey(c.unsubscribedAt, bucket));
      if (i != null) rows[i].unsubscribed += 1;
    }
  }
  for (const r of rows) r.net = r.added - r.unsubscribed;
  return rows;
}

export function audienceTotals(contacts, start, end) {
  let added = 0;
  let unsubscribed = 0;
  for (const c of contacts || []) {
    if (inWindow(c.createdAt, start, end)) added += 1;
    if (c.unsubscribedAt && inWindow(c.unsubscribedAt, start, end)) unsubscribed += 1;
  }
  return { added, unsubscribed, net: added - unsubscribed };
}

const LEFT = new Set(["unsubscribed", "removed"]);

// Per list: current subscribed members and adds/removals inside [start, end].
export function listGrowth(lists, members, start, end) {
  const byList = groupBy(members, (m) => m.listId);
  return (lists || [])
    .map((list) => {
      const rows = byList.get(list.id) || [];
      let current = 0;
      let added = 0;
      let removed = 0;
      for (const m of rows) {
        const active = m.status === "subscribed" && !m.deletedAt;
        if (active) current += 1;
        if (inWindow(m.createdAt, start, end)) added += 1;
        if ((LEFT.has(m.status) || m.deletedAt) && inWindow(m.deletedAt || m.updatedAt, start, end)) removed += 1;
      }
      const base = current - (added - removed);
      return { id: list.id, name: list.name, current, added, removed, net: added - removed, growth: base > 0 ? (added - removed) / base : null };
    })
    .sort((a, b) => b.current - a.current);
}

// contactId -> Set(listId) for active memberships.
export function listMembership(members) {
  const map = new Map();
  for (const m of members || []) {
    if (m.status !== "subscribed" || m.deletedAt) continue;
    if (!map.has(m.contactId)) map.set(m.contactId, new Set());
    map.get(m.contactId).add(m.listId);
  }
  return map;
}

// --- Campaigns ------------------------------------------------------------------------------------

const cached = (metrics, key) => Number(metrics?.[key]) || 0;

// Rollup for one campaign: derived from its deliveries when loaded, else from the cached metrics bag.
export function campaignRollup(campaign, deliveries, attributed = null) {
  const own = deliveries || [];
  let totals;
  let source = "deliveries";
  if (own.length) {
    totals = emptyTotals();
    for (const d of own) addDelivery(totals, d);
  } else {
    const m = campaign.metrics || {};
    source = Object.keys(m).length ? "cached" : "none";
    const delivered = cached(m, "delivered") || Math.max(0, cached(m, "recipients") - cached(m, "bounces"));
    totals = {
      ...emptyTotals(),
      sends: cached(m, "recipients") || cached(m, "sent") || delivered,
      delivered,
      opens: cached(m, "uniqueOpens") || cached(m, "opens"),
      clicks: cached(m, "uniqueClicks") || cached(m, "clicks"),
      bounces: cached(m, "bounces"),
      complaints: cached(m, "complaints"),
      unsubscribes: cached(m, "unsubscribes"),
    };
  }
  const conversions = attributed ? attributed.conversions : cached(campaign.metrics, "conversions");
  const revenue = attributed ? attributed.revenue : cached(campaign.metrics, "revenue");
  const withConv = { ...totals, conversions, revenue };
  return { ...withConv, ...rates(withConv), source };
}

// Percentage change of a count, or percentage-point change of a rate, between two periods.
export function delta(current, previous, { rate = false } = {}) {
  if (current == null || previous == null) return null;
  if (rate) return current - previous;
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

export function median(values) {
  const v = (values || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// The dominant revenue currency among events (no FX conversion is attempted).
export function dominantCurrency(events) {
  const counts = new Map();
  for (const e of events || []) {
    if (!e.revenue || !e.currency) continue;
    const c = String(e.currency).toUpperCase();
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { currency: sorted[0]?.[0] || "USD", mixed: sorted.length > 1, currencies: sorted.map(([c]) => c) };
}
