"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.chat_automations — comment-to-DM, keyword, story reply / mention, welcome, default
// reply and referral automations — plus read-only campaign.chat_outbox (replies held by quiet hours). Status
// changes go through the chat status route so publishing is validated. Pure: null / false / [].

const TABLE = "chat_automations";
const OUTBOX = "chat_outbox";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export const DEFAULT_QUIET_HOURS = Object.freeze({ enabled: false, start: "21:00", end: "08:00", timezone: "UTC", behavior: "queue" });

export function normalizeTrigger(value) {
  const t = bag(value);
  return {
    ...t,
    allPosts: Boolean(t.allPosts),
    postIds: list(t.postIds).map(String),
    posts: list(t.posts),
    includeAds: Boolean(t.includeAds),
    adIds: list(t.adIds).map(String),
    keywords: list(t.keywords).map(String),
    match: ["exact", "contains", "any"].includes(t.match) ? t.match : "contains",
    refs: list(t.refs).map(String),
  };
}

export function normalizeActions(value) {
  const a = bag(value);
  const dm = bag(a.dm);
  return {
    ...a,
    publicReplies: list(a.publicReplies).map(String),
    dm: { ...dm, text: dm.text ?? "", buttons: list(dm.buttons), flowId: dm.flowId ?? null },
    tags: list(a.tags).map(String),
    removeTags: list(a.removeTags).map(String),
    fields: list(a.fields),
    sequenceId: a.sequenceId ?? null,
  };
}

export function normalizeGuardrails(value) {
  const g = bag(value);
  return {
    ...g,
    quietHours: { ...DEFAULT_QUIET_HOURS, ...bag(g.quietHours) },
    oncePerPost: g.oncePerPost !== false,
    cooldownHours: Number(g.cooldownHours ?? 24),
  };
}

export function normalizeChatAutomation(row) {
  if (!row) return null;
  const stats = bag(row.stats);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled automation",
    description: row.description ?? "",
    kind: row.kind ?? "keyword",
    status: row.status ?? "draft",
    priority: Number(row.priority ?? 100),
    channels: list(row.channels),
    connectionIds: list(row.connection_ids),
    trigger: normalizeTrigger(row.trigger),
    actions: normalizeActions(row.actions),
    guardrails: normalizeGuardrails(row.guardrails),
    stats: {
      triggered: Number(stats.triggered ?? 0),
      publicReplies: Number(stats.publicReplies ?? 0),
      dmsSent: Number(stats.dmsSent ?? 0),
      dmsBlocked: Number(stats.dmsBlocked ?? 0),
      queued: Math.max(0, Number(stats.queued ?? 0)),
    },
    publishedAt: row.published_at ?? null,
    lastTriggeredAt: row.last_triggered_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// camelCase patch -> snake_case columns; a column is emitted only when its key is present.
export function chatAutomationToRow(input) {
  const row = {};
  const map = { name: "name", description: "description", kind: "kind", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("priority" in input) row.priority = Number(input.priority) || 100;
  if ("channels" in input) row.channels = list(input.channels);
  if ("connectionIds" in input) row.connection_ids = list(input.connectionIds);
  if ("trigger" in input) row.trigger = bag(input.trigger);
  if ("actions" in input) row.actions = bag(input.actions);
  if ("guardrails" in input) row.guardrails = bag(input.guardrails);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { kinds: string[], limit }.
export async function listChatAutomations(projectId, { kinds, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (Array.isArray(kinds) && kinds.length) query = query.in("kind", kinds);
    const { data, error } = await query;
    if (error) {
      console.error("[chat_automations.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeChatAutomation);
  } catch (e) {
    console.error("[chat_automations.list]", e);
    return null;
  }
}

export async function getChatAutomation(projectId, id) {
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
      console.error("[chat_automations.get]", error.message);
      return null;
    }
    return normalizeChatAutomation(data);
  } catch (e) {
    console.error("[chat_automations.get]", e);
    return null;
  }
}

export async function createChatAutomation(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...chatAutomationToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[chat_automations.create]", error.message);
      return null;
    }
    return normalizeChatAutomation(data);
  } catch (e) {
    console.error("[chat_automations.create]", e);
    return null;
  }
}

export async function updateChatAutomation(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(chatAutomationToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[chat_automations.update]", error.message);
      return null;
    }
    return normalizeChatAutomation(data);
  } catch (e) {
    console.error("[chat_automations.update]", e);
    return null;
  }
}

export async function softDeleteChatAutomation(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", id);
    if (error) {
      console.error("[chat_automations.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_automations.delete]", e);
    return false;
  }
}

export function normalizeOutboxItem(row) {
  if (!row) return null;
  const source = bag(row.source);
  return {
    id: row.id,
    conversationId: row.conversation_id ?? null,
    contactId: row.contact_id ?? null,
    channel: row.channel ?? "",
    text: bag(row.message).text ?? "",
    sourceType: source.type ?? null,
    sourceId: source.id ?? null,
    sendAfter: row.send_after ?? null,
    expiresAt: row.expires_at ?? null,
    status: row.status ?? "queued",
    reason: row.reason ?? "",
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

// Read-only: replies the engine queued (quiet hours). Filters: { sourceId, status, limit }.
export async function listChatOutbox(projectId, { sourceId, status, limit = 200 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(OUTBOX)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    if (sourceId) query = query.contains("source", { id: sourceId });
    const { data, error } = await query;
    if (error) {
      console.error("[chat_automations.outbox]", error.message);
      return null;
    }
    return (data || []).map(normalizeOutboxItem);
  } catch (e) {
    console.error("[chat_automations.outbox]", e);
    return null;
  }
}
