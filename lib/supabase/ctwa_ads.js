"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.ctwa_ads — Click-to-Message ads (WhatsApp / Messenger / Instagram Direct) and
// the DM flow that answers each one. Publishing to Meta goes through the ads publish route (server);
// this layer edits the draft and reads the stats the worker rolls up. Pure: null / false / [].

const TABLE = "ctwa_ads";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeCtwaAd(row) {
  if (!row) return null;
  const stats = bag(row.stats);
  const targeting = bag(row.targeting);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    name: row.name ?? "Untitled ad",
    destination: row.destination ?? "whatsapp",
    objective: row.objective ?? "OUTCOME_ENGAGEMENT",
    connectionId: row.connection_id ?? null,
    pageId: row.fb_page_id ?? "",
    flowId: row.flow_id ?? null,
    automationId: row.automation_id ?? null,
    ref: row.ref ?? "",
    welcomeMessage: row.welcome_message ?? "",
    iceBreakers: Array.isArray(row.ice_breakers) ? row.ice_breakers : [],
    creativeId: row.creative_id ?? null,
    primaryText: row.primary_text ?? "",
    headline: row.headline ?? "",
    mediaUrl: row.media_url ?? "",
    dailyBudget: Number(row.daily_budget ?? 0),
    currency: row.currency ?? "USD",
    targeting: {
      countries: Array.isArray(targeting.countries) ? targeting.countries : [],
      ageMin: Number(targeting.ageMin ?? 18),
      ageMax: Number(targeting.ageMax ?? 65),
    },
    status: row.status ?? "draft",
    externalCampaignId: row.external_campaign_id ?? null,
    externalAdsetId: row.external_adset_id ?? null,
    externalAdId: row.external_ad_id ?? null,
    externalCreativeId: row.external_creative_id ?? null,
    stats: {
      conversationsStarted: Number(stats.conversationsStarted ?? 0),
      threads: Number(stats.threads ?? 0),
      spend: Number(stats.spend ?? 0),
      impressions: Number(stats.impressions ?? 0),
      clicks: Number(stats.clicks ?? 0),
      costPerConversation: stats.costPerConversation == null ? null : Number(stats.costPerConversation),
      syncedAt: stats.syncedAt ?? null,
    },
    lastError: row.last_error ?? "",
    publishedAt: row.published_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function ctwaAdToRow(input) {
  const row = {};
  const map = {
    adAccountId: "ad_account_id",
    name: "name",
    destination: "destination",
    objective: "objective",
    connectionId: "connection_id",
    pageId: "fb_page_id",
    flowId: "flow_id",
    automationId: "automation_id",
    ref: "ref",
    welcomeMessage: "welcome_message",
    creativeId: "creative_id",
    primaryText: "primary_text",
    headline: "headline",
    mediaUrl: "media_url",
    currency: "currency",
    status: "status",
    createdBy: "created_by",
  };
  // Empty-string ids from selects mean "none"; text columns are never null.
  for (const [key, col] of Object.entries(map)) {
    if (!(key in input)) continue;
    row[col] = /Id$/.test(key) ? input[key] || null : input[key] ?? null;
  }
  for (const key of ["name", "welcomeMessage", "primaryText", "headline", "mediaUrl"]) if (key in input) row[map[key]] = String(input[key] ?? "");
  if ("iceBreakers" in input) row.ice_breakers = Array.isArray(input.iceBreakers) ? input.iceBreakers : [];
  if ("dailyBudget" in input) row.daily_budget = Number(input.dailyBudget) || 0;
  if ("targeting" in input) row.targeting = bag(input.targeting);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// A short, URL-safe routing key for a new ad (ref links and referral matching).
export function newCtwaRef() {
  return `ad_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

// Picker options for "answered by": Chat automation's DM flows (campaign.dm_flows), read-only.
export async function listDmFlowOptions(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("dm_flows")
      .select("id, name, status, channels")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[ctwa_ads.flowOptions]", error.message);
      return null;
    }
    return (data || []).map((r) => ({
      id: r.id,
      name: r.name || "Untitled flow",
      status: r.status || "draft",
      channels: Array.isArray(r.channels) ? r.channels : [],
    }));
  } catch (e) {
    console.error("[ctwa_ads.flowOptions]", e);
    return null;
  }
}

export async function listCtwaAds(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[ctwa_ads.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCtwaAd);
  } catch (e) {
    console.error("[ctwa_ads.list]", e);
    return null;
  }
}

export async function createCtwaAd(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...ctwaAdToRow({ ref: newCtwaRef(), ...input }), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[ctwa_ads.create]", error.message);
      return null;
    }
    return normalizeCtwaAd(data);
  } catch (e) {
    console.error("[ctwa_ads.create]", e);
    return null;
  }
}

export async function updateCtwaAd(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(ctwaAdToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[ctwa_ads.update]", error.message);
      return null;
    }
    return normalizeCtwaAd(data);
  } catch (e) {
    console.error("[ctwa_ads.update]", e);
    return null;
  }
}

export async function softDeleteCtwaAd(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[ctwa_ads.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ctwa_ads.delete]", e);
    return false;
  }
}
