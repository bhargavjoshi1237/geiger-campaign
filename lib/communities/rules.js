// Telegram group moderation rules (pure, isomorphic): the rule catalog the Groups screen edits and the
// evaluator the bot webhook runs. Every action deletes the offending message first; warn / restrict /
// ban then apply to the sender.

export const RULE_KINDS = {
  banned_words: {
    label: "Banned words",
    description: "Delete messages containing any of these words or phrases.",
    defaultAction: "warn",
    defaultConfig: { words: [] },
  },
  block_links: {
    label: "Block links",
    description: "Delete messages with links, except to domains you allow.",
    defaultAction: "delete",
    defaultConfig: { allowDomains: [] },
  },
  flood: {
    label: "Flood limit",
    description: "Stop one member sending too many messages in a short window.",
    defaultAction: "restrict",
    defaultConfig: { maxMessages: 5, perSeconds: 10, restrictMinutes: 10 },
  },
};

export const RULE_ACTIONS = [
  { value: "delete", label: "Delete message" },
  { value: "warn", label: "Delete + warn" },
  { value: "restrict", label: "Delete + mute" },
  { value: "ban", label: "Delete + ban" },
];

// The rule set every newly linked group starts with — all off until the owner turns them on.
export const DEFAULT_GROUP_RULES = Object.entries(RULE_KINDS).map(([kind, meta], i) => ({
  kind,
  name: meta.label,
  enabled: false,
  action: meta.defaultAction,
  config: meta.defaultConfig,
  sort: i,
}));

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+|(?<![@\w.-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|me|ly|gg|xyz|info|biz|app|link|site|online|ru|cn|in)\b(?:\/[^\s<>"']*)?|\bt\.me\/[^\s<>"']+/gi;

function hostOf(value) {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Every link in a Telegram message: url / text_link entities plus a plain-text fallback.
export function extractLinks(message) {
  const text = String(message?.text ?? message?.caption ?? "");
  const entities = [...(message?.entities || []), ...(message?.caption_entities || [])];
  const links = [];
  for (const e of entities) {
    if (e.type === "text_link" && e.url) links.push(e.url);
    if (e.type === "url") links.push(text.slice(e.offset, e.offset + e.length));
  }
  for (const match of text.match(URL_PATTERN) || []) links.push(match);
  return [...new Set(links.map((l) => l.trim()).filter(Boolean))];
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The first banned word / phrase present (case-insensitive, whole words), or null.
export function findBannedWord(text, words = []) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack) return null;
  for (const raw of words) {
    const word = String(raw || "").trim().toLowerCase();
    if (!word) continue;
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}($|[^\\p{L}\\p{N}])`, "u");
    if (pattern.test(haystack)) return raw;
  }
  return null;
}

// The first link whose domain isn't allow-listed (subdomains of an allowed domain pass), or null.
export function findBlockedLink(message, allowDomains = []) {
  const allowed = allowDomains.map((d) => hostOf(String(d).trim())).filter(Boolean);
  for (const link of extractLinks(message)) {
    const host = hostOf(link);
    if (!host) continue;
    if (allowed.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    return link;
  }
  return null;
}

// Content rules in sort order -> the first violation { rule, reason, match } (flood is counted separately).
export function evaluateContentRules(rules, message) {
  const text = String(message?.text ?? message?.caption ?? "");
  for (const rule of rules) {
    if (!rule?.enabled) continue;
    const config = rule.config || {};
    if (rule.kind === "banned_words") {
      const word = findBannedWord(text, Array.isArray(config.words) ? config.words : []);
      if (word) return { rule, reason: "Banned word", match: word };
    }
    if (rule.kind === "block_links") {
      const link = findBlockedLink(message, Array.isArray(config.allowDomains) ? config.allowDomains : []);
      if (link) return { rule, reason: "Link not allowed", match: link };
    }
  }
  return null;
}

// "Welcome {first_name} to {group}!" -> filled. Unknown placeholders stay as typed.
export function renderWelcome(template, { firstName = "", username = "", group = "" } = {}) {
  return String(template || "")
    .replace(/\{first_name\}/g, firstName || "there")
    .replace(/\{username\}/g, username ? `@${username}` : firstName || "there")
    .replace(/\{group\}/g, group || "the group");
}

export function splitList(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
