import { createHmac, timingSafeEqual } from "node:crypto";
import { publicUrl } from "@/lib/server/urls";
import { TIKTOK_SCOPES } from "@/lib/social/accounts/catalog";

// TikTok API for Business (server-only): TikTok account authorization, token refresh, business profile,
// the DIRECT_MESSAGE webhook registration and signature check. Business accounts only; not offered in the
// EEA, Switzerland or the UK. Env: TIKTOK_APP_ID, TIKTOK_APP_SECRET, optional TIKTOK_API_VERSION (v1.3).
// Never throws: returns { ok, data, error }.

export function isTikTokConfigured() {
  return Boolean(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET);
}

const apiBase = () => `https://business-api.tiktok.com/open_api/${process.env.TIKTOK_API_VERSION || "v1.3"}`;

export function tiktokRedirectUri() {
  return publicUrl("/api/social/oauth/tiktok/callback");
}

export function tiktokWebhookUrl() {
  return publicUrl("/api/webhooks/tiktok");
}

export async function tiktokRequest(path, { token = null, method = "GET", query = null, body = null } = {}) {
  const url = new URL(`${apiBase()}/${String(path).replace(/^\/+/, "")}`);
  if (query) for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(token ? { "Access-Token": token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.code !== 0) {
      return { ok: false, data: data?.data ?? null, error: data?.message || `TikTok returned ${res.status}`, code: data?.code ?? null };
    }
    return { ok: true, data: data.data ?? {}, error: null, code: 0 };
  } catch (error) {
    console.error("[tiktok]", method, path, error?.message);
    return { ok: false, data: null, error: "request_failed", code: null };
  }
}

export function tiktokAuthorizeUrl({ state }) {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", process.env.TIKTOK_APP_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", tiktokRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

const tokenShape = (data) => {
  const now = Date.now();
  return {
    businessId: data.open_id || null,
    scopes: String(data.scope || "").split(",").map((s) => s.trim()).filter(Boolean),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? new Date(now + Number(data.expires_in) * 1000).toISOString() : null,
    refreshExpiresAt: data.refresh_token_expires_in ? new Date(now + Number(data.refresh_token_expires_in) * 1000).toISOString() : null,
  };
};

export async function exchangeTikTokCode(code) {
  const res = await tiktokRequest("tt_user/oauth2/token/", {
    method: "POST",
    body: {
      client_id: process.env.TIKTOK_APP_ID,
      client_secret: process.env.TIKTOK_APP_SECRET,
      grant_type: "authorization_code",
      auth_code: code,
      redirect_uri: tiktokRedirectUri(),
    },
  });
  if (!res.ok || !res.data?.access_token) return { ok: false, error: res.error || "TikTok didn't return an access token." };
  return { ok: true, ...tokenShape(res.data) };
}

export async function refreshTikTokToken(refreshToken) {
  const res = await tiktokRequest("tt_user/oauth2/refresh_token/", {
    method: "POST",
    body: {
      client_id: process.env.TIKTOK_APP_ID,
      client_secret: process.env.TIKTOK_APP_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });
  if (!res.ok || !res.data?.access_token) return { ok: false, error: res.error || "TikTok refused the refresh token." };
  return { ok: true, ...tokenShape(res.data) };
}

export async function tiktokBusinessInfo(businessId, token) {
  const res = await tiktokRequest("business/get/", {
    token,
    query: { business_id: businessId, fields: JSON.stringify(["username", "display_name", "profile_image", "followers_count"]) },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    username: res.data?.username || "",
    displayName: res.data?.display_name || "",
    profileImage: res.data?.profile_image || "",
    followers: res.data?.followers_count ?? null,
    error: null,
  };
}

// The app-level DIRECT_MESSAGE webhook (one callback for every connected business account).
export async function registerTikTokWebhook() {
  const res = await tiktokRequest("business/webhook/update/", {
    method: "POST",
    body: {
      app_id: process.env.TIKTOK_APP_ID,
      secret: process.env.TIKTOK_APP_SECRET,
      event_type: "DIRECT_MESSAGE",
      callback_url: tiktokWebhookUrl(),
    },
  });
  return { ok: res.ok, error: res.error };
}

export async function tiktokWebhookInfo() {
  const res = await tiktokRequest("business/webhook/list/", {
    query: { app_id: process.env.TIKTOK_APP_ID, secret: process.env.TIKTOK_APP_SECRET, event_type: "DIRECT_MESSAGE" },
  });
  if (!res.ok) return { ok: false, callbackUrl: null, error: res.error };
  const list = Array.isArray(res.data?.list) ? res.data.list : Array.isArray(res.data) ? res.data : [res.data];
  return { ok: true, callbackUrl: list.find((w) => w?.callback_url)?.callback_url || null, error: null };
}

// Tiktok-Signature: "t=<unix seconds>,s=<hex HMAC-SHA256(app secret, `${t}.${rawBody}`)>", at most 5s old.
export function verifyTikTokSignature(rawBody, header, { now = Date.now(), toleranceSeconds = 5 } = {}) {
  const secret = process.env.TIKTOK_APP_SECRET;
  if (!secret || typeof header !== "string") return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=")));
  const ts = Number(parts.t);
  if (!ts || !parts.s) return false;
  if (Math.abs(Math.floor(now / 1000) - ts) > toleranceSeconds) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex"));
  const actual = Buffer.from(String(parts.s));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
