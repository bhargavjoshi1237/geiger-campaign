import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";
import { autoRouteConversation } from "./server";

// Inbound message ingestion (server-only, service-role db): the single path every channel webhook uses
// to record what a person sent. Upserts the contact identity (contacts.metadata.identities[channel]),
// the conversation (by connection + external thread id, opening the 24h window) and the message
// (deduped by external id), routes new/reopened threads (assignment rules + SLA), then records a tracked
// event so automations and reports see it.
// OWNER: Social channels.

// input: { projectId, connection, channel, kind: "dm"|"comment"|"sms"|"chat"|"email", externalThreadId,
//          externalMessageId, sender: { externalId, name, handle, email, phone }, body, attachments,
//          occurredAt, context: { postId, commentId, adId, storyId, referral, parentId, isAd,
//          type: "story_reply"|"story_mention"|"postback"|"referral", payload, caption, permalink, mediaUrl, adName },
//          contactStatus: status for a newly created contact (default: the column default) }
// returns: { conversationId, messageId, contactId, isNewConversation, reopened, duplicate }

const SOCIAL = new Set(["instagram", "messenger", "telegram", "tiktok"]);
// Free-form reply windows the platforms open on every inbound message (hours).
const WINDOW_HOURS = { instagram: 24, messenger: 24, whatsapp: 24, tiktok: 48 };

const EMPTY = Object.freeze({ conversationId: null, messageId: null, contactId: null, isNewConversation: false, reopened: false, duplicate: false });

const toIso = (value) => {
  if (!value) return new Date().toISOString();
  const date = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""));
const nonEmpty = (obj) => (Object.keys(obj).length ? obj : undefined);

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

