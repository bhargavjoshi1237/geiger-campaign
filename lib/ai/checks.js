// Deterministic copy checks (isomorphic, pure): length and inbox-preview truncation, spam-trigger phrases,
// personalization tokens, emoji, shouting and punctuation. They run on AI output and on anything a user
// types, with or without an LLM configured. Each check is { key, label, status: pass|warn|fail|info, detail }.

// Phrases content filters and recipients associate with spam; a hit is a warning, not a verdict.
export const SPAM_TRIGGER_PHRASES = [
  "100% free",
  "act now",
  "apply now",
  "buy now",
  "cash bonus",
  "click here",
  "congratulations",
  "double your",
  "earn money",
  "extra cash",
  "free gift",
  "free money",
  "guaranteed",
  "limited time only",
  "lowest price",
  "make money",
  "miracle",
  "no catch",
  "no cost",
  "no obligation",
  "order now",
  "risk-free",
  "risk free",
  "special promotion",
  "this isn't spam",
  "urgent",
  "winner",
  "you have been selected",
  "$$$",
];

// Approximate subject characters visible before truncation in common inbox lists.
export const SUBJECT_PREVIEW_LIMITS = [
  { key: "gmail_web", label: "Gmail (web)", limit: 70 },
  { key: "gmail_app", label: "Gmail app", limit: 40 },
  { key: "ios_mail", label: "iOS Mail", limit: 41 },
];

// Approximate preheader characters shown after the subject.
export const PREHEADER_PREVIEW_LIMITS = [
  { key: "gmail_web", label: "Gmail (web)", limit: 100 },
  { key: "ios_mail", label: "iOS Mail", limit: 90 },
];

export const CONTENT_TYPES = [
  { value: "email", label: "Email body" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp message" },
  { value: "push", label: "Push notification" },
  { value: "social", label: "Social post" },
  { value: "ad", label: "Ad primary text" },
];

// Hard or recommended limits per content type (chars), with the reason shown to the user.
const CONTENT_LIMITS = {
  whatsapp: { limit: 1024, detail: "WhatsApp template bodies are capped at 1,024 characters." },
  push: { limit: 120, detail: "Lock screens show roughly the first 120 characters." },
  social: { limit: 2200, detail: "Instagram captions are capped at 2,200 characters; ~125 show before “more”." },
  ad: { limit: 125, detail: "Meta recommends primary text under 125 characters before truncation." },
};

export const BASE_MERGE_TOKENS = ["first_name", "last_name", "email", "phone"];

const TOKEN = /\{\{\s*([\w.]+)(?:\|([^}]*))?\s*\}\}/g;
const EMOJI = /\p{Extended_Pictographic}/gu;
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function countEmoji(text) {
  return (String(text || "").match(EMOJI) || []).length;
}

