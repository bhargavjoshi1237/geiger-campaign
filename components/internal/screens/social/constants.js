// Social area lookups and formatters (config only — rows come from the data layer).

export const POST_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  in_review: { label: "In review", variant: "warning" },
  approved: { label: "Approved", variant: "info" },
  scheduled: { label: "Scheduled", variant: "purple" },
  publishing: { label: "Publishing", variant: "info" },
  published: { label: "Published", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
};

export const TARGET_STATUS_MAP = {
  pending: { label: "Pending", variant: "neutral" },
  publishing: { label: "Publishing", variant: "info" },
  published: { label: "Published", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export const POST_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(POST_STATUS_MAP).map(([value, { label }]) => ({ value, label })),
];

export const NETWORK_FILTER_OPTIONS = [
  { value: "all", label: "All networks" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook Page" },
  { value: "telegram", label: "Telegram" },
];

export const MODERATION_ACTION_MAP = {
  hide: { label: "Hide", variant: "warning" },
  unhide: { label: "Unhide", variant: "neutral" },
  delete: { label: "Delete", variant: "danger" },
  reply: { label: "Reply", variant: "info" },
  flag: { label: "Flag", variant: "purple" },
};

export const LOG_STATUS_MAP = {
  done: { label: "Done", variant: "success" },
  flagged: { label: "Flagged", variant: "purple" },
  failed: { label: "Failed", variant: "danger" },
};

export const COMMENT_STATE_MAP = {
  visible: { label: "Visible", variant: "neutral" },
  hidden: { label: "Hidden", variant: "warning" },
  deleted: { label: "Deleted", variant: "danger" },
  replied: { label: "Replied", variant: "info" },
  flagged: { label: "Flagged", variant: "purple" },
};

export const COMMENT_STATE_FILTER_OPTIONS = [
  { value: "all", label: "All comments" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "deleted", label: "Deleted" },
  { value: "flagged", label: "Flagged" },
  { value: "replied", label: "Replied" },
];

export const SENTIMENT_MAP = {
  positive: { label: "Positive", variant: "success" },
  neutral: { label: "Neutral", variant: "neutral" },
  negative: { label: "Negative", variant: "danger" },
  unclassified: { label: "Unclassified", variant: "outline", dot: false },
};

export const SENTIMENT_FILTER_OPTIONS = [
  { value: "all", label: "All sentiment" },
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
  { value: "unclassified", label: "Unclassified" },
];

export const MENTION_SOURCE_LABELS = {
  hashtag_recent: "Hashtag · recent",
  hashtag_top: "Hashtag · top",
  tag: "Tagged",
  comment: "Comment",
};

export const BIO_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  published: { label: "Published", variant: "success" },
};

export const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export const OUTLINE_BUTTON = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelative(iso, now = Date.now()) {
  if (!iso) return "—";
  const diff = now - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const future = diff < 0;
  const abs = Math.abs(diff);
  const units = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      return future ? `in ${n}${label}` : `${n}${label} ago`;
    }
  }
  return future ? "in a moment" : "just now";
}

export function formatNumber(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US");
}

export function compactNumber(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n));
}

export function formatPercent(ratio, digits = 1) {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

const pad = (n) => String(n).padStart(2, "0");

// ISO <-> the value of an <input type="datetime-local"> in the viewer's timezone.
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function excerpt(text, length = 90) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > length ? `${t.slice(0, length - 1)}…` : t;
}
