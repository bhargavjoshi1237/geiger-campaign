import { createHmac } from "node:crypto";
import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";
import { findOrCreateContact, threadInbound } from "./records";

// Inbound email routing (server-only, service-role db). Each route has its own webhook URL keyed by its
// secret; inbound providers (Postmark, SendGrid Inbound Parse, Mailgun routes or any JSON forwarder)
// POST the parsed email there. Mail matching the route's recipient/subject patterns runs its action:
// create_conversation (inbox thread), forward_webhook (signed POST to your app) or tag_contact.

const ADDRESS = /([^<>\s,;"]+@[^<>\s,;"]+)/;

export function parseAddress(value) {
  if (!value) return null;
  if (typeof value === "object") {
    const email = value.Email || value.email || value.address;
    return email ? { email: String(email).toLowerCase(), name: value.Name || value.name || "" } : null;
  }
  const text = String(value);
  const match = text.match(ADDRESS);
  if (!match) return null;
  const name = text.replace(match[0], "").replace(/[<>"]/g, "").trim();
  return { email: match[1].toLowerCase(), name };
}

export function parseAddressList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(parseAddress).filter(Boolean);
  return String(value)
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map(parseAddress)
    .filter(Boolean);
}

const first = (...values) => values.find((v) => v !== undefined && v !== null && v !== "");

// Normalises Postmark / SendGrid / Mailgun / generic JSON into one shape.
export async function readInboundEmail(request) {
  const type = request.headers.get("content-type") || "";
  let src = {};
  if (type.includes("application/json")) {
    src = (await request.json().catch(() => ({}))) || {};
    if (src.data && typeof src.data === "object" && !src.From && !src.from) src = src.data;
  } else if (type.includes("form")) {
    const form = await request.formData().catch(() => null);
    if (form) for (const [key, value] of form.entries()) if (typeof value === "string") src[key] = value;
  }

  const from = parseAddress(first(src.FromFull, src.from, src.From, src.sender));
  const to = parseAddressList(first(src.ToFull, src.to, src.To, src.recipient));
  const cc = parseAddressList(first(src.CcFull, src.cc, src.Cc));
  const headers = Array.isArray(src.Headers)
    ? Object.fromEntries(src.Headers.map((h) => [String(h.Name).toLowerCase(), h.Value]))
    : typeof src.headers === "object" && src.headers
      ? src.headers
      : {};

  const attachments = (Array.isArray(src.Attachments) ? src.Attachments : Array.isArray(src.attachments) ? src.attachments : []).map((a) => ({
    filename: a.Name || a.filename || a.name || "attachment",
    contentType: a.ContentType || a.contentType || a.content_type || "",
    size: Number(a.ContentLength || a.size || 0),
    content: a.Content || a.content || null,
  }));

  return {
    from,
    to,
    cc,
    subject: String(first(src.Subject, src.subject) || ""),
    text: String(first(src.TextBody, src.text, src["body-plain"], src["stripped-text"]) || ""),
    html: String(first(src.HtmlBody, src.html, src["body-html"]) || ""),
    messageId: String(first(src.MessageID, src.messageId, src.message_id, src["Message-Id"], headers["message-id"]) || ""),
    inReplyTo: String(first(src.InReplyTo, src.inReplyTo, src.in_reply_to, headers["in-reply-to"]) || ""),
    attachments,
  };
}

// "support@*.halcyon.studio" -> case-insensitive anchored RegExp; empty pattern matches everything.
export function wildcardMatch(pattern, value) {
  const p = String(pattern || "").trim();
  if (!p) return true;
  const source = p
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "i").test(String(value || ""));
}

export function routeMatches(route, email) {
  const recipients = [...email.to, ...email.cc].map((a) => a.email);
  const recipientOk = !route.match_recipient || recipients.some((r) => wildcardMatch(route.match_recipient, r));
  const subjectOk = !route.match_subject || wildcardMatch(route.match_subject, email.subject);
  return recipientOk && subjectOk;
}

const stripHtml = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const threadSubject = (subject) => String(subject || "").replace(/^\s*((re|fwd?|aw|sv)\s*:\s*)+/i, "").trim();

