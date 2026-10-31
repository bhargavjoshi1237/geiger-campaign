"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { assetKindFromMime, assetToRow, normalizeAsset } from "@/lib/content/files";
import { removeCampaignFile, uploadCampaignFile } from "./storage";

// Data layer for campaign.assets — every uploaded file (images, video, documents) with its public Storage
// URL. The only place that talks to the table. Pure: console.error + null / false / [] on failure.

const TABLE = "assets";

export { normalizeAsset, assetToRow };

// Filters: { kind, kinds, folder, limit }.
export async function listAssets(projectId, { kind, kinds, folder, limit = 2000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (kind) query = query.eq("kind", kind);
    if (Array.isArray(kinds) && kinds.length) query = query.in("kind", kinds);
    if (folder) query = query.eq("folder", folder);
    const { data, error } = await query;
    if (error) {
      console.error("[assets.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAsset);
  } catch (e) {
    console.error("[assets.list]", e);
    return null;
  }
}

export async function getAsset(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[assets.get]", error.message);
      return null;
    }
    return normalizeAsset(data);
  } catch (e) {
    console.error("[assets.get]", e);
    return null;
  }
}

export async function createAsset(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...assetToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[assets.create]", error.message);
      return null;
    }
    return normalizeAsset(data);
  } catch (e) {
    console.error("[assets.create]", e);
    return null;
  }
}

export async function updateAsset(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(assetToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[assets.update]", error.message);
      return null;
    }
    return normalizeAsset(data);
  } catch (e) {
    console.error("[assets.update]", e);
    return null;
  }
}

// Soft-deletes the row and removes the stored object (best effort; only the uploader may remove it).
export async function softDeleteAsset(asset) {
  const id = typeof asset === "string" ? asset : asset?.id;
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[assets.delete]", error.message);
      return false;
    }
    if (typeof asset === "object" && asset?.storagePath) await removeCampaignFile(asset.storagePath);
    return true;
  } catch (e) {
    console.error("[assets.delete]", e);
    return false;
  }
}

// Upload a file to Storage and record it as an asset in one call. Returns the asset or null.
export async function uploadAsset(projectId, file, { id, name, folder = "", tags = [], altText = "", area = "assets", compress = true, createdBy = null, metadata } = {}) {
  if (!projectId || !file) return null;
  const stored = await uploadCampaignFile(projectId, file, { area, compress });
  if (!stored) return null;
  const asset = await createAsset(projectId, {
    id,
    name: name || stored.name,
    kind: assetKindFromMime(stored.mime, stored.name),
    url: stored.url || "",
    storagePath: stored.path,
    size: stored.size,
    width: stored.width,
    height: stored.height,
    mime: stored.mime,
    folder,
    tags,
    altText,
    createdBy,
    ...(metadata ? { metadata } : {}),
  });
  if (!asset) await removeCampaignFile(stored.path);
  return asset;
}
