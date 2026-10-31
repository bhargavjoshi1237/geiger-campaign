// SLA math (isomorphic, pure): business-hours clocks, policy deadlines and the live timer state of a
// conversation. Business hours are { enabled, timezone, days: { mon: { open, start, end }, … } }.

import { formatDuration, MINUTE, toMs } from "./format";

export const WEEKDAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export const DEFAULT_BUSINESS_HOURS = {
  enabled: false,
  timezone: "UTC",
  days: Object.fromEntries(
    WEEKDAYS.map(({ key }) => [key, { open: !["sat", "sun"].includes(key), start: "09:00", end: "17:00" }]),
  ),
};

const DAY_KEY = { Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun" };
const formatters = new Map();

function formatterFor(timeZone) {
  const zone = timeZone || "UTC";
  if (!formatters.has(zone)) {
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    } catch {
      fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    }
    formatters.set(zone, fmt);
  }
  return formatters.get(zone);
}

// Local weekday key + minutes since local midnight for an instant in a time zone.
function localParts(ms, timeZone) {
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hour = Number(get("hour")) % 24;
  return { day: DAY_KEY[get("weekday")] || "mon", minutes: hour * 60 + Number(get("minute") || 0) };
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export function normalizeBusinessHours(value) {
  const v = value && typeof value === "object" ? value : {};
  const days = v.days && typeof v.days === "object" ? v.days : {};
  return {
    enabled: Boolean(v.enabled),
    timezone: v.timezone || "UTC",
    days: Object.fromEntries(
      WEEKDAYS.map(({ key }) => {
        const d = days[key] || DEFAULT_BUSINESS_HOURS.days[key];
        return [key, { open: Boolean(d.open), start: d.start || "09:00", end: d.end || "17:00" }];
      }),
    ),
  };
}

// Minutes left in the open window at this instant, or 0 when closed.
function openMinutesLeft(ms, hours) {
  const { day, minutes } = localParts(ms, hours.timezone);
  const d = hours.days[day];
  if (!d?.open) return 0;
  const start = toMinutes(d.start);
  const end = toMinutes(d.end);
  return minutes >= start && minutes < end ? end - minutes : 0;
}

export function isWithinBusinessHours(hoursValue, at) {
  const hours = normalizeBusinessHours(hoursValue);
  if (!hours.enabled) return true;
  return openMinutesLeft(toMs(at), hours) > 0;
}

// The instant `minutes` of business time after `start` (wall-clock minutes when hours are off).
export function addBusinessMinutes(start, minutes, hoursValue) {
  const startMs = toMs(start);
  const hours = normalizeBusinessHours(hoursValue);
  const total = Math.max(0, Number(minutes) || 0);
  if (!hours.enabled) return new Date(startMs + total * MINUTE).toISOString();
  const anyOpen = Object.values(hours.days).some((d) => d.open && toMinutes(d.end) > toMinutes(d.start));
  if (!anyOpen) return new Date(startMs + total * MINUTE).toISOString();

  let cursor = startMs;
  let remaining = total;
  // Bounded walk: jump through open windows exactly, skip closed time in 15-minute steps (max ~3 weeks).
  for (let guard = 0; guard < 2200 && remaining > 0; guard += 1) {
    const left = openMinutesLeft(cursor, hours);
    if (left > 0) {
      const used = Math.min(left, remaining);
      cursor += used * MINUTE;
      remaining -= used;
    } else {
      cursor += 15 * MINUTE - (cursor % (15 * MINUTE));
    }
  }
  return new Date(cursor).toISOString();
}

// First-response and resolution deadlines for a conversation that started waiting at `start`.
export function slaDeadlines(policy, start) {
  if (!policy) return { slaDueAt: null, resolutionDueAt: null };
  const hours = policy.businessHours ?? policy.business_hours;
  const first = policy.firstResponseMinutes ?? policy.first_response_minutes;
  const resolution = policy.resolutionMinutes ?? policy.resolution_minutes;
  return {
    slaDueAt: first ? addBusinessMinutes(start, first, hours) : null,
    resolutionDueAt: resolution ? addBusinessMinutes(start, resolution, hours) : null,
  };
}

const SOON_MS = 30 * MINUTE;

// Live timer for a conversation view model: which target is running and how it's doing.
// state: none | ok | due_soon | overdue | met
export function slaState(conversation, now) {
  if (!conversation) return { state: "none", target: null, dueAt: null, label: "" };
  const firstDue = conversation.slaDueAt;
  const resolutionDue = conversation.resolutionDueAt;
  if (conversation.status === "resolved") {
    const resolvedAt = toMs(conversation.resolvedAt);
    const missed = resolutionDue && resolvedAt > toMs(resolutionDue);
    return resolutionDue || firstDue
      ? { state: missed ? "overdue" : "met", target: "resolution", dueAt: resolutionDue, label: missed ? "Resolved late" : "SLA met" }
      : { state: "none", target: null, dueAt: null, label: "" };
  }
  const awaitingFirst = !conversation.firstResponseAt && firstDue;
  const dueAt = awaitingFirst ? firstDue : resolutionDue;
  if (!dueAt) return { state: "none", target: null, dueAt: null, label: "" };
  const target = awaitingFirst ? "first_response" : "resolution";
  const left = toMs(dueAt) - now;
  const what = target === "first_response" ? "First reply" : "Resolution";
  if (left < 0) return { state: "overdue", target, dueAt, label: `${what} overdue ${formatDuration(left)}` };
  return {
    state: left <= SOON_MS ? "due_soon" : "ok",
    target,
    dueAt,
    label: `${what} due in ${formatDuration(left)}`,
  };
}
