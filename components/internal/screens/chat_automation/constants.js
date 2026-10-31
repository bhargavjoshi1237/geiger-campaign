import { Camera, MessageCircle, MessageSquare, Send, Video } from "lucide-react";

// Lookups and formatters for the Chat Automation screens (config only — rows come from the data layer).

export const CHAT_EDIT = "campaign.chat.edit";

export const CHAT_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
  active: { label: "Live", variant: "success", dotClass: "bg-emerald-500" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-500" },
  archived: { label: "Archived", variant: "outline", dotClass: "bg-text-tertiary" },
};

export const TOGGLE_STATUS_MAP = {
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-500" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-500" },
};

export const SESSION_STATUS_MAP = {
  active: { label: "Running", variant: "info", dotClass: "bg-sky-500" },
  waiting: { label: "Waiting", variant: "info", dotClass: "bg-sky-500" },
  completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-500" },
  handed_over: { label: "Handed over", variant: "purple", dotClass: "bg-violet-500" },
  expired: { label: "Expired", variant: "neutral", dotClass: "bg-text-tertiary" },
  cancelled: { label: "Cancelled", variant: "neutral", dotClass: "bg-text-tertiary" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-500" },
};

export const ENROLLMENT_STATUS_MAP = {
  active: { label: "Active", variant: "info", dotClass: "bg-sky-500" },
  completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-500" },
  stopped: { label: "Stopped", variant: "neutral", dotClass: "bg-text-tertiary" },
  blocked: { label: "Blocked", variant: "warning", dotClass: "bg-amber-500" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-500" },
};

export const DELIVERY_STATUS_MAP = {
  queued: { label: "Queued", variant: "neutral" },
  sent: { label: "Sent", variant: "info" },
  delivered: { label: "Delivered", variant: "success" },
  read: { label: "Read", variant: "success" },
  replied: { label: "Replied", variant: "success" },
  clicked: { label: "Clicked", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  not_sent: { label: "Not sent", variant: "warning" },
};

export const CHANNEL_META = {
  instagram: { label: "Instagram", icon: Camera },
  messenger: { label: "Messenger", icon: MessageSquare },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  telegram: { label: "Telegram", icon: Send },
  tiktok: { label: "TikTok", icon: Video },
};

export const KIND_META = {
  comment_to_dm: { label: "Comment-to-DM", short: "Comment", event: "Comments matched", description: "Replies to a comment publicly and sends one private DM." },
  keyword: { label: "Keyword trigger", short: "Keyword", event: "Messages matched", description: "Answers a DM that contains a keyword." },
  story_reply: { label: "Story reply", short: "Story reply", event: "Story replies", description: "Answers people who reply to your story." },
  story_mention: { label: "Story mention", short: "Mention", event: "Mentions", description: "Thanks people who mention you in their story." },
  welcome: { label: "Welcome message", short: "Welcome", event: "New conversations", description: "Greets someone the first time they message you." },
  default_reply: { label: "Default reply", short: "Default", event: "Unmatched messages", description: "Answers anything no other automation, flow or agent handled." },
  referral: { label: "Referral reply", short: "Referral", event: "Referrals", description: "Answers people arriving from a ref link, QR code or ad." },
};

// Why the engine didn't send — shown next to blocked DMs and queued replies.
export const BLOCK_REASON_LABELS = {
  dm_cap: "Already sent this person an automated DM in the last 24 hours (platform cap)",
  window_closed: "The 24-hour messaging window had closed",
  template_required: "Outside WhatsApp's 24-hour window — needs an approved template",
  bot_paused: "A person has taken over the conversation",
  opted_out: "The person opted out on this channel",
  quiet_hours: "Quiet hours (set to skip)",
  window_closes_during_quiet_hours: "The window would close before quiet hours end",
  comment_too_old: "The comment is older than 7 days",
  no_address: "No platform id for this person yet",
  handover: "Handed over to a person",
  stopped_manually: "Stopped by a teammate",
  replied: "The person replied",
  sequence_inactive: "The sequence was paused or deleted",
};

export const blockReason = (reason) => BLOCK_REASON_LABELS[reason] || reason || "—";

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
];

export function channelFilterOptions(channels) {
  return [{ value: "all", label: "All channels" }, ...channels.map((c) => ({ value: c, label: CHANNEL_META[c]?.label || c }))];
}

export const formatNumber = (n) => Number(n || 0).toLocaleString("en-US");

export function formatPercent(part, whole) {
  if (!whole) return "—";
  const pct = (Number(part || 0) / Number(whole)) * 100;
  return `${pct >= 10 || pct === 0 ? Math.round(pct) : pct.toFixed(1)}%`;
}

export function formatRelative(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  let text;
  if (minutes < 1) text = "just now";
  else if (minutes < 60) text = `${minutes}m`;
  else if (minutes < 60 * 24) text = `${Math.round(minutes / 60)}h`;
  else if (minutes < 60 * 24 * 30) text = `${Math.round(minutes / 1440)}d`;
  else return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (text === "just now") return text;
  return future ? `in ${text}` : `${text} ago`;
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m === 0) return "Immediately";
  if (m < 60) return `${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h ${rest}m` : `${h}h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.round((m % 1440) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export const SINCE_DAYS = 30;
export const sinceIso = (days = SINCE_DAYS) => new Date(Date.now() - days * 86_400_000).toISOString();

// Social interactions recorded as tracked events (by the inbound webhooks and the chat engine) that can
// start email / SMS workflows. params are the property filters each one can be narrowed by.
const CHANNEL_PARAM = { property: "channel", label: "Channel", input: "channel" };
export const SOCIAL_TRIGGERS = [
  { key: "comment", event: "social.comment", group: "Interactions", label: "Comments on a post", channels: ["instagram", "messenger"], description: "Someone comments on an Instagram or Facebook post, reel or ad.", params: [CHANNEL_PARAM, { property: "text", label: "Comment contains", input: "text", operator: "contains", placeholder: "e.g. guide" }, { property: "postId", label: "Post id", input: "text", operator: "eq", placeholder: "Any post" }] },
  { key: "dm", event: "social.dm", group: "Interactions", label: "Sends a DM", channels: ["instagram", "messenger", "telegram", "tiktok"], description: "Someone messages one of your connected social accounts.", params: [CHANNEL_PARAM, { property: "text", label: "Message contains", input: "text", operator: "contains", placeholder: "e.g. pricing" }] },
  { key: "story_reply", event: "social.story_reply", group: "Interactions", label: "Replies to a story", channels: ["instagram"], description: "Someone replies to one of your Instagram stories.", params: [{ property: "text", label: "Reply contains", input: "text", operator: "contains", placeholder: "Any reply" }] },
  { key: "story_mention", event: "social.story_mention", group: "Interactions", label: "Mentions you in a story", channels: ["instagram"], description: "Someone mentions your Instagram account in their story.", params: [] },
  { key: "ad_click", event: "social.ad_click", group: "Interactions", label: "Starts a chat from an ad", channels: ["instagram", "messenger", "whatsapp"], description: "Someone starts a conversation from a click-to-message ad.", params: [CHANNEL_PARAM, { property: "adId", label: "Ad id", input: "text", operator: "eq", placeholder: "Any ad" }] },
  { key: "referral", event: "social.referral", group: "Interactions", label: "Arrives from a ref link", channels: ["instagram", "messenger", "whatsapp", "telegram"], description: "Someone opens a chat through an ig.me, m.me, t.me or wa.me link or QR code.", params: [CHANNEL_PARAM, { property: "ref", label: "Ref", input: "text", operator: "eq", placeholder: "Any ref" }] },
  { key: "keyword", event: "social.keyword", group: "Chat outcomes", label: "Matches a keyword trigger", channels: ["instagram", "messenger", "whatsapp", "telegram", "tiktok"], description: "A DM matched one of your keyword triggers.", params: [CHANNEL_PARAM, { property: "keyword", label: "Keyword", input: "text", operator: "eq", placeholder: "Any keyword" }] },
  { key: "dm_click", event: "social.dm_click", group: "Chat outcomes", label: "Clicks a link in a DM", channels: ["instagram", "messenger", "whatsapp", "telegram"], description: "Someone taps a link button in an automated DM.", params: [CHANNEL_PARAM, { property: "url", label: "Link contains", input: "text", operator: "contains", placeholder: "Any link" }] },
  { key: "flow_goal", event: "social.flow_goal", group: "Chat outcomes", label: "Reaches a DM flow goal", channels: ["instagram", "messenger", "whatsapp", "telegram", "tiktok"], description: "A DM flow reached one of its goal steps.", params: [{ property: "goal", label: "Goal", input: "text", operator: "eq", placeholder: "Any goal" }] },
  { key: "handover", event: "social.handover", group: "Chat outcomes", label: "Is handed to a person", channels: ["instagram", "messenger", "whatsapp", "telegram", "tiktok"], description: "The bot handed a conversation to your team.", params: [CHANNEL_PARAM] },
  { key: "opt_out", event: "social.opt_out", group: "Chat outcomes", label: "Opts out of automated DMs", channels: ["instagram", "messenger", "whatsapp", "telegram", "tiktok"], description: "Someone replied STOP (or another opt-out word) on a chat channel.", params: [CHANNEL_PARAM] },
];

export const SOCIAL_TRIGGER_EVENTS = new Set(SOCIAL_TRIGGERS.map((t) => t.event));
