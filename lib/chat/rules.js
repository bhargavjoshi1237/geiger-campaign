// Chat automation platform rules (isomorphic, pure): which channel supports which trigger, the guardrails
// the engine enforces (with the platform rule each one implements), opt-out / handover vocabulary, quiet
// hours and entry-point deep links. The screens import this to explain what the engine does.

export const CHAT_CHANNELS = ["instagram", "messenger", "whatsapp", "telegram", "tiktok"];

// Payload of the "Talk to a person" quick reply every automated message with reply options carries.
export const HUMAN_PAYLOAD = "GC_HUMAN";
export const DEFAULT_HANDOVER_LABEL = "Talk to a person";

// Meta allows one private reply per comment, within 7 days of it.
export const PRIVATE_REPLY_MAX_AGE_DAYS = 7;

// Platform limits the editors enforce on reply options and buttons.
export const QUICK_REPLY_TITLE_MAX = 20;
export const MAX_REPLY_OPTIONS = { instagram: 12, messenger: 12, whatsapp: 2, telegram: 8, tiktok: 0 };

// What each official API supports. TikTok's DM API has no comment trigger; Telegram has no comments or stories.
export const CHANNEL_CAPABILITIES = {
  instagram: { comments: true, stories: true, mentions: true, refLinks: true, windowHours: 24 },
  messenger: { comments: true, stories: false, mentions: false, refLinks: true, windowHours: 24 },
  whatsapp: { comments: false, stories: false, mentions: false, refLinks: true, windowHours: 24 },
  telegram: { comments: false, stories: false, mentions: false, refLinks: true, windowHours: null },
  tiktok: { comments: false, stories: false, mentions: false, refLinks: false, windowHours: null },
};

// Channels each automation kind can run on.
export const KIND_CHANNELS = {
  comment_to_dm: ["instagram", "messenger"],
  story_reply: ["instagram"],
  story_mention: ["instagram"],
  keyword: CHAT_CHANNELS,
  welcome: CHAT_CHANNELS,
  default_reply: CHAT_CHANNELS,
  referral: ["instagram", "messenger", "whatsapp", "telegram"],
};

// Kinds whose automated DM counts against the one-per-person-per-24h cap.
export const CAPPED_KINDS = new Set(["comment_to_dm", "story_reply", "story_mention"]);

// The guardrails, each with the rule it implements. `enforcedBy: "platform"` cannot be switched off.
export const GUARDRAILS = [
  {
    key: "window",
    label: "24-hour messaging window",
    enforcedBy: "platform",
    channels: ["instagram", "messenger", "whatsapp"],
    rule: "Meta lets a business message someone for 24 hours after their last message, a comment that triggers a DM, a story reply or a mention. WhatsApp needs an approved template outside that window.",
    behaviour: "Sends that would land outside the window are blocked and logged with the reason; nothing is retried under a different tag.",
  },
  {
    key: "dm_cap",
    label: "One automated DM per person per 24 hours",
    enforcedBy: "platform",
    kinds: ["comment_to_dm", "story_reply", "story_mention"],
    channels: ["instagram", "messenger"],
    rule: "Comment and story triggers may send at most one automated DM to the same person in 24 hours.",
    behaviour: "The engine claims a per-person slot before sending. A second trigger inside 24 hours still records the comment but sends no DM.",
  },
  {
    key: "private_reply",
    label: "One private reply per comment",
    enforcedBy: "platform",
    kinds: ["comment_to_dm"],
    channels: ["instagram", "messenger"],
    rule: "Instagram and Facebook allow a single private reply to a comment, within 7 days of it.",
    behaviour: "Each comment is replied to privately once. Comments older than 7 days are skipped.",
  },
  {
    key: "handover",
    label: "Human handover path",
    enforcedBy: "platform",
    channels: ["instagram", "messenger", "whatsapp"],
    rule: "Every automated Meta experience must offer a clear path to a human agent.",
    behaviour: "Messages with reply options always include “Talk to a person”, and asking for a human at any point pauses the bot and assigns the conversation.",
  },
  {
    key: "opt_out",
    label: "Opt-out keywords",
    enforcedBy: "platform",
    rule: "People must be able to stop automated messages. STOP, UNSUBSCRIBE and the other opt-out words are always honoured.",
    behaviour: "An opt-out is written to the consent ledger, one confirmation is sent and every automation for that person on that channel stops. START opts back in.",
  },
  {
    key: "quiet_hours",
    label: "Quiet hours",
    enforcedBy: "workspace",
    rule: "Optional. Automated replies due in quiet hours wait until they end.",
    behaviour: "Queued replies are sent when quiet hours end, or skipped if the messaging window would close first.",
  },
];

