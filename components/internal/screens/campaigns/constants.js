import { Bell, Mail, MessageCircle, Smartphone } from "lucide-react";

// Lookups shared by the Campaigns screens (config only — rows come from lib/supabase/*).

// Keyed by campaigns.status (core_platform migration).
export const CAMPAIGN_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-400" },
  in_review: { label: "In review", variant: "warning", dotClass: "bg-amber-400" },
  approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  sending: { label: "Sending", variant: "warning", dotClass: "bg-amber-400" },
  sent: { label: "Sent", variant: "success", dotClass: "bg-emerald-400" },
  paused: { label: "Paused", variant: "outline", dotClass: "bg-zinc-500" },
  cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-zinc-500" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
};

// Statuses whose content and audience can still change.
export const EDITABLE_STATUSES = new Set(["draft", "in_review", "approved", "paused", "cancelled", "failed"]);
// Statuses that have produced (or are producing) a report.
export const REPORTABLE_STATUSES = new Set(["sending", "sent", "paused"]);

export const CHANNEL_MAP = {
  email: { label: "Email", icon: Mail, variant: "info" },
  sms: { label: "SMS", icon: Smartphone, variant: "success" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, variant: "success" },
  push: { label: "Push", icon: Bell, variant: "purple" },
};
export const CAMPAIGN_CHANNELS = Object.keys(CHANNEL_MAP);

export const TYPE_MAP = {
  regular: { label: "Regular", variant: "neutral" },
  ab_test: { label: "A/B test", variant: "warning" },
  automated: { label: "Automated", variant: "purple" },
};
// Types a person can create here; automated campaigns come from Automations.
export const CREATABLE_TYPES = ["regular", "ab_test"];

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(CAMPAIGN_STATUS_MAP).map(([value, m]) => ({ value, label: m.label })),
];

export const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...Object.entries(TYPE_MAP).map(([value, m]) => ({ value, label: m.label })),
];

export const CHANNEL_FILTER_OPTIONS = [
  { value: "all", label: "All channels" },
  ...Object.entries(CHANNEL_MAP).map(([value, m]) => ({ value, label: m.label })),
];

export const SCHEDULE_MODES = [
  { value: "now", label: "Send now" },
  { value: "scheduled", label: "Date and time" },
  { value: "timezone", label: "Recipient time zone" },
  { value: "optimized", label: "Optimized send time" },
];

export const APPROVAL_STATUS_MAP = {
  pending: { label: "Pending", variant: "warning", dotClass: "bg-amber-400" },
  approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  rejected: { label: "Rejected", variant: "danger", dotClass: "bg-red-400" },
  changes_requested: { label: "Changes requested", variant: "info", dotClass: "bg-sky-400" },
  withdrawn: { label: "Withdrawn", variant: "outline", dotClass: "bg-zinc-500" },
};

// The editor's approval state chip (lib/campaigns/approval_rules.js evaluateApproval().state).
export const APPROVAL_STATE_LABEL = {
  not_required: "No approval needed",
  not_submitted: "Not submitted",
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  stale: "Edited since approval",
  unknown: "Unknown",
};

export const SUBJECT_LIMIT = 60;
export const PREHEADER_LIMIT = 100;
export const SMS_SEGMENT = 160;

export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const DESTRUCTIVE_BUTTON = "bg-red-500/90 text-white hover:bg-red-500";

export const formatNumber = (n) => (Number(n) || 0).toLocaleString("en-US");

// 0.4213 -> "42.1%"; null/undefined -> "—".
export const formatRate = (r) => (r == null || Number.isNaN(r) ? "—" : `${(r * 100).toFixed(1)}%`);

export const rate = (n, d) => (Number(d) > 0 ? (Number(n) || 0) / Number(d) : null);

// "2026-06-09T12:00:00Z" -> "Jun 9, 2026"
export const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

// ISO -> value for <input type="datetime-local"> in the viewer's time zone.
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromLocalInput = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// The date a campaign sits on in lists and the calendar.
export const campaignDate = (c) => c?.sentAt || c?.scheduledAt || null;

// Open/click rates from the cached metrics rollup (delivered, falling back to recipients).
export function campaignRates(metrics = {}) {
  const base = Number(metrics.delivered) || Number(metrics.recipients) || 0;
  return {
    recipients: Number(metrics.recipients) || 0,
    openRate: rate(metrics.opens, base),
    clickRate: rate(metrics.clicks, base),
  };
}
