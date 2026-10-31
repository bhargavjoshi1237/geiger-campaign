import { adminClient } from "@/lib/supabase/admin";
import { ApiError, badRequest, notConfigured, notFound } from "@/lib/server/http";
import { isTelegramPlatform } from "./platforms";
import { DEFAULT_GROUP_RULES } from "./rules";
import { friendlyTelegramError, normalizeChatRef, validateTelegramPost } from "./telegram_format";
import { inspectChat, loadTelegramBot, memberCount, missingRights, publishToTelegram } from "./telegram";

// Server operations behind the communities routes (server-only). `db` is the caller's user-scoped
// campaign client (RLS + campaign.community.edit decide writes); bot tokens are read through the
// service role because channel_secrets has no client policy.

const CLAIM_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_WELCOME = "Welcome to {group}, {first_name}! Please read the pinned message before posting.";

export function requireAdmin() {
  const admin = adminClient();
  if (!admin) throw notConfigured("Server database access isn't configured (SUPABASE_SERVICE_ROLE_KEY).");
  return admin;
}

export async function getChannelRow(db, projectId, channelId) {
  const { data, error } = await db
    .from("community_channels")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", channelId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ApiError(500, "Couldn't load the channel.", "db_error");
  if (!data) throw notFound("Channel not found.");
  return data;
}

export async function botTokenFor(projectId, connectionId) {
  const { connection, token } = await loadTelegramBot(requireAdmin(), projectId, connectionId);
  if (!connection) throw new ApiError(409, "The Telegram bot for this chat isn't connected anymore. Reconnect it in Channels → Telegram.", "bot_missing");
  if (!token) throw new ApiError(409, friendlyTelegramError("missing_token"), "missing_token");
  return { connection, token };
}

// Welcome bot + the default (all-off) moderation rules for a newly linked group.
async function ensureGroup(db, { projectId, channelId, userId }) {
  const { data: existing } = await db
    .from("community_groups")
    .select("id")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: group, error } = await db
    .from("community_groups")
    .insert({ project_id: projectId, channel_id: channelId, welcome_text: DEFAULT_WELCOME, created_by: userId })
    .select("id")
    .single();
  if (error || !group) {
    console.error("[communities.ensureGroup]", error?.message);
    return null;
  }
  await db.from("group_rules").insert(
    DEFAULT_GROUP_RULES.map((r) => ({ ...r, project_id: projectId, group_id: group.id, created_by: userId })),
  );
  return group.id;
}

async function snapshot(db, { projectId, channelId, count, userId }) {
  if (count == null) return null;
  const { data } = await db
    .from("member_snapshots")
    .insert({ project_id: projectId, channel_id: channelId, count, source: "telegram_api", created_by: userId })
    .select("*")
    .single();
  return data || null;
}

// Verifies the bot is an admin of the chat with the rights the platform needs, then creates or refreshes
// the community_channels row (and the group's moderation settings) and snapshots the member count.
export async function linkTelegramChat(db, { projectId, userId, connectionId, chat, platform }) {
  if (!connectionId) throw badRequest("Pick the bot to link with.");
  const ref = normalizeChatRef(chat);
  if (!ref) throw badRequest("Enter the chat's @username, t.me link or numeric id. Private invite links can't be looked up.");
  const { connection, token } = await botTokenFor(projectId, connectionId);

  const result = await inspectChat(token, ref);
  if (!result.ok) throw new ApiError(422, result.error, "telegram_error");
  if (platform && result.platform !== platform) {
    throw new ApiError(
      422,
      result.platform === "telegram_group"
        ? "That's a group, not a channel. Link it from Communities → Groups."
        : "That's a channel, not a group. Link it from Communities → Telegram Channels.",
      "wrong_type",
    );
  }
  const missing = missingRights(result.platform, result.rights);
  const title = result.chat.title || ref;
  if (!result.rights.isAdmin) {
    throw new ApiError(422, `The bot isn't an admin of ${title}. Add it as an admin in Telegram, then try again.`, "bot_not_admin");
  }
  if (result.platform === "telegram_channel" && !result.rights.canPost) throw new ApiError(422, missing[0], "missing_rights");

  const { data: existing } = await db
    .from("community_channels")
    .select("*")
    .eq("project_id", projectId)
    .eq("external_chat_id", result.chat.id)
    .is("deleted_at", null)
    .maybeSingle();

  const now = new Date().toISOString();
  const fields = {
    platform: result.platform,
    connection_id: connection.id,
    external_chat_id: result.chat.id,
    name: title,
    handle: result.chat.username,
    invite_url: result.chat.username ? `https://t.me/${result.chat.username}` : result.chat.inviteLink || existing?.invite_url || "",
    follower_count: result.memberCount ?? existing?.follower_count ?? 0,
    status: "active",
    settings: { ...(existing?.settings || {}), rights: result.rights, statusReason: null },
    last_synced_at: now,
  };
  const write = existing
    ? db.from("community_channels").update(fields).eq("id", existing.id)
    : db.from("community_channels").insert({ ...fields, project_id: projectId, created_by: userId });
  const { data: channel, error } = await write.select("*").single();
  if (error || !channel) {
    console.error("[communities.link]", error?.message);
    throw new ApiError(500, "Couldn't save the channel.", "db_error");
  }

  if (channel.platform === "telegram_group") await ensureGroup(db, { projectId, channelId: channel.id, userId });
  await snapshot(db, { projectId, channelId: channel.id, count: result.memberCount, userId });
  return { channel, warnings: missing };
}

