import { graphRequest } from "@/lib/social/meta_graph";
import { ingestInboundMessage } from "@/lib/inbox/ingest";
import { applyModeration } from "@/lib/social/moderation";
import { handleInboundEvent } from "@/lib/chat/engine";
import { handleLeadgenEvent } from "@/lib/ads/leads";
import { recordEvent } from "@/lib/events/record";
import { processWhatsAppChange } from "./whatsapp";
import {
  connectionFor,
  contactForIdentity,
  markOutbound,
  recordConsent,
  secretsFor,
  stampWebhookEvent,
  threadExists,
} from "./common";

// Meta webhook processing (server-only, service-role db) for the `page` (Messenger + Facebook comments + leadgen),
// `instagram` (DMs, story replies/mentions, comments, mentions) and `whatsapp_business_account` objects.
// Pipeline per inbound item: ingestInboundMessage -> applyModeration (comments) -> handleInboundEvent.

const HIDDEN = new Set(["hide", "delete", "block", "hidden", "deleted"]);

async function pageConnectionFor(db, pageId) {
  const messenger = await connectionFor(db, "messenger", pageId);
  if (messenger) return messenger;
  const { data } = await db
    .from("channel_connections")
    .select("*")
    .eq("channel", "instagram")
    .eq("config->>pageId", String(pageId))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Name/handle for a new thread via the User Profile API (best-effort; needs the Page token).
async function senderProfile(db, connection, senderId) {
  const token = (await secretsFor(db, connection.id)).pageAccessToken;
  if (!token) return {};
  const fields = connection.channel === "instagram" ? "name,username" : "first_name,last_name,name";
  const res = await graphRequest(String(senderId), { token, query: { fields } });
  if (!res.ok) return {};
  const name = res.data.name || [res.data.first_name, res.data.last_name].filter(Boolean).join(" ");
  return { name: name || undefined, handle: res.data.username ? `@${res.data.username}` : undefined };
}

const attachmentsOf = (list) =>
  (list || [])
    .filter((a) => a?.type !== "story_mention")
    .map((a) => ({ type: a.type, url: a.payload?.url || null, title: a.payload?.title || null }));

const referralOf = (ref) =>
  ref
    ? {
        ref: ref.ref || null,
        source: ref.source || null,
        type: ref.type || null,
        adId: ref.ad_id || null,
        ...(ref.ads_context_data ? { adTitle: ref.ads_context_data.ad_title || null, postId: ref.ads_context_data.post_id || null } : {}),
      }
    : null;

async function handleOptin(db, connection, channel, ev) {
  const optin = ev.optin || {};
  if (optin.type !== "notification_messages") return;
  const contactId = await contactForIdentity(db, connection.project_id, channel, ev.sender?.id);
  const stopped = optin.notification_messages_status === "STOP_NOTIFICATIONS";
  await recordConsent(db, {
    projectId: connection.project_id,
    contactId,
    channel,
    status: stopped ? "opted_out" : "opted_in",
    source: "marketing_messages",
    proof: {
      type: optin.type,
      token: optin.notification_messages_token || null,
      expiresAt: optin.token_expiry_timestamp ? new Date(Number(optin.token_expiry_timestamp)).toISOString() : null,
      frequency: optin.notification_messages_frequency || null,
      topic: optin.payload || null,
      title: optin.title || null,
    },
  });
}

async function handleMessaging(db, connection, channel, ev) {
  const senderId = ev.sender?.id;
  if (!senderId || ev.message?.is_echo) return;
  if (String(senderId) === String(connection.external_id) || String(senderId) === String(connection.config?.pageId)) return;
  if (ev.delivery) return markOutbound(db, { connectionId: connection.id, threadId: senderId, status: "delivered", watermark: ev.delivery.watermark, mids: ev.delivery.mids });
  if (ev.read) {
    return markOutbound(db, { connectionId: connection.id, threadId: senderId, status: "read", watermark: ev.read.watermark, mids: ev.read.mid ? [ev.read.mid] : null });
  }
  if (ev.optin) return handleOptin(db, connection, channel, ev);
  if (!ev.message && !ev.postback && !ev.referral) return;

  const m = ev.message || {};
  let type = "message";
  let text = m.text || "";
  let payload = m.quick_reply?.payload || null;
  let storyId = null;
  let referral = referralOf(m.referral || ev.referral || ev.postback?.referral);
  if (m.reply_to?.story) {
    type = "story_reply";
    storyId = m.reply_to.story.id || null;
  } else if ((m.attachments || []).some((a) => a.type === "story_mention")) {
    type = "story_mention";
    storyId = m.attachments.find((a) => a.type === "story_mention")?.payload?.url || null;
  } else if (ev.postback) {
    type = "postback";
    text = ev.postback.title || "";
    payload = ev.postback.payload || null;
  } else if (!ev.message && ev.referral) {
    type = "referral";
  }

  const sender = { externalId: String(senderId) };
  if (!(await threadExists(db, connection.id, senderId))) Object.assign(sender, await senderProfile(db, connection, senderId));

  const result = await ingestInboundMessage(db, {
    projectId: connection.project_id,
    connection,
    channel,
    kind: "dm",
    externalThreadId: String(senderId),
    externalMessageId: m.mid || ev.postback?.mid || `${type}:${senderId}:${ev.timestamp}`,
    sender,
    body: text,
    attachments: attachmentsOf(m.attachments),
    occurredAt: ev.timestamp,
    context: {
      type: type === "message" ? undefined : type,
      storyId,
      payload,
      referral,
      adId: referral?.adId || undefined,
    },
  });
  if (result.duplicate || !result.conversationId) return;

  await handleInboundEvent(db, {
    projectId: connection.project_id,
    connection,
    channel,
    conversationId: result.conversationId,
    contactId: result.contactId,
    event: { type, text, externalMessageId: m.mid || ev.postback?.mid || null, payload, ref: referral?.ref || null, adId: referral?.adId || null, storyId },
  });
}

async function handleComment(db, connection, channel, comment) {
  const result = await ingestInboundMessage(db, {
    projectId: connection.project_id,
    connection,
    channel,
    kind: "comment",
    externalThreadId: `c_${comment.parentId || comment.id}`,
    externalMessageId: comment.id,
    sender: { externalId: comment.authorId, name: comment.authorName, handle: comment.authorHandle },
    body: comment.text,
    occurredAt: comment.createdTime,
    context: { postId: comment.postId, commentId: comment.id, parentId: comment.parentId, isAd: comment.isAd, adId: comment.adId },
  });
  if (result.duplicate || !result.conversationId) return;

  const moderation = await applyModeration(db, {
    projectId: connection.project_id,
    connection,
    channel,
    comment: { id: comment.id, text: comment.text, authorExternalId: comment.authorId, authorName: comment.authorName || comment.authorHandle, postId: comment.postId, isAd: comment.isAd },
  });
  if (HIDDEN.has(String(moderation?.action || ""))) return;

  await handleInboundEvent(db, {
    projectId: connection.project_id,
    connection,
    channel,
    conversationId: result.conversationId,
    contactId: result.contactId,
    event: { type: "comment", text: comment.text, externalMessageId: comment.id, commentId: comment.id, postId: comment.postId, adId: comment.adId || null },
  });
}

async function recordMention(db, connection, channel, properties) {
  await recordEvent(db, { projectId: connection.project_id, name: "social.mention", properties: { channel, ...properties }, source: "social" });
}

async function processPageEntry(db, entry) {
  const pageId = String(entry.id);
  const messenger = await connectionFor(db, "messenger", pageId);
  if (messenger) await stampWebhookEvent(db, messenger);
  for (const ev of entry.messaging || []) if (messenger) await handleMessaging(db, messenger, "messenger", ev);

  for (const change of entry.changes || []) {
    const v = change.value || {};
    if (change.field === "leadgen") {
      const connection = messenger || (await pageConnectionFor(db, pageId));
      if (!connection) continue;
      await handleLeadgenEvent(db, {
        projectId: connection.project_id,
        connection,
        leadgenId: v.leadgen_id,
        formId: v.form_id,
        adId: v.ad_id || null,
        pageId: v.page_id || pageId,
        createdTime: v.created_time ? new Date(Number(v.created_time) * 1000).toISOString() : null,
      });
    } else if (change.field === "feed" && messenger && v.item === "comment" && v.verb === "add") {
      if (!v.comment_id || String(v.from?.id) === pageId) continue;
      await handleComment(db, messenger, "messenger", {
        id: String(v.comment_id),
        text: v.message || "",
        authorId: v.from?.id ? String(v.from.id) : null,
        authorName: v.from?.name || null,
        postId: v.post_id || null,
        parentId: v.parent_id && v.parent_id !== v.post_id ? String(v.parent_id) : null,
        createdTime: v.created_time,
        isAd: false,
      });
    } else if (change.field === "mention" && messenger && v.verb !== "remove") {
      await recordMention(db, messenger, "messenger", { postId: v.post_id || null, commentId: v.comment_id || null, item: v.item || null });
    }
  }
}

async function processInstagramEntry(db, entry) {
  const igId = String(entry.id);
  const connection = await connectionFor(db, "instagram", igId);
  if (!connection) return;
  await stampWebhookEvent(db, connection);
  for (const ev of entry.messaging || []) await handleMessaging(db, connection, "instagram", ev);

  for (const change of entry.changes || []) {
    const v = change.value || {};
    if (change.field === "comments" || change.field === "live_comments") {
      if (!v.id || String(v.from?.id) === igId) continue;
      await handleComment(db, connection, "instagram", {
        id: String(v.id),
        text: v.text || "",
        authorId: v.from?.id ? String(v.from.id) : null,
        authorHandle: v.from?.username ? `@${v.from.username}` : null,
        postId: v.media?.id || null,
        parentId: v.parent_id ? String(v.parent_id) : null,
        createdTime: entry.time,
        isAd: Boolean(v.media?.ad_id),
        adId: v.media?.ad_id || null,
      });
    } else if (change.field === "mentions") {
      await recordMention(db, connection, "instagram", { postId: v.media_id || null, commentId: v.comment_id || null });
    }
  }
}

// Processes one verified webhook payload; every entry is isolated so one bad item never drops the rest.
export async function processMetaWebhook(db, payload) {
  const object = payload?.object;
  for (const entry of payload?.entry || []) {
    try {
      if (object === "page") await processPageEntry(db, entry);
      else if (object === "instagram") await processInstagramEntry(db, entry);
      else if (object === "whatsapp_business_account") {
        for (const change of entry.changes || []) await processWhatsAppChange(db, entry, change);
      }
    } catch (error) {
      console.error("[webhooks.meta.entry]", object, entry?.id, error);
    }
  }
}
