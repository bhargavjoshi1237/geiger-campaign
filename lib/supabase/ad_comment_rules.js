"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.ad_comment_rules — how comments on ads (dark posts) are routed into the Comment
// Inbox (assignee, priority, tags) and moderated (hide links / keywords / all). The ads worker applies them
// to comment conversations it matches to an ad. Pure: null / false / [].

const TABLE = "ad_comment_rules";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeAdCommentRule(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled rule",
    scope: row.scope ?? "all_ads",
    scopeIds: list(row.scope_ids),
    channels: list(row.channels).length ? row.channels : ["messenger", "instagram"],
    routeToInbox: row.route_to_inbox !== false,
    assigneeId: row.assignee_id ?? null,
    priority: row.priority ?? "normal",
    tags: list(row.tags),
    hideLinks: Boolean(row.hide_links),
    hideKeywords: list(row.hide_keywords),
    hideAll: Boolean(row.hide_all),
    status: row.status ?? "active",
    position: Number(row.position ?? 0),
    matchedCount: Number(row.matched_count ?? 0),
    hiddenCount: Number(row.hidden_count ?? 0),
    lastMatchedAt: row.last_matched_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function adCommentRuleToRow(input) {
  const row = {};
  const map = { name: "name", scope: "scope", priority: "priority", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  for (const [key, col] of Object.entries({ scopeIds: "scope_ids", channels: "channels", tags: "tags", hideKeywords: "hide_keywords" })) {
    if (key in input) row[col] = list(input[key]).map((v) => String(v).trim()).filter(Boolean);
  }
  if ("assigneeId" in input) row.assignee_id = input.assigneeId || null;
  if ("routeToInbox" in input) row.route_to_inbox = Boolean(input.routeToInbox);
  if ("hideLinks" in input) row.hide_links = Boolean(input.hideLinks);
  if ("hideAll" in input) row.hide_all = Boolean(input.hideAll);
  if ("position" in input) row.position = Number(input.position) || 0;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listAdCommentRules(projectId) {
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
      console.error("[ad_comment_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAdCommentRule);
  } catch (e) {
    console.error("[ad_comment_rules.list]", e);
    return null;
  }
}

export async function createAdCommentRule(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...adCommentRuleToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[ad_comment_rules.create]", error.message);
      return null;
    }
    return normalizeAdCommentRule(data);
  } catch (e) {
    console.error("[ad_comment_rules.create]", e);
    return null;
  }
}

export async function updateAdCommentRule(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(adCommentRuleToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[ad_comment_rules.update]", error.message);
      return null;
    }
    return normalizeAdCommentRule(data);
  } catch (e) {
    console.error("[ad_comment_rules.update]", e);
    return null;
  }
}

export async function softDeleteAdCommentRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[ad_comment_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ad_comment_rules.delete]", e);
    return false;
  }
}
