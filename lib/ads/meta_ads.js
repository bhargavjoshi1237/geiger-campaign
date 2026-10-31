import { graphRequest, graphVersion } from "@/lib/social/meta_graph";
import { minorUnitFactor } from "./catalog";

// Meta Marketing API helpers (server-only): OAuth for ad accounts, paged reads, the account tree
// (campaigns / ad sets / ads + insights) and status changes. Built on graphRequest; never throws.

export const ADS_SCOPES = [
  "ads_read",
  "ads_management",
  "leads_retrieval",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_manage_comments",
];

export function isMetaAppConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export const actId = (value) => {
  const id = String(value || "").trim().replace(/^act_/, "");
  return /^\d+$/.test(id) ? `act_${id}` : null;
};

export function oauthDialogUrl({ redirectUri, state }) {
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", ADS_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

// code -> short-lived user token -> long-lived (~60 day) user token.
export async function exchangeCodeForToken({ code, redirectUri }) {
  const short = await graphRequest("oauth/access_token", {
    query: { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: redirectUri, code },
  });
  if (!short.ok) return { ok: false, error: short.error };
  const long = await graphRequest("oauth/access_token", {
    query: {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: short.data.access_token,
    },
  });
  const data = long.ok ? long.data : short.data;
  return {
    ok: true,
    accessToken: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null,
  };
}

// Follows cursor paging up to `max` rows; { ok, rows, complete, error }.
export async function graphAll(path, { token, query = {}, max = 1000 } = {}) {
  const rows = [];
  let after = null;
  for (let page = 0; page < 50; page += 1) {
    const res = await graphRequest(path, { token, query: { limit: 100, ...query, ...(after ? { after } : {}) } });
    if (!res.ok) return { ok: false, rows, complete: false, error: res.error, status: res.status, data: res.data };
    rows.push(...(res.data?.data || []));
    after = res.data?.paging?.next ? res.data?.paging?.cursors?.after : null;
    if (!after) return { ok: true, rows, complete: true, error: null };
    if (rows.length >= max) return { ok: true, rows: rows.slice(0, max), complete: false, error: null };
  }
  return { ok: true, rows, complete: false, error: null };
}

export async function grantedScopes(token) {
  const res = await graphRequest("me/permissions", { token });
  if (!res.ok) return [];
  return (res.data?.data || []).filter((p) => p.status === "granted").map((p) => p.permission);
}

export async function listUserAdAccounts(token) {
  return graphAll("me/adaccounts", { token, query: { fields: "id,account_id,name,currency,timezone_name,account_status,business{id,name}" }, max: 200 });
}

export async function getAdAccount(token, externalId) {
  return graphRequest(externalId, { token, query: { fields: "id,account_id,name,currency,timezone_name,account_status,business{id,name}" } });
}

// Pages (with their page tokens) the user or system user manages.
export async function listManagedPages(token) {
  const res = await graphAll("me/accounts", { token, query: { fields: "id,name,access_token,instagram_business_account{id,username}" }, max: 200 });
  if (!res.ok) return { ok: false, pages: [], tokens: {}, error: res.error };
  const pages = res.rows.map((p) => ({
    id: String(p.id),
    name: p.name || "",
    igUserId: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : null,
    igUsername: p.instagram_business_account?.username || "",
  }));
  const tokens = Object.fromEntries(res.rows.filter((p) => p.access_token).map((p) => [String(p.id), p.access_token]));
  return { ok: true, pages, tokens, error: null };
}

// The ad_accounts row (snake_case) for a Graph ad account object.
export function adAccountRowFromGraph(graph, { projectId, pages = [], tokenKind = "oauth", scopes = [], expiresAt = null, createdBy = null }) {
  return {
    project_id: projectId,
    external_id: actId(graph.id || graph.account_id),
    name: graph.name || "",
    currency: graph.currency || "USD",
    timezone: graph.timezone_name || "UTC",
    account_status: graph.account_status ?? null,
    business_id: graph.business?.id ? String(graph.business.id) : null,
    business_name: graph.business?.name || "",
    page_ids: pages.map((p) => p.id),
    pages,
    token_kind: tokenKind,
    scopes,
    token_expires_at: expiresAt,
    created_by: createdBy,
    last_error: null,
    deleted_at: null,
  };
}

const actionCount = (actions, types) => {
  const list = Array.isArray(actions) ? actions : [];
  for (const type of types) {
    const hit = list.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
};

// Insights row -> the compact metrics the screens and rules read.
export function summarizeInsights(row = {}) {
  const spend = Number(row.spend) || 0;
  const impressions = Number(row.impressions) || 0;
  const clicks = Number(row.clicks) || 0;
  const leads = actionCount(row.actions, ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "offsite_conversion.fb_pixel_lead"]);
  const conversations = actionCount(row.actions, ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"]);
  const purchases = actionCount(row.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]);
  const purchaseValue = actionCount(row.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    spend: round(spend),
    impressions,
    reach: Number(row.reach) || 0,
    clicks,
    ctr: impressions ? round((clicks / impressions) * 100) : null,
    cpc: clicks ? round(spend / clicks) : null,
    leads,
    cpl: leads ? round(spend / leads) : null,
    conversations,
    costPerConversation: conversations ? round(spend / conversations) : null,
    purchases,
    purchaseValue: round(purchaseValue),
  };
}

const budget = (value, currency) => (value == null || value === "" ? null : Number(value) / minorUnitFactor(currency));

// Campaigns, ad sets and ads with their insights for one account, as snapshot rows (snake_case).
export async function fetchAccountTree(token, account, { datePreset = "last_7d" } = {}) {
  const act = account.external_id;
  const currency = account.currency || "USD";
  const [campaigns, adsets, ads] = await Promise.all([
    graphAll(`${act}/campaigns`, { token, query: { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget" }, max: 500 }),
    graphAll(`${act}/adsets`, {
      token,
      query: { fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,destination_type,optimization_goal" },
      max: 1000,
    }),
    graphAll(`${act}/ads`, {
      token,
      query: { fields: "id,name,status,effective_status,campaign_id,adset_id,creative{id,effective_object_story_id,effective_instagram_media_id}" },
      max: 2000,
    }),
  ]);
  const failed = [campaigns, adsets, ads].find((r) => !r.ok);
  if (failed) return { ok: false, error: failed.error, status: failed.status };

  const insightFields = "campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,actions,action_values";
  const [ci, ai, di] = await Promise.all(
    ["campaign", "adset", "ad"].map((level) =>
      graphAll(`${act}/insights`, { token, query: { level, fields: insightFields, date_preset: datePreset }, max: 5000 }),
    ),
  );
  const byId = (res, key) => new Map((res.ok ? res.rows : []).map((r) => [String(r[key]), summarizeInsights(r)]));
  const insights = { campaign: byId(ci, "campaign_id"), adset: byId(ai, "adset_id"), ad: byId(di, "ad_id") };
  const capturedAt = new Date().toISOString();
  const common = { project_id: account.project_id, ad_account_id: account.id, date_preset: datePreset, captured_at: capturedAt, deleted_at: null };
  const campaignObjective = new Map(campaigns.rows.map((c) => [String(c.id), c.objective || ""]));

  const rows = [
    ...campaigns.rows.map((c) => ({
      ...common,
      level: "campaign",
      external_id: String(c.id),
      external_campaign_id: String(c.id),
      external_adset_id: null,
      name: c.name || "",
      status: c.status || "",
      effective_status: c.effective_status || c.status || "",
      objective: c.objective || "",
      destination_type: "",
      optimization_goal: "",
      daily_budget: budget(c.daily_budget, currency),
      lifetime_budget: budget(c.lifetime_budget, currency),
      insights: insights.campaign.get(String(c.id)) || summarizeInsights(),
      story_id: null,
      instagram_media_id: null,
      creative_external_id: null,
    })),
    ...adsets.rows.map((s) => ({
      ...common,
      level: "adset",
      external_id: String(s.id),
      external_campaign_id: s.campaign_id ? String(s.campaign_id) : null,
      external_adset_id: String(s.id),
      name: s.name || "",
      status: s.status || "",
      effective_status: s.effective_status || s.status || "",
      objective: campaignObjective.get(String(s.campaign_id)) || "",
      destination_type: s.destination_type || "",
      optimization_goal: s.optimization_goal || "",
      daily_budget: budget(s.daily_budget, currency),
      lifetime_budget: budget(s.lifetime_budget, currency),
      insights: insights.adset.get(String(s.id)) || summarizeInsights(),
      story_id: null,
      instagram_media_id: null,
      creative_external_id: null,
    })),
    ...ads.rows.map((a) => ({
      ...common,
      level: "ad",
      external_id: String(a.id),
      external_campaign_id: a.campaign_id ? String(a.campaign_id) : null,
      external_adset_id: a.adset_id ? String(a.adset_id) : null,
      name: a.name || "",
      status: a.status || "",
      effective_status: a.effective_status || a.status || "",
      objective: campaignObjective.get(String(a.campaign_id)) || "",
      destination_type: "",
      optimization_goal: "",
      daily_budget: null,
      lifetime_budget: null,
      insights: insights.ad.get(String(a.id)) || summarizeInsights(),
      story_id: a.creative?.effective_object_story_id || null,
      instagram_media_id: a.creative?.effective_instagram_media_id || null,
      creative_external_id: a.creative?.id ? String(a.creative.id) : null,
    })),
  ];
  const complete = campaigns.complete && adsets.complete && ads.complete;
  return { ok: true, rows, complete, counts: { campaigns: campaigns.rows.length, adsets: adsets.rows.length, ads: ads.rows.length }, capturedAt };
}

// ACTIVE | PAUSED on a campaign, ad set or ad.
export async function setEntityStatus(token, externalId, status) {
  return graphRequest(String(externalId), { token, method: "POST", body: { status } });
}

// Graph error codes that mean "try again later" (throttling, transient, temporarily unavailable).
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);

export function isTransientGraphError(res) {
  if (!res || res.ok) return false;
  if (!res.status || res.status >= 500 || res.status === 429) return true;
  const code = Number(res.data?.error?.code);
  return TRANSIENT_CODES.has(code) || Boolean(res.data?.error?.is_transient);
}

// The most useful message Meta returned for a failed call.
export function graphErrorMessage(res, fallback = "Meta rejected the request.") {
  const err = res?.data?.error;
  return err?.error_user_msg || err?.error_user_title || err?.message || res?.error || fallback;
}
