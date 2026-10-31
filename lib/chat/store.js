import { recordEvent } from "@/lib/events/record";

// Server-only reads and writes the chat engine shares (service-role db): loading the conversation, contact
// and consent an event concerns, mapping raw rows to the shapes lib/chat/matching.js reads, contact tag /
// field updates, stats counters and social.* tracked events. Never throws; failures are logged.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export async function loadRow(db, table, id) {
  if (!db || !id) return null;
  const { data, error } = await db.from(table).select("*").eq("id", id).maybeSingle();
  if (error) console.error(`[chat.store.${table}]`, error.message);
  return data || null;
}

export async function loadConnectionRow(db, projectId, channel, connectionId) {
  if (!db) return null;
  let query = db.from("channel_connections").select("*").eq("project_id", projectId).eq("channel", channel).is("deleted_at", null);
  query = connectionId ? query.eq("id", connectionId) : query.eq("status", "connected").order("created_at");
  const { data } = await query.limit(1).maybeSingle();
  return data || null;
}

// Everything a send needs, rebuilt from ids (worker jobs, outbox, sequences).
export async function buildContext(db, { projectId, channel, connectionId = null, conversationId = null, contactId = null }) {
  const [conversation, contact, connection] = await Promise.all([
    loadRow(db, "conversations", conversationId),
    loadRow(db, "contacts", contactId),
    loadConnectionRow(db, projectId, channel, connectionId),
  ]);
  return { db, projectId, channel, connection, conversation, contact, event: null, now: Date.now() };
}

// The latest consent status for (contact, channel), or null when there is none (or no ledger yet).
export async function latestConsent(db, contactId, channel) {
  if (!db || !contactId) return null;
  const { data, error } = await db
    .from("contact_consents")
    .select("status")
    .eq("contact_id", contactId)
    .eq("channel", channel)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.status || null;
}

export async function listActiveRows(db, table, projectId, { order = "created_at" } = {}) {
  if (!db || !projectId) return [];
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order(order, { ascending: true });
  if (error) {
    console.error(`[chat.store.active.${table}]`, error.message);
    return [];
  }
  return data || [];
}

// Raw chat_automations row -> the fields lib/chat/matching.js reads.
export function toAutomation(row) {
  return {
    id: row.id,
    name: row.name || "",
    kind: row.kind,
    status: row.status,
    priority: Number(row.priority ?? 100),
    channels: row.channels || [],
    connectionIds: row.connection_ids || [],
    trigger: bag(row.trigger),
    actions: bag(row.actions),
    guardrails: bag(row.guardrails),
    stats: bag(row.stats),
    createdAt: row.created_at,
  };
}

export async function bumpStats(db, table, id, patch) {
  if (!db || !id) return;
  const { error } = await db.rpc("chat_bump_stats", { p_table: table, p_id: id, p_patch: patch });
  if (error) console.error("[chat.store.bumpStats]", table, error.message);
}

export function chatMeta(row) {
  return bag(bag(row?.metadata).chat);
}

// Shallow-merges into metadata.chat on a loaded conversation / contact row (and keeps the row in sync).
export async function mergeChatMeta(db, table, row, patch) {
  if (!db || !row?.id) return row;
  const metadata = { ...bag(row.metadata), chat: { ...chatMeta(row), ...patch } };
  const { error } = await db.from(table).update({ metadata }).eq("id", row.id);
  if (error) console.error(`[chat.store.meta.${table}]`, error.message);
  row.metadata = metadata;
  return row;
}

// The platform user id we message: the contact's channel identity, else the DM thread id.
export function contactAddress(contact, conversation, channel) {
  const identities = bag(bag(contact?.metadata).identities);
  if (identities[channel]) return String(identities[channel]);
  if (channel === "whatsapp" && contact?.phone) return String(contact.phone).replace(/[^\d]/g, "");
  if (conversation?.kind === "dm" && conversation?.external_thread_id) return String(conversation.external_thread_id);
  return null;
}

export function factsFromContact(contact, channel) {
  return {
    channel,
    tags: contact?.tags || [],
    attributes: bag(contact?.attributes),
    email: contact?.email || "",
    phone: contact?.phone || "",
    name: [contact?.first_name, contact?.last_name].filter(Boolean).join(" "),
  };
}

