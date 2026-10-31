import { telegramRequest } from "@/lib/social/telegram";
import { loadConnection } from "@/lib/messaging/connections";
import { buildTelegramRequest, friendlyTelegramError, TELEGRAM_LIMITS } from "./telegram_format";

// Server-only Telegram helpers for Communities: bot lookup (channel_connections + channel_secrets),
// chat inspection (is the bot an admin, with which rights), publishing, invite links and member counts.
// Every helper returns { ok, error } shapes and never throws.

// The bot token the Social channels connect flow stored for the connection.
export function botToken(secrets) {
  const s = secrets || {};
  return s.botToken || s.bot_token || s.token || s.accessToken || null;
}

// Bot tokens are "<bot id>:<secret>", so the bot's own user id needs no getMe round trip.
export function botIdFromToken(token) {
  const id = Number(String(token || "").split(":")[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Needs a service-role db: channel_secrets has no client policy.
export async function loadTelegramBot(admin, projectId, connectionId) {
  if (!admin || !projectId) return { connection: null, token: null };
  const { connection, secrets } = await loadConnection(admin, projectId, "telegram", connectionId || null);
  return { connection, token: connection ? botToken(secrets) : null };
}

export function platformForChatType(type) {
  if (type === "channel") return "telegram_channel";
  if (type === "group" || type === "supergroup") return "telegram_group";
  return null;
}

export function rightsFrom(member, chatType) {
  const status = member?.status;
  const creator = status === "creator";
  const isAdmin = creator || status === "administrator";
  return {
    isAdmin,
    status: status || "unknown",
    // Channels need "Post messages"; group admins can always post.
    canPost: creator || (chatType === "channel" ? Boolean(member?.can_post_messages) : isAdmin),
    canDelete: creator || Boolean(member?.can_delete_messages),
    canRestrict: creator || Boolean(member?.can_restrict_members),
    canInvite: creator || Boolean(member?.can_invite_users),
    canEdit: creator || Boolean(member?.can_edit_messages),
    checkedAt: new Date().toISOString(),
  };
}

// getChat + getChatMember(bot) + getChatMemberCount -> { ok, chat, platform, rights, memberCount } | { ok: false, error }.
export async function inspectChat(token, chatRef) {
  if (!token) return { ok: false, error: friendlyTelegramError("missing_token") };
  const chat = await telegramRequest(token, "getChat", { chat_id: chatRef });
  if (!chat.ok) return { ok: false, error: friendlyTelegramError(chat.error) };
  const info = chat.data || {};
  const platform = platformForChatType(info.type);
  if (!platform) return { ok: false, error: "That's a private chat. Link a channel or a group." };

  const botId = botIdFromToken(token);
  const member = botId ? await telegramRequest(token, "getChatMember", { chat_id: info.id, user_id: botId }) : { ok: false };
  const rights = rightsFrom(member.ok ? member.data : null, info.type);
  const count = await telegramRequest(token, "getChatMemberCount", { chat_id: info.id });

  return {
    ok: true,
    platform,
    chat: {
      id: String(info.id),
      type: info.type,
      title: info.title || "",
      username: info.username || "",
      inviteLink: info.invite_link || "",
    },
    rights,
    memberCount: count.ok && Number.isFinite(Number(count.data)) ? Number(count.data) : null,
  };
}

// Which rights a platform needs, as one sentence per missing right (empty = good to go).
export function missingRights(platform, rights) {
  if (!rights?.isAdmin) return ["Make the bot an admin of this chat."];
  const missing = [];
  if (platform === "telegram_channel" && !rights.canPost) missing.push('Give the bot the "Post messages" right.');
  if (platform === "telegram_group") {
    if (!rights.canDelete) missing.push('Give the bot the "Delete messages" right so moderation can remove posts.');
    if (!rights.canRestrict) missing.push('Give the bot the "Ban users" right so it can mute or ban.');
  }
  return missing;
}

// Publishes one post. Returns { ok, messageId, error }.
export async function publishToTelegram(token, chatId, post, defaults = {}) {
  if (!token) return { ok: false, messageId: null, error: friendlyTelegramError("missing_token") };
  if (!chatId) return { ok: false, messageId: null, error: "This channel has no Telegram chat linked." };
  const { method, params } = buildTelegramRequest(post, defaults);
  const res = await telegramRequest(token, method, { chat_id: chatId, ...params });
  if (!res.ok) return { ok: false, messageId: null, error: friendlyTelegramError(res.error) };
  const message = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, messageId: message?.message_id != null ? String(message.message_id) : null, error: null };
}

// A named invite link (the name shows in Telegram's admin UI and comes back on chat_member joins).
export async function createInviteLink(token, chatId, { name, expiresAt, memberLimit, createsJoinRequest } = {}) {
  const params = { chat_id: chatId };
  if (name) params.name = String(name).slice(0, TELEGRAM_LIMITS.inviteName);
  const expire = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : null;
  if (expire && expire > Date.now() / 1000) params.expire_date = expire;
  if (createsJoinRequest) params.creates_join_request = true;
  else if (Number(memberLimit) > 0) params.member_limit = Math.min(99999, Math.round(Number(memberLimit)));
  const res = await telegramRequest(token, "createChatInviteLink", params);
  if (!res.ok) return { ok: false, url: null, error: friendlyTelegramError(res.error) };
  return { ok: true, url: res.data?.invite_link || null, error: null };
}

export async function revokeInviteLink(token, chatId, url) {
  if (!token || !chatId || !url) return { ok: false };
  const res = await telegramRequest(token, "revokeChatInviteLink", { chat_id: chatId, invite_link: url });
  return { ok: res.ok, error: res.ok ? null : friendlyTelegramError(res.error) };
}

export async function memberCount(token, chatId) {
  const res = await telegramRequest(token, "getChatMemberCount", { chat_id: chatId });
  return res.ok && Number.isFinite(Number(res.data)) ? Number(res.data) : null;
}
