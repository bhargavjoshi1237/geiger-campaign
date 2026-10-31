// Social network capabilities (isomorphic, pure): which networks Geiger can publish to, the channel
// connection that backs each, per-network caption limits and formats, and the validation the composer
// shows and the publisher enforces. Limits follow each platform's published API documentation.

export const NETWORKS = {
  instagram: {
    key: "instagram",
    label: "Instagram",
    channel: "instagram",
    publishable: true,
    charLimit: 2200,
    hashtagLimit: 30,
    mentionLimit: 20,
    formats: ["feed", "carousel", "reel", "story"],
    firstComment: true,
    altText: true,
    requiresMedia: true,
    maxMedia: 10,
  },
  facebook: {
    key: "facebook",
    label: "Facebook Page",
    channel: "messenger",
    publishable: true,
    charLimit: 63206,
    formats: ["feed"],
    firstComment: true,
    altText: true,
    requiresMedia: false,
    maxMedia: 10,
  },
  telegram: {
    key: "telegram",
    label: "Telegram channel",
    channel: "telegram",
    publishable: true,
    charLimit: 4096,
    captionLimit: 1024,
    formats: ["feed"],
    firstComment: false,
    altText: false,
    requiresMedia: false,
    maxMedia: 10,
  },
  tiktok: { key: "tiktok", label: "TikTok", channel: "tiktok", publishable: false, charLimit: 2200, formats: ["reel"] },
  linkedin: { key: "linkedin", label: "LinkedIn", channel: null, publishable: false, charLimit: 3000, formats: ["feed"] },
  x: { key: "x", label: "X", channel: null, publishable: false, charLimit: 280, formats: ["feed"] },
  threads: { key: "threads", label: "Threads", channel: null, publishable: false, charLimit: 500, formats: ["feed"] },
  pinterest: { key: "pinterest", label: "Pinterest", channel: null, publishable: false, charLimit: 500, formats: ["feed"] },
  youtube: { key: "youtube", label: "YouTube", channel: null, publishable: false, charLimit: 5000, formats: ["reel"] },
};

export const NETWORK_ORDER = ["instagram", "facebook", "telegram", "tiktok", "linkedin", "x", "threads", "pinterest", "youtube"];
export const PUBLISHABLE_NETWORKS = NETWORK_ORDER.filter((key) => NETWORKS[key].publishable);

export const FORMAT_LABELS = { feed: "Feed post", carousel: "Carousel", reel: "Reel", story: "Story" };

// channel_connections.channel -> publishing network (the Messenger connection is the Facebook Page).
export function networkForChannel(channel) {
  if (channel === "messenger") return "facebook";
  return NETWORKS[channel] ? channel : null;
}

export function networkLabel(network) {
  return NETWORKS[network]?.label || network || "Unknown";
}

// Code points, which is how Instagram, Facebook and Telegram count caption characters.
export function charCount(text) {
  return [...String(text || "")].length;
}

