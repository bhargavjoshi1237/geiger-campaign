// Message cost model (isomorphic, pure): SMS segment counting, rate-card lookups, per-recipient estimates and
// the effective cost of a logged delivery. Prices always come from the project's rate card or the provider —
// never from constants here — so a missing rate is reported as unknown, not as zero.

export const RATE_CATEGORIES = {
  whatsapp: [
    { value: "marketing", label: "Marketing template" },
    { value: "utility", label: "Utility template" },
    { value: "authentication", label: "Authentication template" },
    { value: "service", label: "Service reply (in window)" },
  ],
  sms: [{ value: "segment", label: "Per segment" }],
  rcs: [
    { value: "basic", label: "Basic message" },
    { value: "rich", label: "Rich message" },
  ],
};

export const rateCategoryLabel = (channel, category) =>
  RATE_CATEGORIES[channel]?.find((c) => c.value === category)?.label || category || "—";

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";
const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

// GSM-7 fits 160 characters in one segment (153 when split); anything else is UCS-2 at 70 (67 when split).
export function smsSegments(text) {
  const value = String(text || "");
  let gsmUnits = 0;
  let gsm = true;
  for (const ch of value) {
    if (BASIC.has(ch)) gsmUnits += 1;
    else if (EXTENDED.has(ch)) gsmUnits += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { encoding: "GSM-7", units: gsmUnits, segments: gsmUnits === 0 ? 0 : gsmUnits <= 160 ? 1 : Math.ceil(gsmUnits / 153) };
  }
  const units = value.length;
  return { encoding: "UCS-2", units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}

// RCS rich = media, suggestions or long text (mirrors the RCS provider's own split).
export function rcsCategory(content = {}) {
  const rich = Boolean(content.mediaUrl) || (content.buttons || []).length > 0 || String(content.text || "").length > 160;
  return rich ? "rich" : "basic";
}

// The billing category one broadcast message falls under.
export function messageCategory({ channel, content = {}, template = null }) {
  if (channel === "sms") return "segment";
  if (channel === "rcs") return rcsCategory(content);
  if (content.mode === "text") return "service";
  return template?.category || "marketing";
}

// Rate row for (channel, country, category): an exact country first, then the '*' fallback; null when missing.
export function rateFor(rates, { channel, country, category }) {
  const live = (rates || []).filter((r) => !r.deleted_at && !r.deletedAt);
  const match = (c) => live.find((r) => r.channel === channel && r.category === category && r.country === c);
  const row = (country && match(country)) || match("*");
  if (!row) return null;
  return {
    id: row.id,
    unitCost: Number(row.unit_cost ?? row.unitCost ?? 0),
    currency: row.currency || "USD",
    source: row.source || "manual",
    country: row.country,
  };
}

// WhatsApp service replies, and utility templates sent inside an open service window, aren't billed by Meta.
export function isFreeInWindow(channel, category) {
  return channel === "whatsapp" && (category === "service" || category === "utility");
}

// recipients: [{ country, units, windowOpen }] -> totals, a per-country breakdown and the countries without a rate.
export function estimateCosts(recipients, { channel, category, rates }) {
  const byCountry = new Map();
  let total = 0;
  let unknown = 0;
  let free = 0;
  let usesExample = false;
  let currency = null;
  for (const r of recipients || []) {
    const key = r.country || "";
    const row = byCountry.get(key) || { country: key, count: 0, units: 0, unitCost: null, cost: 0, missing: false, free: 0, source: null };
    row.count += 1;
    const units = Math.max(1, Number(r.units) || 1);
    row.units += units;
    if (r.windowOpen && isFreeInWindow(channel, category)) {
      row.free += 1;
      free += 1;
      byCountry.set(key, row);
      continue;
    }
    const rate = rateFor(rates, { channel, country: key, category });
    if (!rate) {
      row.missing = true;
      unknown += 1;
    } else {
      const cost = rate.unitCost * units;
      row.unitCost = rate.unitCost;
      row.source = rate.source;
      row.cost += cost;
      total += cost;
      currency = currency || rate.currency;
      if (rate.source === "example") usesExample = true;
    }
    byCountry.set(key, row);
  }
  const count = (recipients || []).length;
  return {
    total: round(total),
    perMessage: count - unknown - free > 0 ? round(total / (count - unknown - free)) : 0,
    currency: currency || "USD",
    unknown,
    free,
    usesExample,
    byCountry: [...byCountry.values()].map((r) => ({ ...r, cost: round(r.cost) })).sort((a, b) => b.count - a.count),
  };
}

// Cost of one logged delivery: provider-recorded when present, free when Meta marked it non-billable, otherwise
// the broadcast's frozen estimate or a rate-card estimate. -> { amount, kind: provider|estimated|free|unknown, category }
export function deliveryCost(delivery, { rates, country, estimate = null } = {}) {
  const channel = delivery.channel;
  const meta = delivery.metadata || delivery;
  const pricing = meta.pricing || null;
  const recorded = Number(delivery.cost) || 0;
  const currency = delivery.currency || "USD";
  if (channel === "whatsapp" && pricing?.billable === false) return { amount: 0, kind: "free", category: pricing.category || null, currency };
  if (recorded > 0 && channel === "sms") return { amount: recorded, kind: "provider", category: "segment", currency };
  if (recorded > 0) return { amount: recorded, kind: "estimated", category: null, currency };
  if (estimate != null && Number.isFinite(Number(estimate))) return { amount: Number(estimate), kind: "estimated", category: null, currency };
  const category =
    channel === "sms"
      ? "segment"
      : channel === "rcs"
        ? "basic"
        : String(pricing?.category || meta.category || "marketing").toLowerCase().replace("marketing_lite", "marketing");
  const rate = rateFor(rates, { channel, country, category });
  if (!rate) return { amount: 0, kind: "unknown", category, currency };
  return { amount: rate.unitCost, kind: "estimated", category, currency: rate.currency };
}

export function round(value, places = 5) {
  const f = 10 ** places;
  return Math.round((Number(value) || 0) * f) / f;
}

export function formatMoney(amount, currency = "USD", { precise = false } = {}) {
  const value = Number(amount) || 0;
  const digits = precise || (value !== 0 && Math.abs(value) < 1) ? 4 : 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}
