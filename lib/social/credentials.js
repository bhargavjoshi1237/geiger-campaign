import { loadConnection } from "@/lib/messaging/connections";
import { NETWORKS } from "./networks";

// Credentials for a social connection (server-only): the Graph API token + node id for Instagram/Facebook,
// the bot token + channel chat for Telegram. Secrets are written by the Social channels connect flow into
// campaign.channel_secrets; both camelCase and snake_case key spellings are accepted.

const bag = (v) => (v && typeof v === "object" ? v : {});

export function graphAuth(connection, secrets) {
  const cfg = bag(connection?.config);
  const s = bag(secrets);
  const token = s.pageAccessToken || s.page_access_token || s.accessToken || s.access_token || s.token || null;
  const instagramLogin = cfg.loginType === "instagram" || s.loginType === "instagram" || cfg.host === "graph.instagram.com";
  return {
    token,
    host: instagramLogin ? "graph.instagram.com" : "graph.facebook.com",
    nodeId: connection?.external_id || cfg.igUserId || cfg.pageId || null,
  };
}

export function telegramAuth(connection, secrets, override = null) {
  const cfg = bag(connection?.config);
  const s = bag(secrets);
  const chatId = override || cfg.channelChatId || cfg.channelId || cfg.chatId || cfg.channelUsername || null;
  return { token: s.botToken || s.bot_token || s.token || null, chatId };
}

// Loads a connection row + secrets by id for a publishing network; null connection when missing/disconnected.
export async function loadSocialConnection(db, projectId, network, connectionId) {
  const channel = NETWORKS[network]?.channel;
  if (!channel || !connectionId) return { connection: null, secrets: null };
  return loadConnection(db, projectId, channel, connectionId);
}

export function connectionUsable(connection) {
  return Boolean(connection) && connection.status === "connected" && !connection.deleted_at;
}
