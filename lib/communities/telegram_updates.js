import { telegramRequest } from "@/lib/social/telegram";
import { loadConnection } from "@/lib/messaging/connections";
import { recordTelegramJoin } from "./links";
import { evaluateContentRules, renderWelcome } from "./rules";
import { botIdFromToken, botToken, platformForChatType, rightsFrom } from "./telegram";
import { friendlyTelegramError } from "./telegram_format";

// Telegram community updates (server-only): group/channel events from the bot webhook — new members
// (welcome message, join attribution), group messages (banned-word / link moderation), channel post
// stats — for the Communities area. Direct messages are handled by the inbox + chat engine instead.
// OWNER: Communities. `db` is the service-role campaign client; never throws.

const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_CACHE_MS = 10 * 60 * 1000;
// Telegram's own account that relays linked-channel posts into a discussion group.
const TELEGRAM_SERVICE_USER = 777000;
const MUTED = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
};

function updateChat(update) {
  return (
    update.message?.chat ||
    update.edited_message?.chat ||
    update.channel_post?.chat ||
    update.edited_channel_post?.chat ||
    update.chat_member?.chat ||
    update.my_chat_member?.chat ||
    update.message_reaction_count?.chat ||
    update.chat_join_request?.chat ||
    null
  );
}

const isMember = (m) =>
  ["creator", "administrator", "member"].includes(m?.status) || (m?.status === "restricted" && m?.is_member);
const displayName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(" ");
const mention = (u) => (u?.username ? `@${u.username}` : u?.first_name || "Member");

async function logEvents(db, rows) {
  if (!rows.length) return;
  const { error } = await db.from("community_group_events").insert(rows);
  if (error) console.error("[communities.updates.log]", error.message);
}

async function mergeGroupMeta(db, group, patch) {
  group.metadata = { ...(group.metadata || {}), ...patch };
  await db.from("community_groups").update({ metadata: group.metadata }).eq("id", group.id);
}

async function loadGroup(db, channelId) {
  const { data } = await db.from("community_groups").select("*").eq("channel_id", channelId).is("deleted_at", null).maybeSingle();
  return data || null;
}

// The bot itself was added, promoted, demoted or removed: track rights, or surface a newly added chat as "pending".
async function handleBotStatus(db, { projectId, connection, chat, channel, change }) {
  const member = change.new_chat_member;
  const rights = rightsFrom(member, chat.type);
  const removed = ["left", "kicked"].includes(member?.status);
  if (channel) {
    if (channel.status === "pending" && !rights.isAdmin) {
      await db.from("community_channels").update({ deleted_at: new Date().toISOString() }).eq("id", channel.id);
      return { handled: true, action: "pending_removed" };
    }
    const reason = rights.isAdmin ? null : removed ? "The bot was removed from this chat." : "The bot is no longer an admin of this chat.";
    await db
      .from("community_channels")
      .update({
        status: channel.status === "pending" ? "pending" : rights.isAdmin ? "active" : "error",
        settings: { ...(channel.settings || {}), rights, statusReason: reason },
      })
      .eq("id", channel.id);
    return { handled: true, action: "bot_status" };
  }
  const platform = platformForChatType(chat.type);
  if (!platform || !rights.isAdmin || !connection?.id) return { handled: true, action: "ignored" };
  const { error } = await db.from("community_channels").insert({
    project_id: projectId,
    platform,
    connection_id: connection.id,
    external_chat_id: String(chat.id),
    name: chat.title || "",
    handle: chat.username || "",
    invite_url: chat.username ? `https://t.me/${chat.username}` : "",
    status: "pending",
    settings: { rights },
  });
  if (error) console.error("[communities.updates.pending]", error.message);
  return { handled: true, action: "chat_detected" };
}

