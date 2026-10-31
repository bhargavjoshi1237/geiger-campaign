import { dispatch } from "@/lib/messaging/dispatch";
import { loadConnection } from "@/lib/messaging/connections";
import { messagingWindow } from "@/lib/inbox/window";
import { graphRequest } from "@/lib/social/meta_graph";
import { isSigningConfigured, signToken } from "@/lib/server/tokens";
import { publicUrl } from "@/lib/server/urls";
import { PRIVATE_REPLY_MAX_AGE_DAYS, quietHoursState } from "./rules";
import { botPaused, chatMeta, contactAddress, graphHost, graphToken, latestConsent, logBotMessage, mergeChatMeta } from "./store";

// The one way the chat engine sends (server-only). Every automated message passes the guardrails here —
// bot paused, consent, the platform messaging window, quiet hours, the one-DM-per-24h cap — then leaves
// through dispatch (logged in campaign.deliveries) and is written to the conversation thread.
//
//   sendBotMessage(ctx, { text, quickReplies, buttons }, { source, automationId, flowId, capped, privateReply, quietHours })
//   -> { status: sent | queued | blocked | failed | not_sent | duplicate, reason, deliveryId }

const SENT = new Set(["sent", "delivered"]);
const DAY = 86_400_000;

function windowOf(ctx, now) {
  const conversation = ctx.conversation;
  return messagingWindow({ channel: ctx.channel, last_inbound_at: conversation?.last_inbound_at ?? null }, { now });
}

