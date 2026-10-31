// Commerce lookups and formatters (config, never row data). Status maps feed StatusPill / Badge.

export const PLATFORM_MAP = {
  shopify: { label: "Shopify", variant: "success" },
  woocommerce: { label: "WooCommerce", variant: "purple" },
  custom: { label: "Custom", variant: "neutral" },
};

export const STORE_STATUS_MAP = {
  pending: { label: "Awaiting events", variant: "warning" },
  connected: { label: "Connected", variant: "success" },
  error: { label: "Error", variant: "danger" },
};

export const PRODUCT_STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  draft: { label: "Draft", variant: "neutral" },
  archived: { label: "Archived", variant: "neutral" },
};

export const ORDER_STATUS_MAP = {
  pending: { label: "Pending", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  fulfilled: { label: "Fulfilled", variant: "info" },
  partially_refunded: { label: "Partly refunded", variant: "warning" },
  refunded: { label: "Refunded", variant: "neutral" },
  cancelled: { label: "Cancelled", variant: "danger" },
};

export const CART_STATUS_MAP = {
  active: { label: "In progress", variant: "neutral" },
  abandoned: { label: "Abandoned", variant: "warning" },
  recovered: { label: "Recovered", variant: "success" },
  converted: { label: "Converted", variant: "info" },
};

export const COUPON_KIND_MAP = {
  percent: { label: "Percentage", variant: "purple" },
  fixed: { label: "Fixed amount", variant: "warning" },
  free_shipping: { label: "Free shipping", variant: "info" },
};

export const COUPON_STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  paused: { label: "Paused", variant: "warning" },
  expired: { label: "Expired", variant: "neutral" },
  used_up: { label: "Used up", variant: "neutral" },
};

export const STRATEGY_MAP = {
  bestsellers: { label: "Best sellers", variant: "success" },
  trending: { label: "Trending", variant: "warning" },
  also_bought: { label: "Also bought", variant: "purple" },
  recently_viewed: { label: "Recently viewed", variant: "info" },
  new_arrivals: { label: "New arrivals", variant: "neutral" },
  category: { label: "Category", variant: "neutral" },
};

export const RULE_STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
};

export const PLACEMENT_OPTIONS = [
  { value: "campaign_email", label: "Campaign email" },
  { value: "cart_email", label: "Abandoned cart email" },
  { value: "browse_email", label: "Browse abandonment email" },
  { value: "post_purchase", label: "Post-purchase email" },
];

export const PLACEMENT_LABEL = Object.fromEntries(PLACEMENT_OPTIONS.map((p) => [p.value, p.label]));

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "INR", "BRL"];

export const ABANDON_AFTER_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "240", label: "4 hours" },
  { value: "720", label: "12 hours" },
  { value: "1440", label: "24 hours" },
];

export const toFilterOptions = (map, allLabel) => [
  { value: "all", label: allLabel },
  ...Object.entries(map).map(([value, meta]) => ({ value, label: meta.label })),
];

export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

export const DANGER_ICON_BUTTON =
  "text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400";

export const DANGER_BUTTON = "bg-red-500/90 text-white hover:bg-red-500";

export function money(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
  } catch {
    return `${(Number(value) || 0).toFixed(2)} ${currency}`;
  }
}

// Whole-unit money for KPI tiles.
export function moneyShort(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
  } catch {
    return `${Math.round(Number(value) || 0)} ${currency}`;
  }
}

export const count = (n) => Number(n || 0).toLocaleString("en-US");

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
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = now - t;
  const future = diff < 0;
  const minutes = Math.round(Math.abs(diff) / 60_000);
  let label;
  if (minutes < 1) return "just now";
  if (minutes < 60) label = `${minutes}m`;
  else if (minutes < 60 * 24) label = `${Math.round(minutes / 60)}h`;
  else if (minutes < 60 * 24 * 30) label = `${Math.round(minutes / 1440)}d`;
  else return formatDate(iso);
  return future ? `in ${label}` : `${label} ago`;
}

// <input type="date"> value <-> ISO timestamp (start of that day, local time).
export function isoToDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateInputToIso(value, endOfDay = false) {
  if (!value) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "—";
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const daysAgoIso = (days) => new Date(Date.now() - days * 86_400_000).toISOString();
