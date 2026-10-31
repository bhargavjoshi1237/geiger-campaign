// Trigger matching (isomorphic, pure): keyword match modes, which automation answers an inbound event and
// reply-variant rotation. The engine and the screens' live previews share it so a preview never disagrees
// with what the engine will do.

import { KIND_CHANNELS } from "./rules";

export const MATCH_MODES = [
  { value: "exact", label: "Exact", hint: "The whole message is the keyword." },
  { value: "contains", label: "Contains", hint: "The keyword appears anywhere, as a whole word." },
  { value: "any", label: "Any message", hint: "Every message or comment matches." },
];

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}\s#@]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The matched keyword ("*" for match mode "any"), or null.
export function matchKeyword(text, keywords = [], mode = "contains") {
  if (mode === "any") return "*";
  const haystack = normalizeText(text);
  if (!haystack) return null;
  for (const raw of keywords || []) {
    const keyword = normalizeText(raw);
    if (!keyword) continue;
    if (mode === "exact" ? haystack === keyword : ` ${haystack} `.includes(` ${keyword} `)) return raw;
  }
  return null;
}

// Is this automation scoped to the post / ad the comment is on?
export function inPostScope(trigger = {}, { postId, adId } = {}) {
  if (adId) {
    if (!trigger.includeAds) return false;
    const adIds = trigger.adIds || [];
    return adIds.length === 0 || adIds.includes(adId);
  }
  if (trigger.allPosts) return true;
  return Boolean(postId) && (trigger.postIds || []).includes(postId);
}

// Event type each kind answers.
const KIND_EVENTS = {
  comment_to_dm: ["comment"],
  story_reply: ["story_reply"],
  story_mention: ["story_mention"],
  keyword: ["message", "postback"],
  welcome: ["message", "postback"],
  default_reply: ["message"],
  referral: ["referral", "message", "postback"],
};

// { matched, keyword } for one automation against one event.
// facts: { channel, connectionId, firstMessage, ref }
export function automationMatches(automation, event, facts = {}) {
  if (!automation || automation.status !== "active") return { matched: false, keyword: null };
  const { kind } = automation;
  const channel = facts.channel;
  if (!(KIND_EVENTS[kind] || []).includes(event?.type)) return { matched: false, keyword: null };
  if (!(KIND_CHANNELS[kind] || []).includes(channel)) return { matched: false, keyword: null };
  if ((automation.channels || []).length && !automation.channels.includes(channel)) return { matched: false, keyword: null };
  const scoped = automation.connectionIds || [];
  if (scoped.length && facts.connectionId && !scoped.includes(facts.connectionId)) return { matched: false, keyword: null };
  const trigger = automation.trigger || {};
  const text = event.type === "postback" ? event.text || event.payload || "" : event.text || "";

  switch (kind) {
    case "comment_to_dm": {
      if (!inPostScope(trigger, event)) return { matched: false, keyword: null };
      const keyword = matchKeyword(text, trigger.keywords, trigger.match || "contains");
      return { matched: Boolean(keyword), keyword };
    }
    case "story_reply": {
      const keyword = matchKeyword(text, trigger.keywords, trigger.match || "any");
      return { matched: Boolean(keyword), keyword };
    }
    case "story_mention":
      return { matched: true, keyword: null };
    case "keyword": {
      const keyword = matchKeyword(text, trigger.keywords, trigger.match === "any" ? "contains" : trigger.match || "contains");
      return { matched: Boolean(keyword), keyword };
    }
    case "welcome":
      return { matched: Boolean(facts.firstMessage), keyword: null };
    case "default_reply":
      return { matched: true, keyword: null };
    case "referral": {
      const ref = facts.ref || event.ref;
      const refs = (trigger.refs || []).map((r) => String(r).toLowerCase());
      return { matched: Boolean(ref) && refs.includes(String(ref).toLowerCase()), keyword: ref || null };
    }
    default:
      return { matched: false, keyword: null };
  }
}

// Lower priority first, then oldest first, so ties resolve the same way every time.
export function rankAutomations(list = []) {
  return [...list].sort(
    (a, b) =>
      (Number(a.priority) || 100) - (Number(b.priority) || 100) ||
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
  );
}

// The first matching automation of the given kinds.
export function findMatch(automations, kinds, event, facts) {
  for (const automation of rankAutomations(automations.filter((a) => kinds.includes(a.kind)))) {
    const result = automationMatches(automation, event, facts);
    if (result.matched) return { automation, keyword: result.keyword };
  }
  return null;
}

// Public replies rotate through the variants in order, driven by how many have been sent.
export function pickVariant(variants = [], counter = 0) {
  const list = (variants || []).map((v) => String(v || "").trim()).filter(Boolean);
  if (!list.length) return null;
  return list[Math.abs(Number(counter) || 0) % list.length];
}

// Replaces {first_name}, {name} and {username} in reply text.
export function personalize(text, { firstName = "", name = "", username = "" } = {}) {
  return String(text || "")
    .replace(/\{\s*first_name\s*\}/gi, firstName || name.split(" ")[0] || "there")
    .replace(/\{\s*name\s*\}/gi, name || firstName || "there")
    .replace(/\{\s*username\s*\}/gi, username ? `@${String(username).replace(/^@/, "")}` : "");
}
