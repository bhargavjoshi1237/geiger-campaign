// Per-channel sending settings (isomorphic, pure): defaults, normalisation, quiet hours and SMS keyword
// matching. Settings live on the connection row's metadata.settings (written by the channel screens via
// merge_meta); the server-written config/health columns never collide with them.

const SMS_DEFAULTS = {
  optOutKeywords: ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"],
  optInKeywords: ["START", "YES", "UNSTOP"],
  helpKeywords: ["HELP", "INFO"],
  autoReply: true,
  optOutReply: "You're unsubscribed and won't get more messages from us. Reply START to resubscribe.",
  optInReply: "You're resubscribed. Reply STOP to unsubscribe.",
  helpReply: "Reply STOP to unsubscribe or START to resubscribe.",
  appendOptOutNotice: true,
  optOutNotice: "Reply STOP to opt out.",
};

const BASE_DEFAULTS = {
  defaultSender: "",
  replyTo: "",
  quietHours: { enabled: false, start: "21:00", end: "08:00", timezone: "UTC" },
  frequencyCap: { enabled: false, max: 3, days: 7 },
};

const CHANNEL_DEFAULTS = {
  email: {},
  sms: SMS_DEFAULTS,
  whatsapp: {},
  push: { ttlSeconds: 86_400, urgency: "normal" },
  in_app: { defaultExpiryDays: 30 },
};

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// Settings for a connection (raw row or normalized view model), defaults filled in.
export function channelSettings(connection, channel = connection?.channel) {
  const stored = bag(connection?.settings ?? bag(connection?.metadata).settings);
  const defaults = { ...BASE_DEFAULTS, ...(CHANNEL_DEFAULTS[channel] || {}) };
  return {
    ...defaults,
    ...stored,
    quietHours: { ...BASE_DEFAULTS.quietHours, ...bag(stored.quietHours) },
    frequencyCap: { ...BASE_DEFAULTS.frequencyCap, ...bag(stored.frequencyCap) },
  };
}

export function defaultChannelSettings(channel) {
  return channelSettings(null, channel);
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// The local "HH:MM" clock for `at` in `timeZone` (falls back to UTC on an unknown zone).
export function localClock(at = new Date(), timeZone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(at);
  }
}

// True when `at` falls inside the quiet window (windows may wrap midnight, e.g. 21:00–08:00).
export function isQuietTime(settings, at = new Date(), timeZone) {
  const quiet = settings?.quietHours;
  if (!quiet?.enabled) return false;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start == null || end == null || start === end) return false;
  const now = toMinutes(localClock(at, timeZone || quiet.timezone || "UTC"));
  return start < end ? now >= start && now < end : now >= start || now < end;
}

const normalizeKeyword = (text) => String(text || "").trim().toUpperCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();

// "opt_out" | "opt_in" | "help" | null — carriers treat a message that is exactly the keyword as the command.
export function matchSmsKeyword(body, settings = SMS_DEFAULTS) {
  const word = normalizeKeyword(body);
  if (!word) return null;
  const has = (list) => (list || []).some((k) => normalizeKeyword(k) === word);
  if (has(settings.optOutKeywords)) return "opt_out";
  if (has(settings.optInKeywords)) return "opt_in";
  if (has(settings.helpKeywords)) return "help";
  return null;
}

// "STOP, unsubscribe" -> ["STOP", "UNSUBSCRIBE"]
export function parseKeywordList(text) {
  return Array.from(new Set(String(text || "").split(/[,\s]+/).map(normalizeKeyword).filter(Boolean)));
}
