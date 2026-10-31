"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.handover_rules — when the bot steps aside (keywords, negative sentiment, repeated
// no-match, VIP tags, low AI confidence) and what happens (assign, priority, notify, pause the bot). The
// chat engine evaluates active rules in priority order. Pure: null / false / [].

const TABLE = "handover_rules";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeHandoverRule(row) {
  if (!row) return null;
  const c = bag(row.conditions);
  const a = bag(row.action);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled rule",
    description: row.description ?? "",
    status: row.status ?? "active",
    priority: Number(row.priority ?? 100),
    channels: list(row.channels),
    conditions: {
      ...c,
      match: c.match === "all" ? "all" : "any",
      keywords: list(c.keywords).map(String),
      sentiment: c.sentiment === "negative" ? "negative" : null,
      noMatchCount: Number(c.noMatchCount ?? 0),
      vipTags: list(c.vipTags).map(String),
      aiConfidenceBelow: c.aiConfidenceBelow == null || c.aiConfidenceBelow === "" ? null : Number(c.aiConfidenceBelow),
    },
    action: {
      ...a,
      assigneeId: a.assigneeId ?? null,
      team: a.team ?? "",
      priority: a.priority ?? "normal",
      notify: a.notify !== false,
      pauseBot: a.pauseBot !== false,
      message: a.message ?? "",
    },
    stats: { fired: Number(bag(row.stats).fired ?? 0) },
    lastFiredAt: row.last_fired_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function handoverRuleToRow(input) {
  const row = {};
  const map = { name: "name", description: "description", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("priority" in input) row.priority = Number(input.priority) || 100;
  if ("channels" in input) row.channels = list(input.channels);
  if ("conditions" in input) row.conditions = bag(input.conditions);
  if ("action" in input) row.action = bag(input.action);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listHandoverRules(projectId, { limit = 200 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("priority", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("[handover_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeHandoverRule);
  } catch (e) {
    console.error("[handover_rules.list]", e);
    return null;
  }
}

export async function getHandoverRule(projectId, id) {
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
      console.error("[handover_rules.get]", error.message);
      return null;
    }
    return normalizeHandoverRule(data);
  } catch (e) {
    console.error("[handover_rules.get]", e);
    return null;
  }
}

export async function createHandoverRule(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...handoverRuleToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[handover_rules.create]", error.message);
      return null;
    }
    return normalizeHandoverRule(data);
  } catch (e) {
    console.error("[handover_rules.create]", e);
    return null;
  }
}

export async function updateHandoverRule(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(handoverRuleToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[handover_rules.update]", error.message);
      return null;
    }
    return normalizeHandoverRule(data);
  } catch (e) {
    console.error("[handover_rules.update]", e);
    return null;
  }
}

export async function softDeleteHandoverRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "paused" })
      .eq("id", id);
    if (error) {
      console.error("[handover_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[handover_rules.delete]", e);
    return false;
  }
}