export function countHashtags(text) {
  return (String(text || "").match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

export function countMentions(text) {
  return (String(text || "").match(/(^|\s)@[\w.]+/g) || []).length;
}

export function normalizeTag(tag) {
  const clean = String(tag || "").trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
  return clean ? `#${clean}` : "";
}

// The caption a target publishes: its variant (or the post body) plus the hashtag set when placed in the caption.
export function composeCaption(text, tags = [], placement = "caption") {
  const base = String(text || "").trim();
  if (placement !== "caption" || !tags.length) return base;
  const line = tags.map(normalizeTag).filter(Boolean).join(" ");
  return line ? `${base}${base ? "\n\n" : ""}${line}` : base;
}

export function composeFirstComment(firstComment, tags = [], placement = "caption") {
  const base = String(firstComment || "").trim();
  if (placement !== "first_comment" || !tags.length) return base;
  const line = tags.map(normalizeTag).filter(Boolean).join(" ");
  return line ? `${base}${base ? "\n\n" : ""}${line}` : base;
}

const isPublicUrl = (url) => /^https?:\/\//i.test(String(url || ""));

// Sensible default format for a network given the attached media.
export function defaultFormat(network, media = []) {
  if (network !== "instagram") return "feed";
  if (media.length > 1) return "carousel";
  if (media.length === 1 && media[0]?.kind === "video") return "reel";
  return "feed";
}

// Formats the network accepts for this media set.
export function allowedFormats(network, media = []) {
  const meta = NETWORKS[network];
  if (!meta) return [];
  if (network !== "instagram") return meta.formats;
  const videos = media.filter((m) => m.kind === "video").length;
  const out = [];
  if (media.length === 1 && videos === 0) out.push("feed");
  if (media.length >= 2) out.push("carousel");
  if (media.length === 1 && videos === 1) out.push("reel");
  if (media.length === 1) out.push("story");
  return out.length ? out : ["feed"];
}

// Problems that block publishing (errors) or deserve a look (warnings) for one target.
export function validateTarget({ network, format, text, media = [], firstComment = "" }) {
  const meta = NETWORKS[network];
  const issues = [];
  if (!meta) return [{ level: "error", message: "Unknown network." }];
  if (!meta.publishable) issues.push({ level: "error", message: `Publishing to ${meta.label} isn't available.` });

  const length = charCount(text);
  const limit = network === "telegram" && media.length ? meta.captionLimit : meta.charLimit;
  if (length > limit) issues.push({ level: "error", message: `${length.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")} characters — shorten the ${media.length && network === "telegram" ? "caption" : "text"}.` });
  if (!length && !media.length) issues.push({ level: "error", message: "Add text or media." });

  if (meta.hashtagLimit && countHashtags(text) > meta.hashtagLimit) {
    issues.push({ level: "error", message: `${meta.label} allows at most ${meta.hashtagLimit} hashtags.` });
  }
  if (meta.mentionLimit && countMentions(text) > meta.mentionLimit) {
    issues.push({ level: "error", message: `${meta.label} allows at most ${meta.mentionLimit} @mentions.` });
  }
  if (media.some((m) => !isPublicUrl(m.url))) {
    issues.push({ level: "error", message: "Media must be served from a public URL (use the asset library)." });
  }
  if (meta.maxMedia && media.length > meta.maxMedia) {
    issues.push({ level: "error", message: `${meta.label} takes at most ${meta.maxMedia} media items.` });
  }

  if (network === "instagram") {
    if (!media.length) issues.push({ level: "error", message: "Instagram posts need an image or video." });
    if (media.length && !allowedFormats(network, media).includes(format)) {
      issues.push({ level: "error", message: `${FORMAT_LABELS[format] || format} doesn't fit this media — pick ${allowedFormats(network, media).map((f) => FORMAT_LABELS[f]).join(" or ")}.` });
    }
    if (format === "feed" && media[0]?.kind === "video") {
      issues.push({ level: "error", message: "Instagram publishes single videos as Reels." });
    }
    if (format === "story" && length) issues.push({ level: "warning", message: "Stories don't show captions." });
  }
  if (network === "facebook") {
    const videos = media.filter((m) => m.kind === "video").length;
    if (videos > 1) issues.push({ level: "error", message: "Facebook Pages publish one video per post." });
    if (videos && media.length > videos) issues.push({ level: "error", message: "Facebook can't mix photos and a video in one post." });
  }
  if (network === "telegram" && media.length === 1 && media[0]?.kind !== "image" && media[0]?.kind !== "video") {
    issues.push({ level: "error", message: "Telegram posts take images or videos." });
  }

  if (firstComment && !meta.firstComment) {
    issues.push({ level: "warning", message: `${meta.label} doesn't support a first comment — it will be skipped.` });
  }
  if (meta.altText && media.some((m) => m.kind === "image" && !String(m.altText || "").trim())) {
    issues.push({ level: "warning", message: "Some images have no alt text." });
  }
  return issues;
}

export function hasBlockingIssues(issues) {
  return issues.some((i) => i.level === "error");
}
