"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeTrackingLink, trackingLinkToRow } from "@/lib/acquisition/models";

// Data layer for campaign.tracking_links — UTM-tagged short links answered at /l/<slug>. Clicks are
// written server-side by the redirect. Pure: null / false / [] on failure; a slug collision on write
// resolves to SLUG_TAKEN (short-link slugs are unique across the deployment).

const TABLE = "tracking_links";

export const SLUG_TAKEN = "slug_taken";

export { normalizeTrackingLink, trackingLinkToRow };

const isUniqueViolation = (error) => error?.code === "23505" || /duplicate key|unique/i.test(error?.message || "");

export async function listTrackingLinks(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[tracking_links.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeTrackingLink);
  } catch (e) {
    console.error("[tracking_links.list]", e);
    return null;
  }
}

// The link, SLUG_TAKEN, or null.
export async function createTrackingLink(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...trackingLinkToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[tracking_links.create]", error.message);
      return isUniqueViolation(error) ? SLUG_TAKEN : null;
    }
    return normalizeTrackingLink(data);
  } catch (e) {
    console.error("[tracking_links.create]", e);
    return null;
  }
}

// The link, SLUG_TAKEN, or null.
export async function updateTrackingLink(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(trackingLinkToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[tracking_links.update]", error.message);
      return isUniqueViolation(error) ? SLUG_TAKEN : null;
    }
    return normalizeTrackingLink(data);
  } catch (e) {
    console.error("[tracking_links.update]", e);
    return null;
  }
}

export async function softDeleteTrackingLink(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[tracking_links.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tracking_links.delete]", e);
    return false;
  }
}
