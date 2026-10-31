"use client";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.conversations + campaign.conversation_messages — inbox threads across every
// channel. Status, assignment, tags and internal notes are written here; outbound replies go through
// the reply route (server dispatch) so the platform messaging window is enforced. Pure: null / false / [].

const THREADS = "conversations";
const MESSAGES = "conversation_messages";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function normalizeConversation(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    channel: row.channel ?? "email",
    connectionId: row.connection_id ?? null,
    contactId: row.contact_id ?? null,
    kind: row.kind ?? "dm",
    externalThreadId: row.external_thread_id ?? null,
    title: row.title ?? "",
    status: row.status ?? "open",
    priority: row.priority ?? "normal",
    assigneeId: row.assignee_id ?? null,
    handledBy: row.handled_by ?? "human",
    unreadCount: Number(row.unread_count ?? 0),
    tags: Array.isArray(row.tags) ? row.tags : [],
    lastMessageAt: row.last_message_at ?? null,
    lastInboundAt: row.last_inbound_at ?? null,
    windowExpiresAt: row.window_expires_at ?? null,
    slaDueAt: row.sla_due_at ?? null,
    snoozedUntil: row.snoozed_until ?? null,
    firstResponseAt: row.first_response_at ?? null,
    resolvedAt: row.resolved_at ?? null,
    resolutionDueAt: row.resolution_due_at ?? null,
    slaPolicyId: row.sla_policy_id ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function normalizeMessage(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction ?? "inbound",
    senderType: row.sender_type ?? "contact",
    senderId: row.sender_id ?? null,
    body: row.body ?? "",
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    externalId: row.external_id ?? null,
    status: row.status ?? "received",
    deliveryId: row.delivery_id ?? null,
    error: row.error ?? "",
    sentAt: row.sent_at ?? row.created_at ?? null,
  };
}

function conversationToRow(input) {
  const row = {};
  const map = {
    status: "status",
    priority: "priority",
    assigneeId: "assignee_id",
    handledBy: "handled_by",
    title: "title",
    contactId: "contact_id",
    snoozedUntil: "snoozed_until",
    slaDueAt: "sla_due_at",
    firstResponseAt: "first_response_at",
    resolvedAt: "resolved_at",
    resolutionDueAt: "resolution_due_at",
    slaPolicyId: "sla_policy_id",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("unreadCount" in input) row.unread_count = Number(input.unreadCount) || 0;
  if ("tags" in input) row.tags = Array.isArray(input.tags) ? input.tags : [];
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { channel (string | string[]), kind, status, assigneeId, contactId, limit }.
export async function listConversations(projectId, filters = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const { channel, kind, status, assigneeId, contactId, limit = 500 } = filters;
  try {
    let query = schemaClient()
      .from(THREADS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (channel) query = Array.isArray(channel) ? query.in("channel", channel) : query.eq("channel", channel);
    if (kind) query = Array.isArray(kind) ? query.in("kind", kind) : query.eq("kind", kind);
    if (status) query = Array.isArray(status) ? query.in("status", status) : query.eq("status", status);
    if (assigneeId) query = query.eq("assignee_id", assigneeId);
    if (contactId) query = query.eq("contact_id", contactId);
    const { data, error } = await query;
    if (error) {
      console.error("[conversations.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeConversation);
  } catch (e) {
    console.error("[conversations.list]", e);
    return null;
  }
}

export async function getConversation(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(THREADS)
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[conversations.get]", error.message);
      return null;
    }
    return normalizeConversation(data);
  } catch (e) {
    console.error("[conversations.get]", e);
    return null;
  }
}

export async function listMessages(conversationId) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(MESSAGES)
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("sent_at", { ascending: true });
    if (error) {
      console.error("[conversations.messages]", error.message);
      return null;
    }
    return (data || []).map(normalizeMessage);
  } catch (e) {
    console.error("[conversations.messages]", e);
    return null;
  }
}

// Newest messages across the project (notes excluded) — list previews and full-text search.
export async function listRecentMessages(projectId, { limit = 2000, since } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(MESSAGES)
      .select("id, conversation_id, direction, sender_type, body, attachments, status, sent_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .neq("direction", "note")
      .order("sent_at", { ascending: false })
      .limit(limit);
    if (since) query = query.gte("sent_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[conversations.recent]", error.message);
      return null;
    }
    return (data || []).map(normalizeMessage);
  } catch (e) {
    console.error("[conversations.recent]", e);
    return null;
  }
}

export async function updateConversation(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(THREADS)
      .update(conversationToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[conversations.update]", error.message);
      return null;
    }
    return normalizeConversation(data);
  } catch (e) {
    console.error("[conversations.update]", e);
    return null;
  }
}

