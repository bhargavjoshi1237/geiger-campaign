// Revenue arithmetic shared by the commerce screens and server code (isomorphic, pure). Orders are the
// normalized camelCase view models from lib/supabase/orders.js.

// Cancelled and fully refunded orders don't count; partial refunds count net of the refund.
export const REVENUE_STATUSES = new Set(["pending", "paid", "fulfilled", "partially_refunded"]);

export function countsAsRevenue(order) {
  return REVENUE_STATUSES.has(order?.status);
}

export function netRevenue(order) {
  if (!countsAsRevenue(order)) return 0;
  return Math.max(0, Number(order.total || 0) - Number(order.refundedAmount || 0));
}

// Money in mixed currencies can't be summed: total the most common currency and report what was left out.
export function totalInPrimaryCurrency(rows, valueOf, currencyOf = (r) => r.currency || "USD") {
  const totals = new Map();
  for (const row of rows) {
    const currency = currencyOf(row);
    const entry = totals.get(currency) || { total: 0, count: 0 };
    entry.total += Number(valueOf(row)) || 0;
    entry.count += 1;
    totals.set(currency, entry);
  }
  if (totals.size === 0) return { currency: "USD", total: 0, excluded: 0 };
  const [currency, entry] = [...totals.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return { currency, total: entry.total, excluded: rows.length - entry.count };
}
