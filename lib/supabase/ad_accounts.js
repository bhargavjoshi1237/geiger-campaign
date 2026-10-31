"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.ad_accounts (connected Meta ad accounts) and campaign.ad_campaign_snapshots
// (latest Marketing API state + insights per campaign / ad set / ad, server-written). Tokens never reach
// the browser: they live in ad_account_secrets. Pure: null / false / [] on failure, never throws or toasts.

const ACCOUNTS = "ad_accounts";
const SNAPSHOTS = "ad_campaign_snapshots";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const num = (v) => (v == null || v === "" ? null : Number(v));

export function normalizeAdAccount(row) {
  if (!row) return null;
  const externalId = row.external_id ?? "";
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    externalId,
    accountNumber: String(externalId).replace(/^act_/, ""),
    name: row.name || externalId || "Ad account",
    currency: row.currency ?? "USD",
    timezone: row.timezone ?? "UTC",
    status: row.status ?? "pending",
    accountStatus: row.account_status ?? null,
    businessId: row.business_id ?? null,
    businessName: row.business_name ?? "",
    pageIds: Array.isArray(row.page_ids) ? row.page_ids : [],
    pages: Array.isArray(row.pages) ? row.pages : [],
    tokenKind: row.token_kind ?? "oauth",
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    tokenExpiresAt: row.token_expires_at ?? null,
    connectedAt: row.connected_at ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    lastError: row.last_error ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function adAccountToRow(input) {
  const row = {};
  const map = { name: "name", status: "status", lastError: "last_error" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("pageIds" in input) row.page_ids = Array.isArray(input.pageIds) ? input.pageIds : [];
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeAdSnapshot(row) {
  if (!row) return null;
  const insights = bag(row.insights);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    level: row.level ?? "campaign",
    externalId: row.external_id ?? "",
    externalCampaignId: row.external_campaign_id ?? null,
    externalAdsetId: row.external_adset_id ?? null,
    name: row.name || row.external_id || "Untitled",
    status: row.status ?? "",
    effectiveStatus: row.effective_status || row.status || "",
    objective: row.objective ?? "",
    destinationType: row.destination_type ?? "",
    optimizationGoal: row.optimization_goal ?? "",
    dailyBudget: num(row.daily_budget),
    lifetimeBudget: num(row.lifetime_budget),
    insights: {
      spend: Number(insights.spend ?? 0),
      impressions: Number(insights.impressions ?? 0),
      reach: Number(insights.reach ?? 0),
      clicks: Number(insights.clicks ?? 0),
      ctr: num(insights.ctr),
      cpc: num(insights.cpc),
      leads: Number(insights.leads ?? 0),
      cpl: num(insights.cpl),
      conversations: Number(insights.conversations ?? 0),
      costPerConversation: num(insights.costPerConversation),
      purchases: Number(insights.purchases ?? 0),
      purchaseValue: Number(insights.purchaseValue ?? 0),
    },
    datePreset: row.date_preset ?? "last_7d",
    storyId: row.story_id ?? null,
    instagramMediaId: row.instagram_media_id ?? null,
    creativeExternalId: row.creative_external_id ?? null,
    capturedAt: row.captured_at ?? null,
  };
}

export async function listAdAccounts(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(ACCOUNTS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[ad_accounts.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAdAccount);
  } catch (e) {
    console.error("[ad_accounts.list]", e);
    return null;
  }
}

export async function updateAdAccount(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(ACCOUNTS)
      .update(adAccountToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[ad_accounts.update]", error.message);
      return null;
    }
    return normalizeAdAccount(data);
  } catch (e) {
    console.error("[ad_accounts.update]", e);
    return null;
  }
}

// Disconnecting keeps history: the row is soft-deleted and marked disconnected; snapshots stay readable.
export async function disconnectAdAccount(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(ACCOUNTS)
      .update({ deleted_at: new Date().toISOString(), status: "disconnected" })
      .eq("id", id);
    if (error) {
      console.error("[ad_accounts.disconnect]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ad_accounts.disconnect]", e);
    return false;
  }
}

// Filters: { level, adAccountId, limit }.
export async function listAdSnapshots(projectId, { level, adAccountId, limit = 2000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(SNAPSHOTS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("captured_at", { ascending: false })
      .limit(limit);
    if (level) query = Array.isArray(level) ? query.in("level", level) : query.eq("level", level);
    if (adAccountId) query = query.eq("ad_account_id", adAccountId);
    const { data, error } = await query;
    if (error) {
      console.error("[ad_snapshots.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAdSnapshot);
  } catch (e) {
    console.error("[ad_snapshots.list]", e);
    return null;
  }
}
