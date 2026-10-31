// Send-time facts from this workspace's own deliveries (isomorphic, pure): when recipients open (peak
// weekday/hour in the workspace time zone) and which tried send slots earned the best open rate. Feeds the
// campaign brief's schedule recommendation so it is grounded in real data, never a generic "Tuesday 10am".

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const NOT_SENT = new Set(["queued", "failed", "not_sent"]);
export const MIN_OPENS = 30;
const MIN_SLOT_SENDS = 50;

const formatters = new Map();
function partsIn(timeZone, iso) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" });
    } catch {
      fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" });
    }
    formatters.set(timeZone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { weekday: SHORT[parts.weekday] ?? 0, hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

export function formatSlot(weekday, hour) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${WEEKDAYS[weekday]} ${h}:00 ${hour < 12 ? "AM" : "PM"}`;
}

// deliveries: normalized camelCase rows (email + any channel with opens/reads).
export function sendTimeStats(deliveries = [], { timeZone = "UTC" } = {}) {
  const openGrid = new Map();
  const slots = new Map();
  let delivered = 0;
  let opens = 0;
  const weekdayOpens = Array(7).fill(0);
  const hourOpens = Array(24).fill(0);

  for (const d of deliveries) {
    if (NOT_SENT.has(d.status) || d.sourceType === "test") continue;
    const sentAt = d.sentAt || d.createdAt;
    if (!sentAt) continue;
    delivered += 1;
    const sent = partsIn(timeZone, sentAt);
    const slotKey = `${sent.weekday}:${sent.hour}`;
    const slot = slots.get(slotKey) ?? { weekday: sent.weekday, hour: sent.hour, sent: 0, opened: 0 };
    slot.sent += 1;
    if (d.openedAt) {
      slot.opened += 1;
      opens += 1;
      const open = partsIn(timeZone, d.openedAt);
      const key = `${open.weekday}:${open.hour}`;
      openGrid.set(key, (openGrid.get(key) ?? 0) + 1);
      weekdayOpens[open.weekday] += 1;
      hourOpens[open.hour] += 1;
    }
    slots.set(slotKey, slot);
  }

  const peak = [...openGrid.entries()].sort((a, b) => b[1] - a[1])[0];
  const topHours = hourOpens
    .map((count, hour) => ({ hour, opens: count, share: opens ? count / opens : 0 }))
    .filter((h) => h.opens > 0)
    .sort((a, b) => b.opens - a.opens)
    .slice(0, 3);
  const topWeekdays = weekdayOpens
    .map((count, weekday) => ({ weekday, opens: count, share: opens ? count / opens : 0 }))
    .filter((d) => d.opens > 0)
    .sort((a, b) => b.opens - a.opens)
    .slice(0, 3);
  const triedSlots = [...slots.values()]
    .filter((s) => s.sent >= MIN_SLOT_SENDS)
    .map((s) => ({ ...s, openRate: s.opened / s.sent }))
    .sort((a, b) => b.openRate - a.openRate);

  let peakOpen = null;
  if (peak) {
    const [weekday, hour] = peak[0].split(":").map(Number);
    peakOpen = { weekday, hour, opens: peak[1], share: peak[1] / opens, label: formatSlot(weekday, hour) };
  }

  return {
    timeZone,
    delivered,
    opens,
    enough: opens >= MIN_OPENS,
    peakOpen,
    topHours,
    topWeekdays,
    bestSentSlot: triedSlots.length >= 2 ? { ...triedSlots[0], label: formatSlot(triedSlots[0].weekday, triedSlots[0].hour) } : null,
    triedSlots: triedSlots.length,
  };
}

// The next occurrence of weekday/hour:00 in timeZone after `now`, as an ISO string (15-minute scan, ≤ 8 days).
export function nextSlotAt(weekday, hour, timeZone = "UTC", now = new Date()) {
  const step = 15 * 60 * 1000;
  let t = Math.ceil(now.getTime() / step) * step;
  for (let i = 0; i < 8 * 24 * 4; i += 1, t += step) {
    const p = partsIn(timeZone, new Date(t).toISOString());
    if (p.weekday === weekday && p.hour === hour && p.minute === 0) return new Date(t).toISOString();
  }
  return null;
}

// Plain-language facts handed to the model; it may only recommend times these support.
export function describeSendTime(stats) {
  if (!stats?.enough) {
    return `Too little open data to ground a send time (${stats?.opens ?? 0} opens in the window, ${MIN_OPENS} needed). Say the recommendation is a starting point to test, not data-backed.`;
  }
  const lines = [
    `Time zone: ${stats.timeZone}. Window covers ${stats.delivered} sends and ${stats.opens} opens.`,
    `Peak open hour: ${stats.peakOpen.label} (${Math.round(stats.peakOpen.share * 100)}% of opens).`,
    `Top open hours: ${stats.topHours.map((h) => `${h.hour}:00 (${Math.round(h.share * 100)}%)`).join(", ")}.`,
    `Top open weekdays: ${stats.topWeekdays.map((d) => `${WEEKDAYS[d.weekday]} (${Math.round(d.share * 100)}%)`).join(", ")}.`,
  ];
  if (stats.bestSentSlot) {
    lines.push(`Best tried send slot: ${stats.bestSentSlot.label} with ${(stats.bestSentSlot.openRate * 100).toFixed(1)}% opens over ${stats.bestSentSlot.sent} sends.`);
  }
  return lines.join("\n");
}
