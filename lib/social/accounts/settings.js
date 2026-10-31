import { graphRequest } from "@/lib/social/meta_graph";
import { telegramRequest } from "@/lib/social/telegram";
import { badRequest } from "@/lib/server/http";
import { defaultSettings, LIMITS } from "./catalog";

// Per-connection channel settings (server-only): validation into connection.config.settings and the platform
// sync of conversation starters — Messenger Profile API (ice breakers, persistent menu, greeting) for Messenger
// and Instagram, bot commands + descriptions for Telegram.

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const keywords = (list) =>
  [...new Set((Array.isArray(list) ? list : String(list || "").split(",")).map((k) => String(k).trim()).filter(Boolean))].slice(0, 30);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function sanitizeSettings(channel, input = {}, current = {}) {
  const base = { ...defaultSettings(channel), ...current };
  const out = { ...base };
  if (input.handover) {
    out.handover = {
      keywords: keywords(input.handover.keywords ?? base.handover.keywords),
      message: text(input.handover.message ?? base.handover.message, 640),
      pauseAutomationHours: Math.min(168, Math.max(0, Number(input.handover.pauseAutomationHours ?? base.handover.pauseAutomationHours) || 0)),
    };
  }
  if (input.quietHours) {
    const q = { ...base.quietHours, ...input.quietHours };
    if (!TIME.test(q.start) || !TIME.test(q.end)) throw badRequest("Quiet hours need start and end times like 21:00.");
    out.quietHours = { enabled: Boolean(q.enabled), start: q.start, end: q.end, timezone: text(q.timezone, 64) || "UTC" };
  }
  if ("optOutKeywords" in input) out.optOutKeywords = keywords(input.optOutKeywords).map((k) => k.toUpperCase());
  if ("optInKeywords" in input) out.optInKeywords = keywords(input.optInKeywords).map((k) => k.toUpperCase());

  if ((channel === "instagram" || channel === "messenger") && "iceBreakers" in input) {
    out.iceBreakers = (input.iceBreakers || [])
      .map((b, i) => ({ question: text(b.question, LIMITS.iceBreakerQuestion), payload: text(b.payload, 1000) || `ICE_BREAKER_${i + 1}` }))
      .filter((b) => b.question)
      .slice(0, LIMITS.iceBreakers);
  }
  if ((channel === "instagram" || channel === "messenger") && "persistentMenu" in input) {
    out.persistentMenu = (input.persistentMenu || [])
      .map((item, i) => {
        const title = text(item.title, LIMITS.menuTitle);
        if (item.type === "web_url") {
          const url = text(item.url, 2000);
          if (url && !/^https:\/\//i.test(url)) throw badRequest(`Menu item "${title}" needs an https:// link.`);
          return { type: "web_url", title, url };
        }
        return { type: "postback", title, payload: text(item.payload, 1000) || `MENU_${i + 1}` };
      })
      .filter((item) => item.title && (item.type === "postback" || item.url))
      .slice(0, LIMITS.persistentMenu);
  }
  if (channel === "messenger" && "greeting" in input) out.greeting = text(input.greeting, LIMITS.greeting);
  if (channel === "telegram") {
    if ("commands" in input) {
      out.commands = (input.commands || [])
        .map((c) => ({ command: text(c.command, 32).replace(/^\//, "").toLowerCase(), description: text(c.description, 256) }))
        .filter((c) => /^[a-z0-9_]{1,32}$/.test(c.command) && c.description)
        .slice(0, LIMITS.telegramCommands);
    }
    if ("description" in input) out.description = text(input.description, LIMITS.telegramDescription);
    if ("shortDescription" in input) out.shortDescription = text(input.shortDescription, LIMITS.telegramShortDescription);
  }
  return out;
}

const STARTER_KEYS = ["iceBreakers", "persistentMenu", "greeting", "commands", "description", "shortDescription"];

export function startersChanged(prev = {}, next = {}) {
  return STARTER_KEYS.some((key) => JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null));
}

async function syncMetaProfile(connection, secrets, settings) {
  const token = secrets?.pageAccessToken;
  if (!token) return { ok: false, error: "No Page token is stored. Reconnect the account." };
  const instagram = connection.channel === "instagram";
  const platform = instagram ? { platform: "instagram" } : {};
  const set = {};
  const clear = [];

  if (settings.iceBreakers?.length) {
    set.ice_breakers = [{ locale: "default", call_to_actions: settings.iceBreakers.map((b) => ({ question: b.question, payload: b.payload })) }];
  } else clear.push("ice_breakers");

  if (settings.persistentMenu?.length) {
    set.persistent_menu = [
      {
        locale: "default",
        composer_input_disabled: false,
        call_to_actions: settings.persistentMenu.map((m) =>
          m.type === "web_url" ? { type: "web_url", title: m.title, url: m.url } : { type: "postback", title: m.title, payload: m.payload },
        ),
      },
    ];
  } else clear.push("persistent_menu");

  if (!instagram) {
    if (settings.greeting) set.greeting = [{ locale: "default", text: settings.greeting }];
    else clear.push("greeting");
    // Messenger requires a Get Started button before a persistent menu can show.
    if (set.persistent_menu || set.ice_breakers) set.get_started = { payload: "GET_STARTED" };
  }

  if (Object.keys(set).length) {
    const res = await graphRequest("me/messenger_profile", { token, method: "POST", query: platform, body: { ...platform, ...set } });
    if (!res.ok) return { ok: false, error: res.error };
  }
  if (clear.length) {
    const res = await graphRequest("me/messenger_profile", { token, method: "DELETE", query: platform, body: { ...platform, fields: clear } });
    if (!res.ok) return { ok: false, error: res.error };
  }
  return { ok: true, error: null };
}

async function syncTelegramProfile(secrets, settings) {
  const token = secrets?.botToken;
  if (!token) return { ok: false, error: "No bot token is stored. Add the bot again." };
  const commands = settings.commands?.length
    ? await telegramRequest(token, "setMyCommands", { commands: settings.commands })
    : await telegramRequest(token, "deleteMyCommands", {});
  if (!commands.ok) return { ok: false, error: commands.error };
  const description = await telegramRequest(token, "setMyDescription", { description: settings.description || "" });
  if (!description.ok) return { ok: false, error: description.error };
  const short = await telegramRequest(token, "setMyShortDescription", { short_description: settings.shortDescription || "" });
  if (!short.ok) return { ok: false, error: short.error };
  return { ok: true, error: null };
}

// Pushes conversation starters to the platform: { ok, error, syncedAt }.
export async function syncProfile(connection, secrets, settings) {
  let result = { ok: true, error: null };
  try {
    if (connection.channel === "instagram" || connection.channel === "messenger") result = await syncMetaProfile(connection, secrets, settings);
    else if (connection.channel === "telegram") result = await syncTelegramProfile(secrets, settings);
  } catch (error) {
    console.error("[social.settings.sync]", error);
    result = { ok: false, error: "The platform sync failed unexpectedly." };
  }
  return { ...result, syncedAt: new Date().toISOString() };
}
