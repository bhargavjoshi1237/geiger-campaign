import { telegramRequest } from "@/lib/social/telegram";
import { tagDelivery } from "@/lib/social/accounts/guards";
import { notConnected } from "../connections";

// Telegram provider: Bot API sendMessage / sendPhoto / sendVideo / sendDocument with the connection's bot token.
// `to` is a chat id (a person who started the bot, a group, or a channel the bot administers). No messaging
// window; people who blocked the bot fail with a reason. Returns { status, providerId, error, cost }.
export const name = "telegram";

const MEDIA = { image: ["sendPhoto", "photo"], video: ["sendVideo", "video"], audio: ["sendAudio", "audio"], file: ["sendDocument", "document"] };

function replyMarkup(message) {
  if (message.buttons?.length) {
    return {
      inline_keyboard: message.buttons.slice(0, 10).map((b) => [
        b.url ? { text: String(b.title).slice(0, 64), url: b.url } : { text: String(b.title).slice(0, 64), callback_data: String(b.payload || b.title).slice(0, 64) },
      ]),
    };
  }
  if (message.quickReplies?.length) {
    return {
      keyboard: message.quickReplies.slice(0, 12).map((q) => [{ text: String(q.title).slice(0, 64) }]),
      one_time_keyboard: true,
      resize_keyboard: true,
    };
  }
  return undefined;
}

function explain(error) {
  if (/blocked by the user|bot was blocked/i.test(error)) return "The person blocked the bot.";
  if (/chat not found|have no rights|can't initiate/i.test(error)) return "The bot can't message this chat — the person hasn't started it.";
  if (/too many requests/i.test(error)) return "Telegram rate limit reached — try again shortly.";
  return error;
}

export async function send({ db, deliveryId, to, message = {}, connection, secrets }) {
  if (!connection) return notConnected("Telegram");
  if (connection.status === "disconnected") return { status: "not_sent", error: "Telegram is disconnected." };
  const token = secrets?.botToken;
  if (!token) return { status: "not_sent", error: "The Telegram bot token isn't stored — add the bot again." };

  const text = String(message.text ?? message.body ?? "").trim();
  const attachment = (message.attachments || []).find((a) => a?.url);
  const markup = replyMarkup(message);
  let res;
  if (attachment) {
    const [method, field] = MEDIA[attachment.type] || MEDIA.file;
    res = await telegramRequest(token, method, { chat_id: to, [field]: attachment.url, caption: text.slice(0, 1024) || undefined, reply_markup: markup });
  } else {
    if (!text) return { status: "failed", error: "The message is empty." };
    res = await telegramRequest(token, "sendMessage", { chat_id: to, text: text.slice(0, 4096), reply_markup: markup });
  }
  if (!res.ok) {
    const error = explain(res.error || "Telegram refused the message.");
    if (/blocked the bot|hasn't started/.test(error)) await tagDelivery(db, deliveryId, { blockedBy: "blocked" });
    return { status: "failed", error, cost: 0 };
  }
  return { status: "sent", providerId: `${res.data.chat?.id ?? to}:${res.data.message_id}`, error: null, cost: 0, connectionId: connection.id };
}
