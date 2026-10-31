// The report engine behind Dashboards, Custom Reports and scheduled report emails: a metric × dimension ×
// filters × range definition evaluated over prepared sources. Pure and isomorphic. Delivery metrics count the
// send cohort (messages sent in the period and what happened to them); conversions count by conversion time.

import { matchesConditions } from "@/lib/audience/segment_rules";
import {
  addDelivery,
  dominantCurrency,
  emptyTotals,
  groupBy,
  listMembership,
  providerGroup,
  ratio,
  recipientDomain,
  sendTime,
} from "./aggregate";
import { DEFAULT_ATTRIBUTION, attribute, conversionEvents, creditsBy, normalizeAttribution } from "./attribution";
import { hourLabel } from "./format";
import { DEFAULT_RANGE, WEEKDAYS, buildBuckets, bucketKey, inWindow, isRangeKey, resolveRange, weekdayIndex } from "./ranges";

export const CHANNEL_LABELS = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
  in_app: "In-app",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  rcs: "RCS",
};

export const channelLabel = (c) => CHANNEL_LABELS[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : "Unknown");

const SOURCE_TYPE_LABELS = {
  automation: "Automations",
  broadcast: "Broadcasts",
  transactional: "Transactional",
  flow: "Flows",
  test: "Test sends",
  inbox: "Inbox replies",
  community: "Communities",
};

// --- Catalog ------------------------------------------------------------------------------------

const d = (a) => a.d;
export const METRICS = [
  { key: "sends", label: "Sends", format: "number", family: "delivery", value: (a) => d(a).sends },
  { key: "delivered", label: "Delivered", format: "number", family: "delivery", value: (a) => d(a).delivered },
  { key: "opens", label: "Unique opens", format: "number", family: "delivery", value: (a) => d(a).opens },
  { key: "clicks", label: "Unique clicks", format: "number", family: "delivery", value: (a) => d(a).clicks },
  { key: "bounces", label: "Bounces", format: "number", family: "delivery", inverse: true, value: (a) => d(a).bounces },
  { key: "complaints", label: "Spam complaints", format: "number", family: "delivery", inverse: true, value: (a) => d(a).complaints },
  { key: "unsubscribes", label: "Unsubscribes", format: "number", family: "delivery", inverse: true, value: (a) => d(a).unsubscribes },
  { key: "failed", label: "Failed sends", format: "number", family: "delivery", inverse: true, value: (a) => d(a).failed },
  { key: "delivery_rate", label: "Delivery rate", format: "percent", family: "delivery", rate: true, value: (a) => ratio(d(a).delivered, d(a).sends) },
  { key: "open_rate", label: "Open rate", format: "percent", family: "delivery", rate: true, value: (a) => ratio(d(a).opens, d(a).delivered) },
  { key: "click_rate", label: "Click rate", format: "percent", family: "delivery", rate: true, value: (a) => ratio(d(a).clicks, d(a).delivered) },
  { key: "ctor", label: "Click-to-open rate", format: "percent", family: "delivery", rate: true, value: (a) => ratio(d(a).clicks, d(a).opens) },
  { key: "bounce_rate", label: "Bounce rate", format: "percent", family: "delivery", rate: true, inverse: true, value: (a) => ratio(d(a).bounces, d(a).sends) },
  { key: "complaint_rate", label: "Complaint rate", format: "percent", family: "delivery", rate: true, inverse: true, value: (a) => ratio(d(a).complaints, d(a).delivered) },
  { key: "unsubscribe_rate", label: "Unsubscribe rate", format: "percent", family: "delivery", rate: true, inverse: true, value: (a) => ratio(d(a).unsubscribes, d(a).delivered) },
  { key: "conversions", label: "Attributed conversions", format: "number", family: "attributed", value: (a) => a.c.conversions },
  { key: "revenue", label: "Attributed revenue", format: "currency", family: "attributed", value: (a) => a.c.revenue },
  { key: "conversion_rate", label: "Conversion rate", format: "percent", family: "mixed", rate: true, value: (a) => ratio(a.c.conversions, d(a).delivered) },
  { key: "revenue_per_recipient", label: "Revenue per recipient", format: "currency", family: "mixed", rate: true, value: (a) => ratio(a.c.revenue, d(a).delivered) },
  { key: "total_conversions", label: "All conversions", format: "number", family: "conversion", value: (a) => a.v.conversions },
  { key: "total_revenue", label: "Revenue (all sources)", format: "currency", family: "conversion", value: (a) => a.v.revenue },
  { key: "new_contacts", label: "New contacts", format: "number", family: "contact", value: (a) => a.n.added },
];

