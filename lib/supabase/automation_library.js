"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { conditionSetToRow, goalToRow, normalizeConditionSet, normalizeGoal } from "@/lib/automations/model";

export { normalizeConditionSet, normalizeGoal };

// Data layer for the reusable automation library: condition sets (campaign.automation_conditions,
// segment_rules vocabulary) and goals (campaign.automation_goals). Pure: null / false / [] on failure.

async function list(table, projectId, normalize, label) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(table)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(`[${label}.list]`, error.message);
      return null;
    }
    return (data || []).map(normalize);
  } catch (e) {
    console.error(`[${label}.list]`, e);
    return null;
  }
}

async function create(table, projectId, row, id, normalize, label) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...row, project_id: projectId };
    if (id) payload.id = id;
    const { data, error } = await schemaClient().from(table).insert(payload).select("*").single();
    if (error) {
      console.error(`[${label}.create]`, error.message);
      return null;
    }
    return normalize(data);
  } catch (e) {
    console.error(`[${label}.create]`, e);
    return null;
  }
}

async function update(table, id, row, normalize, label) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(table)
      .update(row)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error(`[${label}.update]`, error.message);
      return null;
    }
    return normalize(data);
  } catch (e) {
    console.error(`[${label}.update]`, e);
    return null;
  }
}

async function softDelete(table, id, label) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error(`[${label}.delete]`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[${label}.delete]`, e);
    return false;
  }
}

export const listConditionSets = (projectId) => list("automation_conditions", projectId, normalizeConditionSet, "automation_conditions");
export const createConditionSet = (projectId, input) =>
  create("automation_conditions", projectId, conditionSetToRow(input), input.id, normalizeConditionSet, "automation_conditions");
export const updateConditionSet = (id, patch) => update("automation_conditions", id, conditionSetToRow(patch), normalizeConditionSet, "automation_conditions");
export const softDeleteConditionSet = (id) => softDelete("automation_conditions", id, "automation_conditions");

export const listGoals = (projectId) => list("automation_goals", projectId, normalizeGoal, "automation_goals");
export const createGoal = (projectId, input) => create("automation_goals", projectId, goalToRow(input), input.id, normalizeGoal, "automation_goals");
export const updateGoal = (id, patch) => update("automation_goals", id, goalToRow(patch), normalizeGoal, "automation_goals");
export const softDeleteGoal = (id) => softDelete("automation_goals", id, "automation_goals");

// Converted enrollments per saved goal: { [goalId]: count } (the engine stamps context.goalId on conversion).
export async function countGoalConversions(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("automation_enrollments")
      .select("id, context")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .not("context->>goalId", "is", null)
      .limit(10000);
    if (error) {
      console.error("[automation_goals.conversions]", error.message);
      return null;
    }
    const counts = {};
    for (const row of data || []) {
      const ctx = row.context || {};
      if (!ctx.convertedAt || ctx.test || !ctx.goalId) continue;
      counts[ctx.goalId] = (counts[ctx.goalId] || 0) + 1;
    }
    return counts;
  } catch (e) {
    console.error("[automation_goals.conversions]", e);
    return null;
  }
}
