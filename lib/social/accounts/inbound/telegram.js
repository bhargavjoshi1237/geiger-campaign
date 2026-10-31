import { telegramRequest } from "@/lib/social/telegram";
import { ingestInboundMessage } from "@/lib/inbox/ingest";
import { handleInboundEvent } from "@/lib/chat/engine";
import { handleTelegramCommunityUpdate } from "@/lib/communities/telegram_updates";
import { contactForIdentity, recordConsent, stampWebhookEvent } from "./common";

// Telegram bot updates (server-only, service-role db). Private chats are 1:1 conversations: ingest + chat engine,
// with /start deep links as referrals and blocking the bot as an opt-out. Groups, supergroups and channels belong
// to the Communities area.

const COMMUNITY = new Set(["group", "supergroup", "channel"]);

function attachmentsOf(msg) {
  const out = [];
  if (msg.photo?.length) out.push({ type: "image", fileId: msg.photo[msg.photo.length - 1].file_id });
  if (msg.video) out.push({ type: "video", fileId: msg.video.file_id });
  if (msg.voice) out.push({ type: "audio", fileId: msg.voice.file_id });
  if (msg.audio) out.push({ type: "audio", fileId: msg.audio.file_id });
  if (msg.document) out.push({ type: "file", fileId: msg.document.file_id, title: msg.document.file_name || null });
  if (msg.sticker) out.push({ type: "sticker", fileId: msg.sticker.file_id });
  return out;
}

const nameOf = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(" ") || undefined;

async function handlePrivate(db, connection, { chatId, from, messageId, text, attachments, occurredAt, context, event }) {
  const result = await ingestInboundMessage(db, {
    projectId: connection.project_id,
    connection,
    channel: "telegram",
    kind: "dm",
    externalThreadId: String(chatId),
    externalMessageId: messageId,
    sender: { externalId: String(from.id), name: nameOf(from), handle: from.username ? `@${from.username}` : undefined },
    body: text,
    attachments,
    occurredAt,
    context,
  });
  if (result.duplicate || !result.conversationId) return result;
  await handleInboundEvent(db, {
    projectId: connection.project_id,
    connection,
    channel: "telegram",
    conversationId: result.conversationId,
    contactId: result.contactId,
    event,
  });
  return result;
}

export async function processTelegramUpdate(db, connection, secrets, update) {
  await stampWebhookEvent(db, connection);
  const msg = update.message;
  const chatType = msg?.chat?.type || update.callback_query?.message?.chat?.type || update.my_chat_member?.chat?.type || update.chat_member?.chat?.type;

  if (update.channel_post || update.edited_channel_post || update.chat_join_request || update.chat_member || COMMUNITY.has(chatType)) {
    return handleTelegramCommunityUpdate(db, { projectId: connection.project_id, connection, update });
  }

  // Blocking the bot is the person's opt-out; restarting it is handled by /start below.
  if (update.my_chat_member && chatType === "private") {
    if (update.my_chat_member.new_chat_member?.status === "kicked") {
      const contactId = await contactForIdentity(db, connection.project_id, "telegram", update.my_chat_member.from?.id);
      await recordConsent(db, { projectId: connection.project_id, contactId, channel: "telegram", status: "opted_out", source: "blocked_bot", proof: { chatId: update.my_chat_member.chat.id, date: update.my_chat_member.date } });
    }
    return null;
  }

  if (update.callback_query && chatType === "private") {
    const cb = update.callback_query;
    if (secrets?.botToken) await telegramRequest(secrets.botToken, "answerCallbackQuery", { callback_query_id: cb.id });
    return handlePrivate(db, connection, {
      chatId: cb.message.chat.id,
      from: cb.from,
      messageId: `cb:${cb.id}`,
      text: cb.data || "",
      attachments: [],
      occurredAt: Date.now(),
      context: { type: "postback", payload: cb.data || null },
      event: { type: "postback", text: cb.data || "", externalMessageId: `cb:${cb.id}`, payload: cb.data || null },
    });
  }

  // Edits keep their original message id; the inbox keeps the first version.
  if (!msg || chatType !== "private" || !msg.from || msg.from.is_bot) return null;
  const text = msg.text || msg.caption || "";
  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?/.exec(text);
  const ref = start?.[1] || null;
  const result = await handlePrivate(db, connection, {
    chatId: msg.chat.id,
    from: msg.from,
    messageId: `${msg.chat.id}:${msg.message_id}`,
    text,
    attachments: attachmentsOf(msg),
    occurredAt: msg.date,
    context: ref ? { type: "referral", referral: { ref, source: "DEEP_LINK" } } : {},
    event: { type: ref ? "referral" : "message", text, externalMessageId: `${msg.chat.id}:${msg.message_id}`, ref },
  });
  // Pressing Start is Telegram's explicit opt-in to hear from the bot.
  if (start && result?.contactId && !result.duplicate) {
    await recordConsent(db, { projectId: connection.project_id, contactId: result.contactId, channel: "telegram", status: "opted_in", source: "telegram_start", proof: { chatId: msg.chat.id, ref, date: msg.date } });
  }
  return result;
}