export const METRIC_MAP = Object.fromEntries(METRICS.map((m) => [m.key, m]));

const ALL = ["delivery", "attributed", "mixed", "conversion", "contact"];
const MESSAGE = ["delivery", "attributed", "mixed"];

export const DIMENSIONS = [
  { key: "none", label: "Total", kind: "total", families: ALL },
  { key: "time", label: "Over time", kind: "time", families: ALL },
  { key: "day", label: "Day", kind: "time", bucket: "day", families: ALL },
  { key: "week", label: "Week", kind: "time", bucket: "week", families: ALL },
  { key: "month", label: "Month", kind: "time", bucket: "month", families: ALL },
  { key: "campaign", label: "Campaign", kind: "category", families: MESSAGE },
  { key: "channel", label: "Channel", kind: "category", families: MESSAGE },
  { key: "variant", label: "A/B variant", kind: "category", families: MESSAGE },
  { key: "provider", label: "Mailbox provider", kind: "category", families: MESSAGE },
  { key: "domain", label: "Recipient domain", kind: "category", families: MESSAGE },
  { key: "weekday", label: "Weekday", kind: "ordinal", families: [...MESSAGE, "conversion"] },
  { key: "hour", label: "Hour of day", kind: "ordinal", families: [...MESSAGE, "conversion"] },
  { key: "list", label: "List", kind: "category", families: [...MESSAGE, "conversion", "contact"] },
  { key: "segment", label: "Segment", kind: "category", families: [...MESSAGE, "conversion", "contact"] },
  { key: "source", label: "Source", kind: "category", families: ["attributed", "conversion", "contact"] },
  { key: "event", label: "Conversion event", kind: "category", families: ["attributed", "conversion"] },
];

export const DIMENSION_MAP = Object.fromEntries(DIMENSIONS.map((x) => [x.key, x]));

export const CHART_TYPES = [
  { value: "line", label: "Line chart", kinds: ["time"] },
  { value: "bar", label: "Bar chart", kinds: ["time", "category", "ordinal"] },
  { value: "table", label: "Table", kinds: ["time", "category", "ordinal", "total"] },
  { value: "kpi", label: "Single number", kinds: ["total"] },
];

export const dimensionsFor = (metricKey) => DIMENSIONS.filter((x) => x.families.includes(METRIC_MAP[metricKey]?.family));
export const chartsFor = (dimensionKey) => CHART_TYPES.filter((c) => c.kinds.includes(DIMENSION_MAP[dimensionKey]?.kind));

export const DEFAULT_DEFINITION = Object.freeze({
  metric: "sends",
  dimension: "time",
  filters: { channels: [], campaignIds: [], listIds: [] },
  range: DEFAULT_RANGE,
  chart: "line",
  limit: 10,
});

const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

export function normalizeFilters(f = {}) {
  return { channels: ids(f.channels), campaignIds: ids(f.campaignIds), listIds: ids(f.listIds) };
}

// Coerces any stored definition into a valid one: unknown metric -> sends, incompatible dimension/chart fixed up.
export function normalizeDefinition(input = {}) {
  const metric = METRIC_MAP[input.metric] ? input.metric : DEFAULT_DEFINITION.metric;
  const dims = dimensionsFor(metric);
  const dimension = dims.some((x) => x.key === input.dimension) ? input.dimension : dims.find((x) => x.key === "time")?.key || dims[0].key;
  const charts = chartsFor(dimension);
  const chart = charts.some((c) => c.value === input.chart) ? input.chart : charts[0].value;
  const limit = Math.min(100, Math.max(3, Number(input.limit) || DEFAULT_DEFINITION.limit));
  return { metric, dimension, filters: normalizeFilters(input.filters), range: isRangeKey(input.range) ? input.range : DEFAULT_RANGE, chart, limit };
}

// Dashboard widgets: { id, widget, metric, dimension, range ("dashboard" or a range key), size, title }.
export const WIDGET_TYPES = [
  { value: "kpi", label: "KPI", description: "One number for the period, with the change vs the previous period.", dims: ["none"], size: "sm" },
  { value: "timeseries", label: "Time series", description: "The metric over time.", dims: ["time", "day", "week", "month"], size: "md" },
  { value: "bar", label: "Bar by dimension", description: "The metric broken down by campaign, channel, list…", dims: null, size: "md" },
  { value: "table", label: "Table", description: "A ranked table of the metric by a dimension.", dims: null, size: "md" },
];

export const WIDGET_SIZES = [
  { value: "sm", label: "Quarter width" },
  { value: "md", label: "Half width" },
  { value: "lg", label: "Three quarters" },
  { value: "full", label: "Full width" },
];

