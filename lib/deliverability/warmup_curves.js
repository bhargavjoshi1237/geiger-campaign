// Warm-up ramp curves and schedule maths (isomorphic, pure). A plan stores its generated schedule
// ([{ day, cap }], day 1 = start_date in UTC); the server enforces today's cap via getDailySendCap.

const DAY_MS = 24 * 60 * 60 * 1000;

// Email and SMS ramp geometrically from `start` to the target over `days`; WhatsApp follows Meta's
// business-initiated messaging tiers, one week per tier.
export const WARMUP_CURVES = {
  email: [
    { key: "conservative", label: "Conservative", start: 50, days: 45, description: "45 days from 50 a day. For a brand-new domain or a list with older addresses." },
    { key: "standard", label: "Standard", start: 100, days: 30, description: "30 days from 100 a day. The usual ramp for a new dedicated IP." },
    { key: "accelerated", label: "Accelerated", start: 500, days: 14, description: "14 days from 500 a day. Only for a clean, highly engaged list." },
  ],
  sms: [
    { key: "conservative", label: "Conservative", start: 50, days: 30, description: "30 days from 50 a day." },
    { key: "standard", label: "Standard", start: 100, days: 21, description: "21 days from 100 a day." },
  ],
  whatsapp: [
    { key: "meta_tiers", label: "Meta messaging tiers", start: 50, days: 7, description: "A week inside each tier (250 → 1K → 10K → 100K), using at least half of it so Meta upgrades the number." },
  ],
};

export const WHATSAPP_TIERS = [250, 1000, 10000, 100000];

export const CHANNEL_LABELS = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

export function curvesFor(channel) {
  return WARMUP_CURVES[channel] || WARMUP_CURVES.email;
}

export function curveFor(channel, key) {
  const list = curvesFor(channel);
  return list.find((c) => c.key === key) || list.find((c) => c.key === "standard") || list[0];
}

// Two significant figures, so caps read as 1,400 rather than 1,387.
export function niceRound(value) {
  if (value <= 10) return Math.max(1, Math.round(value));
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

function geometric(start, target, days) {
  if (days <= 1 || target <= start) return Array.from({ length: Math.max(1, days) }, () => target);
  const ratio = target / start;
  const caps = Array.from({ length: days }, (_, i) => niceRound(start * ratio ** (i / (days - 1))));
  caps[days - 1] = target;
  for (let i = 1; i < caps.length; i++) caps[i] = Math.max(caps[i], caps[i - 1]);
  return caps;
}

function whatsappTiers(target) {
  const tiers = WHATSAPP_TIERS.filter((t, i) => i === 0 || WHATSAPP_TIERS[i - 1] < target);
  const caps = [];
  for (const tier of tiers) {
    const from = tier === WHATSAPP_TIERS[0] ? 50 : tier / 2;
    for (let i = 0; i < 7; i++) caps.push(niceRound(from + ((tier - from) * i) / 6));
  }
  return caps.map((cap) => Math.min(cap, target));
}

export function buildWarmupSchedule({ channel = "email", curve, targetVolume, days } = {}) {
  const target = Math.max(1, Math.round(Number(targetVolume) || 0));
  if (channel === "whatsapp") return whatsappTiers(target).map((cap, i) => ({ day: i + 1, cap }));
  const c = curveFor(channel, curve);
  const length = Math.min(120, Math.max(1, Math.round(Number(days) || c.days)));
  return geometric(Math.min(c.start, target), target, length).map((cap, i) => ({ day: i + 1, cap }));
}

const utcDay = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export function parseDate(value) {
  const [y, m, d] = String(value || "").slice(0, 10).split("-").map(Number);
  return y && m && d ? Date.UTC(y, m - 1, d) : null;
}

export function todayIso(now = new Date()) {
  return new Date(utcDay(now)).toISOString().slice(0, 10);
}

export function addDaysIso(iso, days) {
  const base = parseDate(iso) ?? utcDay(new Date());
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

// 1-based ramp day for `now` (0 or less = not started).
export function warmupDay(plan, now = new Date()) {
  const start = parseDate(plan.startDate ?? plan.start_date);
  if (start == null) return 0;
  return Math.floor((utcDay(now) - start) / DAY_MS) + 1;
}

export function capForDay(schedule, day) {
  if (!Array.isArray(schedule) || day < 1) return null;
  return schedule[day - 1]?.cap ?? null;
}

// Display state: scheduled | active | paused | completed.
export function planState(plan, now = new Date()) {
  const schedule = plan.schedule || [];
  const day = warmupDay(plan, now);
  if (plan.status === "completed" || (schedule.length && day > schedule.length)) return "completed";
  if (plan.status === "paused") return "paused";
  return day < 1 ? "scheduled" : "active";
}

// Resuming a paused plan shifts its start so the ramp continues from the day it paused on.
export function resumedStartDate(plan, now = new Date()) {
  const pausedAt = plan.pausedAt ?? plan.paused_at;
  if (!pausedAt) return plan.startDate ?? plan.start_date;
  const pausedDays = Math.max(0, Math.floor((utcDay(now) - utcDay(new Date(pausedAt))) / DAY_MS));
  return addDaysIso(plan.startDate ?? plan.start_date, pausedDays);
}
