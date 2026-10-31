// Moderation rule evaluation (isomorphic, pure): the deterministic half of comment moderation — keywords,
// regex, links and competitor mentions, scope and allowlist — shared by the server (applyModeration) and
// the rules editor's live tester. AI labels (spam / toxicity / negative) are passed in when the caller
// has classified the comment; without them a rule that only matches on AI reports `needsAi`.

export const AI_LABELS = [
  { key: "spam", label: "Spam" },
  { key: "toxicity", label: "Toxic or hateful" },
  { key: "negative", label: "Negative sentiment" },
];

export const SCOPE_MODES = [
  { value: "allPosts", label: "All posts and ads" },
  { value: "organicOnly", label: "Organic posts only" },
  { value: "adsOnly", label: "Ads only" },
  { value: "postIds", label: "Specific posts" },
];

export const MODERATION_ACTIONS = [
  { value: "hide", label: "Hide comment" },
  { value: "delete", label: "Delete comment" },
  { value: "reply", label: "Reply publicly" },
  { value: "flag", label: "Flag for review" },
];

const MAX_TEXT = 4000;
const MAX_PATTERN = 200;
const LINK_RE = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]{2,}\.(?:com|net|org|io|co|ly|me|shop|store|link|xyz|info|biz|app|site|online|click|top|gg|tv)\b)/i;

const list = (v) => (Array.isArray(v) ? v.map((s) => String(s || "").trim()).filter(Boolean) : []);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const handle = (s) => String(s || "").trim().replace(/^@/, "").toLowerCase();

export function normalizeConditions(conditions) {
  const c = conditions && typeof conditions === "object" ? conditions : {};
  return {
    keywords: list(c.keywords),
    regex: list(c.regex),
    links: Boolean(c.links),
    competitorTerms: list(c.competitorTerms),
    ai: list(c.ai).filter((k) => AI_LABELS.some((l) => l.key === k)),
  };
}

export function normalizeScope(scope) {
  const s = scope && typeof scope === "object" ? scope : {};
  const mode = SCOPE_MODES.some((m) => m.value === s.mode) ? s.mode : "allPosts";
  return { mode, postIds: list(s.postIds) };
}

// Whole-word, case-insensitive phrase match that also works for non-Latin scripts.
export function containsTerm(text, term) {
  const t = String(term || "").trim();
  if (!t) return false;
  try {
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(t)}($|[^\\p{L}\\p{N}_])`, "iu").test(text);
  } catch {
    return String(text).toLowerCase().includes(t.toLowerCase());
  }
}

// Compiles a user pattern safely; returns null (and the reason) when it's invalid or too long.
export function compilePattern(pattern) {
  const p = String(pattern || "");
  if (!p || p.length > MAX_PATTERN) return { re: null, error: p ? "Pattern is longer than 200 characters." : "Empty pattern." };
  try {
    return { re: new RegExp(p, "iu"), error: null };
  } catch (e) {
    return { re: null, error: e?.message || "Invalid pattern." };
  }
}

export function ruleInScope(rule, comment) {
  const scope = normalizeScope(rule?.scope);
  const networks = list(rule?.networks);
  if (networks.length && comment?.network && !networks.includes(comment.network)) return false;
  if (scope.mode === "adsOnly") return Boolean(comment?.isAd);
  if (scope.mode === "organicOnly") return !comment?.isAd;
  if (scope.mode === "postIds") return Boolean(comment?.postId) && scope.postIds.includes(String(comment.postId));
  return true;
}

export function isAllowlisted(rule, comment) {
  const allow = list(rule?.allowlist).map(handle);
  if (!allow.length) return false;
  return [comment?.authorName, comment?.authorHandle, comment?.authorExternalId].some((v) => v && allow.includes(handle(v)));
}

// Evaluates one rule. Conditions are OR-ed: any matching condition fires the rule.
export function evaluateRule(rule, comment, { aiLabels = null } = {}) {
  const text = String(comment?.text || "").slice(0, MAX_TEXT);
  const c = normalizeConditions(rule?.conditions);
  const reasons = [];
  const invalid = [];

  for (const kw of c.keywords) if (containsTerm(text, kw)) reasons.push({ type: "keyword", detail: kw });
  for (const pattern of c.regex) {
    const { re, error } = compilePattern(pattern);
    if (!re) invalid.push({ pattern, error });
    else if (re.test(text)) reasons.push({ type: "regex", detail: pattern });
  }
  if (c.links) {
    const m = text.match(LINK_RE);
    if (m) reasons.push({ type: "link", detail: m[0] });
  }
  for (const term of c.competitorTerms) if (containsTerm(text, term)) reasons.push({ type: "competitor", detail: term });

  let needsAi = false;
  if (c.ai.length) {
    if (aiLabels) {
      for (const label of c.ai) if (aiLabels[label]) reasons.push({ type: "ai", detail: label });
    } else {
      needsAi = true;
    }
  }
  return { matched: reasons.length > 0, reasons, needsAi, invalid };
}

export function ruleUsesAi(rule) {
  return normalizeConditions(rule?.conditions).ai.length > 0;
}

// Active rules in priority order (higher first, then oldest); the first in-scope match decides the action.
export function sortRules(rules) {
  return [...(rules || [])]
    .filter((r) => r && r.active !== false)
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(a.createdAt || a.created_at || "").localeCompare(String(b.createdAt || b.created_at || "")));
}

export function findMatchingRule(rules, comment, { aiLabels = null } = {}) {
  let pendingAi = false;
  for (const rule of sortRules(rules)) {
    if (!ruleInScope(rule, comment) || isAllowlisted(rule, comment)) continue;
    const result = evaluateRule(rule, comment, { aiLabels });
    if (result.matched) return { rule, reasons: result.reasons, needsAi: false };
    if (result.needsAi) pendingAi = true;
  }
  return { rule: null, reasons: [], needsAi: pendingAi };
}

const REASON_LABELS = { keyword: "Keyword", regex: "Pattern", link: "Link", competitor: "Competitor", ai: "AI" };

export function describeReasons(reasons) {
  return (reasons || [])
    .map((r) => `${REASON_LABELS[r.type] || r.type}: ${r.type === "ai" ? AI_LABELS.find((l) => l.key === r.detail)?.label || r.detail : r.detail}`)
    .join(", ");
}

export function describeConditions(conditions) {
  const c = normalizeConditions(conditions);
  const parts = [];
  if (c.keywords.length) parts.push(`${c.keywords.length} keyword${c.keywords.length === 1 ? "" : "s"}`);
  if (c.regex.length) parts.push(`${c.regex.length} pattern${c.regex.length === 1 ? "" : "s"}`);
  if (c.links) parts.push("links");
  if (c.competitorTerms.length) parts.push(`${c.competitorTerms.length} competitor term${c.competitorTerms.length === 1 ? "" : "s"}`);
  if (c.ai.length) parts.push(`AI: ${c.ai.map((k) => AI_LABELS.find((l) => l.key === k)?.label.toLowerCase() || k).join(", ")}`);
  return parts.join(" · ") || "No conditions";
}
