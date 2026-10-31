// Display formatters shared by the Data and Integrations screens (pure).

const RTF = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }) : null;

const UNITS = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

// "3 minutes ago", "in 2 hours", "just now"; "Never" for empty.
export function relativeTime(iso, { empty = "Never" } = {}) {
  if (!iso) return empty;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return empty;
  const diff = t - Date.now();
  if (Math.abs(diff) < 45_000) return "just now";
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "minute") {
      const value = Math.round(diff / ms);
      return RTF ? RTF.format(value, unit) : `${Math.abs(value)} ${unit}${Math.abs(value) === 1 ? "" : "s"} ${diff < 0 ? "ago" : "from now"}`;
    }
  }
  return empty;
}

export function formatDate(iso, empty = "—") {
  if (!iso) return empty;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? empty : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso, empty = "—") {
  if (!iso) return empty;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? empty
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export const formatNumber = (n) => Number(n || 0).toLocaleString("en-US");

export const OUTLINE_BUTTON = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

export const DANGER_ICON_BUTTON = "text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400";

export const DANGER_BUTTON = "bg-red-500/90 text-white hover:bg-red-500";

// The browser origin + base path, for snippets that point back at this deployment.
export function appBaseUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
}

export function copyText(text, toast, label = "Copied to clipboard.") {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    toast.error("Clipboard isn't available in this browser.");
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => toast.success(label),
    () => toast.error("Couldn't copy to the clipboard."),
  );
}
