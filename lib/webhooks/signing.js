import { createHmac, timingSafeEqual } from "node:crypto";

// Webhook signatures (server-only). Header: `X-Geiger-Signature: t=<unix seconds>,v1=<hex>` where
// v1 = HMAC-SHA256(secret, "<t>.<raw body>"). During a secret rotation the header carries one v1 per
// live secret; receivers accept if any matches. Receivers should also reject t older than 5 minutes.

export const SIGNATURE_HEADER = "X-Geiger-Signature";
export const TOLERANCE_SECONDS = 300;

export function computeSignature(secret, timestamp, body) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secrets, body, timestamp = Math.floor(Date.now() / 1000)) {
  const list = (Array.isArray(secrets) ? secrets : [secrets]).filter(Boolean);
  return [`t=${timestamp}`, ...list.map((s) => `v1=${computeSignature(s, timestamp, body)}`)].join(",");
}

// Reference verifier (same algorithm as the docs' sample code).
export function verifySignature(header, body, secret, { tolerance = TOLERANCE_SECONDS, now = Date.now() } = {}) {
  const parts = String(header || "").split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > tolerance) return false;
  const expected = Buffer.from(computeSignature(secret, t, body));
  return parts
    .filter(([k]) => k === "v1")
    .some(([, v]) => {
      const actual = Buffer.from(String(v || ""));
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
}
