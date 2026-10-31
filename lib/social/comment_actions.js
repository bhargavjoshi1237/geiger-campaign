import { graphRequest } from "./meta_graph";
import { telegramRequest } from "./telegram";
import { graphAuth, telegramAuth } from "./credentials";
import { networkForChannel, networkLabel } from "./networks";

// Comment actions through the official APIs (server-only): hide/unhide, delete and public reply.
//   Instagram  POST /{ig-comment-id}?hide · DELETE /{ig-comment-id} · POST /{ig-comment-id}/replies
//   Facebook   POST /{comment-id} is_hidden · DELETE /{comment-id} · POST /{comment-id}/comments
//   Telegram   deleteMessage · sendMessage with reply_parameters (no hide in the Bot API)
// Returns { ok, error, replyId }.

export const SUPPORTED_ACTIONS = {
  instagram: ["hide", "unhide", "delete", "reply"],
  facebook: ["hide", "unhide", "delete", "reply"],
  telegram: ["delete", "reply"],
};

// Telegram comment ids are "<chat id>:<message id>" or a bare message id with the chat in context.
function telegramIds(commentId, context = {}) {
  const raw = String(commentId || "");
  if (raw.includes(":")) {
    const [chatId, messageId] = raw.split(":");
    return { chatId, messageId: Number(messageId) };
  }
  return { chatId: context.chatId || null, messageId: Number(raw) };
}

export async function performCommentAction({ connection, secrets, action, commentId, replyText = "", context = {} }) {
  const network = networkForChannel(connection?.channel);
  if (!network || !SUPPORTED_ACTIONS[network]?.includes(action)) {
    return { ok: false, error: `${networkLabel(network)} doesn't support “${action}” through its API.` };
  }
  if (!commentId) return { ok: false, error: "Missing comment id." };

  if (network === "telegram") {
    const auth = telegramAuth(connection, secrets);
    const { chatId, messageId } = telegramIds(commentId, context);
    if (!auth.token) return { ok: false, error: "The Telegram bot has no token." };
    if (!chatId || !messageId) return { ok: false, error: "Couldn't resolve the Telegram chat for this comment." };
    if (action === "delete") {
      const res = await telegramRequest(auth.token, "deleteMessage", { chat_id: chatId, message_id: messageId });
      return { ok: res.ok, error: res.error };
    }
    const res = await telegramRequest(auth.token, "sendMessage", { chat_id: chatId, text: replyText, reply_parameters: { message_id: messageId } });
    return { ok: res.ok, error: res.error, replyId: res.ok ? `${chatId}:${res.data?.message_id}` : null };
  }

  const auth = graphAuth(connection, secrets);
  if (!auth.token) return { ok: false, error: `${networkLabel(network)} has no access token — reconnect it in Social Accounts.` };
  const opts = { token: auth.token, host: network === "instagram" ? auth.host : "graph.facebook.com" };

  if (action === "hide" || action === "unhide") {
    const hidden = action === "hide";
    const body = network === "instagram" ? { hide: hidden } : { is_hidden: hidden };
    const res = await graphRequest(commentId, { ...opts, method: "POST", body });
    return { ok: res.ok, error: res.error };
  }
  if (action === "delete") {
    const res = await graphRequest(commentId, { ...opts, method: "DELETE" });
    return { ok: res.ok, error: res.error };
  }
  if (!String(replyText || "").trim()) return { ok: false, error: "Write a reply first." };
  const edge = network === "instagram" ? "replies" : "comments";
  const res = await graphRequest(`${commentId}/${edge}`, { ...opts, method: "POST", body: { message: String(replyText).slice(0, 2200) } });
  return { ok: res.ok, error: res.error, replyId: res.ok ? res.data?.id || null : null };
}

// Visible moderation state written onto the comment's conversation_messages.metadata.moderation.
export function moderationState(action) {
  return { hide: "hidden", unhide: "visible", delete: "deleted", reply: "replied", flag: "flagged" }[action] || null;
}
