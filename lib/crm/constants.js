// CRM lookups and config (no row data). Plain module so screens, the data layer, server code and the
// playground seed can all import it.

// Fixed stage palette: each key maps to a badge variant plus literal Tailwind classes (kept whole so
// the compiler sees them).
export const STAGE_COLORS = {
  neutral: { label: "Grey", variant: "neutral", dot: "bg-zinc-400", border: "border-t-zinc-400" },
  blue: { label: "Blue", variant: "info", dot: "bg-sky-500", border: "border-t-sky-500" },
  violet: { label: "Violet", variant: "purple", dot: "bg-violet-500", border: "border-t-violet-500" },
  amber: { label: "Amber", variant: "warning", dot: "bg-amber-500", border: "border-t-amber-500" },
  emerald: { label: "Green", variant: "success", dot: "bg-emerald-500", border: "border-t-emerald-500" },
  red: { label: "Red", variant: "danger", dot: "bg-red-500", border: "border-t-red-500" },
};

export const STAGE_COLOR_KEYS = Object.keys(STAGE_COLORS);

export const stageColor = (key) => STAGE_COLORS[key] || STAGE_COLORS.neutral;

// Starting stages for a new sales pipeline; ids are minted per pipeline.
export const DEFAULT_STAGE_TEMPLATE = [
  { name: "Lead", probability: 10, color: "neutral" },
  { name: "Qualified", probability: 25, color: "blue" },
  { name: "Proposal", probability: 50, color: "violet" },
  { name: "Negotiation", probability: 75, color: "amber" },
];

export const DEAL_STATUS_MAP = {
  open: { label: "Open", variant: "info", dotClass: "bg-sky-400" },
  won: { label: "Won", variant: "success", dotClass: "bg-emerald-400" },
  lost: { label: "Lost", variant: "danger", dotClass: "bg-red-400" },
};

export const DEAL_STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open deals" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "all", label: "All statuses" },
];

export const LOST_REASONS = [
  "Price",
  "Went with a competitor",
  "No budget",
  "No decision / went quiet",
  "Timing",
  "Missing features",
];

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "JPY", "CHF", "SEK"];

export const TASK_STATUS_MAP = {
  open: { label: "Open", variant: "info", dotClass: "bg-sky-400" },
  done: { label: "Done", variant: "success", dotClass: "bg-emerald-400" },
};

export const TASK_PRIORITY_MAP = {
  high: { label: "High", variant: "danger" },
  medium: { label: "Medium", variant: "warning" },
  low: { label: "Low", variant: "neutral" },
};

export const TASK_PRIORITIES = ["high", "medium", "low"];

export const RELATED_TYPES = {
  deal: { label: "Deal", plural: "Deals", tab: "Deals" },
  company: { label: "Company", plural: "Companies", tab: "Companies" },
  contact: { label: "Contact", plural: "Contacts", tab: "Contacts" },
};

// crm_activities.kind
export const ACTIVITY_KINDS = {
  call: { label: "Call", verb: "logged a call" },
  meeting: { label: "Meeting", verb: "logged a meeting" },
  note: { label: "Note", verb: "added a note" },
  email: { label: "Email", verb: "logged an email" },
  stage_change: { label: "Stage change", verb: "updated a deal" },
  system: { label: "System", verb: "" },
};

// Kinds a person can log by hand.
export const LOGGABLE_KINDS = ["call", "meeting", "note", "email"];

export const INDUSTRIES = [
  "Software",
  "Financial services",
  "Healthcare",
  "Retail & ecommerce",
  "Food & beverage",
  "Hospitality",
  "Manufacturing",
  "Media",
  "Mobility",
  "Consumer electronics",
  "Outdoor apparel",
  "Grocery",
  "Education",
  "Non-profit",
  "Other",
];

export const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–500", "501–1000", "1000+"];
