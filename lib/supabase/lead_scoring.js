"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.scoring_rules. Scores themselves are computed server-side
// (POST /api/projects/:projectId/audience/scoring/recompute). Pure: null / false / [] on failure.

const TABLE = "scoring_rules";

export function normalizeScoringRule(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled rule",
    trigger: row.trigger ?? "event",
    eventName: row.event_name ?? "",
    condition: row.condition && typeof row.condition === "object" ? row.condition : {},
    points: Number(row.points ?? 0),
    frequency: row.frequency === "once" ? "once" : "every",
    decayDays: row.decay_days ? Number(row.decay_days) : null,
    active: row.active !== false,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function scoringRuleToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled rule";
  if ("trigger" in input) row.trigger = input.trigger;
  if ("eventName" in input) row.event_name = String(input.eventName || "").trim() || null;
  if ("condition" in input) row.condition = input.condition && typeof input.condition === "object" ? input.condition : {};
  if ("points" in input) row.points = Math.round(Number(input.points) || 0);
  if ("frequency" in input) row.frequency = input.frequency === "once" ? "once" : "every";
  if ("decayDays" in input) row.decay_days = Number(input.decayDays) > 0 ? Math.round(Number(input.decayDays)) : null;
  if ("active" in input) row.active = Boolean(input.active);
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  return row;
}

export async function listScoringRules(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[scoring_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeScoringRule);
  } catch (e) {
    console.error("[scoring_rules.list]", e);
    return null;
  }
}

export async function createScoringRule(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...scoringRuleToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[scoring_rules.create]", error.message);
      return null;
    }
    return normalizeScoringRule(data);
  } catch (e) {
    console.error("[scoring_rules.create]", e);
    return null;
  }
}

export async function updateScoringRule(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(scoringRuleToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[scoring_rules.update]", error.message);
      return null;
    }
    return normalizeScoringRule(data);
  } catch (e) {
    console.error("[scoring_rules.update]", e);
    return null;
  }
}

export async function softDeleteScoringRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[scoring_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[scoring_rules.delete]", e);
    return false;
  }
}
