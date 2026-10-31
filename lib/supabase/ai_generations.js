"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.ai_generations — the history of AI assistant outputs. Rows are written by the AI
// routes (app/api/projects/[projectId]/ai/*) after validation; screens list, reopen, link (campaign/segment
// created from an output) and soft-delete them. Pure: null / false / [] on failure, never throws or toasts.

const TABLE = "ai_generations";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeGeneration(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    tool: row.tool ?? "",
    title: row.title ?? "",
    input: bag(row.input),
    output: bag(row.output),
    model: row.model ?? "",
    campaignId: row.campaign_id ?? null,
    segmentId: row.segment_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function generationToRow(input) {
  const row = {};
  if ("title" in input) row.title = String(input.title || "").slice(0, 120);
  if ("campaignId" in input) row.campaign_id = input.campaignId || null;
  if ("segmentId" in input) row.segment_id = input.segmentId || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listGenerations(projectId, { tool, limit = 50 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (tool) query = query.eq("tool", tool);
    const { data, error } = await query;
    if (error) {
      console.error("[ai_generations.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeGeneration);
  } catch (e) {
    console.error("[ai_generations.list]", e);
    return null;
  }
}

export async function getGeneration(projectId, id) {
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
      console.error("[ai_generations.get]", error.message);
      return null;
    }
    return normalizeGeneration(data);
  } catch (e) {
    console.error("[ai_generations.get]", e);
    return null;
  }
}

// Links (campaignId / segmentId), renames or tags a generation.
export async function updateGeneration(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(generationToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[ai_generations.update]", error.message);
      return null;
    }
    return normalizeGeneration(data);
  } catch (e) {
    console.error("[ai_generations.update]", e);
    return null;
  }
}

export async function softDeleteGeneration(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[ai_generations.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ai_generations.delete]", e);
    return false;
  }
}
