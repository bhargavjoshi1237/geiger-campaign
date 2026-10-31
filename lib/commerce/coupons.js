// Coupon helpers shared by the Coupons screen, the codes route and the playground (isomorphic, pure).

// 32 symbols without look-alikes (0/O, 1/I): a random byte masked to 5 bits maps uniformly onto it.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_CODES_PER_RUN = 10000;

// Admin intent (active / paused) plus dates and usage -> what shoppers actually get right now.
export function couponDisplayStatus(coupon, now = new Date()) {
  if (!coupon) return "active";
  if (coupon.status === "paused") return "paused";
  const t = now.getTime();
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= t) return "expired";
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > t) return "scheduled";
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return "used_up";
  return "active";
}

export function formatCouponValue(coupon, currency = "USD") {
  if (!coupon) return "";
  if (coupon.kind === "free_shipping") return "Free shipping";
  if (coupon.kind === "fixed") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(coupon.value || 0);
  }
  return `${Number(coupon.value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

const cleanPrefix = (prefix) => String(prefix || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);

// Cryptographically random single-use codes ("VIP-7KQ2M9XA"), unique within the run and against `exclude`.
export function generateCouponCodes(count, { prefix = "", length = 8, exclude = new Set() } = {}) {
  const n = Math.min(MAX_CODES_PER_RUN, Math.max(1, Math.trunc(Number(count) || 0)));
  const size = Math.min(16, Math.max(6, Math.trunc(Number(length) || 8)));
  const head = cleanPrefix(prefix);
  const lead = head ? (head.endsWith("-") ? head : `${head}-`) : "";
  const seen = new Set([...exclude].map((c) => String(c).toUpperCase()));
  const codes = [];
  while (codes.length < n) {
    const bytes = new Uint8Array(size);
    globalThis.crypto.getRandomValues(bytes);
    let body = "";
    for (const b of bytes) body += CODE_ALPHABET[b & 31];
    const code = `${lead}${body}`;
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

const csvCell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// codes: [{ code, batch, redeemedAt, createdAt }] -> CSV text with a header row.
export function couponCodesToCsv(codes) {
  const lines = ["code,status,batch,redeemed_at,created_at"];
  for (const c of codes) {
    lines.push([c.code, c.redeemedAt ? "redeemed" : "available", c.batch, c.redeemedAt || "", c.createdAt || ""].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
