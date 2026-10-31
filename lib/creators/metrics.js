// Audience maths (isomorphic, pure): shared by the Instagram business-discovery refresh on the server
// and manual metric entry in the browser, so both produce the same audience shape.

const round = (value, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

// Follower tiers used by discovery filters and badges.
export const FOLLOWER_TIERS = [
  { value: "nano", label: "Nano · under 10k", min: 0, max: 10_000 },
  { value: "micro", label: "Micro · 10k–100k", min: 10_000, max: 100_000 },
  { value: "mid", label: "Mid · 100k–500k", min: 100_000, max: 500_000 },
  { value: "macro", label: "Macro · 500k–1M", min: 500_000, max: 1_000_000 },
  { value: "mega", label: "Mega · 1M+", min: 1_000_000, max: Infinity },
];

export function followerTier(followers) {
  const n = Number(followers);
  if (!Number.isFinite(n) || n <= 0) return null;
  return FOLLOWER_TIERS.find((t) => n >= t.min && n < t.max)?.value ?? null;
}

// Engagement rate (%) = average interactions per post / followers.
export function engagementRate({ followers, avgLikes, avgComments }) {
  const f = Number(followers);
  const interactions = (Number(avgLikes) || 0) + (Number(avgComments) || 0);
  if (!Number.isFinite(f) || f <= 0 || interactions <= 0) return null;
  return round((interactions / f) * 100, 2);
}

// Summarises recent media ({ like_count, comments_count, timestamp, permalink, media_type }) into
// per-post averages. Posts with hidden like counts are left out of the likes average.
export function summarizeMedia(media = [], followers = 0) {
  const posts = (Array.isArray(media) ? media : []).filter((m) => m && typeof m === "object");
  const liked = posts.filter((m) => Number.isFinite(Number(m.like_count)) && m.like_count != null);
  const commented = posts.filter((m) => Number.isFinite(Number(m.comments_count)) && m.comments_count != null);
  const avgLikes = liked.length ? round(liked.reduce((s, m) => s + Number(m.like_count), 0) / liked.length, 1) : null;
  const avgComments = commented.length
    ? round(commented.reduce((s, m) => s + Number(m.comments_count), 0) / commented.length, 1)
    : null;

  const times = posts.map((m) => Date.parse(m.timestamp)).filter(Number.isFinite).sort((a, b) => b - a);
  const spanWeeks = times.length > 1 ? (times[0] - times[times.length - 1]) / (7 * 86_400_000) : 0;

  return {
    postsSampled: posts.length,
    avgLikes,
    avgComments,
    engagementRate: engagementRate({ followers, avgLikes, avgComments }),
    lastPostAt: times.length ? new Date(times[0]).toISOString() : null,
    postsPerWeek: spanWeeks > 0 ? round((times.length - 1) / spanWeeks, 1) : null,
    recentPosts: posts.slice(0, 12).map((m) => ({
      permalink: m.permalink || "",
      mediaType: m.media_type || "",
      likes: m.like_count == null ? null : Number(m.like_count),
      comments: m.comments_count == null ? null : Number(m.comments_count),
      timestamp: m.timestamp || null,
    })),
  };
}

// The audience bag for metrics a person typed in; engagement is derived when not given.
export function manualAudience({ network = "instagram", followers, engagementRate: rate, avgLikes, avgComments }, now = new Date()) {
  const f = Math.max(0, Math.round(Number(followers) || 0));
  const likes = avgLikes === "" || avgLikes == null ? null : Math.max(0, Number(avgLikes) || 0);
  const comments = avgComments === "" || avgComments == null ? null : Math.max(0, Number(avgComments) || 0);
  const typed = rate === "" || rate == null ? null : Math.max(0, Number(rate) || 0);
  return {
    network,
    followers: f,
    avgLikes: likes,
    avgComments: comments,
    engagementRate: typed ?? engagementRate({ followers: f, avgLikes: likes, avgComments: comments }),
    source: "manual",
    refreshedAt: now.toISOString(),
  };
}

// "@Lena.Rides", "instagram.com/lena.rides/" and "lena.rides" all become "lena.rides"; null when invalid.
export function normalizeHandle(value) {
  let s = String(value ?? "").trim();
  if (!s) return null;
  const fromUrl = s.match(/(?:instagram\.com|tiktok\.com\/@?|youtube\.com\/@?|x\.com|twitter\.com)\/([^/?#]+)/i);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  return /^[a-z0-9._-]{1,60}$/.test(s) ? s : null;
}
