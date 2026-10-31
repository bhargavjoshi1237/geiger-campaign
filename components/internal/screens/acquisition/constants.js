// Lookups and formatters for the acquisition screens (config, never row data).

export const FORM_STATUS_MAP = {
  live: { label: "Live", variant: "success", dotClass: "bg-emerald-500 dark:bg-emerald-400" },
  draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-400" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-500 dark:bg-amber-400" },
};

export const FORM_KINDS = [
  { value: "embedded", label: "Embedded", tone: "info" },
  { value: "popup", label: "Popup", tone: "purple" },
  { value: "hosted", label: "Hosted", tone: "neutral" },
];
export const FORM_KIND_MAP = Object.fromEntries(FORM_KINDS.map((k) => [k.value, k]));

export const PAGE_STATUS_MAP = {
  published: { label: "Published", variant: "success", dotClass: "bg-emerald-500 dark:bg-emerald-400" },
  draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-400" },
  archived: { label: "Archived", variant: "warning", dotClass: "bg-amber-500 dark:bg-amber-400" },
};

export const POPUP_STATUS_MAP = {
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-500 dark:bg-emerald-400" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-500 dark:bg-amber-400" },
  draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-400" },
};

export const SURVEY_STATUS_MAP = {
  live: { label: "Live", variant: "success", dotClass: "bg-emerald-500 dark:bg-emerald-400" },
  closed: { label: "Closed", variant: "neutral", dotClass: "bg-zinc-400" },
  draft: { label: "Draft", variant: "outline", dotClass: "bg-zinc-400" },
};

export const SUBMISSION_STATUS_MAP = {
  received: { label: "Received", variant: "success", dotClass: "bg-emerald-500 dark:bg-emerald-400" },
  pending_confirmation: { label: "Awaiting confirmation", variant: "warning", dotClass: "bg-amber-500 dark:bg-amber-400" },
  confirmed: { label: "Confirmed", variant: "success", dotClass: "bg-emerald-500 dark:bg-emerald-400" },
};

export const filterOptions = (allLabel, map) => [
  { value: "all", label: allLabel },
  ...Object.entries(map).map(([value, meta]) => ({ value, label: meta.label ?? meta })),
];

export const OUTLINE_BUTTON = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const DESTRUCTIVE_ICON_BUTTON = "text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400";

export const formatNumber = (n) => (Number(n) || 0).toLocaleString("en-US");

// "12.5%" (one decimal under 10%), or "—" when there is nothing to divide by.
export function percent(part, whole) {
  const p = Number(part) || 0;
  const w = Number(whole) || 0;
  if (!w) return "—";
  const value = (p / w) * 100;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

export function formatDate(iso, { time = false } = {}) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function relativeTime(iso) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
