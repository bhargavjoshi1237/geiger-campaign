// Platform messaging windows (isomorphic, pure). Meta (Instagram/Messenger) and WhatsApp only allow
// free-form business messages for 24h after the user's last inbound message; Messenger/Instagram allow
// human agents 7 days under the HUMAN_AGENT tag; WhatsApp needs an approved template outside the window.

const HOUR = 3_600_000;
const WINDOWED = new Set(["instagram", "messenger", "whatsapp"]);

export function messagingWindow(conversation, { now = Date.now(), human = false } = {}) {
  const channel = conversation?.channel;
  if (!WINDOWED.has(channel)) return { windowed: false, open: true, expiresAt: null, requiresTemplate: false, tag: null };
  const last = conversation?.lastInboundAt ?? conversation?.last_inbound_at;
  const lastMs = last ? new Date(last).getTime() : 0;
  const expiresAt = lastMs ? new Date(lastMs + 24 * HOUR).toISOString() : null;
  const open = lastMs > 0 && now < lastMs + 24 * HOUR;
  if (open) return { windowed: true, open, expiresAt, requiresTemplate: false, tag: null };
  const humanOpen = human && channel !== "whatsapp" && lastMs > 0 && now < lastMs + 7 * 24 * HOUR;
  return {
    windowed: true,
    open: humanOpen,
    expiresAt: humanOpen ? new Date(lastMs + 7 * 24 * HOUR).toISOString() : expiresAt,
    requiresTemplate: channel === "whatsapp",
    tag: humanOpen ? "HUMAN_AGENT" : null,
  };
}
