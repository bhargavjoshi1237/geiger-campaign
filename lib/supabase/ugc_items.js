"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.ugc_items — creator and customer content with usage-rights status, expiry,
// whitelisting and the asset-library file it was saved to. Rights requests are emailed by the server
// route; this file edits items and reads the asset library. Pure: null / false / [].

const TABLE = "ugc_items";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeUgcItem(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    creatorId: row.creator_id ?? null,
    collaborationId: row.collaboration_id ?? null,
    title: row.title ?? "",
    sourceUrl: row.source_url ?? "",
    network: row.network || "instagram",
    authorHandle: row.author_handle ?? "",
    kind: row.kind || "post",
    assetId: row.asset_id ?? null,
    assetUrl: row.asset_url ?? "",
    thumbnailUrl: row.thumbnail_url ?? "",
    caption: row.caption ?? "",
    rightsStatus: row.rights_status || "not_requested",
    rightsRequestedAt: row.rights_requested_at ?? null,
    rightsGrantedAt: row.rights_granted_at ?? null,
    rightsExpiresAt: row.rights_expires_at ?? null,
    usageChannels: Array.isArray(row.usage_channels) ? row.usage_channels : [],
    whitelisting: Boolean(row.whitelisting),
    usageNotes: row.usage_notes ?? "",
    rightsRequest: bag(bag(row.metadata).rightsRequest),
    rightsProof: bag(bag(row.metadata).rightsProof),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function ugcItemToRow(input) {
  const row = {};
  const text = { title: "title", sourceUrl: "source_url", network: "network", authorHandle: "author_handle", kind: "kind", caption: "caption", usageNotes: "usage_notes" };
  for (const [key, col] of Object.entries(text)) if (key in input) row[col] = String(input[key] ?? "").trim();
  if ("authorHandle" in input) row.author_handle = row.author_handle.replace(/^@+/, "");
  if ("creatorId" in input) row.creator_id = input.creatorId || null;
  if ("collaborationId" in input) row.collaboration_id = input.collaborationId || null;
  if ("assetId" in input) row.asset_id = input.assetId || null;
  if ("assetUrl" in input) row.asset_url = input.assetUrl || null;
  if ("thumbnailUrl" in input) row.thumbnail_url = input.thumbnailUrl || null;
  if ("rightsStatus" in input) row.rights_status = input.rightsStatus || "not_requested";
  if ("rightsRequestedAt" in input) row.rights_requested_at = input.rightsRequestedAt || null;
  if ("rightsGrantedAt" in input) row.rights_granted_at = input.rightsGrantedAt || null;
  if ("rightsExpiresAt" in input) row.rights_expires_at = input.rightsExpiresAt || null;
  if ("usageChannels" in input) row.usage_channels = Array.isArray(input.usageChannels) ? input.usageChannels : [];
  if ("whitelisting" in input) row.whitelisting = Boolean(input.whitelisting);
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listUgcItems(projectId, { creatorId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (creatorId) query = query.eq("creator_id", creatorId);
    const { data, error } = await query;
    if (error) {
      console.error("[ugc_items.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeUgcItem);
  } catch (e) {
    console.error("[ugc_items.list]", e);
    return null;
  }
}

export async function createUgcItem(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...ugcItemToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[ugc_items.create]", error.message);
      return null;
    }
    return normalizeUgcItem(data);
  } catch (e) {
    console.error("[ugc_items.create]", e);
    return null;
  }
}

export async function updateUgcItem(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(ugcItemToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[ugc_items.update]", error.message);
      return null;
    }
    return normalizeUgcItem(data);
  } catch (e) {
    console.error("[ugc_items.update]", e);
    return null;
  }
}

export async function softDeleteUgcItem(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[ugc_items.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ugc_items.delete]", e);
    return false;
  }
}

// Images and videos from the asset library (campaign.assets, Acquisition & Content) to attach to an item.
// Returns [] when the library is empty or its table isn't there yet.
export async function listAttachableAssets(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("assets")
      .select("id, name, kind, url, mime, created_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in("kind", ["image", "video"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[ugc_items.assets]", error.message);
      return [];
    }
    return (data || []).map((a) => ({ id: a.id, name: a.name || "Untitled asset", kind: a.kind || "image", url: a.url || "", mime: a.mime || "" }));
  } catch (e) {
    console.error("[ugc_items.assets]", e);
    return [];
  }
}