// Shallow-merges keys into the conversation's metadata bag (post context, preview, flags).
export async function mergeConversationMeta(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("merge_meta", { p_table: THREADS, p_id: id, p_patch: patch || {} });
    if (error) {
      console.error("[conversations.mergeMeta]", error.message);
      return null;
    }
    return data ?? {};
  } catch (e) {
    console.error("[conversations.mergeMeta]", e);
    return null;
  }
}

async function insertNoteRow(projectId, conversationId, { id, body, senderId, senderType, metadata }) {
  const { data, error } = await schemaClient()
    .from(MESSAGES)
    .insert({
      ...(id ? { id } : {}),
      project_id: projectId,
      conversation_id: conversationId,
      direction: "note",
      sender_type: senderType,
      sender_id: senderId,
      body: String(body || ""),
      status: "sent",
      sent_at: new Date().toISOString(),
      metadata: bag(metadata),
    })
    .select("*")
    .single();
  return { data, error };
}

// Internal notes are written directly (never sent); replies go through the reply route.
export async function addNote(projectId, conversationId, { id, body, senderId = null, mentions = [] }) {
  if (!projectId || !conversationId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await insertNoteRow(projectId, conversationId, {
      id,
      body,
      senderId,
      senderType: "agent",
      metadata: mentions.length ? { mentions } : {},
    });
    if (error) {
      console.error("[conversations.addNote]", error.message);
      return null;
    }
    return normalizeMessage(data);
  } catch (e) {
    console.error("[conversations.addNote]", e);
    return null;
  }
}

// Activity line in the thread ("Maya took over from the bot") — internal, never sent.
export async function addSystemEvent(projectId, conversationId, { body, senderId = null, event = null }) {
  if (!projectId || !conversationId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await insertNoteRow(projectId, conversationId, {
      body,
      senderId,
      senderType: "system",
      metadata: event ? { event } : {},
    });
    if (error) {
      console.error("[conversations.addSystemEvent]", error.message);
      return null;
    }
    return normalizeMessage(data);
  } catch (e) {
    console.error("[conversations.addSystemEvent]", e);
    return null;
  }
}

// Latest consent row per channel for one contact (campaign.contact_consents is an append-only ledger).
export async function listContactConsents(projectId, contactId) {
  if (!projectId || !contactId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("contact_consents")
      .select("id, channel, status, source, captured_at")
      .eq("project_id", projectId)
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("captured_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[conversations.consents]", error.message);
      return null;
    }
    const latest = new Map();
    for (const row of data || []) {
      if (!latest.has(row.channel)) {
        latest.set(row.channel, { id: row.id, channel: row.channel, status: row.status ?? "pending", source: row.source ?? "", capturedAt: row.captured_at ?? null });
      }
    }
    return [...latest.values()];
  } catch (e) {
    console.error("[conversations.consents]", e);
    return null;
  }
}

// CRM deals linked to one contact (campaign.deals), newest first.
export async function listContactDeals(projectId, contactId) {
  if (!projectId || !contactId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("deals")
      .select("id, name, value, currency, status, stage_id, expected_close_date, created_at")
      .eq("project_id", projectId)
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.error("[conversations.deals]", error.message);
      return null;
    }
    return (data || []).map((row) => ({
      id: row.id,
      name: row.name ?? "Untitled deal",
      value: Number(row.value ?? 0),
      currency: row.currency ?? "USD",
      status: row.status ?? "open",
      stageId: row.stage_id ?? "",
      expectedCloseDate: row.expected_close_date ?? null,
      createdAt: row.created_at ?? null,
    }));
  } catch (e) {
    console.error("[conversations.deals]", e);
    return null;
  }
}

const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

// Uploads a reply attachment to the public products bucket; returns { url, name, type, size } or null.
export async function uploadInboxAttachment(projectId, file) {
  if (!projectId || !file || !isSupabaseConfigured()) return null;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    console.error("[conversations.upload]", "file too large");
    return null;
  }
  try {
    const safe = String(file.name || "file").replace(/[^\w.-]+/g, "-").slice(-80);
    const path = `campaign/${projectId}/inbox/${crypto.randomUUID()}-${safe}`;
    const bucket = createClient().storage.from("products");
    const { error } = await bucket.upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) {
      console.error("[conversations.upload]", error.message);
      return null;
    }
    const { data } = bucket.getPublicUrl(path);
    return { url: data?.publicUrl || "", name: file.name || safe, type: file.type || "application/octet-stream", size: file.size || 0 };
  } catch (e) {
    console.error("[conversations.upload]", e);
    return null;
  }
}

// Soft delete: the thread and its messages drop out of every inbox (messages cascade only on hard delete).
export async function softDeleteConversation(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(THREADS).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[conversations.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[conversations.delete]", e);
    return false;
  }
}
