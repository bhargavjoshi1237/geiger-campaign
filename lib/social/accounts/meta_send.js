import { graphRequest, sendGraphMessage } from "@/lib/social/meta_graph";
import { messagingWindow } from "@/lib/inbox/window";
import { notConnected } from "@/lib/messaging/connections";
import { automatedCapReached, findThread, hoursSince, privateReplySent, tagDelivery, TRIGGERED } from "./guards";

// Shared Send API path for the Messenger and Instagram providers (server-only). Enforces the platform rules
// before calling Meta: the 24h window (HUMAN_AGENT tag for 7 days, human sends only), one private reply per
// comment within 7 days, one automated DM per person per 24h from comment/story triggers.
//
// message: { text, quickReplies: [{ title, payload }], buttons: [{ title, url } | { title, payload }],
//            attachments: [{ type: "image"|"video"|"audio"|"file", url }], human, trigger, commentId,
//            conversationId, notificationToken (Messenger marketing-messages opt-in token) }

const notSent = (error) => ({ status: "not_sent", error });

function buildButtons(buttons) {
  return (buttons || []).slice(0, 3).map((b) =>
    b.url ? { type: "web_url", url: b.url, title: String(b.title).slice(0, 20) } : { type: "postback", payload: String(b.payload || b.title), title: String(b.title).slice(0, 20) },
  );
}

function buildMessage(channel, message) {
  const text = String(message.text ?? message.body ?? "").trim();
  if (message.buttons?.length) {
    const buttons = buildButtons(message.buttons);
    if (channel === "instagram") {
      return { attachment: { type: "template", payload: { template_type: "generic", elements: [{ title: text.slice(0, 80) || " ", buttons }] } } };
    }
    return { attachment: { type: "template", payload: { template_type: "button", text: text.slice(0, 640), buttons } } };
  }
  if (!text) return null;
  const out = { text: text.slice(0, 2000) };
  if (message.quickReplies?.length) {
    out.quick_replies = message.quickReplies.slice(0, 13).map((q) => ({ content_type: "text", title: String(q.title).slice(0, 20), payload: String(q.payload || q.title) }));
  }
  return out;
}

const attachmentMessages = (attachments) =>
  (attachments || [])
    .filter((a) => a?.url)
    .map((a) => ({ attachment: { type: ["image", "video", "audio", "file"].includes(a.type) ? a.type : "file", payload: { url: a.url, is_reusable: true } } }));

export async function sendMetaMessage(ctx, label) {
  const { db, deliveryId, to, connection, secrets } = ctx;
  const message = ctx.message || {};
  if (!connection) return notConnected(label);
  if (connection.status === "disconnected") return notSent(`${label} is disconnected.`);
  const token = secrets?.pageAccessToken;
  if (!token) return notSent(`${label} isn't fully connected — reconnect the account to store a Page token.`);
  const channel = connection.channel;
  const nodeId = connection.config?.pageId || (channel === "messenger" ? connection.external_id : "me");
  const human = Boolean(message.human);
  // Refusals are tagged on the delivery so the channel screen can count what each rule blocked.
  const block = async (rule, error) => {
    await tagDelivery(db, deliveryId, { blockedBy: rule, trigger: message.trigger || null, human });
    return notSent(error);
  };

  let recipient = { id: String(to) };
  let tag = null;
  let guard = {};

  if (message.notificationToken && channel === "messenger") {
    recipient = { notification_messages_token: message.notificationToken };
    guard = { optInMessage: true };
  } else if (message.commentId) {
    // Private reply to a comment: once per comment, within 7 days of it being posted.
    const { data: comment } = await db
      .from("conversation_messages")
      .select("sent_at")
      .eq("project_id", connection.project_id)
      .eq("external_id", String(message.commentId))
      .limit(1)
      .maybeSingle();
    if (comment && hoursSince(comment.sent_at) > 7 * 24) return block("private_reply", "Private replies are only allowed within 7 days of the comment.");
    if (await privateReplySent(db, { connection, commentId: message.commentId, deliveryId })) {
      return block("private_reply", "This comment already received its one private reply.");
    }
    recipient = { comment_id: String(message.commentId) };
    guard = { commentId: String(message.commentId) };
  } else {
    const thread = await findThread(db, connection, to, message.conversationId);
    const window = messagingWindow({ channel, lastInboundAt: thread?.last_inbound_at }, { human });
    if (!window.open) {
      if (!thread?.last_inbound_at) return block("window", `This person hasn't messaged the ${label} account, so it can't start a conversation.`);
      return block(
        "window",
        human
          ? "The 7-day human agent window has closed. Wait for the person to message again."
          : "Outside the 24-hour messaging window. Automated messages are blocked; a teammate can still reply for 7 days.",
      );
    }
    tag = window.tag;
    guard = { windowExpiresAt: window.expiresAt };
  }

  if (!human && TRIGGERED.includes(message.trigger)) {
    if (await automatedCapReached(db, { connection, channel, to, deliveryId })) {
      return block("cap", "Already sent this person an automated DM in the last 24 hours (platform limit).");
    }
  }
  await tagDelivery(db, deliveryId, { ...guard, trigger: message.trigger || null, human, tag });

  const body = buildMessage(channel, message);
  const extras = attachmentMessages(message.attachments);
  if (!body && !extras.length) return { status: "failed", error: "The message is empty." };

  const send = (payload) =>
    recipient.notification_messages_token
      ? graphRequest(`${nodeId}/messages`, { token, method: "POST", body: { recipient, message: payload } })
      : sendGraphMessage({ nodeId, token, recipient, message: payload, messagingType: "RESPONSE", tag });

  let providerId = null;
  for (const payload of [body, ...extras].filter(Boolean)) {
    const res = await send(payload);
    if (!res.ok) {
      return { status: providerId ? "sent" : "failed", providerId, error: res.error, cost: 0 };
    }
    providerId ??= res.data?.message_id || null;
    // A comment gets exactly one private reply; follow-ups go to the thread it opened.
    if (recipient.comment_id && res.data?.recipient_id) recipient = { id: res.data.recipient_id };
  }
  return { status: "sent", providerId, error: null, cost: 0, connectionId: connection.id };
}
