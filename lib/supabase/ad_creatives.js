"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.ad_creatives — the creative library: an asset (image/video from the Asset
// Library) plus primary text, headline, CTA and copy variants reused by Click-to-Message ads. Pure: null / false / [].

const TABLE = "ad_creatives";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeAdCreative(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    assetId: row.asset_id ?? null,
    name: row.name ?? "Untitled creative",
    format: row.format ?? "image",
    mediaUrl: row.media_url ?? "",
    primaryText: row.primary_text ?? "",
    headline: row.headline ?? "",
    description: row.description ?? "",
    cta: row.cta ?? "LEARN_MORE",
    linkUrl: row.link_url ?? "",
    variants: Array.isArray(row.variants) ? row.variants : [],
    status: row.status ?? "draft",
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function adCreativeToRow(input) {
  const row = {};
  const text = { name: "name", format: "format", mediaUrl: "media_url", primaryText: "primary_text", headline: "headline", description: "description", cta: "cta", linkUrl: "link_url", status: "status" };
  for (const [key, col] of Object.entries(text)) if (key in input) row[col] = String(input[key] ?? "");
  if ("assetId" in input) row.asset_id = input.assetId || null;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("variants" in input) row.variants = Array.isArray(input.variants) ? input.variants : [];
  if ("tags" in input) row.tags = Array.isArray(input.tags) ? input.tags : [];
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listAdCreatives(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[ad_creatives.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAdCreative);
  } catch (e) {
    console.error("[ad_creatives.list]", e);
    return null;
  }
}

export async function createAdCreative(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...adCreativeToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[ad_creatives.create]", error.message);
      return null;
    }
    return normalizeAdCreative(data);
  } catch (e) {
    console.error("[ad_creatives.create]", e);
    return null;
  }
}

export async function updateAdCreative(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(adCreativeToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[ad_creatives.update]", error.message);
      return null;
    }
    return normalizeAdCreative(data);
  } catch (e) {
    console.error("[ad_creatives.update]", e);
    return null;
  }
}

export async function softDeleteAdCreative(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[ad_creatives.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ad_creatives.delete]", e);
    return false;
  }
}
