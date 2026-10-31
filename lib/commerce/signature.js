import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Webhook signatures for store ingest (server-only). Every scheme is HMAC-SHA256 over the exact raw
// request body with the store's signing secret; only the header and encoding differ per platform.

export function generateStoreSecret() {
  return `gcs_${randomBytes(32).toString("base64url")}`;
}

export function secretHint(secret) {
  return String(secret || "").slice(-4);
}

const digest = (secret, rawBody) => createHmac("sha256", secret).update(rawBody, "utf8").digest();

function safeEqual(expected, provided) {
  if (!provided || expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function decode(value, encoding) {
  try {
    const buf = Buffer.from(String(value).trim(), encoding);
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

// The scheme a request is signed with, or null when it carries no recognised signature header.
// X-Geiger-Signature works for every platform so a store's backend can add custom events.
export function detectScheme(headers) {
  if (headers.get("x-geiger-signature")) return "geiger";
  if (headers.get("x-shopify-hmac-sha256")) return "shopify";
  if (headers.get("x-wc-webhook-signature")) return "woocommerce";
  return null;
}

export function verifySignature(scheme, headers, rawBody, secret) {
  if (!secret || !scheme) return false;
  const expected = digest(secret, rawBody);
  if (scheme === "geiger") {
    const value = String(headers.get("x-geiger-signature") || "").replace(/^sha256=/i, "");
    return safeEqual(expected, /^[0-9a-f]+$/i.test(value) ? decode(value, "hex") : null);
  }
  if (scheme === "shopify") return safeEqual(expected, decode(headers.get("x-shopify-hmac-sha256"), "base64"));
  if (scheme === "woocommerce") return safeEqual(expected, decode(headers.get("x-wc-webhook-signature"), "base64"));
  return false;
}

// For documentation / tests: the X-Geiger-Signature header value for a body.
export function signGeigerBody(secret, rawBody) {
  return `sha256=${digest(secret, rawBody).toString("hex")}`;
}
