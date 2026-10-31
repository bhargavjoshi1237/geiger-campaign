import {
  Archive,
  BellRing,
  BookOpen,
  Cake,
  Calendar,
  Clock,
  Code,
  Eye,
  FileInput,
  Flag,
  GitBranch,
  Hand,
  HeartHandshake,
  Layers,
  ListMinus,
  ListPlus,
  LogOut,
  Mail,
  MailOpen,
  MessageCircle,
  MessageSquare,
  MousePointerClick,
  PackageCheck,
  RotateCcw,
  Send,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Tag,
  Tags,
  UserMinus,
  UserPen,
  UserPlus,
  Hourglass,
  Webhook,
  Zap,
  ListChecks,
  Route,
} from "lucide-react";

// Lookups, icons and formatters for the Automations screens (config only — never row data).

export const AUTOMATION_STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-500" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-500" },
  archived: { label: "Archived", variant: "outline" },
};

export const ENROLLMENT_STATUS_MAP = {
  active: { label: "Running", variant: "info" },
  waiting: { label: "Waiting", variant: "neutral" },
  completed: { label: "Completed", variant: "success" },
  exited: { label: "Exited", variant: "outline" },
  failed: { label: "Failed", variant: "danger" },
};

export const LOG_STATUS_MAP = {
  ok: { label: "Done", variant: "success" },
  waiting: { label: "Waiting", variant: "neutral" },
  deferred: { label: "Deferred", variant: "warning" },
  skipped: { label: "Skipped", variant: "outline" },
  failed: { label: "Failed", variant: "danger" },
};

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(AUTOMATION_STATUS_MAP).map(([value, m]) => ({ value, label: m.label })),
];

export const ENROLLMENT_FILTER_OPTIONS = [
  { value: "all", label: "All contacts" },
  { value: "running", label: "In progress" },
  ...["completed", "exited", "failed"].map((value) => ({ value, label: ENROLLMENT_STATUS_MAP[value].label })),
];

export const LOG_FILTER_OPTIONS = [
  { value: "all", label: "All steps" },
  ...Object.entries(LOG_STATUS_MAP).map(([value, m]) => ({ value, label: m.label })),
];

export const KIND_COPY = {
  workflow: {
    title: "Workflows",
    singular: "workflow",
    description: "Automated, multi-step sequences that run when a contact meets a trigger.",
    create: "Create workflow",
    empty: "Create a workflow to send a sequence when a contact meets a trigger.",
    icon: Zap,
  },
  journey: {
    title: "Journeys",
    singular: "journey",
    description: "Cross-channel paths that move contacts between email, SMS, WhatsApp and push toward a goal.",
    create: "Create journey",
    empty: "Create a journey to reach contacts across channels and track them to a goal.",
    icon: Route,
  },
};

// Node icon + accent per node type. Accents: amber trigger, sky messages, violet logic, neutral otherwise.
export const NODE_META = {
  trigger: { icon: Zap, accent: "amber" },
  send_email: { icon: Mail, accent: "sky" },
  send_sms: { icon: MessageSquare, accent: "sky" },
  send_whatsapp: { icon: MessageCircle, accent: "sky" },
  send_push: { icon: BellRing, accent: "sky" },
  wait: { icon: Hourglass, accent: "neutral" },
  condition: { icon: GitBranch, accent: "violet" },
  split: { icon: Shuffle, accent: "violet" },
  goal: { icon: Flag, accent: "violet" },
  exit: { icon: LogOut, accent: "neutral" },
  update_contact: { icon: UserPen, accent: "neutral" },
  list: { icon: ListPlus, accent: "neutral" },
  webhook: { icon: Webhook, accent: "neutral" },
  notify: { icon: Send, accent: "neutral" },
};

export const ACCENT_CLASS = {
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  sky: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  neutral: "border-border bg-surface-card text-muted-foreground",
};

export const TRIGGER_ICONS = {
  contact_created: UserPlus,
  list_joined: ListPlus,
  list_left: ListMinus,
  tag_added: Tag,
  tag_removed: Tags,
  unsubscribed: UserMinus,
  form_submitted: FileInput,
  email_opened: MailOpen,
  email_clicked: MousePointerClick,
  page_viewed: Eye,
  order_completed: PackageCheck,
  cart_abandoned: ShoppingCart,
  product_viewed: ShoppingBag,
  date_attribute: Calendar,
  inactivity: Clock,
  custom_event: Code,
  manual: Hand,
};

export const CHANNEL_META = {
  email: { label: "Email", icon: Mail },
  sms: { label: "SMS", icon: MessageSquare },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  push: { label: "Push", icon: BellRing },
};

export const RECIPE_ICONS = {
  welcome_series: UserPlus,
  abandoned_cart: ShoppingCart,
  browse_abandonment: Eye,
  post_purchase: HeartHandshake,
  win_back: RotateCcw,
  birthday: Cake,
  lead_nurture: Layers,
  re_engagement: Route,
};

export const LIBRARY_ICONS = { conditions: ListChecks, goals: Flag, recipes: BookOpen, archive: Archive };

export const OUTLINE_BUTTON = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

export const DESTRUCTIVE_ICON_BUTTON =
  "text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400";

const NUMBER = new Intl.NumberFormat("en-US");

export function formatNumber(n) {
  return NUMBER.format(Number(n) || 0);
}

// 0.284 -> "28.4%"; null -> "—".
export function formatPercent(ratio, digits = 1) {
  if (ratio == null || Number.isNaN(Number(ratio))) return "—";
  return `${(Number(ratio) * 100).toFixed(digits).replace(/\.0$/, "")}%`;
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "3m ago", "in 2h", "Mar 4".
export function formatRelative(iso, now = Date.now()) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = t - now;
  const abs = Math.abs(diff);
  const fmt = (v, unit) => (diff < 0 ? `${v}${unit} ago` : `in ${v}${unit}`);
  if (abs < 60_000) return diff < 0 ? "just now" : "in a moment";
  if (abs < 3_600_000) return fmt(Math.round(abs / 60_000), "m");
  if (abs < 86_400_000) return fmt(Math.round(abs / 3_600_000), "h");
  if (abs < 7 * 86_400_000) return fmt(Math.round(abs / 86_400_000), "d");
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Readable label for a step-log action ("email.sent" -> "Email sent").
export function actionLabel(action) {
  const text = String(action || "").replace(/[._]/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}
