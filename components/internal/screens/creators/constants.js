// Lookups and formatters shared by the Creators screens (config only — rows come from lib/supabase/*).

export {
  DELIVERABLE_KINDS,
  DELIVERABLE_LABELS,
  NETWORKS,
  UGC_KINDS,
  USAGE_CHANNELS,
  USAGE_LABELS,
  PAYOUT_METHODS,
} from "@/lib/creators/labels";
export { FOLLOWER_TIERS } from "@/lib/creators/metrics";

const filterOptions = (map, allLabel) => [
  { value: "all", label: allLabel },
  ...Object.entries(map).map(([value, m]) => ({ value, label: m.label })),
];

// Keyed by creators.status.
export const CREATOR_STATUS_MAP = {
  prospect: { label: "Prospect", variant: "neutral", dotClass: "bg-zinc-400" },
  contacted: { label: "Contacted", variant: "info", dotClass: "bg-sky-400" },
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
  declined: { label: "Declined", variant: "outline", dotClass: "bg-zinc-500" },
};
export const CREATOR_STATUS_OPTIONS = filterOptions(CREATOR_STATUS_MAP, "All statuses");

// Keyed by creator_outreach.status.
export const OUTREACH_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-400" },
  active: { label: "Sending", variant: "success", dotClass: "bg-emerald-400" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
  completed: { label: "Completed", variant: "info", dotClass: "bg-sky-400" },
};
export const OUTREACH_STATUS_OPTIONS = filterOptions(OUTREACH_STATUS_MAP, "All statuses");

