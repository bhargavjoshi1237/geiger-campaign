"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.audience_syncs — segments hashed (SHA-256) and uploaded to a Meta Custom
// Audience on a schedule. Uploads run server-side (sync route + ads worker); this layer edits the sync and
// reads its run history. Pure: null / false / [].

const TABLE = "audience_syncs";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeAudienceSync(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    segmentId: row.segment_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    name: row.name ?? "Untitled audience",
    externalAudienceId: row.external_audience_id ?? null,
    matchKeys: Array.isArray(row.match_keys) && row.match_keys.length ? row.match_keys : ["email"],
    schedule: row.schedule ?? "daily",
    defaultCountryCode: row.default_country_code ?? "",
    status: row.status ?? "draft",
    lastSyncedAt: row.last_synced_at ?? null,
    nextSyncAt: row.next_sync_at ?? null,
    uploadedCount: Number(row.uploaded_count ?? 0),
    matchedCount: row.matched_count == null ? null : Number(row.matched_count),
    invalidCount: Number(row.invalid_count ?? 0),
    lastError: row.last_error ?? "",
    runs: Array.isArray(row.runs) ? row.runs : [],
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function audienceSyncToRow(input) {
  const row = {};
  const map = {
    segmentId: "segment_id",
    adAccountId: "ad_account_id",
    name: "name",
    schedule: "schedule",
    status: "status",
    nextSyncAt: "next_sync_at",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = /Id$/.test(key) ? input[key] || null : input[key] ?? null;
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled audience";
  if ("matchKeys" in input) row.match_keys = Array.isArray(input.matchKeys) && input.matchKeys.length ? input.matchKeys : ["email"];
  if ("defaultCountryCode" in input) row.default_country_code = String(input.defaultCountryCode || "").replace(/\D/g, "");
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listAudienceSyncs(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[audience_syncs.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAudienceSync);
  } catch (e) {
    console.error("[audience_syncs.list]", e);
    return null;
  }
}

export async function createAudienceSync(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...audienceSyncToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[audience_syncs.create]", error.message);
      return null;
    }
    return normalizeAudienceSync(data);
  } catch (e) {
    console.error("[audience_syncs.create]", e);
    return null;
  }
}

export async function updateAudienceSync(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(audienceSyncToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[audience_syncs.update]", error.message);
      return null;
    }
    return normalizeAudienceSync(data);
  } catch (e) {
    console.error("[audience_syncs.update]", e);
    return null;
  }
}

// Stops syncing; the Custom Audience on Meta is left in place (it may be used by live ad sets).
export async function softDeleteAudienceSync(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[audience_syncs.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[audience_syncs.delete]", e);
    return false;
  }
}