// Link buttons go through the signed click redirect so DM clicks count as conversions.
function trackLinks(ctx, message, opts) {
  if (!message?.buttons?.length || !isSigningConfigured()) return message;
  return {
    ...message,
    buttons: message.buttons.map((b) => {
      if (b.type !== "url" || !/^https?:\/\//i.test(String(b.url || ""))) return b;
      const token = signToken(
        { k: "chat_click", p: ctx.projectId, c: ctx.contact?.id || null, a: opts.automationId || null, f: opts.flowId || null, ch: ctx.channel, u: b.url },
        { ttlDays: 90 },
      );
      return { ...b, url: publicUrl("/api/public/chat/click", { t: token }) };
    }),
  };
}

function nextKey(ctx, opts) {
  if (opts.idempotencyKey) return opts.idempotencyKey;
  const external = ctx.event?.externalMessageId || ctx.event?.commentId;
  if (!external) return null;
  ctx.sendSeq = (ctx.sendSeq || 0) + 1;
  return `chatreply:${ctx.conversation?.id || "none"}:${external}:${ctx.sendSeq}`;
}

async function claimSlot(ctx, to) {
  const subject = ctx.contact?.id || `ext:${to}`;
  const { data, error } = await ctx.db.rpc("chat_claim_dm_slot", {
    p_project: ctx.projectId,
    p_channel: ctx.channel,
    p_subject: subject,
    p_contact: ctx.contact?.id || null,
  });
  if (error) {
    console.error("[chat.send.claim]", error.message);
    return { ok: false, error: true };
  }
  return data ? { ok: true, subject, claimedAt: data } : { ok: false };
}

async function releaseSlot(ctx, claim) {
  if (!claim?.ok) return;
  await ctx.db.rpc("chat_release_dm_slot", {
    p_project: ctx.projectId,
    p_channel: ctx.channel,
    p_subject: claim.subject,
    p_claimed: claim.claimedAt,
  });
}

// Sends now: claims the 24h slot when capped, dispatches, logs the thread message.
export async function deliverNow(ctx, { to, message, opts = {} }) {
  let claim = null;
  if (opts.capped) {
    claim = await claimSlot(ctx, to);
    if (!claim.ok) return { status: "blocked", reason: claim.error ? "cap_check_failed" : "dm_cap" };
  }

  const chat = {
    kind: opts.kind || null,
    automationId: opts.automationId || null,
    flowId: opts.flowId || null,
    nodeId: opts.nodeId || null,
    sessionId: opts.sessionId || null,
    sequenceId: opts.sequenceId || null,
    privateReply: Boolean(opts.privateReply),
  };
  const outbound = trackLinks(ctx, message, opts);
  const result = await dispatch({
    db: ctx.db,
    projectId: ctx.projectId,
    channel: ctx.channel,
    to,
    contactId: ctx.contact?.id || null,
    connectionId: ctx.connection?.id || null,
    source: opts.source || { type: "flow", id: opts.automationId || opts.flowId || opts.sequenceId || null },
    idempotencyKey: nextKey(ctx, opts),
    message: {
      ...outbound,
      ...(opts.privateReply ? { recipient: { comment_id: opts.privateReply.commentId } } : {}),
      messagingType: "RESPONSE",
    },
    metadata: { chat },
  });

  if (result.duplicate) return { status: "duplicate", deliveryId: result.deliveryId, reason: null };
  const sent = SENT.has(result.status);
  if (!sent) await releaseSlot(ctx, claim);

  await logBotMessage(ctx, {
    body: message.text,
    deliveryId: result.deliveryId,
    status: sent ? "sent" : "failed",
    error: sent ? null : result.error,
    metadata: { chat, quickReplies: message.quickReplies || [], buttons: message.buttons || [] },
  });

  if (sent && ctx.conversation && !(await botPaused(ctx.db, ctx.conversation))) {
    const patch = ctx.conversation.handled_by === "bot" ? {} : { handled_by: "bot" };
    if (Object.keys(patch).length) {
      await ctx.db.from("conversations").update(patch).eq("id", ctx.conversation.id);
      Object.assign(ctx.conversation, patch);
    }
    if (!chatMeta(ctx.conversation).botSince) await mergeChatMeta(ctx.db, "conversations", ctx.conversation, { botSince: new Date().toISOString() });
  }
  return { status: sent ? "sent" : result.status || "failed", reason: sent ? null : result.error, deliveryId: result.deliveryId };
}

export async function sendBotMessage(ctx, message, opts = {}) {
  if (!ctx?.db || !message?.text) return { status: "blocked", reason: "empty" };
  const now = Date.now();

  if (!opts.force) {
    if (await botPaused(ctx.db, ctx.conversation)) return { status: "blocked", reason: "bot_paused" };
    if ((await latestConsent(ctx.db, ctx.contact?.id, ctx.channel)) === "opted_out") return { status: "blocked", reason: "opted_out" };
  }

  // The comment opens the window for its one private reply (7 days); everything else needs an open window.
  let windowExpiresAt = null;
  if (opts.privateReply) {
    const at = ctx.event?.occurredAt ? new Date(ctx.event.occurredAt).getTime() : now;
    if (now - at > PRIVATE_REPLY_MAX_AGE_DAYS * DAY) return { status: "blocked", reason: "comment_too_old" };
    windowExpiresAt = new Date(at + PRIVATE_REPLY_MAX_AGE_DAYS * DAY).toISOString();
  } else {
    const window = windowOf(ctx, now);
    if (window.windowed && !window.open) return { status: "blocked", reason: window.requiresTemplate ? "template_required" : "window_closed" };
    windowExpiresAt = window.expiresAt;
  }

  const to = opts.privateReply
    ? contactAddress(ctx.contact, ctx.conversation, ctx.channel) || `comment:${opts.privateReply.commentId}`
    : contactAddress(ctx.contact, ctx.conversation, ctx.channel);
  if (!to) return { status: "blocked", reason: "no_address" };

  const quiet = opts.force ? { inQuiet: false } : quietHoursState(opts.quietHours, now);
  if (quiet.inQuiet) {
    if (opts.quietHours?.behavior === "skip") return { status: "blocked", reason: "quiet_hours" };
    if (windowExpiresAt && new Date(quiet.endsAt).getTime() >= new Date(windowExpiresAt).getTime()) {
      return { status: "blocked", reason: "window_closes_during_quiet_hours" };
    }
    const { error } = await ctx.db.from("chat_outbox").insert({
      project_id: ctx.projectId,
      conversation_id: ctx.conversation?.id || null,
      contact_id: ctx.contact?.id || null,
      channel: ctx.channel,
      connection_id: ctx.connection?.id || null,
      to_address: to,
      message,
      source: {
        type: opts.sequenceId ? "sequence" : opts.flowId && !opts.automationId ? "flow" : "automation",
        id: opts.automationId || opts.flowId || opts.sequenceId || null,
        kind: opts.kind || null,
        capped: Boolean(opts.capped),
        privateReply: opts.privateReply || null,
        nodeId: opts.nodeId || null,
      },
      send_after: quiet.endsAt,
      expires_at: windowExpiresAt,
    });
    if (error) {
      console.error("[chat.send.queue]", error.message);
      return { status: "failed", reason: "queue_failed" };
    }
    return { status: "queued", reason: "quiet_hours", sendAfter: quiet.endsAt };
  }

  return deliverNow(ctx, { to, message, opts });
}

// Public comment reply through the Graph API: /{comment-id}/replies on Instagram, /{comment-id}/comments on Facebook.
export async function postPublicReply(ctx, { commentId, text }) {
  if (!commentId || !String(text || "").trim()) return { ok: false, error: "empty" };
  const { connection, secrets } = await loadConnection(ctx.db, ctx.projectId, ctx.channel, ctx.connection?.id || null);
  const token = graphToken(secrets);
  if (!connection || !token) return { ok: false, error: `${ctx.channel === "instagram" ? "Instagram" : "Facebook"} isn't connected.` };
  const path = ctx.channel === "instagram" ? `${commentId}/replies` : `${commentId}/comments`;
  const res = await graphRequest(path, { token, method: "POST", body: { message: String(text) }, host: graphHost(connection) });
  await logBotMessage(ctx, {
    body: text,
    status: res.ok ? "sent" : "failed",
    error: res.ok ? null : res.error,
    metadata: { chat: { publicReply: true, commentId }, externalReplyId: res.data?.id || null },
  });
  return { ok: res.ok, id: res.data?.id || null, error: res.error };
}