async function sendWelcome(db, { token, channel, group, user }) {
  const text = renderWelcome(group.welcome_text, { firstName: user.first_name, username: user.username, group: channel.name });
  if (!text.trim()) return null;
  const buttons = (Array.isArray(group.welcome_buttons) ? group.welcome_buttons : []).filter((b) => b?.text && b?.url);
  const res = await telegramRequest(token, "sendMessage", {
    chat_id: channel.external_chat_id,
    text,
    disable_notification: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) } } : {}),
  });
  if (res.ok) {
    const previous = group.metadata?.lastWelcomeMessageId;
    if (previous && group.clean_service_messages) {
      await telegramRequest(token, "deleteMessage", { chat_id: channel.external_chat_id, message_id: previous });
    }
    await mergeGroupMeta(db, group, { lastWelcomeMessageId: res.data?.message_id ?? null });
  }
  return {
    project_id: channel.project_id,
    group_id: group.id,
    event: res.ok ? "welcomed" : "failed",
    external_user_id: String(user.id),
    username: user.username || "",
    display_name: displayName(user),
    reason: res.ok ? "Welcome message" : "Welcome message failed",
    error: res.ok ? null : friendlyTelegramError(res.error),
  };
}

// chat_member: someone joined or left. Joins through our invite links are attributed to the join link.
async function handleMemberChange(db, { projectId, channel, change, getToken }) {
  const before = change.old_chat_member;
  const after = change.new_chat_member;
  const user = after?.user;
  if (!user || user.is_bot) return { handled: true, action: "ignored" };
  const joined = !isMember(before) && isMember(after);
  const left = isMember(before) && !isMember(after);
  if (!joined && !left) return { handled: true, action: "member_update" };

  let joinLinkId = null;
  if (joined && change.invite_link) {
    joinLinkId = await recordTelegramJoin(db, {
      projectId,
      channel,
      inviteLink: change.invite_link,
      user,
      viaJoinRequest: change.via_join_request,
    });
  }
  if (channel.platform !== "telegram_group") return { handled: true, action: joined ? "joined" : "left", joinLinkId };

  const group = await loadGroup(db, channel.id);
  if (!group) return { handled: true, action: joined ? "joined" : "left", joinLinkId };
  if (!group.metadata?.chatMemberUpdates) await mergeGroupMeta(db, group, { chatMemberUpdates: true });

  const token = await getToken();
  // Our own ban already wrote "banned" to the log.
  if (left && change.from?.id === botIdFromToken(token)) return { handled: true, action: "left" };
  const rows = [
    {
      project_id: projectId,
      group_id: group.id,
      event: joined ? "joined" : "left",
      external_user_id: String(user.id),
      username: user.username || "",
      display_name: displayName(user),
      reason: joined ? (change.invite_link?.name ? `Invite link: ${change.invite_link.name}` : "") : "",
      metadata: joinLinkId ? { joinLinkId } : {},
    },
  ];
  if (joined && group.welcome_enabled && token) {
    const welcome = await sendWelcome(db, { token, channel, group, user });
    if (welcome) rows.push(welcome);
  }
  await logEvents(db, rows);
  return { handled: true, action: joined ? "joined" : "left", joinLinkId };
}

async function adminIds(db, { token, channel, group }) {
  const cached = group.metadata?.adminIds;
  const fresh = group.metadata?.adminIdsAt && Date.now() - new Date(group.metadata.adminIdsAt).getTime() < ADMIN_CACHE_MS;
  if (Array.isArray(cached) && fresh) return new Set(cached.map(String));
  const res = await telegramRequest(token, "getChatAdministrators", { chat_id: channel.external_chat_id });
  if (!res.ok) return new Set((cached || []).map(String));
  const ids = (res.data || []).map((m) => String(m.user?.id)).filter(Boolean);
  await mergeGroupMeta(db, group, { adminIds: ids, adminIdsAt: new Date().toISOString() });
  return new Set(ids);
}

