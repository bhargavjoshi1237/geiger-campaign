// Source attribution over tracked events: which UTM sources brought visitors, signups and revenue, and how
// one tracked link performed. Pure: no React, no database. Events are normalized tracked events (camelCase).

export const ATTRIBUTION_MODELS = [
  { value: "first", label: "First touch" },
  { value: "last", label: "Last touch" },
];

export const ATTRIBUTION_GROUPS = [
  { value: "source", label: "Source" },
  { value: "source_medium", label: "Source / medium" },
  { value: "campaign", label: "Campaign" },
];

const SIGNUP_EVENTS = new Set(["form_submitted"]);

const time = (e) => new Date(e.occurredAt || 0).getTime() || 0;
const lower = (v) => String(v || "").trim().toLowerCase();

export const hasUtm = (utm) => Boolean(utm && (utm.source || utm.medium || utm.campaign));

const personOf = (e) => (e.contactId ? `c:${e.contactId}` : e.anonymousId ? `a:${e.anonymousId}` : null);

const isOrder = (e) => Number(e.revenue) > 0;

// Orders can be recorded more than once (placed, completed); count each order id once.
const orderKey = (e) => {
  const p = e.properties || {};
  const id = p.orderId ?? p.order_id ?? p.id;
  return id != null ? `o:${id}` : `e:${e.id}`;
};

// { key, label, source, medium, campaign } for a UTM set; untagged traffic groups as "(direct)".
export function groupFor(utm = {}, groupBy = "source_medium") {
  const source = lower(utm.source) || "(direct)";
  const medium = lower(utm.medium) || "(none)";
  const campaign = lower(utm.campaign) || "(not set)";
  if (groupBy === "source") return { key: source, label: source, source, medium: null, campaign: null };
  if (groupBy === "campaign") return { key: campaign, label: campaign, source: null, medium: null, campaign };
  return { key: `${source}|${medium}`, label: `${source} / ${medium}`, source, medium, campaign: null };
}

// The UTM a conversion is credited to: the person's first tagged touch, or their latest one up to the event.
function creditFor(event, touches = [], model) {
  const at = time(event);
  if (model === "first") {
    const first = touches.find((t) => time(t) <= at);
    return first?.utm || (hasUtm(event.utm) ? event.utm : {});
  }
  if (hasUtm(event.utm)) return event.utm;
  let last = null;
  for (const t of touches) {
    if (time(t) > at) break;
    last = t;
  }
  return last?.utm || {};
}

// One row per source group: visitors (distinct people with a tagged visit), clicks, signups, orders and
// revenue credited by the chosen model. Sorted by revenue, then signups, then visitors.
export function attributeSources(events = [], { model = "first", groupBy = "source_medium" } = {}) {
  const sorted = events.filter((e) => e?.occurredAt).sort((a, b) => time(a) - time(b));
  const touches = new Map();
  for (const e of sorted) {
    const person = personOf(e);
    if (!person || !hasUtm(e.utm)) continue;
    if (!touches.has(person)) touches.set(person, []);
    touches.get(person).push(e);
  }

  const rows = new Map();
  const visitors = new Map();
  const rowFor = (utm) => {
    const g = groupFor(utm, groupBy);
    if (!rows.has(g.key)) {
      rows.set(g.key, { ...g, visitors: 0, touches: 0, clicks: 0, signups: 0, orders: 0, revenue: 0 });
      visitors.set(g.key, new Set());
    }
    return rows.get(g.key);
  };

  const seenOrders = new Set();
  for (const e of sorted) {
    if (hasUtm(e.utm)) {
      const r = rowFor(e.utm);
      r.touches += 1;
      if (e.name === "link_clicked") r.clicks += 1;
      visitors.get(r.key).add(personOf(e) || `e:${e.id}`);
    }
    const signup = SIGNUP_EVENTS.has(e.name);
    const order = isOrder(e);
    if (!signup && !order) continue;
    if (order) {
      const key = orderKey(e);
      if (seenOrders.has(key)) continue;
      seenOrders.add(key);
    }
    const r = rowFor(creditFor(e, touches.get(personOf(e)), model));
    if (signup) r.signups += 1;
    if (order) {
      r.orders += 1;
      r.revenue += Number(e.revenue) || 0;
    }
  }

  return [...rows.values()]
    .map((r) => ({ ...r, visitors: visitors.get(r.key).size, revenue: Math.round(r.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue || b.signups - a.signups || b.visitors - a.visitors);
}

// True when an event's UTM carries the link's source, medium and campaign (case-insensitive).
export function utmMatches(eventUtm = {}, linkUtm = {}) {
  const keys = ["source", "medium", "campaign"].filter((k) => lower(linkUtm[k]));
  if (!keys.length) return false;
  return keys.every((k) => lower(eventUtm?.[k]) === lower(linkUtm[k]));
}

// Clicks recorded by /l/<slug>, signups carrying the link's UTM, and orders by contacts who clicked it first.
export function linkPerformance(link, events = []) {
  if (!link) return { clicks: [], signups: 0, orders: 0, revenue: 0, contacts: 0 };
  const sorted = events.filter((e) => e?.occurredAt).sort((a, b) => time(a) - time(b));
  const clicks = sorted.filter((e) => e.name === "link_clicked" && (e.properties?.linkId === link.id || e.properties?.slug === link.slug));
  const firstClick = new Map();
  for (const c of clicks) if (c.contactId && !firstClick.has(c.contactId)) firstClick.set(c.contactId, time(c));
  let signups = 0;
  let orders = 0;
  let revenue = 0;
  const seen = new Set();
  for (const e of sorted) {
    if (SIGNUP_EVENTS.has(e.name) && utmMatches(e.utm, link.utm)) signups += 1;
    if (!isOrder(e) || !e.contactId) continue;
    const clickedAt = firstClick.get(e.contactId);
    if (clickedAt == null || time(e) < clickedAt) continue;
    const key = orderKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    orders += 1;
    revenue += Number(e.revenue) || 0;
  }
  return { clicks: clicks.reverse(), signups, orders, revenue: Math.round(revenue * 100) / 100, contacts: firstClick.size };
}

// The most common currency across revenue events, for display.
export function dominantCurrency(events = [], fallback = "USD") {
  const counts = new Map();
  for (const e of events) if (isOrder(e) && e.currency) counts.set(e.currency, (counts.get(e.currency) || 0) + 1);
  let best = fallback;
  let max = 0;
  for (const [c, n] of counts) if (n > max) [best, max] = [c, n];
  return best;
}
