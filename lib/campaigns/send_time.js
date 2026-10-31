// Send-time math (isomorphic, pure): time-zone conversion without a library, deterministic hashing,
// per-contact open-hour profiles, the due-time planners the sender uses for each strategy, and the
// analysis behind the Send-Time Optimization screen. Opens are profiled by UTC hour so a contact's
// habit is comparable across time zones; display converts to the workspace zone.

export const DEFAULT_SEND_TIME = Object.freeze({
  enabled: false,
  strategy: "optimized",
  fallbackHour: 10,
  windowHours: 24,
  minOpens: 2,
  localTime: "09:00",
});

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const HOUR_MS = 3_600_000;

// --- Time zones -------------------------------------------------------------------

const formatters = new Map();

function formatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

// A valid IANA zone, or the fallback.
export function safeTimeZone(timeZone, fallback = "UTC") {
  if (!timeZone || typeof timeZone !== "string") return fallback;
  try {
    formatter(timeZone);
    return timeZone;
  } catch {
    return fallback;
  }
}

// Wall-clock parts of an instant in a zone; weekday 0 = Monday.
export function zonedParts(date, timeZone = "UTC") {
  const parts = {};
  for (const { type, value } of formatter(safeTimeZone(timeZone)).formatToParts(new Date(date))) parts[type] = value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getUTCMilliseconds());
}

// The instant a wall-clock time occurs in a zone (DST-safe for real times; gaps roll forward).
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone = "UTC") {
  const zone = safeTimeZone(timeZone);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), zone);
  return new Date(guess - offsetMs(new Date(first), zone));
}

// Current UTC offset of a zone in hours (e.g. -4 for New York in summer).
export function zoneOffsetHours(timeZone, at = new Date()) {
  return offsetMs(new Date(at), safeTimeZone(timeZone)) / HOUR_MS;
}

// "09:30" -> { hour: 9, minute: 30 }; invalid input -> the fallback.
export function parseLocalTime(value, fallback = { hour: 9, minute: 0 }) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallback;
  return { hour, minute };
}

// The first instant at or after `from` when the zone's clock reads hour:minute.
export function nextLocalOccurrence(from, { hour, minute = 0 }, timeZone = "UTC") {
  const start = new Date(from);
  const p = zonedParts(start, timeZone);
  let at = zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour, minute }, timeZone);
  if (at < start) {
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    at = zonedTimeToUtc(
      { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour, minute },
      timeZone,
    );
  }
  return at;
}

// Moves an instant out of quiet hours ({ start: "21:00", end: "08:00" }, recipient-local) to their end.
export function applyQuietHours(at, quietHours, timeZone = "UTC") {
  if (!quietHours?.start || !quietHours?.end) return new Date(at);
  const startT = parseLocalTime(quietHours.start, null);
  const endT = parseLocalTime(quietHours.end, null);
  if (!startT || !endT) return new Date(at);
  const p = zonedParts(at, timeZone);
  const minutes = p.hour * 60 + p.minute;
  const s = startT.hour * 60 + startT.minute;
  const e = endT.hour * 60 + endT.minute;
  const quiet = s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
  return quiet ? nextLocalOccurrence(at, endT, timeZone) : new Date(at);
}

// --- Deterministic hashing ----------------------------------------------------------

