"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { landingPageToRow, normalizeLandingPage } from "@/lib/acquisition/models";

// Data layer for campaign.landing_pages. The only place the workspace talks to the table. Pure:
// null / false / [] on failure. Writes that collide on a slug resolve to SLUG_TAKEN so the screen can
// say exactly why (a live slug is unique across the deployment, a draft slug within the project).

const TABLE = "landing_pages";

export const SLUG_TAKEN = "slug_taken";

export { normalizeLandingPage, landingPageToRow };

const isUniqueViolation = (error) => error?.code === "23505" || /duplicate key|unique/i.test(error?.message || "");

export async function listLandingPages(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[landing_pages.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeLandingPage);
  } catch (e) {
    console.error("[landing_pages.list]", e);
    return null;
  }
}

export async function getLandingPage(projectId, id) {
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
      console.error("[landing_pages.get]", error.message);
      return null;
    }
    return normalizeLandingPage(data);
  } catch (e) {
    console.error("[landing_pages.get]", e);
    return null;
  }
}

// The page, SLUG_TAKEN, or null.
export async function createLandingPage(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...landingPageToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[landing_pages.create]", error.message);
      return isUniqueViolation(error) ? SLUG_TAKEN : null;
    }
    return normalizeLandingPage(data);
  } catch (e) {
    console.error("[landing_pages.create]", e);
    return null;
  }
}

// The page, SLUG_TAKEN, or null.
export async function updateLandingPage(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(landingPageToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[landing_pages.update]", error.message);
      return isUniqueViolation(error) ? SLUG_TAKEN : null;
    }
    return normalizeLandingPage(data);
  } catch (e) {
    console.error("[landing_pages.update]", e);
    return null;
  }
}

export async function softDeleteLandingPage(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[landing_pages.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[landing_pages.delete]", e);
    return false;
  }
}