async function forward(route, email, { test }) {
  const url = String(route.config?.webhookUrl || "");
  if (!/^https:\/\//i.test(url)) return { ok: false, error: "The route has no https:// webhook URL." };
  const includeAttachments = route.config?.includeAttachments !== false;
  const payload = JSON.stringify({
    event: "email.received",
    test: Boolean(test),
    route: { id: route.id, name: route.name },
    receivedAt: new Date().toISOString(),
    email: {
      ...email,
      attachments: email.attachments.map((a) => (includeAttachments ? a : { ...a, content: null })),
    },
  });
  const signature = createHmac("sha256", route.secret_key).update(payload).digest("hex");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Geiger-Signature": `sha256=${signature}`, "X-Geiger-Route": route.id },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `Your endpoint returned HTTP ${res.status}.` };
  } catch (error) {
    return { ok: false, error: error?.name === "TimeoutError" ? "Your endpoint didn't answer within 10 seconds." : "Couldn't reach your endpoint." };
  }
}

// Runs one route's action for one parsed email and records the outcome on the route.
export async function runInboundRoute(db, route, email, { test = false } = {}) {
  const projectId = route.project_id;
  if (!email.from?.email) return { matched: false, ok: false, error: "The email has no sender address." };
  if (!test && route.status !== "active") return { matched: false, ok: true, skipped: "paused" };
  if (!routeMatches(route, email)) return { matched: false, ok: true };

  let outcome = { matched: true, ok: true, action: route.action };
  let contactId = null;

  if (route.action === "forward_webhook") {
    outcome = { ...outcome, ...(await forward(route, email, { test })) };
  } else if (!test) {
    const name = email.from.name.split(" ");
    const { contact } = await findOrCreateContact(db, projectId, {
      email: email.from.email,
      firstName: name[0] || "",
      lastName: name.slice(1).join(" "),
      source: "inbound_email",
    });
    contactId = contact?.id || null;

    if (route.action === "tag_contact" && contact) {
      const tags = Array.from(new Set([...(contact.tags || []), ...(route.config?.tags || [])]));
      await db.from("contacts").update({ tags }).eq("id", contact.id);
      outcome.tags = tags;
    }

    if (route.action === "create_conversation") {
      const { data: emailConnection } = await db
        .from("channel_connections")
        .select("id")
        .eq("project_id", projectId)
        .eq("channel", "email")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      // Replies thread onto the conversation that holds the message they answer.
      let threadKey = email.messageId || null;
      if (email.inReplyTo) {
        const { data: parent } = await db
          .from("conversation_messages")
          .select("conversation_id, conversations!inner(external_thread_id)")
          .eq("project_id", projectId)
          .eq("external_id", email.inReplyTo)
          .limit(1)
          .maybeSingle();
        if (parent?.conversations?.external_thread_id) threadKey = parent.conversations.external_thread_id;
      }
      const thread = await threadInbound(db, {
        projectId,
        channel: "email",
        kind: "email",
        connectionId: emailConnection?.id || null,
        contactId,
        threadKey,
        title: threadSubject(email.subject) || email.from.email,
        body: email.text || stripHtml(email.html),
        attachments: email.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, size: a.size })),
        externalId: email.messageId || null,
        metadata: { subject: email.subject, to: email.to.map((a) => a.email), routeId: route.id },
      });
      outcome.conversationId = thread?.conversation?.id || null;
      if (thread?.created) await emitWebhook(db, projectId, "conversation.created", { channel: "email", conversationId: outcome.conversationId, contactId });
      await emitWebhook(db, projectId, "message.received", { channel: "email", conversationId: outcome.conversationId, contactId, from: email.from.email, subject: email.subject });
    }

    await recordEvent(db, {
      projectId,
      contactId,
      name: "email.received",
      properties: { routeId: route.id, subject: email.subject, to: email.to.map((a) => a.email) },
      source: "email",
    });
  }

  await db
    .from("inbound_routes")
    .update({
      ...(test ? {} : { received_count: Number(route.received_count || 0) + 1, last_received_at: new Date().toISOString() }),
      metadata: {
        ...(route.metadata || {}),
        lastResult: { at: new Date().toISOString(), test, ok: outcome.ok, error: outcome.error || null, from: email.from.email, subject: email.subject },
      },
    })
    .eq("id", route.id);
  return outcome;
}

// A realistic sample for "Send test": addressed so it matches the route's recipient pattern.
export function sampleInboundEmail(route) {
  const recipient = String(route.match_recipient || "inbound@example.com").replace(/\*/g, "test");
  const subject = String(route.match_subject || "Test message from Geiger").replace(/\*/g, "test");
  return {
    from: { email: "sender@example.com", name: "Test Sender" },
    to: [{ email: recipient, name: "" }],
    cc: [],
    subject,
    text: "This is a test email sent from the Inbound Routing screen.",
    html: "<p>This is a test email sent from the Inbound Routing screen.</p>",
    messageId: `<test-${Date.now()}@geiger.studio>`,
    inReplyTo: "",
    attachments: [],
  };
}
