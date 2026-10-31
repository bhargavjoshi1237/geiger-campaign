// Lookups and formatters for the Ads screens (config only — rows come from the data layer).

export const ACCOUNT_STATUS_MAP = {
  connected: { label: "Connected", variant: "success", dotClass: "bg-emerald-500" },
  pending: { label: "Not selected", variant: "warning", dotClass: "bg-amber-500" },
  error: { label: "Needs attention", variant: "danger", dotClass: "bg-red-500" },
  disconnected: { label: "Disconnected", variant: "neutral" },
};

// Meta effective_status values for campaigns, ad sets and ads.
export const DELIVERY_STATUS_MAP = {
  ACTIVE: { label: "Active", variant: "success", dotClass: "bg-emerald-500" },
  PAUSED: { label: "Paused", variant: "neutral" },
  CAMPAIGN_PAUSED: { label: "Campaign paused", variant: "neutral" },
  ADSET_PAUSED: { label: "Ad set paused", variant: "neutral" },
  IN_PROCESS: { label: "Processing", variant: "info", dotClass: "bg-sky-500" },
  PENDING_REVIEW: { label: "In review", variant: "warning", dotClass: "bg-amber-500" },
  PREAPPROVED: { label: "Pre-approved", variant: "info", dotClass: "bg-sky-500" },
  WITH_ISSUES: { label: "With issues", variant: "danger", dotClass: "bg-red-500" },
  DISAPPROVED: { label: "Rejected", variant: "danger", dotClass: "bg-red-500" },
  PENDING_BILLING_INFO: { label: "Billing needed", variant: "warning", dotClass: "bg-amber-500" },
  ARCHIVED: { label: "Archived", variant: "neutral" },
  DELETED: { label: "Deleted", variant: "neutral" },
};

export const CTWA_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  publishing: { label: "Publishing", variant: "info", dotClass: "bg-sky-500" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-500" },
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-500" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-500" },
  archived: { label: "Archived", variant: "neutral" },
};

export const LEAD_FORM_STATUS_MAP = {
  active: { label: "Routing", variant: "success", dotClass: "bg-emerald-500" },
  paused: { label: "Paused", variant: "neutral" },
};

export const AUDIENCE_SYNC_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  queued: { label: "Queued", variant: "info", dotClass: "bg-sky-500" },
  syncing: { label: "Syncing", variant: "info", dotClass: "bg-sky-500" },
  synced: { label: "Synced", variant: "success", dotClass: "bg-emerald-500" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-500" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-500" },
};

export const CAPI_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  active: { label: "Forwarding", variant: "success", dotClass: "bg-emerald-500" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-500" },
  error: { label: "Error", variant: "danger", dotClass: "bg-red-500" },
};

export const CAPI_EVENT_STATUS_MAP = {
  queued: { label: "Queued", variant: "info", dotClass: "bg-sky-500" },
  sent: { label: "Sent", variant: "success", dotClass: "bg-emerald-500" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-500" },
  skipped: { label: "Skipped", variant: "neutral" },
};

export const CREATIVE_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  ready: { label: "Ready", variant: "success", dotClass: "bg-emerald-500" },
  archived: { label: "Archived", variant: "neutral" },
};

export const RULE_STATUS_MAP = {
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-500" },
  paused: { label: "Paused", variant: "neutral" },
};

export const ACTION_SOURCE_LABELS = {
  website: "Website",
  business_messaging: "Business messaging",
  system_generated: "System",
  email: "Email",
  chat: "Chat",
  other: "Other",
};

export const DATE_PRESET_OPTIONS = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_14d", label: "Last 14 days" },
  { value: "last_30d", label: "Last 30 days" },
];

export function formatMoney(value, currency = "USD", { decimals } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  try {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: decimals ?? (Math.abs(n) >= 1000 ? 0 : 2),
      maximumFractionDigits: decimals ?? (Math.abs(n) >= 1000 ? 0 : 2),
    });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-US");
}

export function formatPercent(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return "never";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : formatDate(iso);
}
