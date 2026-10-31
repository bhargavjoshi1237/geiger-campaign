import { badRequest, notConfigured } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";
import { loadConnection } from "@/lib/messaging/connections";
import { moderationState, performCommentAction } from "./comment_actions";
import { markCommentMessage } from "./moderation";
import { networkForChannel } from "./networks";

// Manual bulk moderation from the Comments browser (server-only). Each item is a comment message the caller can
// read (user-scoped db, RLS); the platform call, the audit log row and the message state are written with the
// service role. Replies are also appended to the thread as outbound messages so the inbox shows them.

const MAX_ITEMS = 50;
const ACTIONS = ["hide", "unhide", "delete", "reply"];
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export async function runCommentActions({ db, user, projectId, action, items, replyText = "" }) {
  if (!ACTIONS.includes(action)) throw badRequest("Unknown moderation action.");
  if (!Array.isArray(items) || !items.length) throw badRequest("Pick at least one comment.");
  if (action === "reply" && !String(replyText).trim()) throw badRequest("Write a reply first.");
  const admin = adminClient();
  if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured.");

  const ids = [...new Set(items.map((i) => i?.messageId).filter(Boolean))].slice(0, MAX_ITEMS);
  const { data: messages } = await db.from("conversation_messages").select("*").eq("project_id", projectId).in("id", ids);
  const threadIds = [...new Set((messages || []).map((m) => m.conversation_id))];
  const { data: threads } = threadIds.length
    ? await db.from("conversations").select("*").eq("project_id", projectId).in("id", threadIds)
    : { data: [] };
  const threadById = new Map((threads || []).map((t) => [t.id, t]));
  const connections = new Map();

  const results = [];
  for (const message of messages || []) {
    const thread = threadById.get(message.conversation_id);
    if (!thread || thread.kind !== "comment" || !message.external_id) {
      results.push({ messageId: message.id, ok: false, error: "Not a platform comment." });
      continue;
    }
    const key = thread.connection_id || thread.channel;
    if (!connections.has(key)) connections.set(key, await loadConnection(admin, projectId, thread.channel, thread.connection_id || null));
    const { connection, secrets } = connections.get(key);
    const meta = bag(message.metadata);

    const outcome = connection
      ? await performCommentAction({ connection, secrets, action, commentId: message.external_id, replyText, context: { chatId: meta.chatId || bag(thread.metadata).chatId } })
      : { ok: false, error: "The account this comment came from isn't connected." };

    await admin.from("moderation_log").insert({
      project_id: projectId,
      connection_id: connection?.id || thread.connection_id || null,
      network: networkForChannel(thread.channel) || thread.channel,
      comment_external_id: String(message.external_id),
      post_external_id: meta.postId || bag(thread.metadata).postId || null,
      text: String(message.body || "").slice(0, 4000),
      author: meta.authorName || meta.senderName || thread.title || "",
      author_external_id: meta.authorExternalId || null,
      action,
      source: "manual",
      status: outcome.ok ? "done" : "failed",
      reason: action === "reply" ? String(replyText).slice(0, 200) : "",
      error: outcome.ok ? null : outcome.error,
      actor_id: user.id,
      metadata: outcome.replyId ? { replyId: outcome.replyId } : {},
    });

    if (outcome.ok) {
      await markCommentMessage(admin, projectId, message.external_id, { state: moderationState(action), source: "manual", by: user.id, at: new Date().toISOString() });
      if (action === "reply") {
        const at = new Date().toISOString();
        await admin.from("conversation_messages").insert({
          project_id: projectId,
          conversation_id: thread.id,
          direction: "outbound",
          sender_type: "agent",
          sender_id: user.id,
          body: String(replyText),
          external_id: outcome.replyId || null,
          status: "sent",
          sent_at: at,
          metadata: { replyTo: message.external_id },
        });
        await admin.from("conversations").update({ last_message_at: at }).eq("id", thread.id);
      }
    }
    results.push({ messageId: message.id, ok: outcome.ok, error: outcome.ok ? null : outcome.error, state: outcome.ok ? moderationState(action) : null });
  }

  return { action, done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
