import { createHmac, timingSafeEqual } from "node:crypto";

// Thin server-only client for Meta's Graph API (Instagram, Messenger, WhatsApp Cloud, Marketing API).
// Every Meta integration builds on graphRequest; the version is pinned by META_GRAPH_VERSION.
// Never throws: returns { ok, status, data, error }.

const DEFAULT_VERSION = "v24.0";

export function graphVersion() {
  return process.env.META_GRAPH_VERSION || DEFAULT_VERSION;
}

export async function graphRequest(path, { token, method = "GET", query = null, body = null, host = "graph.facebook.com", signal } = {}) {
  const url = new URL(`https://${host}/${graphVersion()}/${String(path).replace(/^\/+/, "")}`);
  if (query) for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      return { ok: false, status: res.status, data, error: data?.error?.message || `Graph API returned ${res.status}` };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (error) {
    console.error("[meta.graph]", method, path, error?.message);
    return { ok: false, status: 0, data: null, error: "request_failed" };
  }
}

// Validates X-Hub-Signature-256 ("sha256=<hex>") over the raw request body with the app secret.
export function verifyMetaSignature(rawBody, signatureHeader, appSecret = process.env.META_APP_SECRET) {
  if (!appSecret || typeof signatureHeader !== "string" || !signatureHeader.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const actual = Buffer.from(signatureHeader);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Send API for Messenger and Instagram (Facebook Login flavour): POST /{node-id}/messages.
// recipient: { id } for a PSID/IGSID or { comment_id } for a private reply to a comment.
export function sendGraphMessage({ nodeId, token, recipient, message, messagingType = "RESPONSE", tag = null }) {
  return graphRequest(`${nodeId}/messages`, {
    token,
    method: "POST",
    body: { recipient, message, messaging_type: tag ? "MESSAGE_TAG" : messagingType, ...(tag ? { tag } : {}) },
  });
}