export function widgetDimensions(type, metric) {
  const allowed = dimensionsFor(metric);
  const spec = WIDGET_TYPES.find((w) => w.value === type) || WIDGET_TYPES[0];
  if (spec.dims) return allowed.filter((x) => spec.dims.includes(x.key));
  return allowed.filter((x) => x.kind === "category" || x.kind === "ordinal");
}

export function normalizeWidget(input = {}, index = 0) {
  const type = WIDGET_TYPES.some((w) => w.value === input.widget) ? input.widget : "kpi";
  const metric = METRIC_MAP[input.metric] ? input.metric : "sends";
  const dims = widgetDimensions(type, metric);
  const fallbackDim = dims[0]?.key || "none";
  const dimension = dims.some((x) => x.key === input.dimension) ? input.dimension : fallbackDim;
  const spec = WIDGET_TYPES.find((w) => w.value === type);
  return {
    id: typeof input.id === "string" && input.id ? input.id : `w${index + 1}`,
    widget: type,
    metric,
    dimension,
    range: isRangeKey(input.range) ? input.range : "dashboard",
    size: WIDGET_SIZES.some((s) => s.value === input.size) ? input.size : spec.size,
    title: typeof input.title === "string" ? input.title.slice(0, 80) : "",
  };
}

export const normalizeLayout = (layout) => (Array.isArray(layout) ? layout.map(normalizeWidget) : []);

export function widgetTitle(w) {
  if (w.title) return w.title;
  const metric = METRIC_MAP[w.metric]?.label || w.metric;
  if (w.widget === "kpi") return metric;
  if (w.widget === "timeseries") return `${metric} over time`;
  return `${metric} by ${(DIMENSION_MAP[w.dimension]?.label || w.dimension).toLowerCase()}`;
}

// --- Sources -----------------------------------------------------------------------------------

// Builds the indexes every query shares once: lookups, attribution rows and lazy segment membership.
export function prepareSources(sources = {}, { attribution = DEFAULT_ATTRIBUTION } = {}) {
  const campaigns = sources.campaigns || [];
  const deliveries = sources.deliveries || [];
  const events = sources.events || [];
  const contacts = sources.contacts || [];
  const campaignsById = new Map(campaigns.map((c) => [c.id, c]));
  const deliveriesById = new Map(deliveries.map((x) => [x.id, x]));
  const contactsById = new Map(contacts.map((c) => [c.id, c]));
  const config = normalizeAttribution(attribution);
  const conversions = conversionEvents(events, config);
  const attributedRows = attribute(conversions, deliveries, config, { campaignsById });
  const listsByContact = listMembership(sources.listMembers);
  const listsById = new Map((sources.lists || []).map((l) => [l.id, l]));
  const segments = sources.segments || [];
  const segmentsById = new Map(segments.map((s) => [s.id, s]));

  let segmentsByContact = null;
  const segmentsFor = (contactId) => {
    if (!contactId || !segments.length) return [];
    if (!segmentsByContact) {
      segmentsByContact = new Map();
      const eventsByContact = groupBy(events, (e) => e.contactId);
      const deliveriesByContact = groupBy(deliveries, (x) => x.contactId);
      for (const contact of contacts) {
        const ctx = {
          listIds: listsByContact.get(contact.id) || new Set(),
          events: eventsByContact.get(contact.id) || [],
          deliveries: deliveriesByContact.get(contact.id) || [],
        };
        const hits = segments.filter((s) => {
          try {
            return matchesConditions(contact, { match: s.match, conditions: s.conditions }, ctx);
          } catch {
            return false;
          }
        });
        segmentsByContact.set(contact.id, hits.map((s) => s.id));
      }
    }
    return segmentsByContact.get(contactId) || [];
  };

  return {
    ...sources,
    campaigns,
    deliveries,
    events,
    contacts,
    campaignsById,
    deliveriesById,
    contactsById,
    attribution: config,
    conversions,
    attributedRows,
    listsByContact,
    listsById,
    segmentsById,
    segmentsFor,
    currency: dominantCurrency(conversions),
  };
}

// Campaign id -> { conversions, revenue } credited under the prepared attribution model.
export const creditsByCampaign = (prepared) => creditsBy(prepared.attributedRows, (c) => c.campaignId);

// --- Keys and labels ---------------------------------------------------------------------------

function timeKeys(at, bucket) {
  return bucketKey(at, bucket);
}

function contactLists(p, contactId) {
  const set = contactId ? p.listsByContact.get(contactId) : null;
  return set && set.size ? [...set] : ["__none"];
}

function contactSegments(p, contactId) {
  const hits = p.segmentsFor(contactId);
  return hits.length ? hits : ["__none"];
}

