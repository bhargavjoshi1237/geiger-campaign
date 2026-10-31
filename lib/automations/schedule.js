// Time helpers for the automation engine (isomorphic, pure): zone-aware wall-clock math via Intl, wait
// targets ("next weekday at 09:00"), quiet-hours windows and durations. Invalid time zones fall back to UTC.

import { durationMs } from "./steps.js";

const formatters = new Map();

export function safeTimeZone(timeZone) {
  const tz = String(timeZone || "").trim();
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
      }),
    );
  }
  return formatters.get(timeZone);
}

const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Wall-clock parts of `date` in `timeZone`; weekday is ISO (1 = Monday … 7 = Sunday).
export function zonedParts(date, timeZone = "UTC") {
  const parts = Object.fromEntries(formatterFor(safeTimeZone(timeZone)).formatToParts(new Date(date)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY[parts.weekday] || 1,
  };
}

// Milliseconds the zone is ahead of UTC at `date`.
function offsetAt(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(new Date(date).getTime() / 1000) * 1000;
}

// The instant a wall-clock time happens in `timeZone` (DST gaps resolve forward).
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = "UTC") {
  const tz = safeTimeZone(timeZone);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - offsetAt(guess, tz);
  return new Date(guess - offsetAt(first, tz));
}

export function parseTime(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export function addDuration(date, amount, unit) {
  return new Date(new Date(date).getTime() + durationMs(amount, unit));
}

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + (Number(days) || 0) * 86_400_000);
}

// "YYYY-MM-DD" for `date` in `timeZone`.
export function localDate(date, timeZone = "UTC") {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Calendar arithmetic on a "YYYY-MM-DD" string.
export function shiftDate(isoDate, days) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + (Number(days) || 0) * 86_400_000);
  return t.toISOString().slice(0, 10);
}

// Local minutes since midnight in `timeZone`.
export function localMinutes(date, timeZone = "UTC") {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

// The next instant at or after `now` that falls on one of `weekdays` at `time` (local to `timeZone`).
export function nextWeekdayTime(now, { weekdays = [1, 2, 3, 4, 5, 6, 7], time = "09:00" } = {}, timeZone = "UTC") {
  const tz = safeTimeZone(timeZone);
  const allowed = new Set((Array.isArray(weekdays) && weekdays.length ? weekdays : [1, 2, 3, 4, 5, 6, 7]).map(Number));
  const at = parseTime(time) || { hour: 9, minute: 0 };
  const start = new Date(now);
  const today = localDate(start, tz);
  for (let i = 0; i <= 7; i += 1) {
    const day = shiftDate(today, i);
    const [year, month, d] = day.split("-").map(Number);
    const weekday = ((new Date(Date.UTC(year, month - 1, d)).getUTCDay() + 6) % 7) + 1;
    if (!allowed.has(weekday)) continue;
    const candidate = zonedTimeToUtc({ year, month, day: d, hour: at.hour, minute: at.minute }, tz);
    if (candidate.getTime() >= start.getTime()) return candidate;
  }
  return addDays(start, 7);
}

// When the current quiet window ends, or null when `now` isn't inside { start, end } (local to `timeZone`).
export function quietHoursEnd(now, { start, end } = {}, timeZone = "UTC") {
  const s = parseTime(start);
  const e = parseTime(end);
  if (!s || !e) return null;
  const tz = safeTimeZone(timeZone);
  const m = localMinutes(now, tz);
  const startM = s.hour * 60 + s.minute;
  const endM = e.hour * 60 + e.minute;
  if (startM === endM) return null;
  const inside = startM < endM ? m >= startM && m < endM : m >= startM || m < endM;
  if (!inside) return null;
  const today = localDate(now, tz);
  const day = m < endM ? today : shiftDate(today, 1);
  const [year, month, d] = day.split("-").map(Number);
  return zonedTimeToUtc({ year, month, day: d, hour: e.hour, minute: e.minute }, tz);
}
