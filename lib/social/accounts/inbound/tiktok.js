import { ingestInboundMessage } from "@/lib/inbox/ingest";
import { handleInboundEvent } from "@/lib/chat/engine";
import { connectionFor, stampWebhookEvent } from "./common";

// TikTok DIRECT_MESSAGE webhook events (server-only, service-role db). `im_receive_msg` is a person messaging a
// connected business account (only delivered outside the EEA/CH/UK); echoes and read receipts are ignored.

export async function processTikTokEvent(db, event) {
  if (event?.event !== "im_receive_msg") return null;
  let content = event.content;
  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch {
      return null;
    }
  }
  const connection = await connectionFor(db, "tiktok", event.user_openid);
  if (!connection || !content?.conversation_id) return null;
  // The business itself is the recipient of an inbound message.
  if (content.to_user?.id && String(content.to_user.id) !== String(connection.external_id)) return null;
  await stampWebhookEvent(db, connection);

  const attachments = [];
  if (content.image?.media_id) attachments.push({ type: "image", mediaId: content.image.media_id });
  if (content.share_post?.embed_url) attachments.push({ type: "share", url: content.share_post.embed_url });
  const text = content.text?.body || "";

  const result = await ingestInboundMessage(db, {
    projectId: connection.project_id,
    connection,
    channel: "tiktok",
    kind: "dm",
    externalThreadId: String(content.conversation_id),
    externalMessageId: content.message_id ? String(content.message_id) : null,
    sender: { externalId: content.from_user?.id ? String(content.from_user.id) : null, name: content.from || undefined, handle: content.from ? `@${content.from}` : undefined },
    body: text,
    attachments,
    occurredAt: content.timestamp ? Number(content.timestamp) : Date.now(),
  });
  if (result.duplicate || !result.conversationId) return result;
  await handleInboundEvent(db, {
    projectId: connection.project_id,
    connection,
    channel: "tiktok",
    conversationId: result.conversationId,
    contactId: result.contactId,
    event: { type: "message", text, externalMessageId: content.message_id || null },
  });
  return result;
}
