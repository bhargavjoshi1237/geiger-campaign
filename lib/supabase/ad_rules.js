"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.ad_rules — automated rules the ads worker evaluates against the latest
// insights snapshots (e.g. pause an ad set whose cost per lead crosses a threshold). Pure: null / false / [].

const TABLE = "ad_rules";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeAdRule(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    name: row.name ?? "Untitled rule",
    level: row.level ?? "adset",
    metric: row.metric ?? "cpl",
    operator: row.operator ?? "gt",
    threshold: Number(row.threshold ?? 0),
    minSpend: Number(row.min_spend ?? 0),
    datePreset: row.date_preset ?? "last_7d",
    action: row.action ?? "pause",
    status: row.status ?? "active",
    scopeIds: Array.isArray(row.scope_ids) ? row.scope_ids : [],
    lastEvaluatedAt: row.last_evaluated_at ?? null,
    lastTriggeredAt: row.last_triggered_at ?? null,
    triggerCount: Number(row.trigger_count ?? 0),
    history: Array.isArray(row.history) ? row.history : [],
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function adRuleToRow(input) {
  const row = {};
  const map = {
    adAccountId: "ad_account_id",
    name: "name",
    level: "level",
    metric: "metric",
    operator: "operator",
    datePreset: "date_preset",
    action: "action",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("threshold" in input) row.threshold = Number(input.threshold) || 0;
  if ("minSpend" in input) row.min_spend = Number(input.minSpend) || 0;
  if ("scopeIds" in input) row.scope_ids = Array.isArray(input.scopeIds) ? input.scopeIds : [];
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listAdRules(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[ad_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAdRule);
  } catch (e) {
    console.error("[ad_rules.list]", e);
    return null;
  }
}

export async function createAdRule(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...adRuleToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[ad_rules.create]", error.message);
      return null;
    }
    return normalizeAdRule(data);
  } catch (e) {
    console.error("[ad_rules.create]", e);
    return null;
  }
}

export async function updateAdRule(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(adRuleToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[ad_rules.update]", error.message);
      return null;
    }
    return normalizeAdRule(data);
  } catch (e) {
    console.error("[ad_rules.update]", e);
    return null;
  }
}

export async function softDeleteAdRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[ad_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ad_rules.delete]", e);
    return false;
  }
}