export function guardrailsFor({ kind = null, channels = [] } = {}) {
  return GUARDRAILS.filter((g) => {
    if (g.kinds && kind && !g.kinds.includes(kind)) return false;
    if (g.kinds && !kind) return false;
    if (g.channels && channels.length && !channels.some((c) => g.channels.includes(c))) return false;
    return true;
  });
}

// Opt-out / opt-in words match the whole message (so "cancel my order" is not an opt-out).
export const OPT_OUT_KEYWORDS = ["stop", "stopall", "stop all", "unsubscribe", "cancel", "end", "quit", "opt out", "optout"];
export const OPT_IN_KEYWORDS = ["start", "unstop", "subscribe", "opt in", "optin"];

// Single words count only as the whole message; phrases count anywhere in it.
const HANDOVER_WORDS = ["human", "agent", "person", "operator", "representative", "staff", "humano", "agente"];
const HANDOVER_PHRASES = [
  "talk to a human",
  "talk to a person",
  "talk to someone",
  "speak to a human",
  "speak to a person",
  "speak to someone",
  "real person",
  "live agent",
  "customer service",
  "customer support",
  "talk to an agent",
  "speak to an agent",
];

const squash = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function isOptOut(text) {
  const t = squash(text);
  return Boolean(t) && OPT_OUT_KEYWORDS.includes(t);
}

export function isOptIn(text) {
  const t = squash(text).replace(/^\/?/, "");
  return Boolean(t) && OPT_IN_KEYWORDS.includes(t);
}

export function isHandoverRequest(text, payload = null) {
  if (payload === HUMAN_PAYLOAD) return true;
  const t = squash(text);
  if (!t) return false;
  if (HANDOVER_WORDS.includes(t)) return true;
  return HANDOVER_PHRASES.some((p) => ` ${t} `.includes(` ${p} `));
}

// Keyword-based negative sentiment, used when no AI reading is available.
const NEGATIVE_WORDS = [
  "angry", "furious", "terrible", "awful", "horrible", "worst", "useless", "scam", "fraud", "ripoff", "rip off",
  "disappointed", "disgusted", "unacceptable", "ridiculous", "refund", "complaint", "complain", "broken",
  "never again", "hate", "rude", "lied", "waste of money", "not working", "doesnt work", "still waiting",
];

export function looksNegative(text) {
  const t = ` ${squash(text).replace(/'/g, "")} `;
  return NEGATIVE_WORDS.some((w) => t.includes(` ${w} `));
}

// Quiet hours: { enabled, start: "21:00", end: "08:00", timezone }. Returns whether `now` is inside and when it ends.
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};

function localMinutes(now, timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(now));
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    return hour * 60 + minute;
  } catch {
    const d = new Date(now);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

export function quietHoursState(config, now = Date.now()) {
  if (!config?.enabled) return { inQuiet: false, endsAt: null };
  const start = toMinutes(config.start);
  const end = toMinutes(config.end);
  if (start == null || end == null || start === end) return { inQuiet: false, endsAt: null };
  const local = localMinutes(now, config.timezone);
  const inQuiet = start < end ? local >= start && local < end : local >= start || local < end;
  if (!inQuiet) return { inQuiet: false, endsAt: null };
  const minutesLeft = (end - local + 1440) % 1440 || 1440;
  return { inQuiet: true, endsAt: new Date(new Date(now).getTime() + minutesLeft * 60_000).toISOString() };
}

// Entry-point refs: the characters every platform accepts in ?ref= / ?start=.
export function normalizeRef(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 64);
}

// Deep link for an entry point on a channel: ig.me / m.me (?ref=), t.me (?start=), wa.me (prefilled text carrying the ref).
export function buildEntryLink({ channel, handle, ref, prefill = "" }) {
  const cleanHandle = String(handle || "").trim().replace(/^@/, "");
  const cleanRef = normalizeRef(ref);
  if (!cleanHandle) return "";
  switch (channel) {
    case "instagram":
      return `https://ig.me/m/${encodeURIComponent(cleanHandle)}${cleanRef ? `?ref=${cleanRef}` : ""}`;
    case "messenger":
      return `https://m.me/${encodeURIComponent(cleanHandle)}${cleanRef ? `?ref=${cleanRef}` : ""}`;
    case "telegram":
      return `https://t.me/${encodeURIComponent(cleanHandle)}${cleanRef ? `?start=${cleanRef}` : ""}`;
    case "whatsapp": {
      const phone = cleanHandle.replace(/[^\d]/g, "");
      if (!phone) return "";
      const text = [prefill.trim(), cleanRef ? `[${cleanRef}]` : ""].filter(Boolean).join(" ");
      return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
    }
    default:
      return "";
  }
}

// The ref carried by a wa.me prefilled message ("Hi! [SPRING26]").
export function refFromText(text) {
  const match = String(text || "").match(/\[([A-Za-z0-9_-]{1,64})\]/);
  return match ? match[1] : null;
}
