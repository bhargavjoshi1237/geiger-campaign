"use client";

import { normalizeBusinessHours } from "@/lib/inbox/sla";
import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.sla_policies — first-response and resolution targets per channel / priority,
// measured on a business-hours clock. Deadlines are stamped onto conversations by the routing server.
// Pure: console.error and null / false / [], never toast.

const TABLE = "sla_policies";
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeSlaPolicy(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled policy",
    firstResponseMinutes: Number(row.first_response_minutes ?? 60),
    resolutionMinutes: row.resolution_minutes == null ? null : Number(row.resolution_minutes),
    businessHours: normalizeBusinessHours(row.business_hours),
    channels: list(row.channels),
    priorities: list(row.priorities),
    position: Number(row.position ?? 0),
    active: row.active !== false,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function slaPolicyToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled policy";
  if ("firstResponseMinutes" in input) row.first_response_minutes = Math.max(1, Math.round(Number(input.firstResponseMinutes) || 60));
  if ("resolutionMinutes" in input) {
    const minutes = Number(input.resolutionMinutes);
    row.resolution_minutes = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
  }
  if ("businessHours" in input) row.business_hours = normalizeBusinessHours(input.businessHours);
  if ("channels" in input) row.channels = list(input.channels);
  if ("priorities" in input) row.priorities = list(input.priorities);
  if ("position" in input) row.position = Number(input.position) || 0;
  if ("active" in input) row.active = Boolean(input.active);
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export async function listSlaPolicies(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[sla_policies.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSlaPolicy);
  } catch (e) {
    console.error("[sla_policies.list]", e);
    return null;
  }
}

export async function createSlaPolicy(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...slaPolicyToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[sla_policies.create]", error.message);
      return null;
    }
    return normalizeSlaPolicy(data);
  } catch (e) {
    console.error("[sla_policies.create]", e);
    return null;
  }
}

export async function updateSlaPolicy(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(slaPolicyToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[sla_policies.update]", error.message);
      return null;
    }
    return normalizeSlaPolicy(data);
  } catch (e) {
    console.error("[sla_policies.update]", e);
    return null;
  }
}

export async function softDeleteSlaPolicy(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[sla_policies.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[sla_policies.delete]", e);
    return false;
  }
}
