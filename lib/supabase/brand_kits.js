"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { brandKitToRow, normalizeBrandKit } from "@/lib/content/brand";

// Data layer for campaign.brand_kits — one row per project, edited from Content -> Brand kit and
// Settings -> Branding and read by hosted pages, email footers and AI copy. Pure: null / false on failure.

const TABLE = "brand_kits";

export { normalizeBrandKit, brandKitToRow };

// The project's kit; null on failure or without a DB, a defaults-only kit ({ id: null }) before the first save.
export async function getBrandKit(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[brand_kits.get]", error.message);
      return null;
    }
    return data ? normalizeBrandKit(data) : normalizeBrandKit({ id: null, project_id: projectId });
  } catch (e) {
    console.error("[brand_kits.get]", e);
    return null;
  }
}

// Creates the row on first save, updates it after. `palette` lives in the metadata bag (merge_meta).
export async function saveBrandKit(projectId, patch, { createdBy = null } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data: existing, error: readError } = await sb
      .from(TABLE)
      .select("id")
      .eq("project_id", projectId)
      .maybeSingle();
    if (readError) {
      console.error("[brand_kits.save]", readError.message);
      return null;
    }
    const row = brandKitToRow(patch);
    let saved;
    if (existing?.id) {
      const { data, error } = await sb.from(TABLE).update(row).eq("id", existing.id).select("*").single();
      if (error) {
        console.error("[brand_kits.save]", error.message);
        return null;
      }
      saved = data;
    } else {
      const { data, error } = await sb
        .from(TABLE)
        .insert({ ...row, project_id: projectId, created_by: createdBy })
        .select("*")
        .single();
      if (error) {
        console.error("[brand_kits.save]", error.message);
        return null;
      }
      saved = data;
    }
    if ("palette" in patch) {
      const { data: meta, error } = await sb.rpc("merge_meta", {
        p_table: TABLE,
        p_id: saved.id,
        p_patch: { palette: Array.isArray(patch.palette) ? patch.palette : [] },
      });
      if (error) {
        console.error("[brand_kits.save.palette]", error.message);
        return null;
      }
      saved = { ...saved, metadata: meta ?? saved.metadata };
    }
    return normalizeBrandKit(saved);
  } catch (e) {
    console.error("[brand_kits.save]", e);
    return null;
  }
}
