// Communities lookups and formatters (config only — rows come from the data layer).

export const POST_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  scheduled: { label: "Scheduled", variant: "info" },
  reminder_sent: { label: "Ready to post", variant: "warning" },
  posted: { label: "Posted", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
};

export const CHANNEL_STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  error: { label: "Needs attention", variant: "danger" },
  pending: { label: "Detected", variant: "info" },
};

export const GROUP_EVENT_MAP = {
  joined: { label: "Joined", variant: "neutral" },
  left: { label: "Left", variant: "neutral" },
  welcomed: { label: "Welcomed", variant: "info" },
  deleted: { label: "Deleted", variant: "warning" },
  warned: { label: "Warned", variant: "warning" },
  restricted: { label: "Muted", variant: "purple" },
  banned: { label: "Banned", variant: "danger" },
  failed: { label: "Failed", variant: "danger" },
};

export const PLATFORM_BADGE = {
  telegram_channel: { label: "Telegram", variant: "info" },
  telegram_group: { label: "Telegram group", variant: "info" },
  whatsapp_channel: { label: "WhatsApp", variant: "success" },
  instagram_broadcast: { label: "Instagram", variant: "purple" },
};

export const POST_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All posts" },
  { value: "upcoming", label: "Upcoming" },
  { value: "posted", label: "Posted" },
  { value: "draft", label: "Drafts" },
  { value: "failed", label: "Failed" },
];

export const CHANNEL_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "error", label: "Needs attention" },
];

export const GROUP_EVENT_FILTER_OPTIONS = [
  { value: "all", label: "All activity" },
  { value: "enforcement", label: "Enforcement" },
  { value: "joins", label: "Joins & welcomes" },
  { value: "failed", label: "Failures" },
];

export const ENFORCEMENT_EVENTS = ["deleted", "warned", "restricted", "banned"];

export const REMINDER_LEAD_OPTIONS = [
  { value: "0", label: "At the scheduled time" },
  { value: "15", label: "15 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

// UTM source presets for join links; free text is allowed too.
export const SOURCE_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "landing_page", label: "Landing page" },
  { value: "link_in_bio", label: "Link in bio" },
  { value: "instagram", label: "Instagram" },
  { value: "qr", label: "QR code" },
  { value: "meta_ads", label: "Paid social" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

export const RANGE_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

export function sourceLabel(value) {
  if (!value) return "Untagged";
  return SOURCE_OPTIONS.find((o) => o.value === value)?.label || value.replace(/_/g, " ");
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export function formatCompact(value) {
  const n = Number(value || 0);
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`;
  return n.toLocaleString("en-US");
}

export function formatPercent(part, whole) {
  if (!whole) return "—";
  return `${((Number(part) / Number(whole)) * 100).toFixed(1)}%`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatRelative(iso, now = Date.now()) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const [value, unit] = abs < hour ? [Math.round(abs / minute), "minute"] : abs < day ? [Math.round(abs / hour), "hour"] : [Math.round(abs / day), "day"];
  if (value === 0) return "just now";
  const label = `${value} ${unit}${value === 1 ? "" : "s"}`;
  return diff < 0 ? `${label} ago` : `in ${label}`;
}

// ISO <-> the "YYYY-MM-DDTHH:mm" local value the date/time field edits.
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
