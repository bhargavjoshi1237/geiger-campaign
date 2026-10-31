import { messagingWindow } from "@/lib/inbox/window";
import { CHANNEL_META, SOCIAL_NETWORKS } from "@/lib/social/accounts/catalog";

// Pure view helpers for the social channel screens: health summaries, token/webhook labels, messaging-window
// state per conversation and relative time copy. `now` is always passed in so render stays pure.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso, now) {
  if (!iso) return "—";
  const diff = now - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (abs < MINUTE) return diff >= 0 ? "Just now" : "In a moment";
  if (abs < HOUR) return `${Math.round(abs / MINUTE)}m ${suffix}`;
  if (abs < DAY) return `${Math.round(abs / HOUR)}h ${suffix}`;
  if (abs < 30 * DAY) return `${Math.round(abs / DAY)}d ${suffix}`;
  return formatDate(iso);
}

export function untilLabel(iso, now) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "Expired";
  if (diff < HOUR) return `in ${Math.max(1, Math.round(diff / MINUTE))}m`;
  if (diff < 2 * DAY) return `in ${Math.round(diff / HOUR)}h`;
  return `in ${Math.round(diff / DAY)} days`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const HEALTH_MAP = {
  healthy: { label: "Healthy", variant: "success" },
  attention: { label: "Check settings", variant: "warning" },
  pending: { label: "Pending", variant: "warning" },
  reauth: { label: "Reconnect needed", variant: "danger" },
  error: { label: "Needs attention", variant: "danger" },
  unchecked: { label: "Not checked", variant: "neutral" },
  disconnected: { label: "Disconnected", variant: "neutral" },
};

export function healthIssues(connection) {
  return Array.isArray(connection?.health?.issues) ? connection.health.issues : [];
}

// One status key for a connection, combining its row status and the last health check.
export function healthStatus(connection) {
  if (!connection) return "unchecked";
  if (connection.status === "disconnected") return "disconnected";
  const issues = healthIssues(connection);
  if (connection.health?.reauthRequired) return "reauth";
  if (connection.status === "error" || issues.some((i) => i.level === "error")) return "error";
  if (connection.status === "pending") return "pending";
  if (issues.some((i) => i.level === "warning")) return "attention";
  if (!connection.health?.checkedAt && !connection.lastCheckedAt) return "unchecked";
  return "healthy";
}

export const needsAttention = (connection) => ["reauth", "error", "attention", "pending"].includes(healthStatus(connection));

export function tokenLabel(connection, now) {
  const h = connection?.health || {};
  if (h.tokenValid === false) return "Invalid";
  if (connection.channel === "telegram") return h.tokenValid ? "Bot token valid" : "—";
  if (connection.channel === "rcs") return h.tokenValid ? "Service account valid" : "—";
  if (connection.channel === "tiktok") {
    if (h.refreshExpiresAt) return `Renews · refresh ${untilLabel(h.refreshExpiresAt, now)}`;
    return h.tokenExpiresAt ? `Expires ${untilLabel(h.tokenExpiresAt, now)}` : "—";
  }
  if (h.tokenExpiresAt) return `Expires ${untilLabel(h.tokenExpiresAt, now)}`;
  if (h.dataAccessExpiresAt) return `Data access ${untilLabel(h.dataAccessExpiresAt, now)}`;
  return h.tokenValid ? "Doesn't expire" : "—";
}

export function webhookLabel(connection) {
  const w = connection?.health?.webhook;
  if (!w) return "Not checked";
  if (!w.subscribed) return "Not subscribed";
  const count = Array.isArray(w.fields) ? w.fields.length : 0;
  return count ? `Subscribed · ${count} fields` : "Subscribed";
}

// { state: "open" | "human" | "closed" | "none", expiresAt } for one conversation on a channel.
export function windowState(conversation, channel, now) {
  if (channel === "tiktok") {
    const last = conversation?.lastInboundAt ? new Date(conversation.lastInboundAt).getTime() : 0;
    if (!last) return { state: "closed", expiresAt: null };
    const expires = last + 48 * HOUR;
    return { state: now < expires ? "open" : "closed", expiresAt: new Date(expires).toISOString() };
  }
  if (!CHANNEL_META[channel]?.windowHours) return { state: "none", expiresAt: null };
  const open = messagingWindow({ channel, lastInboundAt: conversation?.lastInboundAt }, { now });
  if (open.open) return { state: "open", expiresAt: open.expiresAt };
  const human = messagingWindow({ channel, lastInboundAt: conversation?.lastInboundAt }, { now, human: true });
  if (human.open) return { state: "human", expiresAt: human.expiresAt };
  return { state: "closed", expiresAt: null };
}

export function windowCopy(win, now) {
  if (win.state === "open") return `Window open · closes ${untilLabel(win.expiresAt, now)}`;
  if (win.state === "human") return `Human replies only · until ${formatDateTime(win.expiresAt)}`;
  if (win.state === "closed") return "Window closed";
  return "No messaging window";
}

export function networkFor(channel) {
  return SOCIAL_NETWORKS.find((n) => n.channel === channel) || null;
}

export const recentlyAt = (iso, now, ms) => Boolean(iso) && now - new Date(iso).getTime() <= ms;
export { HOUR, DAY };
