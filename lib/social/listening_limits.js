// Instagram Hashtag Search budget (isomorphic, pure): an account may query at most 30 unique hashtags per rolling
// 7 days, and re-querying a hashtag already in the window is free. Usage is recorded per query in
// metadata.hashtagQueriedAt = { tag: iso }, so the screen and the listening run read the same numbers.

export const HASHTAG_LIMIT = 30;
export const HASHTAG_WINDOW_DAYS = 7;
const WINDOW_MS = HASHTAG_WINDOW_DAYS * 86_400_000;
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function hashtagFor(term) {
  return String(term || "").trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
}

// Unique hashtags a query would search (hashtag source only).
export function queryHashtags(query) {
  const sources = query?.sources?.length ? query.sources : ["hashtags", "tags", "comments"];
  const networks = query?.networks?.length ? query.networks : ["instagram"];
  if (!sources.includes("hashtags") || !networks.includes("instagram")) return [];
  return [...new Set((query?.terms || []).map(hashtagFor).filter(Boolean))];
}

// Hashtags queried inside the rolling window, with when each frees up: Map<tag, releaseAtMs>.
export function hashtagsInWindow(queries, now = Date.now()) {
  const used = new Map();
  for (const q of queries || []) {
    const queried = bag(q?.hashtagQueriedAt ?? bag(q?.metadata).hashtagQueriedAt);
    for (const [tag, at] of Object.entries(queried)) {
      const t = new Date(at).getTime();
      if (!Number.isFinite(t) || now - t >= WINDOW_MS) continue;
      const release = t + WINDOW_MS;
      if (!used.has(tag) || used.get(tag) < release) used.set(tag, release);
    }
  }
  return used;
}

// { used, planned, remaining, overBy, nextReleaseAt }: planned = active queries' hashtags not yet in the window.
export function hashtagBudget(queries, now = Date.now()) {
  const used = hashtagsInWindow(queries, now);
  const planned = new Set();
  for (const q of queries || []) {
    if (q?.active === false) continue;
    for (const tag of queryHashtags(q)) if (!used.has(tag)) planned.add(tag);
  }
  const remaining = Math.max(0, HASHTAG_LIMIT - used.size);
  const releases = [...used.values()].sort((a, b) => a - b);
  return {
    used: used.size,
    usedTags: [...used.keys()],
    planned: planned.size,
    plannedTags: [...planned],
    remaining,
    overBy: Math.max(0, used.size + planned.size - HASHTAG_LIMIT),
    nextReleaseAt: releases.length ? new Date(releases[0]).toISOString() : null,
  };
}