export function findSpamPhrases(text) {
  const haystack = String(text || "").toLowerCase();
  return SPAM_TRIGGER_PHRASES.filter((phrase) => {
    if (!/^[\w\s'-]+$/.test(phrase)) return haystack.includes(phrase);
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(phrase)}([^a-z0-9]|$)`, "i").test(haystack);
  });
}

// { key, fallback, known } for every {{token}} in the text.
export function findTokens(text, knownTokens = BASE_MERGE_TOKENS) {
  const known = new Set(knownTokens);
  const out = [];
  for (const match of String(text || "").matchAll(TOKEN)) {
    const key = match[1];
    const bare = key.startsWith("contact.") ? key.slice(8) : key;
    out.push({ key, fallback: match[2] ?? null, known: known.has(key) || known.has(bare) });
  }
  return out;
}

// Characters a recipient actually sees, with tokens replaced by their fallback (or a typical first name).
export function renderedLength(text) {
  return String(text || "").replace(TOKEN, (_, key, fallback) => fallback ?? (key.includes("first") ? "Alex" : "xxxxx")).length;
}

function shoutingWords(text) {
  return (String(text || "").match(/\b[A-Z]{3,}\b/g) || []).filter((w) => !/^(SMS|USA|FAQ|VIP|CEO|RSVP|PDF|URL|API)$/.test(w));
}

function tokenChecks(tokens) {
  if (!tokens.length) return [];
  const unknown = tokens.filter((t) => !t.known);
  const noFallback = tokens.filter((t) => t.known && t.fallback == null);
  const checks = [];
  if (unknown.length) {
    checks.push({
      key: "tokens",
      label: "Personalization",
      status: "fail",
      detail: `Unknown merge tag${unknown.length > 1 ? "s" : ""} ${unknown.map((t) => `{{${t.key}}}`).join(", ")} — it would render empty.`,
    });
  } else if (noFallback.length) {
    checks.push({
      key: "tokens",
      label: "Personalization",
      status: "warn",
      detail: `Add a fallback for contacts without data, e.g. {{${noFallback[0].key}|there}}.`,
    });
  } else {
    checks.push({ key: "tokens", label: "Personalization", status: "pass", detail: "Merge tags are valid and have fallbacks." });
  }
  return checks;
}

function hygieneChecks(text) {
  const checks = [];
  const spam = findSpamPhrases(text);
  checks.push(
    spam.length
      ? { key: "spam", label: "Spam triggers", status: "warn", detail: `Contains ${spam.map((s) => `“${s}”`).join(", ")}.` }
      : { key: "spam", label: "Spam triggers", status: "pass", detail: "No common spam-trigger phrases." },
  );
  const emoji = countEmoji(text);
  if (emoji > 2) checks.push({ key: "emoji", label: "Emoji", status: "warn", detail: `${emoji} emoji — more than two reads as noisy.` });
  else if (emoji) checks.push({ key: "emoji", label: "Emoji", status: "info", detail: `${emoji} emoji.` });
  const shouting = shoutingWords(text);
  if (shouting.length >= 2) checks.push({ key: "caps", label: "All caps", status: "warn", detail: `${shouting.length} all-caps words (${shouting.slice(0, 3).join(", ")}).` });
  if (/[!?]{2,}/.test(text) || (String(text).match(/!/g) || []).length > 2) {
    checks.push({ key: "punctuation", label: "Punctuation", status: "warn", detail: "Repeated ! or ? marks look like spam." });
  }
  return checks;
}

// Subject (+ optional preheader) checks with per-client truncation previews.
export function checkSubject(subject, { preheader = "", knownTokens = BASE_MERGE_TOKENS } = {}) {
  const value = String(subject || "").trim();
  const length = renderedLength(value);
  const tokens = findTokens(`${value} ${preheader}`, knownTokens);
  const truncation = SUBJECT_PREVIEW_LIMITS.map((c) => ({ ...c, truncated: length > c.limit }));
  const checks = [];

  if (!value) checks.push({ key: "length", label: "Length", status: "fail", detail: "The subject is empty." });
  else if (length > 70) checks.push({ key: "length", label: "Length", status: "warn", detail: `${length} characters — cut off in every inbox.` });
  else if (length > 41) checks.push({ key: "length", label: "Length", status: "warn", detail: `${length} characters — cut off on most phones (≈40 visible).` });
  else if (length < 10) checks.push({ key: "length", label: "Length", status: "warn", detail: `${length} characters — very short subjects carry little context.` });
  else checks.push({ key: "length", label: "Length", status: "pass", detail: `${length} characters — fully visible on phones and desktop.` });

  const pre = String(preheader || "").trim();
  if (pre) {
    const preLength = renderedLength(pre);
    const cut = PREHEADER_PREVIEW_LIMITS.filter((c) => preLength > c.limit);
    checks.push(
      cut.length
        ? { key: "preheader", label: "Preheader", status: "info", detail: `${preLength} characters — trimmed in ${cut.map((c) => c.label).join(" and ")}.` }
        : { key: "preheader", label: "Preheader", status: "pass", detail: `${preLength} characters — shown in full.` },
    );
    if (pre.toLowerCase() === value.toLowerCase()) {
      checks.push({ key: "preheader_repeat", label: "Preheader", status: "warn", detail: "Repeats the subject — use it to add a second reason to open." });
    }
  }

  checks.push(...tokenChecks(tokens), ...hygieneChecks(`${value} ${pre}`));
  return { length, emoji: countEmoji(value), tokens, truncation, checks };
}

// SMS segments: GSM-7 fits 160 chars (153 per part when split); anything else is UCS-2 at 70 (67 per part).
export function smsSegments(text) {
  const value = String(text || "");
  const gsm = GSM7.test(value);
  const extended = gsm ? (value.match(/[\^{}\\[~\]|€]/g) || []).length : 0;
  const units = gsm ? value.length + extended : [...value].length;
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return { encoding: gsm ? "GSM-7" : "Unicode", units, segments: units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi) };
}

// Body copy checks for a content type (see CONTENT_TYPES).
export function checkCopy(text, { contentType = "email", knownTokens = BASE_MERGE_TOKENS } = {}) {
  const value = String(text || "").trim();
  const length = renderedLength(value);
  const words = value ? value.split(/\s+/).length : 0;
  const checks = [];

  if (!value) {
    checks.push({ key: "length", label: "Length", status: "fail", detail: "The copy is empty." });
  } else if (contentType === "sms") {
    const sms = smsSegments(value);
    checks.push({
      key: "length",
      label: "Segments",
      status: sms.segments > 2 ? "warn" : sms.segments > 1 ? "info" : "pass",
      detail: `${sms.units} ${sms.encoding} characters — ${sms.segments} segment${sms.segments === 1 ? "" : "s"}, each billed by your provider.`,
    });
    if (!/stop/i.test(value)) checks.push({ key: "optout", label: "Opt-out", status: "info", detail: "Marketing SMS usually needs opt-out wording (e.g. “Reply STOP to opt out”)." });
  } else if (CONTENT_LIMITS[contentType]) {
    const { limit, detail } = CONTENT_LIMITS[contentType];
    checks.push({
      key: "length",
      label: "Length",
      status: length > limit ? (contentType === "whatsapp" ? "fail" : "warn") : "pass",
      detail: `${length} / ${limit} characters. ${detail}`,
    });
  } else {
    checks.push({
      key: "length",
      label: "Length",
      status: words > 300 ? "warn" : "pass",
      detail: words > 300 ? `${words} words — long promotional emails lose readers; aim for under 300.` : `${words} words.`,
    });
  }

  checks.push(...tokenChecks(findTokens(value, knownTokens)), ...hygieneChecks(value));
  return { length, words, emoji: countEmoji(value), checks, sms: contentType === "sms" ? smsSegments(value) : null };
}

// Worst status across checks, for a one-glance badge.
export function overallStatus(checks = []) {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}
