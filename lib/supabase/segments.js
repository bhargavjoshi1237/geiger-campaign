"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.segments — saved { match, conditions } rules evaluated by lib/audience/segment_rules.js.
// contact_count / computed_at cache the last evaluation. Pure: null / false / [] on failure.

const TABLE = "segments";

export function normalizeSegment(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled segment",
    description: row.description ?? "",
    match: row.match === "any" ? "any" : "all",
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    contactCount: Number(row.contact_count ?? 0),
    computedAt: row.computed_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function segmentToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled segment";
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("match" in input) row.match = input.match === "any" ? "any" : "all";
  if ("conditions" in input) row.conditions = Array.isArray(input.conditions) ? input.conditions : [];
  if ("contactCount" in input) row.contact_count = Math.max(0, Number(input.contactCount) || 0);
  if ("computedAt" in input) row.computed_at = input.computedAt || null;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export async function listSegments(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[segments.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSegment);
  } catch (e) {
    console.error("[segments.list]", e);
    return null;
  }
}

export async function getSegment(projectId, id) {
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
      console.error("[segments.get]", error.message);
      return null;
    }
    return normalizeSegment(data);
  } catch (e) {
    console.error("[segments.get]", e);
    return null;
  }
}

// createSegment(projectId, { id, name, description, match, conditions }) — the AI suggestions screen calls this too.
export async function createSegment(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...segmentToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[segments.create]", error.message);
      return null;
    }
    return normalizeSegment(data);
  } catch (e) {
    console.error("[segments.create]", e);
    return null;
  }
}

export async function updateSegment(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(segmentToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[segments.update]", error.message);
      return null;
    }
    return normalizeSegment(data);
  } catch (e) {
    console.error("[segments.update]", e);
    return null;
  }
}

export async function softDeleteSegment(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[segments.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[segments.delete]", e);
    return false;
  }
}
