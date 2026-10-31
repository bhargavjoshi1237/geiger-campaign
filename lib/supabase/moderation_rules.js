"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeConditions, normalizeScope } from "@/lib/social/moderation_eval";

// Data layer for campaign.moderation_rules (editable) and campaign.moderation_log (read-only audit of every
// automatic or manual moderation action; written server-side). Pure: null / false / [] on failure.

const RULES = "moderation_rules";
const LOG = "moderation_log";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const strings = (v) => (Array.isArray(v) ? v.map((s) => String(s || "").trim()).filter(Boolean) : []);

export function normalizeModerationRule(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled rule",
    conditions: normalizeConditions(row.conditions),
    scope: normalizeScope(row.scope),
    networks: strings(row.networks),
    action: row.action ?? "hide",
    replyText: row.reply_text ?? "",
    allowlist: strings(row.allowlist),
    active: row.active !== false,
    priority: Number(row.priority ?? 0),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function moderationRuleToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled rule";
  if ("conditions" in input) row.conditions = normalizeConditions(input.conditions);
  if ("scope" in input) row.scope = normalizeScope(input.scope);
  if ("networks" in input) row.networks = strings(input.networks);
  if ("action" in input) row.action = input.action || "hide";
  if ("replyText" in input) row.reply_text = String(input.replyText || "");
  if ("allowlist" in input) row.allowlist = strings(input.allowlist);
  if ("active" in input) row.active = Boolean(input.active);
  if ("priority" in input) row.priority = Number(input.priority) || 0;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeModerationLog(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    ruleId: row.rule_id ?? null,
    connectionId: row.connection_id ?? null,
    network: row.network ?? "",
    commentExternalId: row.comment_external_id ?? "",
    postExternalId: row.post_external_id ?? null,
    text: row.text ?? "",
    author: row.author ?? "",
    authorExternalId: row.author_external_id ?? null,
    action: row.action ?? "flag",
    source: row.source ?? "auto",
    status: row.status ?? "done",
    reason: row.reason ?? "",
    error: row.error ?? "",
    actorId: row.actor_id ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function listModerationRules(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(RULES)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[moderation_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeModerationRule);
  } catch (e) {
    console.error("[moderation_rules.list]", e);
    return null;
  }
}

export async function createModerationRule(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...moderationRuleToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(RULES).insert(payload).select("*").single();
    if (error) {
      console.error("[moderation_rules.create]", error.message);
      return null;
    }
    return normalizeModerationRule(data);
  } catch (e) {
    console.error("[moderation_rules.create]", e);
    return null;
  }
}

export async function updateModerationRule(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(RULES)
      .update(moderationRuleToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[moderation_rules.update]", error.message);
      return null;
    }
    return normalizeModerationRule(data);
  } catch (e) {
    console.error("[moderation_rules.update]", e);
    return null;
  }
}

export async function softDeleteModerationRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(RULES).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[moderation_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[moderation_rules.delete]", e);
    return false;
  }
}

// Filters: { ruleId, since, limit }.
export async function listModerationLog(projectId, { ruleId, since, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(LOG)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (ruleId) query = query.eq("rule_id", ruleId);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[moderation_rules.log]", error.message);
      return null;
    }
    return (data || []).map(normalizeModerationLog);
  } catch (e) {
    console.error("[moderation_rules.log]", e);
    return null;
  }
}
