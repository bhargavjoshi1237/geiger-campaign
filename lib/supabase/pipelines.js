"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { DEFAULT_STAGE_TEMPLATE, STAGE_COLORS } from "@/lib/crm/constants";

// Data layer for campaign.pipelines — deal boards and their ordered stages ({ id, name, probability, color }).
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "pipelines";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function newStageId() {
  return `stg_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export function normalizeStage(stage, index = 0) {
  const s = bag(stage);
  const probability = Math.round(Number(s.probability));
  return {
    id: String(s.id || `stage_${index + 1}`),
    name: String(s.name || "").trim() || `Stage ${index + 1}`,
    probability: Number.isFinite(probability) ? Math.min(100, Math.max(0, probability)) : 0,
    color: s.color in STAGE_COLORS ? s.color : "neutral",
  };
}

export function normalizeStages(stages) {
  return (Array.isArray(stages) ? stages : []).map(normalizeStage);
}

// Fresh stages for a new pipeline, from the default sales template.
export function templateStages() {
  return DEFAULT_STAGE_TEMPLATE.map((s) => ({ ...s, id: newStageId() }));
}

export function normalizePipeline(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled pipeline",
    description: row.description ?? "",
    stages: normalizeStages(row.stages),
    isDefault: Boolean(row.is_default),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function pipelineToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled pipeline";
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("stages" in input) row.stages = normalizeStages(input.stages);
  if ("isDefault" in input) row.is_default = Boolean(input.isDefault);
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Default pipeline first, then oldest first (board order in the switcher).
export async function listPipelines(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[pipelines.list]", error.message);
      return null;
    }
    const rows = (data || []).map(normalizePipeline);
    return rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  } catch (e) {
    console.error("[pipelines.list]", e);
    return null;
  }
}

export async function createPipeline(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { name: "Untitled pipeline", description: "", stages: [], is_default: false, ...pipelineToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[pipelines.create]", error.message);
      return null;
    }
    return normalizePipeline(data);
  } catch (e) {
    console.error("[pipelines.create]", e);
    return null;
  }
}

export async function updatePipeline(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(pipelineToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[pipelines.update]", error.message);
      return null;
    }
    return normalizePipeline(data);
  } catch (e) {
    console.error("[pipelines.update]", e);
    return null;
  }
}

// One default per project (partial unique index): clear the others first, then flag this one.
export async function setDefaultPipeline(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const cleared = await sb
      .from(TABLE)
      .update({ is_default: false })
      .eq("project_id", projectId)
      .eq("is_default", true)
      .neq("id", id);
    if (cleared.error) {
      console.error("[pipelines.setDefault]", cleared.error.message);
      return false;
    }
    const { error } = await sb.from(TABLE).update({ is_default: true }).eq("id", id).is("deleted_at", null);
    if (error) {
      console.error("[pipelines.setDefault]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[pipelines.setDefault]", e);
    return false;
  }
}

export async function softDeletePipeline(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), is_default: false })
      .eq("id", id);
    if (error) {
      console.error("[pipelines.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[pipelines.delete]", e);
    return false;
  }
}