// Merge data for {first_name} / {name} / {username} in replies.
export function personOf(contact, channel) {
  const handles = bag(bag(contact?.metadata).handles);
  return {
    firstName: contact?.first_name || "",
    name: [contact?.first_name, contact?.last_name].filter(Boolean).join(" "),
    username: handles[channel] || "",
  };
}

// Tags and fields written by automations land on the contact (keeps the loaded row in sync).
export async function applyContactChanges(db, contact, { addTags = [], removeTags = [], fields = [] } = {}) {
  if (!db || !contact?.id) return contact;
  const add = addTags.map((t) => String(t).trim()).filter(Boolean);
  const remove = removeTags.map((t) => String(t).trim()).filter(Boolean);
  const patch = {};
  if (add.length || remove.length) {
    const tags = [...new Set([...(contact.tags || []).filter((t) => !remove.includes(t)), ...add])];
    patch.tags = tags;
  }
  const attributes = { ...bag(contact.attributes) };
  let attributesChanged = false;
  for (const field of fields) {
    const key = String(field?.key || "").trim();
    if (!key) continue;
    const value = field.value ?? "";
    if (key === "email") patch.email = String(value).trim().toLowerCase() || null;
    else if (key === "phone") patch.phone = String(value).trim() || null;
    else if (key === "first_name" || key === "firstName") patch.first_name = String(value).trim();
    else if (key === "last_name" || key === "lastName") patch.last_name = String(value).trim();
    else {
      attributes[key.replace(/^attributes\./, "")] = value;
      attributesChanged = true;
    }
  }
  if (attributesChanged) patch.attributes = attributes;
  if (!Object.keys(patch).length) return contact;
  const { error } = await db.from("contacts").update(patch).eq("id", contact.id);
  if (error) {
    console.error("[chat.store.contact]", error.message);
    return contact;
  }
  Object.assign(contact, patch);
  return contact;
}

export function recordChatEvent(ctx, name, properties = {}) {
  return recordEvent(ctx.db, {
    projectId: ctx.projectId,
    contactId: ctx.contact?.id || null,
    name,
    source: "social",
    properties: { channel: ctx.channel, ...properties },
  });
}

// Conversation messages the bot wrote, so the inbox shows the whole thread.
export async function logBotMessage(ctx, { body, deliveryId = null, status = "sent", error = null, metadata = {}, conversationId = null }) {
  const conversation = conversationId ? { id: conversationId } : ctx.conversation;
  if (!ctx.db || !conversation?.id) return null;
  const now = new Date().toISOString();
  const { data, error: insertError } = await ctx.db
    .from("conversation_messages")
    .insert({
      project_id: ctx.projectId,
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "bot",
      body: String(body || ""),
      status,
      delivery_id: deliveryId,
      error: error ? String(error).slice(0, 500) : null,
      sent_at: now,
      metadata,
    })
    .select("id")
    .single();
  if (insertError) console.error("[chat.store.logBotMessage]", insertError.message);
  await ctx.db.from("conversations").update({ last_message_at: now }).eq("id", conversation.id);
  return data?.id || null;
}

// The bot stays out of a thread a person has taken over: an explicit handover, or an agent already replying.
export async function botPaused(db, conversation) {
  if (!conversation) return false;
  const chat = chatMeta(conversation);
  if (chat.paused) return true;
  if (conversation.handled_by !== "human") return false;
  if (chat.handover) return true;
  const { data } = await db
    .from("conversation_messages")
    .select("id")
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "agent")
    .eq("direction", "outbound")
    .limit(1);
  return Boolean(data?.length);
}

// The last few turns of a thread, oldest first, for AI context.
export async function conversationHistory(db, conversationId, limit = 12) {
  if (!db || !conversationId) return [];
  const { data } = await db
    .from("conversation_messages")
    .select("direction, sender_type, body, sent_at")
    .eq("conversation_id", conversationId)
    .in("direction", ["inbound", "outbound"])
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(limit);
  return (data || [])
    .reverse()
    .filter((m) => String(m.body || "").trim())
    .map((m) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: String(m.body) }));
}

// Access token stored for a Meta connection (key names vary by connect flow).
export function graphToken(secrets) {
  const s = bag(secrets);
  return s.pageAccessToken || s.page_access_token || s.accessToken || s.access_token || s.token || null;
}

export function graphHost(connection) {
  const config = bag(connection?.config);
  if (config.apiHost) return config.apiHost;
  return connection?.provider === "instagram_login" ? "graph.instagram.com" : "graph.facebook.com";
}
