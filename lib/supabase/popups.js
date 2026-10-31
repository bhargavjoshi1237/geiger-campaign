"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizePopup, popupToRow } from "@/lib/acquisition/models";

// Data layer for campaign.popups. Impressions and conversions are written server-side by the public
// popup routes; the workspace edits design, trigger and targeting. Pure: null / false / [] on failure.

const TABLE = "popups";

export { normalizePopup, popupToRow };

export async function listPopups(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[popups.list]", error.message);
      return null;
    }
    return (data || []).map(normalizePopup);
  } catch (e) {
    console.error("[popups.list]", e);
    return null;
  }
}

export async function getPopup(projectId, id) {
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
      console.error("[popups.get]", error.message);
      return null;
    }
    return normalizePopup(data);
  } catch (e) {
    console.error("[popups.get]", e);
    return null;
  }
}

export async function createPopup(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...popupToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[popups.create]", error.message);
      return null;
    }
    return normalizePopup(data);
  } catch (e) {
    console.error("[popups.create]", e);
    return null;
  }
}

export async function updatePopup(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(popupToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[popups.update]", error.message);
      return null;
    }
    return normalizePopup(data);
  } catch (e) {
    console.error("[popups.update]", e);
    return null;
  }
}

export async function softDeletePopup(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[popups.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[popups.delete]", e);
    return false;
  }
}
