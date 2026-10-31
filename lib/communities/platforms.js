// Community platform facts shared by the screens and the server (pure, isomorphic). Telegram is fully
// automated through the open Bot API; WhatsApp Channels and Instagram broadcast channels have no public
// write API, so they are manual-assist: planned here, posted by a person after a reminder.

export const PLATFORMS = {
  telegram_channel: {
    label: "Telegram channel",
    noun: "channel",
    tab: "Telegram Channels",
    automated: true,
    appLabel: "Telegram",
    appUrl: "https://web.telegram.org/",
  },
  telegram_group: {
    label: "Telegram group",
    noun: "group",
    tab: "Groups",
    automated: true,
    appLabel: "Telegram",
    appUrl: "https://web.telegram.org/",
  },
  whatsapp_channel: {
    label: "WhatsApp Channel",
    noun: "channel",
    tab: "WhatsApp Channels",
    automated: false,
    appLabel: "WhatsApp",
    appUrl: "https://web.whatsapp.com/",
    // Where the person posts once reminded.
    postHint: "Post it from the channel in WhatsApp on your phone or WhatsApp Web.",
  },
  instagram_broadcast: {
    label: "Instagram broadcast channel",
    noun: "channel",
    tab: "Instagram Broadcasts",
    automated: false,
    appLabel: "Instagram",
    appUrl: "https://www.instagram.com/direct/inbox/",
    postHint: "Broadcast channels can only be posted to from the Instagram app on a phone.",
  },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS);

export function isTelegramPlatform(platform) {
  return platform === "telegram_channel" || platform === "telegram_group";
}

export function platformLabel(platform) {
  return PLATFORMS[platform]?.label || "Channel";
}

// Workspace URL slug for a sidebar title (mirrors lib/workspace/tabs.js without importing the nav).
export function tabSlug(title) {
  return String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Workspace path to a channel's editor: /project/<id>/<tab>?record=<channel>&section=<section>.
export function channelWorkspacePath(projectId, platform, channelId, section = "") {
  const tab = tabSlug(PLATFORMS[platform]?.tab || "Telegram Channels");
  const query = new URLSearchParams();
  if (channelId) query.set("record", channelId);
  if (section) query.set("section", section);
  const qs = query.toString();
  return `/project/${projectId}/${tab}${qs ? `?${qs}` : ""}`;
}

// The link that opens the platform where the person publishes (the channel itself when known).
export function openInAppUrl(channel) {
  if (channel?.inviteUrl) return channel.inviteUrl;
  if (channel?.handle && isTelegramPlatform(channel.platform)) return `https://t.me/${channel.handle.replace(/^@/, "")}`;
  return PLATFORMS[channel?.platform]?.appUrl || "";
}

// Join-link slugs: lowercase letters, digits and dashes; random ones are 7 characters.
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const RESERVED_SLUGS = new Set(["unavailable", "api", "admin", "new", "edit"]);

export function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Bot-detection for click counting: link unfurlers and crawlers follow the redirect but aren't people.
export const BOT_USER_AGENT = /bot|crawler|spider|preview|facebookexternalhit|slackbot|whatsapp|telegrambot|discordbot|twitterbot|linkedinbot|embedly|quora link|outbrain|pinterest|vkshare|skypeuripreview|headless/i;
