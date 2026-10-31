// Date ranges and time buckets shared by every reporting surface. Pure and isomorphic (screens, routes,
// the worker); all bucketing happens in the runtime's local time zone.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "14d", label: "Last 14 days", days: 14 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "180d", label: "Last 6 months", days: 180 },
  { value: "365d", label: "Last 12 months", days: 365 },
];

export const DEFAULT_RANGE = "30d";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function isRangeKey(value) {
  return RANGE_OPTIONS.some((o) => o.value === value);
}

export function rangeOption(key) {
  return RANGE_OPTIONS.find((o) => o.value === key) ?? RANGE_OPTIONS.find((o) => o.value === DEFAULT_RANGE);
}

export const rangeDays = (key) => rangeOption(key).days;
export const rangeLabel = (key) => rangeOption(key).label;

// Lower-cased period phrase for footers ("vs previous 30 days").
export const previousLabel = (key) => `vs previous ${rangeOption(key).label.replace(/^Last /, "").toLowerCase()}`;

export function toTime(value) {
  if (!value) return NaN;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : NaN;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - weekdayIndex(d));
  return d;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

// Monday-first weekday index (0 = Mon … 6 = Sun).
export function weekdayIndex(date) {
  return (new Date(date).getDay() + 6) % 7;
}

const BUCKETS_FOR_DAYS = (days) => (days <= 31 ? "day" : days <= 120 ? "week" : "month");

// The current window (today inclusive) plus the equally long window right before it, for deltas.
export function resolveRange(key = DEFAULT_RANGE, now = new Date()) {
  const option = rangeOption(key);
  const end = new Date(now);
  const start = startOfDay(new Date(end.getTime() - (option.days - 1) * DAY));
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start.getTime() - option.days * DAY);
  return { key: option.value, label: option.label, days: option.days, start, end, prevStart, prevEnd, bucket: BUCKETS_FOR_DAYS(option.days) };
}

// The widest of several range keys, so one load covers every widget on a dashboard.
export function widestRange(keys) {
  return (keys || []).filter(isRangeKey).reduce((best, k) => (rangeDays(k) > rangeDays(best) ? k : best), DEFAULT_RANGE);
}

// ISO timestamp to load from so the previous period (for deltas) is covered, plus optional lookback days.
export function loadSince(key, { lookbackDays = 0, now = new Date() } = {}) {
  const range = resolveRange(key, now);
  return new Date(range.prevStart.getTime() - lookbackDays * DAY).toISOString();
}

export function inWindow(value, start, end) {
  const t = toTime(value);
  return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
}

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function bucketKey(value, bucket) {
  const t = toTime(value);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  if (bucket === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (bucket === "week") return dayKey(startOfWeek(d));
  if (bucket === "hour") return `${dayKey(d)}T${pad(d.getHours())}`;
  return dayKey(d);
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

// Ordered, gap-free buckets covering [range.start, range.end].
export function buildBuckets(range, bucket = range.bucket) {
  const out = [];
  let cursor = bucket === "month" ? startOfMonth(range.start) : bucket === "week" ? startOfWeek(range.start) : startOfDay(range.start);
  let guard = 0;
  while (cursor.getTime() <= range.end.getTime() && guard < 800) {
    const next = new Date(cursor);
    if (bucket === "month") next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + (bucket === "week" ? 7 : 1));
    out.push({
      key: bucketKey(cursor, bucket),
      label: bucket === "month" ? MONTH.format(cursor) : DAY_LABEL.format(cursor),
      start: new Date(Math.max(cursor.getTime(), range.start.getTime())),
      end: new Date(Math.min(next.getTime() - 1, range.end.getTime())),
    });
    cursor = next;
    guard += 1;
  }
  return out;
}

export const hoursBetween = (from, to) => (toTime(to) - toTime(from)) / HOUR;
export const daysBetween = (from, to) => (toTime(to) - toTime(from)) / DAY;
export { HOUR, DAY };
