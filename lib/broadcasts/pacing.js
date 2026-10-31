// Send pacing (isomorphic, pure): WhatsApp messaging-limit tiers, a broadcast's own volume ramp, hourly caps and
// quiet hours. The worker sends the smallest of these allowances each tick, so volume grows gradually instead
// of jumping from tens to thousands in an afternoon (which reads to Meta and carriers as a compromised sender).

import { isQuietTime, localClock } from "@/lib/channels/policy";

const DAY = 86_400_000;

// Meta's business-initiated limit: unique customers per rolling 24 hours, per business portfolio number.
export const TIER_LIMITS = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Infinity,
};

// Unknown tiers are paced as the 250 starting tier until Meta reports one.
export function tierLimit(tier) {
  const key = String(tier || "").toUpperCase();
  if (key in TIER_LIMITS) return { limit: TIER_LIMITS[key], known: true };
  return { limit: TIER_LIMITS.TIER_250, known: false };
}

// The broadcast's own ramp: startPerDay on day one, growing by growthPercent each following day.
export function rampAllowance(ramp, startedAt, now = new Date()) {
  if (!ramp?.enabled) return Infinity;
  const start = Math.max(1, Number(ramp.startPerDay) || 0);
  const growth = Math.max(0, Number(ramp.growthPercent) || 0) / 100;
  const day = startedAt ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(startedAt).getTime()) / DAY)) : 0;
  return Math.floor(start * (1 + growth) ** day);
}

// Days a ramp needs to reach `total` messages (for the schedule preview).
export function rampDays(ramp, total) {
  if (!ramp?.enabled || !total) return 1;
  let sent = 0;
  let day = 0;
  while (sent < total && day < 365) {
    sent += rampAllowance(ramp, new Date(0), new Date(day * DAY));
    day += 1;
  }
  return day;
}

const minutes = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export function safeTimeZone(zone, fallback = "UTC") {
  if (!zone) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return fallback;
  }
}

// When quiet hours apply at `now` in `timeZone`, the moment they end; otherwise null.
export function quietUntil(quiet, now = new Date(), timeZone) {
  if (!quiet?.enabled) return null;
  const zone = safeTimeZone(timeZone || quiet.timezone);
  if (!isQuietTime({ quietHours: quiet }, now, zone)) return null;
  const end = minutes(quiet.end);
  const current = minutes(localClock(now, zone));
  if (end == null || current == null) return null;
  const wait = (end - current + 1440) % 1440 || 1440;
  return new Date(new Date(now).getTime() + wait * 60_000);
}