// Keyed by creator_outreach_recipients.status (plus "not_started" for creators not yet enrolled).
export const RECIPIENT_STATUS_MAP = {
  not_started: { label: "Not started", variant: "outline", dotClass: "bg-zinc-500" },
  active: { label: "In sequence", variant: "info", dotClass: "bg-sky-400" },
  replied: { label: "Replied", variant: "success", dotClass: "bg-emerald-400" },
  opted_out: { label: "Opted out", variant: "danger", dotClass: "bg-red-400" },
  completed: { label: "Finished", variant: "neutral", dotClass: "bg-zinc-400" },
  stopped: { label: "Stopped", variant: "warning", dotClass: "bg-amber-400" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
};

export const LOG_EVENT_LABELS = {
  sent: "Sent",
  failed: "Failed",
  not_sent: "Not sent",
  replied: "Replied",
  opted_out: "Opted out",
  stopped: "Stopped",
  completed: "Finished",
};

// Keyed by collaborations.status.
export const COLLAB_STATUS_MAP = {
  planned: { label: "Planned", variant: "neutral", dotClass: "bg-zinc-400" },
  active: { label: "In progress", variant: "info", dotClass: "bg-sky-400" },
  in_review: { label: "In review", variant: "warning", dotClass: "bg-amber-400" },
  completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-zinc-500" },
};
export const COLLAB_STATUS_OPTIONS = filterOptions(COLLAB_STATUS_MAP, "All statuses");

export const CONTRACT_STATUS_MAP = {
  draft: { label: "Contract draft", variant: "neutral", dotClass: "bg-zinc-400" },
  sent: { label: "Contract sent", variant: "info", dotClass: "bg-sky-400" },
  signed: { label: "Signed", variant: "success", dotClass: "bg-emerald-400" },
};
export const CONTRACT_STATUS_OPTIONS = filterOptions(CONTRACT_STATUS_MAP, "All contracts");

// Deliverable status; "overdue" is derived from the due date, never stored.
export const DELIVERABLE_STATUS_MAP = {
  pending: { label: "Pending", variant: "neutral", dotClass: "bg-zinc-400" },
  submitted: { label: "Submitted", variant: "info", dotClass: "bg-sky-400" },
  approved: { label: "Approved", variant: "purple", dotClass: "bg-violet-400" },
  live: { label: "Live", variant: "success", dotClass: "bg-emerald-400" },
  overdue: { label: "Overdue", variant: "danger", dotClass: "bg-red-400" },
};
export const DELIVERABLE_STATUSES = ["pending", "submitted", "approved", "live"];

// Keyed by ugc_items.rights_status.
export const RIGHTS_STATUS_MAP = {
  not_requested: { label: "Not requested", variant: "outline", dotClass: "bg-zinc-500" },
  requested: { label: "Requested", variant: "warning", dotClass: "bg-amber-400" },
  granted: { label: "Granted", variant: "success", dotClass: "bg-emerald-400" },
  denied: { label: "Denied", variant: "danger", dotClass: "bg-red-400" },
  expired: { label: "Expired", variant: "neutral", dotClass: "bg-zinc-400" },
};
export const RIGHTS_STATUS_OPTIONS = filterOptions(RIGHTS_STATUS_MAP, "All rights");

export const LINK_STATUS_MAP = {
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
};

export const CONVERSION_STATUS_MAP = {
  pending: { label: "Pending", variant: "warning", dotClass: "bg-amber-400" },
  approved: { label: "Approved", variant: "info", dotClass: "bg-sky-400" },
  paid: { label: "Paid", variant: "success", dotClass: "bg-emerald-400" },
  rejected: { label: "Rejected", variant: "outline", dotClass: "bg-zinc-500" },
};
export const CONVERSION_STATUS_OPTIONS = filterOptions(CONVERSION_STATUS_MAP, "All statuses");

export const ATTRIBUTION_LABELS = {
  code: "Link code",
  cookie: "Link cookie",
  utm: "UTM",
  discount_code: "Discount code",
  click: "Recent click",
};

export const PAYOUT_STATUS_MAP = {
  pending: { label: "Pending", variant: "warning", dotClass: "bg-amber-400" },
  approved: { label: "Approved", variant: "info", dotClass: "bg-sky-400" },
  paid: { label: "Paid", variant: "success", dotClass: "bg-emerald-400" },
};
export const PAYOUT_STATUS_OPTIONS = filterOptions(PAYOUT_STATUS_MAP, "All statuses");

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"];

export const ENGAGEMENT_FILTER_OPTIONS = [
  { value: "all", label: "Any engagement" },
  { value: "1", label: "1%+ engagement" },
  { value: "3", label: "3%+ engagement" },
  { value: "6", label: "6%+ engagement" },
];

// Merge tags an outreach step can use (see lib/creators/email.js creatorMergeData).
export const OUTREACH_MERGE_TAGS = [
  { tag: "{{first_name}}", label: "First name" },
  { tag: "{{name}}", label: "Full name" },
  { tag: "{{handle}}", label: "Primary handle" },
  { tag: "{{brand_name}}", label: "Your brand" },
  { tag: "{{sender_name}}", label: "Sender name" },
];

// --- Formatters ---------------------------------------------------------------------------------

export function formatNumber(value) {
  return value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-US");
}

// 12,400 -> "12.4K"; 1,250,000 -> "1.3M".
export function formatCompact(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

export function formatPercent(value, digits = 1) {
  return value == null || !Number.isFinite(Number(value)) ? "—" : `${Number(value).toFixed(digits)}%`;
}

export function formatMoney(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(Number(value) || 0);
  } catch {
    return `${currency} ${(Number(value) || 0).toFixed(2)}`;
  }
}

export function formatDate(value) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : undefined });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const DAY = 86_400_000;

// Whole days from now to a date ("YYYY-MM-DD" counts to the end of that day).
export function daysUntil(value, now = Date.now()) {
  if (!value) return null;
  const t = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T23:59:59Z`) : Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - now) / DAY);
}

export function relativeDays(value, now = Date.now()) {
  const d = daysUntil(value, now);
  if (d == null) return "";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

// ISO timestamp -> "YYYY-MM-DD" for a date input.
export function toDateInput(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
