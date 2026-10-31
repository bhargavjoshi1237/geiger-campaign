// Inbox time formatting (isomorphic, pure). Every helper takes `now` explicitly so render stays pure.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const toMs = (value) => (value == null ? NaN : typeof value === "number" ? value : new Date(value).getTime());

// "3h 20m", "2d 4h", "45m", "under a minute".
export function formatDuration(ms) {
  const abs = Math.max(0, Math.round(Math.abs(Number(ms) || 0) / MINUTE));
  if (abs < 1) return "under a minute";
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const minutes = abs % 60;
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

// Compact list timestamp: "now", "5m", "3h", "Mon", "Oct 3".
export function formatListTime(value, now) {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return "";
  const diff = now - ms;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 6 * DAY) return new Date(ms).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "2h ago", "in 3h", "just now".
export function formatRelative(value, now) {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return "";
  const diff = ms - now;
  if (Math.abs(diff) < MINUTE) return "just now";
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} ago`;
}

export function formatClock(value) {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// "Oct 3, 2:14 PM".
export function formatDateTime(value) {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Day divider label in a thread: "Today", "Yesterday", "Mon, Oct 3".
export function formatDayLabel(value, now) {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return "";
  const day = new Date(ms).toDateString();
  if (day === new Date(now).toDateString()) return "Today";
  if (day === new Date(now - DAY).toDateString()) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export { MINUTE, HOUR, DAY, toMs };
