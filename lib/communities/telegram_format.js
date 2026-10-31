// Telegram post formatting and validation (pure, isomorphic): the composer validates with the same
// rules the server publishes with, so a post that saves is a post Telegram accepts.

export const TELEGRAM_LIMITS = Object.freeze({ text: 4096, caption: 1024, buttonText: 64, album: 10, buttons: 8, inviteName: 32 });

export const PARSE_MODES = [
  { value: "none", label: "Plain text" },
  { value: "HTML", label: "HTML" },
  { value: "MarkdownV2", label: "MarkdownV2" },
];

const SEND_METHOD = { photo: ["sendPhoto", "photo"], video: ["sendVideo", "video"], animation: ["sendAnimation", "animation"], document: ["sendDocument", "document"] };

// Asset kind / mime -> Telegram media type.
export function mediaTypeFor(kindOrMime = "") {
  const value = String(kindOrMime).toLowerCase();
  if (value === "gif" || value === "image/gif") return "animation";
  if (value === "image" || value.startsWith("image/")) return "photo";
  if (value === "video" || value.startsWith("video/")) return "video";
  return "document";
}

export function isHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "tg:";
  } catch {
    return false;
  }
}

const cleanButtons = (buttons) =>
  (Array.isArray(buttons) ? buttons : [])
    .map((b) => ({ text: String(b?.text || "").trim(), url: String(b?.url || "").trim() }))
    .filter((b) => b.text || b.url);

// Returns the first problem as a sentence, or null when Telegram will accept the post.
export function validateTelegramPost({ body = "", media = [], buttons = [] } = {}) {
  const text = String(body || "");
  const items = Array.isArray(media) ? media : [];
  const btns = cleanButtons(buttons);
  if (!text.trim() && !items.length) return "Write a message or attach media.";
  if (!items.length && text.length > TELEGRAM_LIMITS.text) return `Messages are limited to ${TELEGRAM_LIMITS.text.toLocaleString("en-US")} characters.`;
  if (items.length && text.length > TELEGRAM_LIMITS.caption) return `Captions on media are limited to ${TELEGRAM_LIMITS.caption.toLocaleString("en-US")} characters.`;
  if (items.length > TELEGRAM_LIMITS.album) return `An album holds at most ${TELEGRAM_LIMITS.album} items.`;
  if (items.some((m) => !/^https?:\/\//i.test(String(m?.url || "")))) return "Every media item needs a public URL.";
  if (items.length > 1 && items.some((m) => mediaTypeFor(m.type) !== "photo" && mediaTypeFor(m.type) !== "video")) {
    return "Albums can only mix photos and videos; send documents on their own.";
  }
  if (items.length > 1 && btns.length) return "Telegram doesn't allow buttons on albums. Attach one item or remove the buttons.";
  if (btns.length > TELEGRAM_LIMITS.buttons) return `Use at most ${TELEGRAM_LIMITS.buttons} buttons.`;
  for (const b of btns) {
    if (!b.text) return "Every button needs a label.";
    if (b.text.length > TELEGRAM_LIMITS.buttonText) return `Button labels are limited to ${TELEGRAM_LIMITS.buttonText} characters.`;
    if (!isHttpsUrl(b.url)) return `"${b.text}" needs a valid link.`;
  }
  return null;
}

// Post -> the Bot API call that publishes it: { method, params } (chat_id added by the caller).
export function buildTelegramRequest(post, defaults = {}) {
  const options = { ...defaults, ...(post?.options || {}) };
  const parseMode = options.parseMode && options.parseMode !== "none" ? options.parseMode : undefined;
  const text = String(post?.body || "");
  const media = Array.isArray(post?.media) ? post.media : [];
  const buttons = cleanButtons(post?.buttons);
  const common = {
    ...(options.silent ? { disable_notification: true } : {}),
    ...(options.protectContent ? { protect_content: true } : {}),
  };
  const keyboard = buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) } } : {};

  if (!media.length) {
    return {
      method: "sendMessage",
      params: {
        text,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(options.disablePreview ? { link_preview_options: { is_disabled: true } } : {}),
        ...common,
        ...keyboard,
      },
    };
  }
  if (media.length === 1) {
    const [method, field] = SEND_METHOD[mediaTypeFor(media[0].type)];
    return {
      method,
      params: {
        [field]: media[0].url,
        ...(text ? { caption: text } : {}),
        ...(parseMode && text ? { parse_mode: parseMode } : {}),
        ...common,
        ...keyboard,
      },
    };
  }
  return {
    method: "sendMediaGroup",
    params: {
      media: media.slice(0, TELEGRAM_LIMITS.album).map((m, i) => ({
        type: mediaTypeFor(m.type) === "video" ? "video" : "photo",
        media: m.url,
        ...(i === 0 && text ? { caption: text, ...(parseMode ? { parse_mode: parseMode } : {}) } : {}),
      })),
      ...common,
    },
  };
}

// "@name", "name", "https://t.me/name" or "-100123…" -> a getChat chat_id; null for invite links / junk.
export function normalizeChatRef(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^-?\d{5,}$/.test(raw)) return raw;
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(.+)$/i);
  const handle = (fromUrl ? fromUrl[1] : raw).replace(/^@/, "").split(/[/?#]/)[0];
  if (!handle || handle.startsWith("+") || handle.toLowerCase() === "joinchat") return null;
  if (!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(handle)) return null;
  return `@${handle}`;
}

// Telegram error description -> a sentence the user can act on.
export function friendlyTelegramError(error) {
  const text = String(error || "");
  if (text === "missing_token") return "The bot's token is missing. Reconnect the bot in Channels → Telegram.";
  if (text === "request_failed") return "Couldn't reach Telegram. Try again in a moment.";
  if (/unauthorized/i.test(text)) return "Telegram rejected the bot token. Reconnect the bot in Channels → Telegram.";
  if (/chat not found/i.test(text)) return "Telegram can't find that chat. Check the @username and that the bot has been added to it.";
  if (/bot is not a member|bot was kicked|bot is not a participant/i.test(text)) return "The bot isn't in this chat. Add it as an admin, then try again.";
  if (/not enough rights|have no rights|administrator rights/i.test(text)) return "The bot is missing an admin right for this. Check its permissions in the chat's admin settings.";
  if (/can't parse entities/i.test(text)) return "Telegram couldn't parse the formatting. Check the HTML / MarkdownV2 markup, or switch to plain text.";
  if (/wrong file identifier|failed to get http url content|wrong type of the web page content/i.test(text)) {
    return "Telegram couldn't download the media. Use a public HTTPS URL to an image or video.";
  }
  if (/too many requests/i.test(text)) return "Telegram is rate-limiting the bot. The post will retry on the next run.";
  return text ? `Telegram: ${text}` : "Telegram rejected the request.";
}