// FNV-1a over the string -> [0, 1). Same input, same bucket, on every run.
export function hashUnit(value, salt = "") {
  let h = 0x811c9dc5;
  const input = `${salt}:${value}`;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

// --- Open profiles ----------------------------------------------------------------------

const field = (row, snake, camel) => row?.[snake] ?? row?.[camel] ?? null;

// Delivery rows (snake or camel) -> per-contact and workspace open counts by UTC hour.
export function buildOpenProfiles(rows = []) {
  const byContact = new Map();
  const workspace = new Array(24).fill(0);
  let total = 0;
  for (const row of rows) {
    const openedAt = field(row, "opened_at", "openedAt");
    if (!openedAt) continue;
    const time = Date.parse(openedAt);
    if (Number.isNaN(time)) continue;
    const hour = new Date(time).getUTCHours();
    workspace[hour] += 1;
    total += 1;
    const contactId = field(row, "contact_id", "contactId");
    if (!contactId) continue;
    let profile = byContact.get(contactId);
    if (!profile) {
      profile = { counts: new Array(24).fill(0), total: 0 };
      byContact.set(contactId, profile);
    }
    profile.counts[hour] += 1;
    profile.total += 1;
  }
  return { byContact, workspace, total };
}

// Neighbouring hours count half, so one stray open doesn't dominate a sparse profile.
function smooth(counts) {
  return counts.map((c, h) => c + 0.5 * (counts[(h + 23) % 24] + counts[(h + 1) % 24]));
}

function normalize(counts) {
  const max = Math.max(...counts, 0);
  return max ? counts.map((c) => c / max) : counts.map(() => 0);
}

// The best-scoring hour slot inside [start, start + windowHours); earliest wins ties.
function bestSlot(scores, start, windowHours) {
  const startMs = new Date(start).getTime();
  const hourStart = startMs - (startMs % HOUR_MS);
  let best = { k: 0, score: -1 };
  for (let k = 0; k < Math.max(1, windowHours); k += 1) {
    const hour = new Date(hourStart + k * HOUR_MS).getUTCHours();
    if (scores[hour] > best.score + 1e-9) best = { k, score: scores[hour] };
  }
  return { at: best.k === 0 ? new Date(startMs) : new Date(hourStart + best.k * HOUR_MS), score: best.score };
}

// Spreads sends across the chosen hour (0-50 min) so one slot doesn't fire as a single burst.
function spread(at, contactId, start) {
  const time = new Date(at).getTime();
  if (time <= new Date(start).getTime()) return new Date(time);
  return new Date(time + Math.floor(hashUnit(contactId, "sto-minute") * 50) * 60_000);
}

// Per-recipient optimized send instant: the contact's own habit, else the workspace's, else the fallback hour.
export function optimizedDueAt({ contactId, start, profiles, settings = DEFAULT_SEND_TIME, timeZone = "UTC" }) {
  const windowHours = Math.max(1, Number(settings.windowHours) || DEFAULT_SEND_TIME.windowHours);
  const minOpens = Math.max(1, Number(settings.minOpens) || DEFAULT_SEND_TIME.minOpens);
  const workspace = normalize(smooth(profiles?.workspace || new Array(24).fill(0)));
  const own = profiles?.byContact?.get(contactId);
  if (own && own.total >= minOpens) {
    const mine = normalize(smooth(own.counts));
    const { at } = bestSlot(mine.map((v, h) => v + 0.2 * workspace[h]), start, windowHours);
    return { at: spread(at, contactId, start), source: "contact" };
  }
  if ((profiles?.total || 0) >= 20) {
    const { at } = bestSlot(workspace, start, windowHours);
    return { at: spread(at, contactId, start), source: "workspace" };
  }
  const fallback = nextLocalOccurrence(start, { hour: Number(settings.fallbackHour ?? 10), minute: 0 }, timeZone);
  const inWindow = fallback.getTime() - new Date(start).getTime() <= windowHours * HOUR_MS;
  return { at: inWindow ? spread(fallback, contactId, start) : new Date(start), source: "fallback" };
}

// Recipient-time-zone send instant: localTime on `date` ({ year, month, day }) in their zone, or the next
// occurrence after `start` when no date is fixed. Times already past go out at `start`.
export function localTimeDueAt({ start, localTime, date = null, timeZone = "UTC" }) {
  const time = parseLocalTime(localTime);
  const at = date ? zonedTimeToUtc({ ...date, ...time }, timeZone) : nextLocalOccurrence(start, time, timeZone);
  return at < new Date(start) ? new Date(start) : at;
}

// --- Analysis (Send-Time Optimization screen) ----------------------------------------

const TIME_TO_OPEN = [
  { key: "lt1h", label: "< 1h", max: 1 },
  { key: "1to3h", label: "1–3h", max: 3 },
  { key: "3to6h", label: "3–6h", max: 6 },
  { key: "6to12h", label: "6–12h", max: 12 },
  { key: "12to24h", label: "12–24h", max: 24 },
  { key: "1to3d", label: "1–3d", max: 72 },
  { key: "gt3d", label: "> 3d", max: Infinity },
];

// Email delivery rows (snake or camel) -> heatmap, coverage, recommended windows and time-to-open.
export function analyzeSendTimes(rows = [], { timeZone = "UTC", minOpens = DEFAULT_SEND_TIME.minOpens } = {}) {
  const zone = safeTimeZone(timeZone);
  const heatmap = WEEKDAYS.map(() => new Array(24).fill(0));
  const hours = new Array(24).fill(0);
  const timeToOpen = TIME_TO_OPEN.map((b) => ({ key: b.key, label: b.label, count: 0 }));
  const minutesToOpen = [];
  const reached = new Set();
  let delivered = 0;
  let opened = 0;

  const sendable = rows.filter((row) => {
    const source = field(row, "source_type", "sourceType");
    const status = field(row, "status", "status");
    return source !== "test" && !["queued", "failed", "not_sent", "bounced"].includes(status);
  });

  for (const row of sendable) {
    delivered += 1;
    const contactId = field(row, "contact_id", "contactId");
    if (contactId) reached.add(contactId);
    const openedAt = field(row, "opened_at", "openedAt");
    if (!openedAt) continue;
    const time = Date.parse(openedAt);
    if (Number.isNaN(time)) continue;
    opened += 1;
    const p = zonedParts(time, zone);
    heatmap[p.weekday][p.hour] += 1;
    hours[p.hour] += 1;
    const sentAt = Date.parse(field(row, "sent_at", "sentAt") || "");
    if (!Number.isNaN(sentAt) && time >= sentAt) {
      const elapsedHours = (time - sentAt) / HOUR_MS;
      minutesToOpen.push(elapsedHours * 60);
      timeToOpen[TIME_TO_OPEN.findIndex((b) => elapsedHours < b.max)].count += 1;
    }
  }

  const profiles = buildOpenProfiles(sendable);
  const offset = zoneOffsetHours(zone);
  const learnedHours = new Array(24).fill(0);
  let withHistory = 0;
  for (const profile of profiles.byContact.values()) {
    if (profile.total < minOpens) continue;
    withHistory += 1;
    const smoothed = smooth(profile.counts);
    const utcHour = smoothed.indexOf(Math.max(...smoothed));
    learnedHours[(((utcHour + Math.round(offset)) % 24) + 24) % 24] += 1;
  }

  // Top two-hour windows by weekday, non-overlapping within a day.
  const candidates = [];
  for (let d = 0; d < 7; d += 1) {
    for (let h = 0; h < 24; h += 1) {
      candidates.push({ weekday: d, hour: h, opens: heatmap[d][h] + heatmap[d][(h + 1) % 24] });
    }
  }
  const average = opened ? (opened * 2) / (7 * 24) : 0;
  const windows = [];
  for (const c of candidates.sort((a, b) => b.opens - a.opens || a.weekday - b.weekday || a.hour - b.hour)) {
    if (!c.opens || windows.length >= 5) break;
    if (windows.some((w) => w.weekday === c.weekday && Math.abs(w.hour - c.hour) < 2)) continue;
    windows.push({ ...c, share: opened ? c.opens / opened : 0, lift: average ? c.opens / average : 0 });
  }

  const sorted = [...minutesToOpen].sort((a, b) => a - b);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : null;
  const bestHour = opened ? hours.indexOf(Math.max(...hours)) : null;

  return {
    timeZone: zone,
    totals: {
      delivered,
      opened,
      openRate: delivered ? opened / delivered : 0,
      contactsReached: reached.size,
      contactsWithHistory: withHistory,
      coverage: reached.size ? withHistory / reached.size : 0,
    },
    heatmap,
    max: Math.max(0, ...heatmap.flat()),
    hours: hours.map((opens, hour) => ({ hour, opens })),
    windows,
    bestHour,
    medianMinutesToOpen: median,
    timeToOpen,
    learnedHours: learnedHours.map((contacts, hour) => ({ hour, contacts })),
    fallbackContacts: Math.max(0, reached.size - withHistory),
  };
}

// 0..23 -> "9 AM" style label.
export function hourLabel(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}