// Re-checks the bot's rights and the chat's title / handle / member count.
export async function verifyTelegramChannel(db, { projectId, channelId }) {
  const channel = await getChannelRow(db, projectId, channelId);
  if (!isTelegramPlatform(channel.platform)) throw badRequest("Only Telegram chats are verified through the bot.");
  const { token } = await botTokenFor(projectId, channel.connection_id);
  const result = await inspectChat(token, channel.external_chat_id);
  const now = new Date().toISOString();
  if (!result.ok) {
    const { data } = await db
      .from("community_channels")
      .update({ status: "error", settings: { ...(channel.settings || {}), statusReason: result.error }, last_synced_at: now })
      .eq("id", channel.id)
      .select("*")
      .single();
    return { channel: data || channel, warnings: [result.error] };
  }
  const missing = missingRights(channel.platform, result.rights);
  const healthy = result.rights.isAdmin && (channel.platform !== "telegram_channel" || result.rights.canPost);
  const { data, error } = await db
    .from("community_channels")
    .update({
      name: result.chat.title || channel.name,
      handle: result.chat.username,
      invite_url: result.chat.username ? `https://t.me/${result.chat.username}` : result.chat.inviteLink || channel.invite_url,
      follower_count: result.memberCount ?? channel.follower_count,
      status: healthy ? "active" : "error",
      settings: { ...(channel.settings || {}), rights: result.rights, statusReason: healthy ? null : missing[0] },
      last_synced_at: now,
    })
    .eq("id", channel.id)
    .select("*")
    .single();
  if (error) throw new ApiError(500, "Couldn't save the channel.", "db_error");
  return { channel: data, warnings: missing };
}

// Captures the member count now (getChatMemberCount) as a snapshot.
export async function syncTelegramMembers(db, { projectId, channelId, userId }) {
  const channel = await getChannelRow(db, projectId, channelId);
  if (!isTelegramPlatform(channel.platform)) throw badRequest("Record WhatsApp and Instagram follower counts by hand.");
  const { token } = await botTokenFor(projectId, channel.connection_id);
  const count = await memberCount(token, channel.external_chat_id);
  if (count == null) throw new ApiError(422, "Telegram didn't return a member count. Check the bot is still in the chat.", "telegram_error");
  const snap = await snapshot(db, { projectId, channelId: channel.id, count, userId });
  const { data } = await db
    .from("community_channels")
    .update({ follower_count: count, last_synced_at: new Date().toISOString() })
    .eq("id", channel.id)
    .select("*")
    .single();
  return { channel: data || channel, snapshot: snap };
}

// Publishes an automated Telegram post immediately. The claim stops a double click posting twice.
export async function publishPostNow(db, { projectId, postId }) {
  const { data: post } = await db
    .from("community_posts")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!post) throw notFound("Post not found.");
  if (post.status === "posted") throw new ApiError(409, "This post is already published.", "already_posted");
  if (post.mode !== "automated") throw new ApiError(409, "Manual-assist posts are published by a person in the app. Mark it as posted once it's live.", "manual_assist");
  const problem = validateTelegramPost(post);
  if (problem) throw badRequest(problem);

  const channel = await getChannelRow(db, projectId, post.channel_id);
  if (!isTelegramPlatform(channel.platform)) throw badRequest("Only Telegram posts can be published by the bot.");
  const { token } = await botTokenFor(projectId, channel.connection_id);

  const now = new Date();
  const stale = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  const { data: claimed } = await db
    .from("community_posts")
    .update({ claimed_at: now.toISOString() })
    .eq("id", post.id)
    .neq("status", "posted")
    .or(`claimed_at.is.null,claimed_at.lt."${stale}"`)
    .select("id")
    .maybeSingle();
  if (!claimed) throw new ApiError(409, "This post is already being published.", "in_progress");

  const result = await publishToTelegram(token, channel.external_chat_id, post, channel.settings?.defaults);
  const patch = result.ok
    ? { status: "posted", posted_at: new Date().toISOString(), external_message_id: result.messageId, error: null, claimed_at: null }
    : { status: "failed", error: result.error, claimed_at: null };
  const { data: saved } = await db.from("community_posts").update(patch).eq("id", post.id).select("*").single();
  return { post: saved || { ...post, ...patch }, ok: result.ok, error: result.error };
}
