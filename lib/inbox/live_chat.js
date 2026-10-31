import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";
import { handleInboundEvent } from "@/lib/chat/engine";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/server/http";
import { isWithinBusinessHours } from "./sla";
import { autoRouteConversation } from "./server";

// Website live chat (server-only, service-role db): widget lookup + origin check, visitor sessions as
// `chat` conversations, visitor messages, polling with delivered/read ticks and offline email capture.
// A session token is "<conversationId>.<secret>"; only its sha256 is stored on the conversation.

const bag = (v) => (v && typeof v === "object" ? v : {});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY = 2000;
const MAX_PER_MINUTE = 8;
const hash = (secret) => createHash("sha256").update(secret).digest("hex");
const clean = (v, max = 300) => String(v ?? "").trim().slice(0, max);

export async function loadWidget(admin, publicId) {
  if (!/^cw_[0-9a-f]{8,40}$/.test(String(publicId || ""))) throw notFound("Unknown chat widget.");
  const { data } = await admin.from("chat_widgets").select("*").eq("public_id", publicId).is("deleted_at", null).maybeSingle();
  if (!data) throw notFound("Unknown chat widget.");
  return data;
}

function requestHost(request) {
  const source = request.headers.get("origin") || request.headers.get("referer") || "";
  try {
    return new URL(source).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Empty allow-list = any site; "example.com" also covers its subdomains.
export function assertOriginAllowed(widget, request) {
  const allowed = (widget.allowed_domains || []).map((d) => String(d).toLowerCase().replace(/^\*\./, ""));
  if (!allowed.length) return;
  const host = requestHost(request);
  if (host && allowed.some((d) => host === d || host.endsWith(`.${d}`))) return;
  throw forbidden("This site isn't allowed to use the chat widget.");
}

export function widgetOnline(widget, at = new Date()) {
  return widget.status === "active" && isWithinBusinessHours(widget.business_hours, at);
}

// What the widget script needs to render — no ids beyond the public one.
export function publicWidgetConfig(widget) {
  const appearance = bag(widget.appearance);
  const offline = bag(widget.offline);
  return {
    id: widget.public_id,
    status: widget.status,
    online: widgetOnline(widget),
    title: clean(appearance.title || "Chat with us", 60),
    launcherLabel: clean(appearance.launcherLabel || "Chat", 30),
    position: appearance.position === "bottom-left" ? "bottom-left" : "bottom-right",
    color: /^#[0-9a-f]{6}$/i.test(appearance.color || "") ? appearance.color : null,
    greeting: clean(widget.greeting, 500),
    requireEmail: Boolean(widget.require_email),
    offline: { mode: ["email_capture", "message", "hide"].includes(offline.mode) ? offline.mode : "email_capture", message: clean(offline.message, 500) },
  };
}

function parseUserAgent(ua) {
  const s = String(ua || "");
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Unknown browser";
  const os = /iPhone|iPad|iPod/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "Unknown OS";
  const device = /Mobi|iPhone|Android.*Mobile/.test(s) ? "Mobile" : /iPad|Tablet/.test(s) ? "Tablet" : "Desktop";
  return { browser, os, device };
}

function requestLocation(request) {
  const city = request.headers.get("x-vercel-ip-city");
  const country = request.headers.get("x-vercel-ip-country");
  const parts = [city ? decodeURIComponent(city) : null, country].filter(Boolean);
  return parts.join(", ") || null;
}

async function findOrCreateContact(admin, projectId, { email, name }) {
  const address = String(email || "").trim().toLowerCase();
  if (!EMAIL.test(address)) return null;
  const { data: existing } = await admin.from("contacts").select("id").eq("project_id", projectId).ilike("email", address).is("deleted_at", null).maybeSingle();
  if (existing) return existing.id;
  const [first = "", ...rest] = clean(name, 120).split(/\s+/).filter(Boolean);
  const { data, error } = await admin
    .from("contacts")
    .insert({ project_id: projectId, email: address, first_name: first, last_name: rest.join(" "), status: "pending", source: "live_chat" })
    .select("id")
    .single();
  if (error) {
    console.error("[live_chat.contact]", error.message);
    return null;
  }
  await recordEvent(admin, { projectId, contactId: data.id, name: "contact.created", properties: { source: "live_chat" }, source: "web" });
  return data.id;
}

// POST /api/public/chat/:widgetId/session — input { name, email, page, referrer, locale, timezone, visitorId }.
export async function startSession(admin, widget, request, input) {
  if (widget.status !== "active") throw new ApiError(409, "Chat is paused on this site.", "paused");
  const email = clean(input?.email, 200).toLowerCase();
  const name = clean(input?.name, 120);
  if (widget.require_email && !EMAIL.test(email)) throw badRequest("Enter a valid email to start the chat.");
  const contactId = email ? await findOrCreateContact(admin, widget.project_id, { email, name }) : null;
  const secret = randomBytes(24).toString("base64url");
  const ua = parseUserAgent(request.headers.get("user-agent"));
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("conversations")
    .insert({
      project_id: widget.project_id,
      channel: "chat",
      kind: "chat",
      contact_id: contactId,
      title: name || "Website visitor",
      status: "open",
      handled_by: "human",
      unread_count: 0,
      last_message_at: now,
      metadata: {
        widgetId: widget.id,
        widgetPublicId: widget.public_id,
        chatSession: hash(secret),
        visitor: {
          name: name || null,
          email: email || null,
          page: clean(input?.page, 500) || null,
          referrer: clean(input?.referrer, 500) || null,
          locale: clean(input?.locale, 20) || null,
          timezone: clean(input?.timezone, 60) || null,
          visitorId: clean(input?.visitorId, 80) || null,
          location: requestLocation(request),
          ...ua,
        },
      },
    })
    .select("id")
    .single();
  if (error) throw new ApiError(500, "Couldn't start the chat.", "session_failed");
  return { sessionToken: `${data.id}.${secret}`, conversationId: data.id };
}

export async function resolveSession(admin, widget, token) {
  const [conversationId, secret] = String(token || "").split(".");
  if (!/^[0-9a-f-]{36}$/i.test(conversationId || "") || !secret) throw new ApiError(401, "Chat session expired — start a new chat.", "session_invalid");
  const { data } = await admin
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("project_id", widget.project_id)
    .eq("channel", "chat")
    .is("deleted_at", null)
    .maybeSingle();
  const stored = bag(data?.metadata).chatSession;
  if (!data || bag(data.metadata).widgetId !== widget.id || !stored) throw new ApiError(401, "Chat session expired — start a new chat.", "session_invalid");
  const a = Buffer.from(hash(secret));
  const b = Buffer.from(String(stored));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, "Chat session expired — start a new chat.", "session_invalid");
  return data;
}

// Visitor-facing message shape; internal notes and system lines never leave the server.
function publicMessage(m) {
  const meta = bag(m.metadata);
  return {
    id: m.id,
    from: m.direction === "inbound" ? "visitor" : m.sender_type === "bot" ? "bot" : "agent",
    author: m.direction === "inbound" ? null : meta.senderName || (m.sender_type === "bot" ? "Assistant" : "Support"),
    body: m.body || "",
    attachments: Array.isArray(m.attachments) ? m.attachments.filter((a) => /^https:\/\//.test(a?.url || "")).map((a) => ({ url: a.url, name: a.name || "attachment", type: a.type || "" })) : [],
    status: m.status,
    sentAt: m.sent_at,
  };
}

// POST /api/public/chat/:widgetId/messages — input { sessionToken, body }.
export async function postVisitorMessage(admin, widget, input) {
  const conversation = await resolveSession(admin, widget, input?.sessionToken);
  const body = clean(input?.body, MAX_BODY);
  if (!body) throw badRequest("Type a message first.");
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("direction", "inbound")
    .gte("sent_at", since);
  if ((count || 0) >= MAX_PER_MINUTE) throw new ApiError(429, "You're sending messages too quickly — wait a moment.", "rate_limited");

  const { count: previous } = await admin
    .from("conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("direction", "inbound");
  const now = new Date().toISOString();
  const { data: message, error } = await admin
    .from("conversation_messages")
    .insert({ project_id: widget.project_id, conversation_id: conversation.id, direction: "inbound", sender_type: "contact", body, status: "received", sent_at: now, metadata: {} })
    .select("*")
    .single();
  if (error) throw new ApiError(500, "Couldn't send your message.", "insert_failed");

  const reopen = conversation.status === "resolved" || conversation.status === "snoozed";
  await admin
    .from("conversations")
    .update({
      last_message_at: now,
      last_inbound_at: now,
      unread_count: (conversation.unread_count || 0) + 1,
      ...(reopen ? { status: "open", snoozed_until: null, resolved_at: null, first_response_at: null, sla_policy_id: null } : {}),
      metadata: { ...bag(conversation.metadata), preview: body.slice(0, 160), previewDirection: "inbound" },
    })
    .eq("id", conversation.id);

  const projectId = widget.project_id;
  const first = !previous;
  if (first || reopen) await autoRouteConversation(admin, { projectId, conversationId: conversation.id });
  if (first) {
    await recordEvent(admin, { projectId, contactId: conversation.contact_id, name: "chat.started", properties: { channel: "chat", conversationId: conversation.id, page: bag(bag(conversation.metadata).visitor).page || null }, source: "web" });
    await emitWebhook(admin, projectId, "conversation.created", { conversationId: conversation.id, channel: "chat", contactId: conversation.contact_id });
  }
  await emitWebhook(admin, projectId, "message.received", { conversationId: conversation.id, messageId: message.id, channel: "chat", body });
  await handleInboundEvent(admin, {
    projectId,
    connection: null,
    channel: "chat",
    conversationId: conversation.id,
    contactId: conversation.contact_id,
    event: { type: "message", text: body, externalMessageId: message.id },
  });
  return { message: publicMessage(message) };
}

// GET /api/public/chat/:widgetId/messages?sessionToken=&after=&visible=1 — new messages since `after`;
// marks agent replies delivered (and read while the panel is open).
export async function pollVisitorMessages(admin, widget, { sessionToken, after, visible }) {
  const conversation = await resolveSession(admin, widget, sessionToken);
  let query = admin
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .neq("direction", "note")
    .is("deleted_at", null)
    .order("sent_at", { ascending: true })
    .limit(200);
  const afterMs = after ? new Date(after).getTime() : NaN;
  if (!Number.isNaN(afterMs)) query = query.gt("sent_at", new Date(afterMs).toISOString());
  const { data: messages } = await query;

  const unseen = (messages || []).filter((m) => m.direction === "outbound" && (m.status === "sent" || (visible && m.status === "delivered")));
  if (visible) {
    await admin.from("conversation_messages").update({ status: "read" }).eq("conversation_id", conversation.id).eq("direction", "outbound").in("status", ["sent", "delivered"]);
  } else if (unseen.length) {
    await admin.from("conversation_messages").update({ status: "delivered" }).in("id", unseen.map((m) => m.id));
  }
  for (const m of unseen) m.status = visible ? "read" : "delivered";
  return {
    status: conversation.status,
    online: widgetOnline(widget),
    messages: (messages || []).map(publicMessage),
  };
}

// POST /api/public/chat/:widgetId/offline — input { name, email, message, page, sessionToken }.
export async function captureOfflineMessage(admin, widget, request, input) {
  const email = clean(input?.email, 200).toLowerCase();
  const name = clean(input?.name, 120);
  const body = clean(input?.message, MAX_BODY);
  if (!EMAIL.test(email)) throw badRequest("Enter a valid email so we can reply.");
  if (!body) throw badRequest("Write a message first.");
  const projectId = widget.project_id;
  const contactId = await findOrCreateContact(admin, projectId, { email, name });

  let conversationId = null;
  if (input?.sessionToken) {
    const existing = await resolveSession(admin, widget, input.sessionToken).catch(() => null);
    if (existing) {
      conversationId = existing.id;
      const visitor = { ...bag(bag(existing.metadata).visitor), email, name: name || bag(bag(existing.metadata).visitor).name || null };
      await admin.from("conversations").update({ contact_id: existing.contact_id || contactId, metadata: { ...bag(existing.metadata), visitor } }).eq("id", existing.id);
    }
  }
  if (!conversationId) {
    const started = await startSession(admin, { ...widget, status: "active", require_email: false }, request, { ...input, email, name });
    conversationId = started.conversationId;
  }
  const now = new Date().toISOString();
  await admin.from("conversation_messages").insert({
    project_id: projectId, conversation_id: conversationId, direction: "inbound", sender_type: "contact", body, status: "received", sent_at: now, metadata: { offline: true },
  });
  const { data: conversation } = await admin.from("conversations").select("unread_count, metadata").eq("id", conversationId).maybeSingle();
  await admin
    .from("conversations")
    .update({
      contact_id: contactId,
      status: "open",
      last_message_at: now,
      last_inbound_at: now,
      unread_count: (conversation?.unread_count || 0) + 1,
      metadata: { ...bag(conversation?.metadata), offlineCapture: true, preview: body.slice(0, 160), previewDirection: "inbound" },
    })
    .eq("id", conversationId);
  await autoRouteConversation(admin, { projectId, conversationId });
  await recordEvent(admin, { projectId, contactId, name: "chat.offline_message", properties: { channel: "chat", conversationId, page: clean(input?.page, 500) || null }, source: "web" });
  await emitWebhook(admin, projectId, "message.received", { conversationId, channel: "chat", body, offline: true });
  return { ok: true };
}