// Deletes the offending message, then warns / mutes / bans per the rule (warnings escalate at the group's limit).
async function enforce(db, { token, channel, group, violation, message, sender }) {
  const { rule, reason, match } = violation;
  const chatId = channel.external_chat_id;
  const text = String(message.text ?? message.caption ?? "");
  const base = {
    project_id: channel.project_id,
    group_id: group.id,
    rule_id: rule.id,
    external_user_id: String(sender.id),
    username: sender.username || "",
    display_name: displayName(sender),
    excerpt: text.slice(0, 280),
    reason: match ? `${reason}: ${String(match).slice(0, 120)}` : reason,
  };
  const rows = [];
  const deleted = await telegramRequest(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
  rows.push({ ...base, event: deleted.ok ? "deleted" : "failed", error: deleted.ok ? null : friendlyTelegramError(deleted.error) });

  let action = rule.action;
  if (action === "warn") {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { count } = await db
      .from("community_group_events")
      .select("id", { count: "exact", head: true })
      .eq("group_id", group.id)
      .eq("external_user_id", String(sender.id))
      .eq("event", "warned")
      .gte("occurred_at", since);
    const warnings = (count || 0) + 1;
    const limit = Math.max(1, Number(group.warn_limit) || 3);
    if (warnings >= limit) {
      action = group.escalation_action === "ban" ? "ban" : "restrict";
    } else {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `${mention(sender)}, your message was removed (${reason.toLowerCase()}). Warning ${warnings} of ${limit}.`,
        disable_notification: true,
      });
      rows.push({ ...base, event: "warned", metadata: { warnings, limit } });
    }
  }
  if (action === "restrict") {
    const minutes = Math.max(1, Number(rule.config?.restrictMinutes) || 60);
    const res = await telegramRequest(token, "restrictChatMember", {
      chat_id: chatId,
      user_id: sender.id,
      permissions: MUTED,
      use_independent_chat_permissions: true,
      until_date: Math.floor(Date.now() / 1000) + minutes * 60,
    });
    if (res.ok) {
      await telegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `${mention(sender)} was muted for ${minutes} minute${minutes === 1 ? "" : "s"} (${reason.toLowerCase()}).`,
        disable_notification: true,
      });
    }
    rows.push({ ...base, event: res.ok ? "restricted" : "failed", error: res.ok ? null : friendlyTelegramError(res.error), metadata: { minutes, escalated: rule.action !== "restrict" } });
  }
  if (action === "ban") {
    const res = await telegramRequest(token, "banChatMember", { chat_id: chatId, user_id: sender.id, revoke_messages: false });
    rows.push({ ...base, event: res.ok ? "banned" : "failed", error: res.ok ? null : friendlyTelegramError(res.error), metadata: { escalated: rule.action !== "ban" } });
  }
  await logEvents(db, rows);
  return { handled: true, action: `moderated:${action}` };
}

async function handleGroupMessage(db, { projectId, channel, message, edited, getToken }) {
  if (message.migrate_to_chat_id) {
    await db.from("community_channels").update({ external_chat_id: String(message.migrate_to_chat_id) }).eq("id", channel.id);
    return { handled: true, action: "migrated" };
  }
  const group = await loadGroup(db, channel.id);
  if (!group) return { handled: false };
  const token = await getToken();
  if (!token) return { handled: true, action: "no_token" };

  // Service messages: optional cleanup, and the welcome fallback when chat_member updates aren't enabled.
  if (message.new_chat_members?.length || message.left_chat_member) {
    if (group.clean_service_messages) {
      await telegramRequest(token, "deleteMessage", { chat_id: channel.external_chat_id, message_id: message.message_id });
    }
    if (message.new_chat_members?.length && !group.metadata?.chatMemberUpdates) {
      const rows = [];
      for (const user of message.new_chat_members) {
        if (user.is_bot) continue;
        rows.push({ project_id: projectId, group_id: group.id, event: "joined", external_user_id: String(user.id), username: user.username || "", display_name: displayName(user) });
        if (group.welcome_enabled) {
          const welcome = await sendWelcome(db, { token, channel, group, user });
          if (welcome) rows.push(welcome);
        }
      }
      await logEvents(db, rows);
    }
    return { handled: true, action: "service_message" };
  }

  const sender = message.from;
  if (!sender || String(sender.id) === String(botIdFromToken(token)) || sender.id === TELEGRAM_SERVICE_USER) {
    return { handled: true, action: "ignored" };
  }
  // Anonymous admins post as the group itself; linked-channel posts arrive as automatic forwards.
  if (message.is_automatic_forward || (message.sender_chat && String(message.sender_chat.id) === String(message.chat.id))) {
    return { handled: true, action: "ignored" };
  }

  const { data: rules } = await db
    .from("group_rules")
    .select("*")
    .eq("group_id", group.id)
    .eq("enabled", true)
    .is("deleted_at", null)
    .order("sort", { ascending: true });
  if (!rules?.length) return { handled: true, action: "none" };
  if (group.exempt_admins) {
    const admins = await adminIds(db, { token, channel, group });
    if (admins.has(String(sender.id))) return { handled: true, action: "admin" };
  }

  let violation = evaluateContentRules(rules, message);
  const flood = rules.find((r) => r.kind === "flood");
  if (!violation && flood && !edited) {
    const perSeconds = Math.max(1, Number(flood.config?.perSeconds) || 10);
    const maxMessages = Math.max(1, Number(flood.config?.maxMessages) || 5);
    const { data: hits, error } = await db.rpc("community_flood_hit", {
      p_project: projectId,
      p_group: group.id,
      p_user: String(sender.id),
      p_window_seconds: perSeconds,
    });
    if (error) console.error("[communities.updates.flood]", error.message);
    if (Number(hits) > maxMessages) violation = { rule: flood, reason: "Flooding", match: `more than ${maxMessages} messages in ${perSeconds}s` };
  }
  if (!violation) return { handled: true, action: "none" };
  return enforce(db, { token, channel, group, violation, message, sender });
}

