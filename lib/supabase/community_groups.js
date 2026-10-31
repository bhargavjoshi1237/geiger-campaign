"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for Telegram group automation: campaign.community_groups (welcome bot + moderation
// settings, one per linked group), campaign.group_rules (banned words / links / flood rules) and the
// read-only moderation log campaign.community_group_events (written by the bot webhook on the server).
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeCommunityGroup(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    channelId: row.channel_id ?? null,
    welcomeEnabled: Boolean(row.welcome_enabled),
    welcomeText: row.welcome_text ?? "",
    welcomeButtons: list(row.welcome_buttons),
    cleanServiceMessages: Boolean(row.clean_service_messages),
    exemptAdmins: row.exempt_admins ?? true,
    warnLimit: Number(row.warn_limit ?? 3),
    escalationAction: row.escalation_action ?? "restrict",
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function communityGroupToRow(input) {
  const row = {};
  if ("channelId" in input) row.channel_id = input.channelId;
  if ("welcomeEnabled" in input) row.welcome_enabled = Boolean(input.welcomeEnabled);
  if ("welcomeText" in input) row.welcome_text = String(input.welcomeText ?? "");
  if ("welcomeButtons" in input) row.welcome_buttons = list(input.welcomeButtons);
  if ("cleanServiceMessages" in input) row.clean_service_messages = Boolean(input.cleanServiceMessages);
  if ("exemptAdmins" in input) row.exempt_admins = Boolean(input.exemptAdmins);
  if ("warnLimit" in input) row.warn_limit = Math.min(10, Math.max(1, Math.round(Number(input.warnLimit) || 3)));
  if ("escalationAction" in input) row.escalation_action = input.escalationAction === "ban" ? "ban" : "restrict";
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeGroupRule(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    groupId: row.group_id ?? null,
    kind: row.kind ?? "banned_words",
    name: row.name ?? "",
    enabled: row.enabled ?? true,
    action: row.action ?? "delete",
    config: bag(row.config),
    sort: Number(row.sort ?? 0),
    createdAt: row.created_at ?? null,
  };
}

export function groupRuleToRow(input) {
  const row = {};
  if ("groupId" in input) row.group_id = input.groupId;
  if ("kind" in input) row.kind = input.kind;
  if ("name" in input) row.name = String(input.name || "").trim();
  if ("enabled" in input) row.enabled = Boolean(input.enabled);
  if ("action" in input) row.action = input.action;
  if ("config" in input) row.config = bag(input.config);
  if ("sort" in input) row.sort = Math.round(Number(input.sort) || 0);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeGroupEvent(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    groupId: row.group_id ?? null,
    ruleId: row.rule_id ?? null,
    event: row.event ?? "deleted",
    externalUserId: row.external_user_id ?? null,
    username: row.username ?? "",
    displayName: row.display_name ?? "",
    excerpt: row.excerpt ?? "",
    reason: row.reason ?? "",
    error: row.error ?? null,
    occurredAt: row.occurred_at ?? row.created_at ?? null,
  };
}

export async function listCommunityGroups(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("community_groups")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[community_groups.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCommunityGroup);
  } catch (e) {
    console.error("[community_groups.list]", e);
    return null;
  }
}

export async function updateCommunityGroup(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("community_groups")
      .update(communityGroupToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[community_groups.update]", error.message);
      return null;
    }
    return normalizeCommunityGroup(data);
  } catch (e) {
    console.error("[community_groups.update]", e);
    return null;
  }
}

// Filters: { groupId }.
export async function listGroupRules(projectId, { groupId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from("group_rules")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("sort", { ascending: true });
    if (groupId) query = query.eq("group_id", groupId);
    const { data, error } = await query;
    if (error) {
      console.error("[group_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeGroupRule);
  } catch (e) {
    console.error("[group_rules.list]", e);
    return null;
  }
}

export async function createGroupRule(projectId, input) {
  if (!projectId || !input?.groupId || !isSupabaseConfigured()) return null;
  try {
    const payload = { enabled: true, action: "delete", config: {}, sort: 0, ...groupRuleToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from("group_rules").insert(payload).select("*").single();
    if (error) {
      console.error("[group_rules.create]", error.message);
      return null;
    }
    return normalizeGroupRule(data);
  } catch (e) {
    console.error("[group_rules.create]", e);
    return null;
  }
}

export async function updateGroupRule(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("group_rules")
      .update(groupRuleToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[group_rules.update]", error.message);
      return null;
    }
    return normalizeGroupRule(data);
  } catch (e) {
    console.error("[group_rules.update]", e);
    return null;
  }
}

export async function softDeleteGroupRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from("group_rules")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[group_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[group_rules.delete]", e);
    return false;
  }
}

// Moderation log, newest first. Filters: { groupId, events, limit }.
export async function listGroupEvents(projectId, { groupId, events, limit = 200 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from("community_group_events")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (groupId) query = query.eq("group_id", groupId);
    if (Array.isArray(events) && events.length) query = query.in("event", events);
    const { data, error } = await query;
    if (error) {
      console.error("[community_group_events.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeGroupEvent);
  } catch (e) {
    console.error("[community_group_events.list]", e);
    return null;
  }
}
