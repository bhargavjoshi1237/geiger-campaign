"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.assignment_rules — inbox routing (round robin / least busy / manual) over a
// set of teammates, scoped by channel and conditions. The round-robin pointer (next_index) and counters
// are advanced by the server when it routes. Pure: console.error and null / false / [], never toast.

const TABLE = "assignment_rules";
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeAssignmentRule(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const conditions = row.conditions && typeof row.conditions === "object" ? row.conditions : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled rule",
    strategy: row.strategy ?? "round_robin",
    members: list(row.members),
    channels: list(row.channels),
    conditions: { match: conditions.match === "any" ? "any" : "all", conditions: list(conditions.conditions) },
    position: Number(row.position ?? 0),
    active: row.active !== false,
    maxOpenPerMember: row.max_open_per_member == null ? null : Number(row.max_open_per_member),
    nextIndex: Number(row.next_index ?? 0),
    assignedCount: Number(row.assigned_count ?? 0),
    lastAssignedAt: row.last_assigned_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function assignmentRuleToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled rule";
  if ("strategy" in input) row.strategy = input.strategy;
  if ("members" in input) row.members = list(input.members);
  if ("channels" in input) row.channels = list(input.channels);
  if ("conditions" in input) {
    const c = input.conditions && typeof input.conditions === "object" ? input.conditions : {};
    row.conditions = { match: c.match === "any" ? "any" : "all", conditions: list(c.conditions) };
  }
  if ("position" in input) row.position = Number(input.position) || 0;
  if ("active" in input) row.active = Boolean(input.active);
  if ("maxOpenPerMember" in input) {
    const cap = Number(input.maxOpenPerMember);
    row.max_open_per_member = Number.isFinite(cap) && cap > 0 ? Math.round(cap) : null;
  }
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export async function listAssignmentRules(projectId) {
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
      console.error("[assignment_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAssignmentRule);
  } catch (e) {
    console.error("[assignment_rules.list]", e);
    return null;
  }
}

export async function createAssignmentRule(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...assignmentRuleToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[assignment_rules.create]", error.message);
      return null;
    }
    return normalizeAssignmentRule(data);
  } catch (e) {
    console.error("[assignment_rules.create]", e);
    return null;
  }
}

export async function updateAssignmentRule(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(assignmentRuleToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[assignment_rules.update]", error.message);
      return null;
    }
    return normalizeAssignmentRule(data);
  } catch (e) {
    console.error("[assignment_rules.update]", e);
    return null;
  }
}

export async function softDeleteAssignmentRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[assignment_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[assignment_rules.delete]", e);
    return false;
  }
}
