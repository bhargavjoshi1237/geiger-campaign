// Workspace settings vocabulary (isomorphic, pure): per-section defaults, option lists and the merge that
// turns a stored campaign.workspace_settings row into complete, type-safe sections. Shared by the
// settings screens, lib/settings/server.js and the playground.

export const GENERAL_DEFAULTS = { name: "", timezone: "UTC", locale: "en-US", currency: "USD" };
export const SENDING_DEFAULTS = { fromName: "", fromEmail: "", replyTo: "", quietHours: null, weeklyFrequencyCap: null };
// utm: null leaves links untagged; { enabled, source, medium } tags every tracked link (lib/email/tracking.js).
export const TRACKING_DEFAULTS = { opens: true, clicks: true, linkDomain: "", utm: null };
export const ADVANCED_DEFAULTS = { doubleOptInDefault: false, retentionMonths: null };
export const BILLING_DEFAULTS = { plan: "free", interval: "monthly", cycleAnchorDay: 1, changedAt: null, changedBy: null };
export const BRANDING_DEFAULTS = {
  logoUrl: "",
  logoDarkUrl: "",
  iconUrl: "",
  primaryColor: "",
  accentColor: "",
  textColor: "",
  backgroundColor: "",
  fontHeading: "",
  fontBody: "",
  voice: "",
  footerText: "",
  address: "",
  socialLinks: {},
};

export const SETTINGS_SECTIONS = ["general", "sending", "tracking", "advanced", "billing"];

export const TIMEZONE_OPTIONS = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Dublin",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Istanbul",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export const LOCALE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Español" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "ja-JP", label: "日本語" },
];

export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "CAD", "AUD", "BRL", "JPY", "INR"];

// retentionMonths null keeps activity for as long as the workspace exists.
export const RETENTION_OPTIONS = [
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "24", label: "24 months" },
  { value: "36", label: "36 months" },
  { value: "forever", label: "Keep forever" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOMAIN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export const isValidEmail = (value) => EMAIL.test(String(value || "").trim());
export const isValidTime = (value) => TIME.test(String(value || ""));
export const isValidDomain = (value) => DOMAIN.test(String(value || "").trim());

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const text = (v, fallback = "") => (typeof v === "string" ? v : fallback);
const positiveInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function normalizeGeneral(input) {
  const g = { ...GENERAL_DEFAULTS, ...bag(input) };
  return {
    name: text(g.name),
    timezone: text(g.timezone, GENERAL_DEFAULTS.timezone) || GENERAL_DEFAULTS.timezone,
    locale: text(g.locale, GENERAL_DEFAULTS.locale) || GENERAL_DEFAULTS.locale,
    currency: text(g.currency, GENERAL_DEFAULTS.currency) || GENERAL_DEFAULTS.currency,
  };
}

export function normalizeSending(input) {
  const s = { ...SENDING_DEFAULTS, ...bag(input) };
  const quiet = bag(s.quietHours);
  return {
    fromName: text(s.fromName),
    fromEmail: text(s.fromEmail),
    replyTo: text(s.replyTo),
    quietHours: isValidTime(quiet.start) && isValidTime(quiet.end) ? { start: quiet.start, end: quiet.end } : null,
    weeklyFrequencyCap: positiveInt(s.weeklyFrequencyCap),
  };
}

const UTM_VALUE = /^[a-z0-9_.-]{1,60}$/i;

export function normalizeTracking(input) {
  const t = { ...TRACKING_DEFAULTS, ...bag(input) };
  const utm = bag(t.utm);
  return {
    opens: t.opens !== false,
    clicks: t.clicks !== false,
    linkDomain: text(t.linkDomain).trim().toLowerCase(),
    utm:
      t.utm && utm.enabled !== false
        ? {
            enabled: true,
            source: UTM_VALUE.test(utm.source || "") ? utm.source : "",
            medium: UTM_VALUE.test(utm.medium || "") ? utm.medium : "",
          }
        : null,
  };
}

export function normalizeAdvanced(input) {
  const a = { ...ADVANCED_DEFAULTS, ...bag(input) };
  return { doubleOptInDefault: a.doubleOptInDefault === true, retentionMonths: positiveInt(a.retentionMonths) };
}

export function normalizeBilling(input) {
  const b = { ...BILLING_DEFAULTS, ...bag(input) };
  const anchor = positiveInt(b.cycleAnchorDay);
  return {
    plan: text(b.plan, BILLING_DEFAULTS.plan) || BILLING_DEFAULTS.plan,
    interval: b.interval === "annual" ? "annual" : "monthly",
    cycleAnchorDay: anchor && anchor <= 28 ? anchor : 1,
    changedAt: b.changedAt || null,
    changedBy: b.changedBy || null,
  };
}

// campaign.brand_kits row (snake_case) -> the branding section email rendering and AI copy read.
export function normalizeBranding(row) {
  const r = bag(row);
  return {
    logoUrl: text(r.logo_url),
    logoDarkUrl: text(r.logo_dark_url),
    iconUrl: text(r.icon_url),
    primaryColor: text(r.primary_color),
    accentColor: text(r.accent_color),
    textColor: text(r.text_color),
    backgroundColor: text(r.background_color),
    fontHeading: text(r.font_heading),
    fontBody: text(r.font_body),
    voice: text(r.voice),
    footerText: text(r.footer_text),
    address: text(r.company_address),
    socialLinks: bag(r.social_links),
  };
}

// Stored row (snake_case, any section possibly empty) -> complete sections with defaults filled in.
export function mergeSettings(row) {
  const r = bag(row);
  return {
    general: normalizeGeneral(r.general),
    sending: normalizeSending(r.sending),
    tracking: normalizeTracking(r.tracking),
    advanced: normalizeAdvanced(r.advanced),
    billing: normalizeBilling(r.billing),
  };
}
