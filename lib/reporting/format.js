// Number, rate and money formatting for reporting surfaces and report emails (pure, isomorphic).

const NUMBER = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const formatNumber = (n) => NUMBER.format(Math.round(Number(n) || 0));

export const formatCompact = (n) => (Math.abs(Number(n) || 0) >= 10000 ? COMPACT.format(Number(n) || 0) : formatNumber(n));

// A 0..1 rate as a percentage; null renders as an em dash (no denominator).
export function formatPercent(rate, digits) {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const pct = rate * 100;
  const d = digits ?? (pct !== 0 && Math.abs(pct) < 1 ? 2 : 1);
  return `${pct.toFixed(d)}%`;
}

export function formatCurrency(value, currency = "USD", { cents } = {}) {
  const n = Number(value) || 0;
  const showCents = cents ?? (Math.abs(n) < 100 && n % 1 !== 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0,
    }).format(n);
  } catch {
    return `${showCents ? n.toFixed(2) : formatNumber(n)} ${currency || ""}`.trim();
  }
}

// Percentage-point difference between two 0..1 rates ("+1.4 pts").
export function formatPts(delta, digits = 1) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const pts = delta * 100;
  const fixed = Math.abs(pts) < 0.1 && pts !== 0 ? pts.toFixed(2) : pts.toFixed(digits);
  return `${pts >= 0 ? "+" : ""}${fixed} pts`;
}

// Relative change between two counts ("+12.5%"); null when there is no baseline.
export function formatChange(current, previous) {
  if (!previous) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
}

// Formats a metric value by its catalog format key.
export function formatMetric(value, format, currency = "USD") {
  if (value == null) return "—";
  if (format === "percent") return formatPercent(value);
  if (format === "currency") return formatCurrency(value, currency);
  if (format === "decimal") return (Number(value) || 0).toFixed(2);
  return formatNumber(value);
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const formatDate = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? DATE.format(new Date(iso)) : "—");
export const formatDateTime = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? DATE_TIME.format(new Date(iso)) : "—");

// "in 3 days", "2 hours ago", "just now".
export function formatRelative(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = t - now;
  const abs = Math.abs(diff);
  const units = [
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms);
      const label = `${n} ${unit}${n === 1 ? "" : "s"}`;
      return diff > 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return "just now";
}

export function hourLabel(h) {
  const hour = ((Number(h) % 24) + 24) % 24;
  return `${String(hour).padStart(2, "0")}:00`;
}
