import { Bell, Mail, Smartphone } from "lucide-react";

// Lookups shared by the All Campaigns list and its editor.

export const CAMPAIGN_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-400" },
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  Sending: { label: "Sending", variant: "warning", dotClass: "bg-amber-400" },
  Sent: { label: "Sent", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "outline", dotClass: "bg-zinc-600" },
};

export const CHANNEL_MAP = {
  Email: { label: "Email", icon: Mail, variant: "info" },
  SMS: { label: "SMS", icon: Smartphone, variant: "success" },
  Push: { label: "Push", icon: Bell, variant: "purple" },
};

export const TYPE_MAP = {
  Broadcast: { label: "Broadcast", variant: "neutral" },
  Automated: { label: "Automated", variant: "purple" },
  "A/B Test": { label: "A/B Test", variant: "warning" },
};

export const CAMPAIGN_TYPES = Object.keys(TYPE_MAP);
export const CAMPAIGN_CHANNELS = Object.keys(CHANNEL_MAP);
export const AUDIENCE_LISTS = ["Newsletter", "Product Updates", "VIP Customers", "Webinar Attendees"];

// Contact count per list, used for the editor's live recipient estimate.
export const LIST_SIZE = {
  Newsletter: 18900,
  "Product Updates": 9800,
  "VIP Customers": 940,
  "Webinar Attendees": 3400,
};

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.keys(CAMPAIGN_STATUS_MAP).map((s) => ({ value: s, label: s })),
];

export const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...CAMPAIGN_TYPES.map((t) => ({ value: t, label: t })),
];

export const CHANNEL_FILTER_OPTIONS = [
  { value: "all", label: "All channels" },
  ...CAMPAIGN_CHANNELS.map((c) => ({ value: c, label: c })),
];

export const AB_METRIC_OPTIONS = [
  { value: "opens", label: "Open rate" },
  { value: "clicks", label: "Click rate" },
];

export const defaultAb = () => ({ enabled: false, split: 50, metric: "opens", variantB: { subject: "", body: "" } });

// "2026-06-09T12:00" -> "Jun 9, 2026"
export const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
