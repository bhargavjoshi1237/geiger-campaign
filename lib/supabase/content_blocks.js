"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.content_blocks — reusable saved builder blocks (a header, footer, CTA…). The only
// place that talks to the table. Pure: console.error on failure and return null / false / [] — never throw.

const TABLE = "content_blocks";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function normalizeContentBlock(row) {
  if (!row) return null;
  const block = bag(row.block);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled block",
    description: row.description ?? "",
    blockType: row.block_type ?? block.type ?? "text",
    block,
    usageCount: Number(row.usage_count ?? 0),
    lastUsedAt: row.last_used_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function contentBlockToRow(input) {
  const row = {};
  const map = { projectId: "project_id", lastUsedAt: "last_used_at", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled block";
  if ("description" in input) row.description = String(input.description || "");
  if ("block" in input) {
    row.block = bag(input.block);
    if (!("blockType" in input) && row.block.type) row.block_type = row.block.type;
  }
  if ("blockType" in input) row.block_type = input.blockType || "text";
  if ("usageCount" in input) row.usage_count = Number(input.usageCount) || 0;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listContentBlocks(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[content_blocks.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeContentBlock);
  } catch (e) {
    console.error("[content_blocks.list]", e);
    return null;
  }
}

export async function getContentBlock(projectId, id) {
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
      console.error("[content_blocks.get]", error.message);
      return null;
    }
    return normalizeContentBlock(data);
  } catch (e) {
    console.error("[content_blocks.get]", e);
    return null;
  }
}

export async function createContentBlock(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...contentBlockToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[content_blocks.create]", error.message);
      return null;
    }
    return normalizeContentBlock(data);
  } catch (e) {
    console.error("[content_blocks.create]", e);
    return null;
  }
}

export async function updateContentBlock(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(contentBlockToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[content_blocks.update]", error.message);
      return null;
    }
    return normalizeContentBlock(data);
  } catch (e) {
    console.error("[content_blocks.update]", e);
    return null;
  }
}

export async function softDeleteContentBlock(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[content_blocks.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[content_blocks.delete]", e);
    return false;
  }
}

// Called when the builder inserts the block into a document.
export async function markContentBlockUsed(block) {
  if (!block?.id) return null;
  return updateContentBlock(block.id, { usageCount: (block.usageCount || 0) + 1, lastUsedAt: new Date().toISOString() });
}