// message_reaction_count (anonymous reactions on channel posts) and any view counts Telegram includes.
async function handlePostStats(db, { channel, messageId, reactions, views }) {
  const { data: post } = await db
    .from("community_posts")
    .select("id, metadata")
    .eq("channel_id", channel.id)
    .eq("external_message_id", String(messageId))
    .is("deleted_at", null)
    .maybeSingle();
  if (!post) return { handled: true, action: "untracked_post" };
  const patch = {};
  if (Array.isArray(reactions)) {
    patch.reactions = reactions.reduce((sum, r) => sum + (Number(r.total_count) || 0), 0);
    patch.metadata = {
      ...(post.metadata || {}),
      reactionBreakdown: reactions.map((r) => ({ emoji: r.type?.emoji || r.type?.custom_emoji_id || r.type?.type, count: r.total_count })),
    };
  }
  if (Number.isFinite(Number(views))) patch.views = Number(views);
  if (Object.keys(patch).length) await db.from("community_posts").update(patch).eq("id", post.id);
  return { handled: true, action: "post_stats" };
}

export async function handleTelegramCommunityUpdate(db, { projectId, connection, update }) {
  if (!db || !projectId || !update) return { handled: false };
  try {
    const chat = updateChat(update);
    if (!chat || chat.type === "private") return { handled: false };

    const { data: channel } = await db
      .from("community_channels")
      .select("*")
      .eq("project_id", projectId)
      .eq("external_chat_id", String(chat.id))
      .is("deleted_at", null)
      .maybeSingle();

    if (update.my_chat_member) return handleBotStatus(db, { projectId, connection, chat, channel, change: update.my_chat_member });
    if (!channel || channel.status === "pending") return { handled: false };

    let token;
    const getToken = async () => {
      if (token === undefined) {
        const { secrets } = await loadConnection(db, projectId, "telegram", channel.connection_id || connection?.id || null);
        token = botToken(secrets);
      }
      return token;
    };

    if (update.message_reaction_count) {
      const r = update.message_reaction_count;
      return handlePostStats(db, { channel, messageId: r.message_id, reactions: r.reactions });
    }
    const channelPost = update.channel_post || update.edited_channel_post;
    if (channelPost) return handlePostStats(db, { channel, messageId: channelPost.message_id, views: channelPost.views });
    if (update.chat_member) return handleMemberChange(db, { projectId, channel, change: update.chat_member, getToken });

    const message = update.message || update.edited_message;
    if (message && channel.platform === "telegram_group") {
      return handleGroupMessage(db, { projectId, channel, message, edited: Boolean(update.edited_message), getToken });
    }
    return { handled: false };
  } catch (error) {
    console.error("[communities.updates]", error);
    return { handled: false, error: "failed" };
  }
}
