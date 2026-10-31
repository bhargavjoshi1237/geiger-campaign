// Report delivery schedules (pure): { frequency: manual|daily|weekly|monthly, hour, weekday (0 = Mon),
// day (1–28), timezone, recipients }. A run is due once per period after the local send time; the worker
// stamps the period key it ran for, so a missed tick catches up within the same period.

import { WEEKDAYS } from "./ranges";

export const FREQUENCIES = [
  { value: "manual", label: "Manual" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validTimezone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normalizeSchedule(input = {}) {
  const frequency = FREQUENCIES.some((f) => f.value === input.frequency) ? input.frequency : "manual";
  const clamp = (v, lo, hi, fallback) => (Number.isInteger(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : fallback);
  const recipients = (Array.isArray(input.recipients) ? input.recipients : [])
    .map((e) => String(e || "").trim().toLowerCase())
    .filter((e) => EMAIL.test(e))
    .slice(0, 20);
  return {
    frequency,
    hour: clamp(input.hour, 0, 23, 9),
    weekday: clamp(input.weekday, 0, 6, 0),
    day: clamp(input.day, 1, 28, 1),
    timezone: validTimezone(input.timezone) ? input.timezone : "UTC",
    recipients: [...new Set(recipients)],
  };
}

export const isValidEmail = (e) => EMAIL.test(String(e || "").trim());

// Local calendar parts of `date` in `timezone`.
export function zonedParts(date, timezone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")) % 24, weekday };
}

const pad = (n) => String(n).padStart(2, "0");

// The period a run at `now` belongs to, or null when this period's send time hasn't come yet.
export function duePeriodKey(schedule, now = new Date()) {
  const s = normalizeSchedule(schedule);
  if (s.frequency === "manual") return null;
  const p = zonedParts(now, s.timezone);
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  if (s.frequency === "daily") return p.hour >= s.hour ? `D:${date}` : null;
  if (s.frequency === "weekly") {
    const reached = p.weekday > s.weekday || (p.weekday === s.weekday && p.hour >= s.hour);
    if (!reached) return null;
    const start = new Date(Date.UTC(p.year, p.month - 1, p.day - p.weekday));
    return `W:${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
  }
  const reached = p.day > s.day || (p.day === s.day && p.hour >= s.hour);
  return reached ? `M:${p.year}-${pad(p.month)}` : null;
}

export function isDue(schedule, lastScheduledKey, now = new Date()) {
  const key = duePeriodKey(schedule, now);
  return key && key !== lastScheduledKey ? key : null;
}

export function describeSchedule(schedule) {
  const s = normalizeSchedule(schedule);
  const at = `${pad(s.hour)}:00`;
  const zone = s.timezone === "UTC" ? "UTC" : s.timezone.replace(/_/g, " ");
  if (s.frequency === "daily") return `Every day at ${at} (${zone})`;
  if (s.frequency === "weekly") return `Every ${WEEKDAYS[s.weekday]} at ${at} (${zone})`;
  if (s.frequency === "monthly") return `Monthly on day ${s.day} at ${at} (${zone})`;
  return "Runs only when you press Run now";
}
