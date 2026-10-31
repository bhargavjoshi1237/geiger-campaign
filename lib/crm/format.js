// Formatting helpers for CRM screens. Pure; every value comes from fetched rows.

const DAY = 24 * 60 * 60 * 1000;

const moneyFormats = new Map();

export function formatMoney(value, currency = "USD") {
  const code = currency || "USD";
  if (!moneyFormats.has(code)) {
    try {
      moneyFormats.set(code, new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 0 }));
    } catch {
      moneyFormats.set(code, new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }));
    }
  }
  return moneyFormats.get(code).format(Number(value) || 0);
}

// Totals per currency, most common currency first: [{ currency, total, count }].
export function totalsByCurrency(items, valueOf = (d) => d.value) {
  const map = new Map();
  for (const item of items) {
    const code = item.currency || "USD";
    const entry = map.get(code) || { currency: code, total: 0, count: 0 };
    entry.total += Number(valueOf(item)) || 0;
    entry.count += 1;
    map.set(code, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.total - a.total);
}

// Primary-currency total as the headline, other currencies as a footnote.
export function moneySummary(items, valueOf, fallbackCurrency = "USD") {
  const totals = totalsByCurrency(items, valueOf);
  if (!totals.length) return { value: formatMoney(0, fallbackCurrency), footer: "" };
  const [primary, ...rest] = totals;
  return {
    value: formatMoney(primary.total, primary.currency),
    footer: rest.map((t) => formatMoney(t.total, t.currency)).join(" · "),
  };
}

export function formatDate(value) {
  if (!value) return "—";
  const date = typeof value === "string" && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function relativeTime(value, now = Date.now()) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const diff = now - time;
  const abs = Math.abs(diff);
  const future = diff < 0;
  if (abs < 60 * 1000) return future ? "in a moment" : "just now";
  if (abs < 60 * 60 * 1000) {
    const m = Math.round(abs / 60000);
    return future ? `in ${m} min` : `${m} min ago`;
  }
  if (abs < DAY) {
    const h = Math.round(abs / 3600000);
    return future ? `in ${h} h` : `${h} h ago`;
  }
  const days = Math.round(abs / DAY);
  if (days === 1) return future ? "tomorrow" : "yesterday";
  if (days < 7) return future ? `in ${days} days` : `${days} days ago`;
  return formatDate(value);
}

// Local calendar day key ("2026-10-27") for grouping and due-date maths.
export function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(key, now = new Date()) {
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(now.getTime() - DAY)) return "Yesterday";
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// Where a due date falls relative to today: overdue | today | upcoming | none.
export function dueState(dueAt, now = new Date()) {
  if (!dueAt) return "none";
  const key = dayKey(dueAt);
  const today = dayKey(now);
  if (key === today) return "today";
  return key < today ? "overdue" : "upcoming";
}

export function daysBetween(from, to) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / DAY;
}

export function formatDays(days) {
  if (days == null || Number.isNaN(days)) return "—";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h`;
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

export function percent(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

// <input type="datetime-local"> <-> ISO, in the viewer's timezone.
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// "deal_won" / "form.submitted" -> "Deal won" / "Form submitted".
export function humanizeEvent(name) {
  const text = String(name || "").replace(/[._]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "Event";
}
