"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { renameContactTag } from "@/lib/supabase/contacts";

// Data layer for campaign.tags — the tag catalog (name, colour, description) over the free-form
// contacts.tags array. Renames, merges and deletes propagate to contacts. Pure: null / false / [] on failure.

const TABLE = "tags";

export const TAG_COLORS = ["emerald", "blue", "amber", "violet", "red", "zinc"];

export function normalizeTag(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    color: TAG_COLORS.includes(row.color) ? row.color : "zinc",
    description: row.description ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function tagToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim();
  if ("color" in input) row.color = TAG_COLORS.includes(input.color) ? input.color : "zinc";
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  return row;
}

export async function listTags(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) {
      console.error("[tags.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeTag);
  } catch (e) {
    console.error("[tags.list]", e);
    return null;
  }
}

export async function createTag(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...tagToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[tags.create]", error.message);
      return null;
    }
    return normalizeTag(data);
  } catch (e) {
    console.error("[tags.create]", e);
    return null;
  }
}

// Saves the catalog row; a name change is carried onto every contact carrying the old name.
export async function updateTag(projectId, tag, patch) {
  if (!projectId || !tag?.id || !isSupabaseConfigured()) return null;
  try {
    const renamed = "name" in patch && patch.name.trim() && patch.name.trim() !== tag.name;
    if (renamed) {
      const touched = await renameContactTag(projectId, tag.name, patch.name.trim());
      if (touched === null) return null;
    }
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(tagToRow(patch))
      .eq("id", tag.id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[tags.update]", error.message);
      return null;
    }
    return normalizeTag(data);
  } catch (e) {
    console.error("[tags.update]", e);
    return null;
  }
}

// Removes the tag from every contact, then retires the catalog row (if it has one).
export async function deleteTag(projectId, tag) {
  if (!projectId || !tag?.name || !isSupabaseConfigured()) return false;
  try {
    const touched = await renameContactTag(projectId, tag.name, null);
    if (touched === null) return false;
    if (!tag.id) return true;
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", tag.id);
    if (error) {
      console.error("[tags.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tags.delete]", e);
    return false;
  }
}

// Moves every contact from `source` onto `target`, then retires the source catalog row.
export async function mergeTag(projectId, source, target) {
  if (!projectId || !source?.name || !target?.name || !isSupabaseConfigured()) return false;
  try {
    const touched = await renameContactTag(projectId, source.name, target.name);
    if (touched === null) return false;
    if (!source.id) return true;
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", source.id);
    if (error) {
      console.error("[tags.merge]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tags.merge]", e);
    return false;
  }
}