function deliveryKeys(dim, x, p, bucket) {
  switch (dim) {
    case "none": return "all";
    case "campaign": return x.campaignId || `__${x.sourceType || "other"}`;
    case "channel": return x.channel || "email";
    case "variant": return x.variant || "__none";
    case "provider": return x.channel === "email" ? providerGroup(recipientDomain(x.to)) : null;
    case "domain": return x.channel === "email" ? recipientDomain(x.to) : null;
    case "weekday": return weekdayIndex(sendTime(x));
    case "hour": return new Date(sendTime(x)).getHours();
    case "list": return contactLists(p, x.contactId);
    case "segment": return contactSegments(p, x.contactId);
    default: return timeKeys(sendTime(x), bucket);
  }
}

function creditKeys(dim, c, r, p, bucket) {
  const sentAt = sendTime(p.deliveriesById.get(c.deliveryId) || {}) || r.at;
  switch (dim) {
    case "none": return "all";
    case "campaign": return c.campaignId || "__other";
    case "channel": return c.channel || "email";
    case "variant": return c.variant || "__none";
    case "provider": return c.channel === "email" && c.to ? providerGroup(recipientDomain(c.to)) : null;
    case "domain": return c.channel === "email" && c.to ? recipientDomain(c.to) : null;
    case "weekday": return weekdayIndex(sentAt);
    case "hour": return new Date(sentAt).getHours();
    case "list": return contactLists(p, r.contactId);
    case "segment": return contactSegments(p, r.contactId);
    case "source": return r.source;
    case "event": return r.name;
    default: return timeKeys(r.at, bucket);
  }
}

function conversionKeys(dim, r, p, bucket) {
  switch (dim) {
    case "none": return "all";
    case "weekday": return weekdayIndex(r.at);
    case "hour": return new Date(r.at).getHours();
    case "list": return contactLists(p, r.contactId);
    case "segment": return contactSegments(p, r.contactId);
    case "source": return r.source;
    case "event": return r.name;
    default: return timeKeys(r.at, bucket);
  }
}

function contactKeys(dim, c, p, bucket) {
  switch (dim) {
    case "none": return "all";
    case "list": return contactLists(p, c.id);
    case "segment": return contactSegments(p, c.id);
    case "source": return c.source || "manual";
    default: return timeKeys(c.createdAt, bucket);
  }
}

export function keyLabel(dim, key, p) {
  if (key === "__none") return dim === "variant" ? "No variant" : dim === "list" ? "Not in a list" : "No segment";
  switch (dim) {
    case "campaign":
      if (String(key).startsWith("__")) return SOURCE_TYPE_LABELS[String(key).slice(2)] || "Other messages";
      return p.campaignsById.get(key)?.name || "Deleted campaign";
    case "channel": return channelLabel(key);
    case "variant": return `Variant ${key}`;
    case "weekday": return WEEKDAYS[key] ?? String(key);
    case "hour": return hourLabel(key);
    case "list": return p.listsById.get(key)?.name || "Deleted list";
    case "segment": return p.segmentsById.get(key)?.name || "Deleted segment";
    case "event": return String(key).replace(/_/g, " ");
    default: return String(key);
  }
}

// --- Evaluation --------------------------------------------------------------------------------

const newAcc = () => ({ d: emptyTotals(), c: { conversions: 0, revenue: 0 }, v: { conversions: 0, revenue: 0 }, n: { added: 0 } });

function passesFilters(filters, { channel, campaignId, contactId }, p) {
  if (filters.channels.length && !filters.channels.includes(channel)) return false;
  if (filters.campaignIds.length && !filters.campaignIds.includes(campaignId)) return false;
  if (filters.listIds.length) {
    const lists = contactId ? p.listsByContact.get(contactId) : null;
    if (!lists || !filters.listIds.some((id) => lists.has(id))) return false;
  }
  return true;
}

