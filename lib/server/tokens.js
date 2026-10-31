import { createHmac, timingSafeEqual } from "node:crypto";

// Compact signed tokens for links a recipient follows without signing in (unsubscribe, preference
// centre, open/click tracking, double opt-in). Payload is base64url JSON, signature is HMAC-SHA256
// over it with CAMPAIGN_SIGNING_SECRET. Tokens are tamper-proof, not secret — never put PII in them.

function secret() {
  const value = process.env.CAMPAIGN_SIGNING_SECRET;
  if (!value) throw new Error("CAMPAIGN_SIGNING_SECRET is not configured.");
  return value;
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (body) => createHmac("sha256", secret()).update(body).digest("base64url");

export function isSigningConfigured() {
  return Boolean(process.env.CAMPAIGN_SIGNING_SECRET);
}

// signToken({ k: "unsub", d: deliveryId }, { ttlDays: 365 })
export function signToken(payload, { ttlDays = null } = {}) {
  const body = encode(ttlDays ? { ...payload, exp: Date.now() + ttlDays * 86_400_000 } : payload);
  return `${body}.${sign(body)}`;
}

// The payload, or null when the token is malformed, forged or expired.
export function verifyToken(token, kind = null) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  try {
    const expected = Buffer.from(sign(body));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    if (kind && payload.k !== kind) return null;
    return payload;
  } catch {
    return null;
  }
}
