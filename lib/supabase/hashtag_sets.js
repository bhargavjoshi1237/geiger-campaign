"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.hashtag_sets — reusable hashtag groups the composer appends to a caption or the
// first comment. Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "hashtag_sets";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

const cleanTags = (tags) =>
  [...new Set((Array.isArray(tags) ? tags : []).map((t) => String(t || "").trim().replace(/^#+/, "")).filter(Boolean))];

export function normalizeHashtagSet(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled set",
    tags: cleanTags(row.tags),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function hashtagSetToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled set";
  if ("tags" in input) row.tags = cleanTags(input.tags);
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listHashtagSets(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[hashtag_sets.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeHashtagSet);
  } catch (e) {
    console.error("[hashtag_sets.list]", e);
    return null;
  }
}

export async function createHashtagSet(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...hashtagSetToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[hashtag_sets.create]", error.message);
      return null;
    }
    return normalizeHashtagSet(data);
  } catch (e) {
    console.error("[hashtag_sets.create]", e);
    return null;
  }
}

export async function updateHashtagSet(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(hashtagSetToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[hashtag_sets.update]", error.message);
      return null;
    }
    return normalizeHashtagSet(data);
  } catch (e) {
    console.error("[hashtag_sets.update]", e);
    return null;
  }
}

export async function softDeleteHashtagSet(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[hashtag_sets.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[hashtag_sets.delete]", e);
    return false;
  }
}
