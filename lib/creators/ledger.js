// Commission and payout maths (isomorphic, pure): used by the attribution sweep, the payout generator
// route, the Payouts preview in the browser and the playground. Amounts are rounded to cents.

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// { kind: "percent" | "flat", value } applied to one order's revenue.
export function commissionFor(commission, revenue) {
  const value = Math.max(0, Number(commission?.value) || 0);
  if (commission?.kind === "flat") return round2(value);
  return round2((Math.max(0, Number(revenue) || 0) * value) / 100);
}

export function describeCommission(commission, currency = "USD") {
  const value = Number(commission?.value) || 0;
  if (commission?.kind === "flat") {
    return `${new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value)} per order`;
  }
  return `${value}% of revenue`;
}

// "2026-10" for a date (UTC calendar month).
export function periodOf(date = new Date()) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isPeriod(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// Exclusive end of a period: the first instant of the following month.
export function periodEnd(period) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString();
}

export function periodLabel(period) {
  if (!isPeriod(period)) return period || "";
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// The last `count` periods ending with the current month, newest first.
export function recentPeriods(count = 12, now = new Date()) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

// Groups what's owed up to the end of `period` into one draft per creator and currency:
// approved conversions and completed collaboration fees not yet on a payout.
// Rows are camelCase or snake_case ({ creatorId | creator_id, ... }).
export function buildPayoutDrafts({ conversions = [], collaborations = [], period }) {
  const end = Date.parse(periodEnd(period));
  const pick = (row, camel, snake) => row[camel] ?? row[snake] ?? null;
  const drafts = new Map();
  const draftFor = (creatorId, currency) => {
    const key = `${creatorId}|${currency}`;
    if (!drafts.has(key)) {
      drafts.set(key, {
        creatorId,
        currency,
        amount: 0,
        conversionIds: [],
        collaborationIds: [],
        lines: { conversions: { count: 0, commission: 0, revenue: 0 }, collaborations: [] },
      });
    }
    return drafts.get(key);
  };

  for (const c of conversions) {
    if (c.status !== "approved" || pick(c, "payoutId", "payout_id") || pick(c, "deletedAt", "deleted_at")) continue;
    const creatorId = pick(c, "creatorId", "creator_id");
    const at = Date.parse(pick(c, "occurredAt", "occurred_at"));
    if (!creatorId || !(at < end)) continue;
    const d = draftFor(creatorId, c.currency || "USD");
    d.conversionIds.push(c.id);
    d.lines.conversions.count += 1;
    d.lines.conversions.commission = round2(d.lines.conversions.commission + Number(c.commission || 0));
    d.lines.conversions.revenue = round2(d.lines.conversions.revenue + Number(c.revenue || 0));
    d.amount = round2(d.amount + Number(c.commission || 0));
  }

  for (const c of collaborations) {
    const fee = Number(c.fee || 0);
    if (c.status !== "completed" || fee <= 0 || pick(c, "payoutId", "payout_id") || pick(c, "deletedAt", "deleted_at")) continue;
    const creatorId = pick(c, "creatorId", "creator_id");
    const at = Date.parse(pick(c, "completedAt", "completed_at") || pick(c, "updatedAt", "updated_at"));
    if (!creatorId || !(at < end)) continue;
    const d = draftFor(creatorId, c.currency || "USD");
    d.collaborationIds.push(c.id);
    d.lines.collaborations.push({ id: c.id, campaignName: pick(c, "campaignName", "campaign_name") || "", fee: round2(fee) });
    d.amount = round2(d.amount + fee);
  }

  return [...drafts.values()].filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount);
}

// Adds a draft's lines onto an existing pending payout's lines.
export function mergePayoutLines(existing = {}, extra = {}) {
  const a = existing.conversions || { count: 0, commission: 0, revenue: 0 };
  const b = extra.conversions || { count: 0, commission: 0, revenue: 0 };
  return {
    conversions: {
      count: (a.count || 0) + (b.count || 0),
      commission: round2((a.commission || 0) + (b.commission || 0)),
      revenue: round2((a.revenue || 0) + (b.revenue || 0)),
    },
    collaborations: [...(existing.collaborations || []), ...(extra.collaborations || [])],
  };
}

const csvCell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV for a payout export. `payouts` are snake_case rows; `creators` maps id -> { name, email }.
export function payoutsCsv(payouts = [], creators = new Map()) {
  const header = [
    "payout_id", "creator", "email", "period", "currency", "amount", "status", "conversions",
    "conversion_commission", "collaboration_fees", "method", "reference", "approved_at", "paid_at",
  ];
  const lines = payouts.map((p) => {
    const creator = creators.get(p.creator_id) || {};
    const l = p.lines || {};
    const fees = round2((l.collaborations || []).reduce((s, c) => s + Number(c.fee || 0), 0));
    return [
      p.id, creator.name || "", creator.email || "", p.period, p.currency, round2(p.amount).toFixed(2), p.status,
      l.conversions?.count || 0, round2(l.conversions?.commission || 0).toFixed(2), fees.toFixed(2),
      p.method || "", p.reference || "", p.approved_at || "", p.paid_at || "",
    ].map(csvCell).join(",");
  });
  return [header.join(","), ...lines].join("\r\n");
}
