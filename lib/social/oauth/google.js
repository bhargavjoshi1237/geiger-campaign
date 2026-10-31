import { createHmac, createSign, timingSafeEqual } from "node:crypto";

// Google service-account auth without extra dependencies (server-only): an RS256 JWT assertion exchanged at the
// token endpoint (RFC 7523), cached until shortly before it expires. Used for the RCS Business Messaging agent.

const cache = new Map();

export function parseServiceAccount(input) {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!value?.client_email || !value?.private_key) return null;
  return {
    type: value.type || "service_account",
    project_id: value.project_id || null,
    client_email: value.client_email,
    private_key: value.private_key,
    token_uri: value.token_uri || "https://oauth2.googleapis.com/token",
  };
}

const b64url = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

export async function googleAccessToken(serviceAccount, scopes) {
  const account = parseServiceAccount(serviceAccount);
  if (!account) return { ok: false, token: null, error: "The service account key is missing client_email or private_key." };
  const scope = Array.isArray(scopes) ? scopes.join(" ") : String(scopes);
  const key = `${account.client_email}|${scope}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return { ok: true, token: cached.token, error: null };

  try {
    const iat = Math.floor(Date.now() / 1000);
    const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ iss: account.client_email, scope, aud: account.token_uri, iat, exp: iat + 3600 })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key).toString("base64url");
    const res = await fetch(account.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.access_token) {
      return { ok: false, token: null, error: data?.error_description || data?.error || `Google returned ${res.status}` };
    }
    cache.set(key, { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
    return { ok: true, token: data.access_token, error: null };
  } catch (error) {
    console.error("[google.token]", error?.message);
    return { ok: false, token: null, error: "Couldn't sign in with the service account key." };
  }
}

// Authenticated JSON call to a Google API. Never throws: { ok, status, data, error }.
export async function googleRequest(url, { token, method = "GET", body = null } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, data, error: data?.error?.message || `Google returned ${res.status}` };
    return { ok: true, status: res.status, data, error: null };
  } catch (error) {
    console.error("[google.request]", method, url, error?.message);
    return { ok: false, status: 0, data: null, error: "request_failed" };
  }
}

// RBM webhooks: X-Goog-Signature = base64(HMAC-SHA512(clientToken, base64-decoded message.data)).
export function verifyRbmSignature(decodedPayload, header, clientToken) {
  if (!clientToken || typeof header !== "string") return false;
  const expected = Buffer.from(createHmac("sha512", clientToken).update(decodedPayload).digest("base64"));
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