function accumulate(metric, dim, filters, p, start, end, bucket) {
  const groups = new Map();
  const acc = (key) => {
    if (!groups.has(key)) groups.set(key, newAcc());
    return groups.get(key);
  };
  const keysOf = (k) => (Array.isArray(k) ? k : [k]).filter((x) => x != null);
  const family = metric.family;

  if (family === "delivery" || family === "mixed") {
    for (const x of p.deliveries) {
      if (!inWindow(sendTime(x), start, end)) continue;
      if (!passesFilters(filters, { channel: x.channel, campaignId: x.campaignId, contactId: x.contactId }, p)) continue;
      for (const key of keysOf(deliveryKeys(dim, x, p, bucket))) addDelivery(acc(key).d, x);
    }
  }
  if (family === "attributed" || family === "mixed") {
    for (const r of p.attributedRows) {
      if (!inWindow(r.at, start, end)) continue;
      for (const c of r.credits) {
        if (!passesFilters(filters, { channel: c.channel, campaignId: c.campaignId, contactId: r.contactId }, p)) continue;
        for (const key of keysOf(creditKeys(dim, c, r, p, bucket))) {
          const a = acc(key).c;
          a.conversions += c.weight;
          a.revenue += r.revenue * c.weight;
        }
      }
    }
  }
  if (family === "conversion") {
    for (const r of p.attributedRows) {
      if (!inWindow(r.at, start, end)) continue;
      if (filters.listIds.length && !passesFilters({ ...filters, channels: [], campaignIds: [] }, { contactId: r.contactId }, p)) continue;
      for (const key of keysOf(conversionKeys(dim, r, p, bucket))) {
        const a = acc(key).v;
        a.conversions += 1;
        a.revenue += r.revenue;
      }
    }
  }
  if (family === "contact") {
    for (const c of p.contacts) {
      if (!inWindow(c.createdAt, start, end)) continue;
      if (filters.listIds.length && !passesFilters({ ...filters, channels: [], campaignIds: [] }, { contactId: c.id }, p)) continue;
      for (const key of keysOf(contactKeys(dim, c, p, bucket))) acc(key).n.added += 1;
    }
  }
  return groups;
}

const support = (a) => ({ sends: a.d.sends, delivered: a.d.delivered });

// Evaluates a definition. Returns { kind, metric, dimension, range, value, previous, rows, currency }.
export function runQuery(definition, prepared, { now = new Date(), range: rangeKey } = {}) {
  const def = normalizeDefinition(definition);
  const metric = METRIC_MAP[def.metric];
  const dimension = DIMENSION_MAP[def.dimension];
  const range = resolveRange(rangeKey || def.range, now);
  const bucket = dimension.bucket || range.bucket;

  const totalNow = accumulate(metric, "none", def.filters, prepared, range.start, range.end, bucket).get("all") || newAcc();
  const totalPrev = accumulate(metric, "none", def.filters, prepared, range.prevStart, range.prevEnd, bucket).get("all") || newAcc();
  const base = {
    definition: def,
    metric,
    dimension,
    range,
    value: metric.value(totalNow),
    previous: metric.value(totalPrev),
    totals: support(totalNow),
    currency: prepared.currency?.currency || "USD",
    mixedCurrency: Boolean(prepared.currency?.mixed),
  };

  if (dimension.kind === "total") {
    return { ...base, kind: "total", rows: [{ key: "all", label: "Total", value: base.value, ...support(totalNow) }] };
  }

  const groups = accumulate(metric, dimension.key, def.filters, prepared, range.start, range.end, bucket);

  if (dimension.kind === "time") {
    const rows = buildBuckets(range, bucket).map((b) => {
      const a = groups.get(b.key) || newAcc();
      const value = metric.value(a);
      return { key: b.key, label: b.label, value: value ?? (metric.rate ? null : 0), ...support(a) };
    });
    return { ...base, kind: "time", rows };
  }

  if (dimension.kind === "ordinal") {
    const keys = dimension.key === "weekday" ? WEEKDAYS.map((_, i) => i) : Array.from({ length: 24 }, (_, i) => i);
    const rows = keys.map((key) => {
      const a = groups.get(key) || newAcc();
      const value = metric.value(a);
      return { key, label: keyLabel(dimension.key, key, prepared), value: value ?? (metric.rate ? null : 0), ...support(a) };
    });
    return { ...base, kind: "ordinal", rows };
  }

  const rows = [...groups.entries()]
    .map(([key, a]) => ({ key, label: keyLabel(dimension.key, key, prepared), value: metric.value(a), ...support(a) }))
    .filter((r) => r.value != null && (r.value !== 0 || metric.rate))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return { ...base, kind: "category", rows: rows.slice(0, def.limit), totalRows: rows.length };
}

// Flat rows + columns for CSV export and report emails.
export function resultTable(result) {
  const metricLabel = result.metric.label;
  const dimLabel = result.dimension.kind === "total" ? "Period" : result.dimension.label;
  const columns = [
    { key: "label", header: dimLabel },
    { key: "value", header: metricLabel },
  ];
  if (result.metric.rate && result.metric.family !== "conversion") {
    columns.push({ key: "delivered", header: "Delivered" });
  }
  const rows = result.rows.map((r) => ({
    ...r,
    label: result.dimension.kind === "total" ? result.range.label : r.label,
  }));
  return { columns, rows };
}
