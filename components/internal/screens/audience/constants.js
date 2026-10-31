// Audience area lookups and formatters (config only — rows come from the data layer).

export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

export const DESTRUCTIVE_GHOST =
  "text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400";

export const DESTRUCTIVE_BUTTON = "bg-red-500/90 text-white hover:bg-red-500";

// Tall dialogs: header and footer stay put while the body scrolls (gutter keeps focus rings unclipped).
export const DIALOG_SCROLL = "max-h-[min(90vh,56rem)] grid-rows-[auto_minmax(0,1fr)_auto]";
export const DIALOG_BODY = "-mx-6 -my-1 grid content-start gap-4 overflow-y-auto px-6 py-1";

export const CONTACT_STATUS_MAP = {
  subscribed: { label: "Subscribed", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  unsubscribed: { label: "Unsubscribed", variant: "neutral" },
  bounced: { label: "Bounced", variant: "danger" },
  complained: { label: "Complained", variant: "danger" },
};

export const CONTACT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(CONTACT_STATUS_MAP).map(([value, { label }]) => ({ value, label })),
];

export const MEMBER_STATUS_MAP = {
  subscribed: { label: "Subscribed", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  unsubscribed: { label: "Unsubscribed", variant: "neutral" },
};

export const CONSENT_STATUS_MAP = {
  opted_in: { label: "Opted in", variant: "success" },
  opted_out: { label: "Opted out", variant: "danger" },
  pending: { label: "Pending", variant: "warning" },
  none: { label: "No record", variant: "neutral", dot: false },
};

export const SUPPRESSION_REASON_MAP = {
  unsubscribed: { label: "Unsubscribed", variant: "neutral" },
  hard_bounce: { label: "Hard bounce", variant: "danger" },
  complaint: { label: "Spam complaint", variant: "warning" },
  manual: { label: "Manual", variant: "purple" },
  invalid: { label: "Invalid address", variant: "danger" },
};

export const SUPPRESSION_KIND_LABELS = { email: "Email", phone: "Phone", domain: "Domain" };

export const TAG_COLOR_OPTIONS = [
  { name: "Emerald", value: "emerald", dot: "bg-emerald-500" },
  { name: "Blue", value: "blue", dot: "bg-blue-500" },
  { name: "Amber", value: "amber", dot: "bg-amber-500" },
  { name: "Violet", value: "violet", dot: "bg-violet-500" },
  { name: "Red", value: "red", dot: "bg-red-500" },
  { name: "Zinc", value: "zinc", dot: "bg-zinc-400" },
];

export const TAG_DOT = Object.fromEntries(TAG_COLOR_OPTIONS.map((c) => [c.value, c.dot]));

export const TRIGGER_LABELS = {
  email_opened: "Opens an email",
  email_clicked: "Clicks an email link",
  event: "Performs a tracked event",
  attribute: "Matches a condition",
};

const DATE_FMT = { month: "short", day: "numeric", year: "numeric" };

export function formatDate(iso) {
  if (!iso) return "—";
  const t = Date.parse(String(iso).length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", DATE_FMT) : "—";
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t)
    ? new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
}

// "3 hours ago" / "2 days ago" relative to `now` (pass it in so renders stay pure).
export function timeAgo(iso, now) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || !now) return "—";
  const diff = Math.max(0, now - t);
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

export const number = (n) => (Number(n) || 0).toLocaleString("en-US");

export const plural = (n, one, many = `${one}s`) => `${number(n)} ${n === 1 ? one : many}`;

export function initials(contact) {
  const a = contact?.firstName?.[0] ?? "";
  const b = contact?.lastName?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || (contact?.email?.[0] ?? contact?.phone?.[0] ?? "?").toUpperCase();
}
