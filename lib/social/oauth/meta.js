import { graphRequest, graphVersion } from "@/lib/social/meta_graph";
import { publicUrl } from "@/lib/server/urls";
import { INSTAGRAM_WEBHOOK_FIELDS, META_SCOPES, PAGE_WEBHOOK_FIELDS } from "@/lib/social/accounts/catalog";

// Facebook Login for Business (server-only): authorize URL, code exchange, long-lived user token, the Pages
// (and linked Instagram business accounts) the person granted, token debugging and webhook subscriptions.
// Env: META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN, optional META_LOGIN_CONFIG_ID (a FLfB configuration).

export function isMetaConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function metaRedirectUri() {
  return publicUrl("/api/social/oauth/meta/callback");
}

export function metaWebhookUrl() {
  return publicUrl("/api/webhooks/meta");
}

const appToken = () => `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;

export function metaScopes(channels) {
  const set = new Set();
  for (const channel of channels) {
    for (const scope of [...(META_SCOPES[channel]?.required || []), ...(META_SCOPES[channel]?.optional || [])]) set.add(scope);
  }
  return [...set];
}

export function metaAuthorizeUrl({ state, channels }) {
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID);
  url.searchParams.set("redirect_uri", metaRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  // A Facebook Login for Business configuration carries its own permission set; classic login takes scopes.
  if (process.env.META_LOGIN_CONFIG_ID) url.searchParams.set("config_id", process.env.META_LOGIN_CONFIG_ID);
  else url.searchParams.set("scope", metaScopes(channels).join(","));
  return url.toString();
}

export async function exchangeMetaCode(code) {
  const res = await graphRequest("oauth/access_token", {
    query: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: metaRedirectUri(),
      code,
    },
  });
  if (!res.ok || !res.data?.access_token) return { ok: false, error: res.error || "Meta didn't return an access token." };
  return { ok: true, token: res.data.access_token, expiresIn: Number(res.data.expires_in) || null };
}

// ~60-day user token; Page tokens derived from it don't expire while the person keeps access.
export async function longLivedUserToken(shortToken) {
  const res = await graphRequest("oauth/access_token", {
    query: {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  });
  if (!res.ok || !res.data?.access_token) return { ok: false, error: res.error || "Couldn't extend the Meta token." };
  const expiresIn = Number(res.data.expires_in) || null;
  return { ok: true, token: res.data.access_token, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null };
}

const PAGE_FIELDS =
  "id,name,username,access_token,tasks,category,picture{url},instagram_business_account{id,username,name,profile_picture_url,followers_count}";

export async function listManagedPages(userToken) {
  const pages = [];
  let after = null;
  for (let i = 0; i < 5; i += 1) {
    const res = await graphRequest("me/accounts", { token: userToken, query: { fields: PAGE_FIELDS, limit: 100, after } });
    if (!res.ok) return { ok: false, pages, error: res.error };
    pages.push(...(res.data?.data || []));
    after = res.data?.paging?.cursors?.after;
    if (!res.data?.paging?.next || !after) break;
  }
  return { ok: true, pages, error: null };
}

// { isValid, expiresAt, dataAccessExpiresAt, scopes, type } for any user or Page token.
export async function debugToken(inputToken) {
  const res = await graphRequest("debug_token", { query: { input_token: inputToken, access_token: appToken() } });
  const data = res.data?.data;
  if (!res.ok || !data) return { ok: false, error: res.error || "Couldn't inspect the token." };
  const ts = (value) => (Number(value) > 0 ? new Date(Number(value) * 1000).toISOString() : null);
  return {
    ok: true,
    isValid: Boolean(data.is_valid),
    type: data.type || null,
    expiresAt: ts(data.expires_at),
    dataAccessExpiresAt: ts(data.data_access_expires_at),
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    error: data.error?.message || null,
  };
}

export async function subscribePage(pageId, pageToken, { leads = false } = {}) {
  const fields = leads ? [...PAGE_WEBHOOK_FIELDS, "leadgen"] : PAGE_WEBHOOK_FIELDS;
  let res = await graphRequest(`${pageId}/subscribed_apps`, {
    token: pageToken,
    method: "POST",
    query: { subscribed_fields: fields.join(",") },
  });
  // leadgen needs leads_retrieval; retry with the messaging fields alone rather than leave the Page unsubscribed.
  if (!res.ok && leads) {
    res = await graphRequest(`${pageId}/subscribed_apps`, {
      token: pageToken,
      method: "POST",
      query: { subscribed_fields: PAGE_WEBHOOK_FIELDS.join(",") },
    });
  }
  return { ok: res.ok, error: res.error };
}

export async function unsubscribePage(pageId, pageToken) {
  const res = await graphRequest(`${pageId}/subscribed_apps`, { token: pageToken, method: "DELETE" });
  return { ok: res.ok, error: res.error };
}

// The fields this app is subscribed to on a Page, or null when the app isn't subscribed.
export async function pageSubscription(pageId, pageToken) {
  const res = await graphRequest(`${pageId}/subscribed_apps`, { token: pageToken });
  if (!res.ok) return { ok: false, fields: null, error: res.error };
  const app = (res.data?.data || []).find((a) => String(a.id) === String(process.env.META_APP_ID));
  return { ok: true, fields: app ? app.subscribed_fields || [] : null, error: null };
}

// App-level webhook objects (page + instagram). Meta verifies the callback URL synchronously, so this fails
// until the deployment is publicly reachable and META_WEBHOOK_VERIFY_TOKEN is set — callers treat it as advisory.
export async function ensureAppSubscriptions() {
  if (!process.env.META_WEBHOOK_VERIFY_TOKEN) return { ok: false, error: "META_WEBHOOK_VERIFY_TOKEN isn't set." };
  const results = [];
  for (const [object, fields] of [
    ["page", [...PAGE_WEBHOOK_FIELDS, "leadgen"]],
    ["instagram", INSTAGRAM_WEBHOOK_FIELDS],
  ]) {
    const res = await graphRequest(`${process.env.META_APP_ID}/subscriptions`, {
      method: "POST",
      query: {
        object,
        callback_url: metaWebhookUrl(),
        fields: fields.join(","),
        verify_token: process.env.META_WEBHOOK_VERIFY_TOKEN,
        include_values: "true",
        access_token: appToken(),
      },
    });
    results.push({ object, ok: res.ok, error: res.error });
  }
  const failed = results.find((r) => !r.ok);
  return { ok: !failed, error: failed ? `${failed.object}: ${failed.error}` : null, results };
}

// { page: { callbackUrl, active, fields }, instagram: {...} } as Meta has them registered for this app.
export async function appSubscriptions() {
  const res = await graphRequest(`${process.env.META_APP_ID}/subscriptions`, { query: { access_token: appToken() } });
  if (!res.ok) return { ok: false, objects: {}, error: res.error };
  const objects = {};
  for (const sub of res.data?.data || []) {
    objects[sub.object] = {
      callbackUrl: sub.callback_url || "",
      active: Boolean(sub.active),
      fields: (sub.fields || []).map((f) => (typeof f === "string" ? f : f.name)),
    };
  }
  return { ok: true, objects, error: null };
}
