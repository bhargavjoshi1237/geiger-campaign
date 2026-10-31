import { Camera, Mail, MessageCircle, MessageSquare, MessageSquareText, MessagesSquare, Music2, Send, Smartphone } from "lucide-react";

// Inbox lookups (config, not data): channel labels/icons, status and priority maps, filter options and
// snooze presets. Rows always come from lib/supabase/conversations.js.

export const CHANNELS = {
  email: { label: "Email", icon: Mail },
  sms: { label: "SMS", icon: Smartphone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  instagram: { label: "Instagram", icon: Camera },
  messenger: { label: "Messenger", icon: MessageSquare },
  chat: { label: "Live chat", icon: MessagesSquare },
  telegram: { label: "Telegram", icon: Send },
  tiktok: { label: "TikTok", icon: Music2 },
  rcs: { label: "RCS", icon: MessageSquareText },
};

export const channelMeta = (channel) => CHANNELS[channel] || { label: channel || "Message", icon: MessageSquare };

export const CHANNEL_OPTIONS = Object.entries(CHANNELS).map(([value, { label }]) => ({ value, label }));

export const KIND_LABEL = { dm: "Direct message", comment: "Comment", sms: "Text message", chat: "Live chat", email: "Email" };

export const CONVERSATION_STATUS_MAP = {
  open: { label: "Open", variant: "info" },
  pending: { label: "Pending", variant: "warning" },
  snoozed: { label: "Snoozed", variant: "purple" },
  resolved: { label: "Resolved", variant: "neutral" },
};

export const PRIORITY_MAP = {
  low: { label: "Low", variant: "neutral" },
  normal: { label: "Normal", variant: "neutral" },
  high: { label: "High", variant: "warning" },
  urgent: { label: "Urgent", variant: "danger" },
};

export const PRIORITY_OPTIONS = Object.entries(PRIORITY_MAP).map(([value, { label }]) => ({ value, label }));

export const STATUS_TABS = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "snoozed", label: "Snoozed" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export const CONSENT_MAP = {
  opted_in: { label: "Opted in", variant: "success" },
  opted_out: { label: "Opted out", variant: "danger" },
  pending: { label: "Pending", variant: "warning" },
};

export const DEAL_STATUS_MAP = {
  open: { label: "Open", variant: "info" },
  won: { label: "Won", variant: "success" },
  lost: { label: "Lost", variant: "neutral" },
};

// Channels whose consent ledger matters for replies and the side panel.
export const CONSENT_CHANNELS = ["email", "sms", "whatsapp", "instagram", "messenger"];

const at = (base, { days = 0, hour = null, minutes = 0 } = {}) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  if (hour != null) d.setHours(hour, 0, 0, 0);
  else d.setTime(d.getTime() + minutes * 60_000);
  return d.toISOString();
};

// Snooze presets resolved against `now` when the menu opens.
export function snoozeOptions(now) {
  const day = new Date(now).getDay();
  const toMonday = ((8 - day) % 7) || 7;
  return [
    { key: "1h", label: "1 hour", until: at(now, { minutes: 60 }) },
    { key: "3h", label: "3 hours", until: at(now, { minutes: 180 }) },
    { key: "tomorrow", label: "Tomorrow, 9:00", until: at(now, { days: 1, hour: 9 }) },
    { key: "monday", label: "Next Monday, 9:00", until: at(now, { days: toMonday, hour: 9 }) },
  ];
}

export const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

// Display name for a thread: linked contact, then the social sender / chat visitor, then the title.
export function conversationName(conversation, contact) {
  if (contact?.name && contact.name !== "Unnamed contact") return contact.name;
  return (
    conversation?.sender?.name ||
    (conversation?.sender?.handle ? `@${conversation.sender.handle}` : "") ||
    conversation?.visitor?.name ||
    conversation?.visitor?.email ||
    conversation?.title ||
    contact?.email ||
    contact?.phone ||
    `${channelMeta(conversation?.channel).label} conversation`
  );
}

export const currency = (value, code = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: code || "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