async function findContactBy(db, projectId, column, value) {
  if (!value) return null;
  const { data } = await db
    .from("contacts")
    .select("*")
    .eq("project_id", projectId)
    .eq(column, value)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Finds the person by channel identity, then email, then phone; creates them if unknown; merges the identity.
async function upsertContactIdentity(db, { projectId, channel, sender, existingContactId, status }) {
  const externalId = sender.externalId ? String(sender.externalId) : null;
  const email = sender.email ? String(sender.email).trim().toLowerCase() : null;
  const phone = sender.phone ? String(sender.phone).trim() : null;
  const handle = sender.handle ? String(sender.handle) : null;

  let contact = existingContactId ? await findContactBy(db, projectId, "id", existingContactId) : null;
  if (!contact && externalId) contact = await findContactBy(db, projectId, `metadata->identities->>${channel}`, externalId);
  if (!contact && email) contact = await findContactBy(db, projectId, "email", email);
  if (!contact && phone) contact = await findContactBy(db, projectId, "phone", phone);

  if (!contact) {
    const { first, last } = splitName(sender.name || (handle ? handle.replace(/^@/, "") : ""));
    const { data, error } = await db
      .from("contacts")
      .insert({
        project_id: projectId,
        first_name: first,
        last_name: last,
        email,
        phone,
        source: channel,
        ...(status ? { status } : {}),
        metadata: compact({
          identities: externalId ? { [channel]: externalId } : undefined,
          handles: handle ? { [channel]: handle } : undefined,
        }),
      })
      .select("*")
      .single();
    if (!error) return data.id;
    // Lost a race on the unique email: use the row that won.
    const winner = email ? await findContactBy(db, projectId, "email", email) : null;
    if (winner) contact = winner;
    else {
      console.error("[inbox.ingest.contact]", error.message);
      return null;
    }
  }

  const meta = bag(contact.metadata);
  const identities = bag(meta.identities);
  const handles = bag(meta.handles);
  const patch = {};
  if (externalId && identities[channel] !== externalId) patch.identities = { ...identities, [channel]: externalId };
  if (handle && handles[channel] !== handle) patch.handles = { ...handles, [channel]: handle };
  const row = {};
  if (Object.keys(patch).length) row.metadata = { ...meta, ...patch };
  if (!contact.phone && phone) row.phone = phone;
  if (!contact.email && email) row.email = email;
  if (!contact.first_name && !contact.last_name && sender.name) {
    const { first, last } = splitName(sender.name);
    row.first_name = first;
    row.last_name = last;
  }
  if (Object.keys(row).length) {
    const { error } = await db.from("contacts").update(row).eq("id", contact.id);
    if (error) console.error("[inbox.ingest.contact.merge]", error.message);
  }
  return contact.id;
}

async function findConversation(db, { projectId, connectionId, channel, threadId }) {
  let query = db.from("conversations").select("*").eq("external_thread_id", threadId).is("deleted_at", null);
  query = connectionId ? query.eq("connection_id", connectionId) : query.eq("project_id", projectId).eq("channel", channel).is("connection_id", null);
  const { data } = await query.limit(1).maybeSingle();
  return data || null;
}

function eventNames(channel, kind, context) {
  if (kind === "comment") return ["social.comment"];
  if (context.type === "story_reply") return ["social.story_reply"];
  if (context.type === "story_mention") return ["social.story_mention"];
  const names = [SOCIAL.has(channel) ? "social.dm" : "message_received"];
  if (context.adId || context.referral?.source === "ADS") names.push("social.ad_click");
  else if (context.referral || context.type === "referral") names.push("social.referral");
  return names;
}

export async function ingestInboundMessage(db, input) {
  if (!db || !input?.projectId || !input?.channel) return { ...EMPTY };
  const { projectId, connection = null, channel, kind = "dm", sender = {}, attachments = [] } = input;
  const context = bag(input.context);
  const threadId = String(input.externalThreadId || sender.externalId || "");
  if (!threadId) return { ...EMPTY };
  const externalMessageId = input.externalMessageId ? String(input.externalMessageId) : null;
  const occurredAt = toIso(input.occurredAt);
  const body = String(input.body ?? "");
  const connectionId = connection?.id || null;

  try {
    let conversation = await findConversation(db, { projectId, connectionId, channel, threadId });

    if (conversation && externalMessageId) {
      const { data: dup } = await db
        .from("conversation_messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("external_id", externalMessageId)
        .maybeSingle();
      if (dup) {
        return { conversationId: conversation.id, messageId: dup.id, contactId: conversation.contact_id, isNewConversation: false, reopened: false, duplicate: true };
      }
    }

    const contactId = await upsertContactIdentity(db, { projectId, channel, sender, existingContactId: conversation?.contact_id, status: input.contactStatus });

    const windowHours = kind === "comment" ? null : WINDOW_HOURS[channel] || null;
    const windowExpiresAt = windowHours ? new Date(new Date(occurredAt).getTime() + windowHours * 3_600_000).toISOString() : null;
    const threadMeta = compact({
      externalUserId: sender.externalId ? String(sender.externalId) : undefined,
      senderHandle: sender.handle,
      postId: context.postId,
      rootCommentId: kind === "comment" ? context.parentId || context.commentId : undefined,
      isAd: context.isAd ? true : undefined,
      adId: context.adId,
      referral: context.referral,
      freeEntryPointExpiresAt: context.freeEntryPointExpiresAt,
      // What the inbox renders: who wrote, the post a comment is on, and the list preview.
      sender: nonEmpty(compact({ externalId: sender.externalId ? String(sender.externalId) : undefined, name: sender.name, handle: sender.handle ? String(sender.handle).replace(/^@/, "") : undefined })),
      context: kind === "comment" ? nonEmpty(compact({ postId: context.postId, isAd: context.isAd ? true : undefined, adId: context.adId, adName: context.adName, caption: context.caption, permalink: context.permalink, mediaUrl: context.mediaUrl })) : undefined,
      preview: body.slice(0, 160) || (attachments.length ? "Attachment" : undefined),
      previewDirection: "inbound",
    });
    const title = sender.name || sender.handle || "";
    let isNewConversation = false;
    let reopened = false;

    if (conversation) {
      const newer = !conversation.last_inbound_at || occurredAt >= new Date(conversation.last_inbound_at).toISOString();
      const old = bag(conversation.metadata);
      const metadata = { ...old, ...threadMeta };
      // A comment thread keeps its first author; enriched post context survives later comments.
      if (threadMeta.sender) metadata.sender = kind === "comment" ? { ...threadMeta.sender, ...bag(old.sender) } : { ...bag(old.sender), ...threadMeta.sender };
      if (threadMeta.context) metadata.context = { ...bag(old.context), ...threadMeta.context };
      if (!newer) {
        metadata.preview = old.preview;
        metadata.previewDirection = old.previewDirection;
      }
      const patch = { unread_count: (Number(conversation.unread_count) || 0) + 1, metadata };
      if (!conversation.contact_id && contactId) patch.contact_id = contactId;
      if (!conversation.title && title) patch.title = title;
      if (newer) {
        patch.last_inbound_at = occurredAt;
        if (!conversation.last_message_at || occurredAt > new Date(conversation.last_message_at).toISOString()) patch.last_message_at = occurredAt;
        if (windowHours) patch.window_expires_at = windowExpiresAt;
      }
      // A new message wakes resolved and snoozed threads; a reopened thread restarts its SLA clock.
      if (conversation.status === "resolved" || conversation.status === "snoozed") {
        patch.status = "open";
        patch.snoozed_until = null;
        patch.resolved_at = null;
        patch.first_response_at = null;
        patch.sla_policy_id = null;
        reopened = true;
      }
      const { error } = await db.from("conversations").update(patch).eq("id", conversation.id);
      if (error) console.error("[inbox.ingest.conversation.update]", error.message);
    } else {
      const { data, error } = await db
        .from("conversations")
        .insert({
          project_id: projectId,
          channel,
          connection_id: connectionId,
          contact_id: contactId,
          kind,
          external_thread_id: threadId,
          title,
          status: "open",
          unread_count: 1,
          last_message_at: occurredAt,
          last_inbound_at: occurredAt,
          window_expires_at: windowExpiresAt,
          metadata: threadMeta,
        })
        .select("*")
        .single();
      if (error) {
        // Another delivery of the same webhook created it first.
        conversation = await findConversation(db, { projectId, connectionId, channel, threadId });
        if (!conversation) {
          console.error("[inbox.ingest.conversation.insert]", error.message);
          return { ...EMPTY, contactId };
        }
      } else {
        conversation = data;
        isNewConversation = true;
      }
    }

    const { data: message, error: messageError } = await db
      .from("conversation_messages")
      .insert({
        project_id: projectId,
        conversation_id: conversation.id,
        direction: "inbound",
        sender_type: "contact",
        body,
        attachments: Array.isArray(attachments) ? attachments : [],
        external_id: externalMessageId,
        status: "received",
        sent_at: occurredAt,
        metadata: compact({
          kind,
          type: context.type,
          postId: context.postId,
          commentId: context.commentId,
          parentId: context.parentId,
          storyId: context.storyId,
          adId: context.adId,
          payload: context.payload,
          senderName: sender.name,
          senderHandle: sender.handle,
          senderExternalId: sender.externalId ? String(sender.externalId) : undefined,
        }),
      })
      .select("id")
      .single();
    if (messageError) {
      const { data: dup } = externalMessageId
        ? await db.from("conversation_messages").select("id").eq("conversation_id", conversation.id).eq("external_id", externalMessageId).maybeSingle()
        : { data: null };
      if (dup) return { conversationId: conversation.id, messageId: dup.id, contactId, isNewConversation, reopened, duplicate: true };
      console.error("[inbox.ingest.message]", messageError.message);
      return { conversationId: conversation.id, messageId: null, contactId, isNewConversation, reopened, duplicate: false };
    }

    const properties = compact({
      channel,
      kind,
      type: context.type,
      connectionId,
      conversationId: conversation.id,
      messageId: message.id,
      externalMessageId,
      postId: context.postId,
      commentId: context.commentId,
      parentId: context.parentId,
      storyId: context.storyId,
      adId: context.adId,
      isAd: context.isAd ? true : undefined,
      ref: context.referral?.ref,
      referralSource: context.referral?.source,
      payload: context.payload,
      text: body.slice(0, 500),
    });
    for (const name of eventNames(channel, kind, context)) {
      await recordEvent(db, { projectId, contactId, name, properties, source: SOCIAL.has(channel) ? "social" : "system", occurredAt });
    }

    if (isNewConversation || reopened) await autoRouteConversation(db, { projectId, conversationId: conversation.id });
    if (isNewConversation) {
      await emitWebhook(db, projectId, "conversation.created", { conversationId: conversation.id, channel, kind, contactId, createdAt: occurredAt });
    }
    await emitWebhook(db, projectId, "message.received", {
      conversationId: conversation.id,
      messageId: message.id,
      channel,
      kind,
      contactId,
      body,
      occurredAt,
    });

    return { conversationId: conversation.id, messageId: message.id, contactId, isNewConversation, reopened, duplicate: false };
  } catch (error) {
    console.error("[inbox.ingest]", error);
    return { ...EMPTY };
  }
}
