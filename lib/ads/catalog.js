// Ads vocabulary (isomorphic, pure): Click-to-Message destinations, objectives, CTA types, Conversions API
// event mappings and automated-rule metrics, shared by the ads screens, routes and worker.

// Click-to-Message destinations and the Marketing API values each one needs.
export const AD_DESTINATIONS = [
  {
    value: "whatsapp",
    label: "WhatsApp",
    channel: "whatsapp",
    destinationType: "WHATSAPP",
    cta: "WHATSAPP_MESSAGE",
    appDestination: "WHATSAPP",
    link: "https://api.whatsapp.com/send",
  },
  {
    value: "messenger",
    label: "Messenger",
    channel: "messenger",
    destinationType: "MESSENGER",
    cta: "MESSAGE_PAGE",
    appDestination: "MESSENGER",
    link: "https://fb.com/messenger_doc/",
  },
  {
    value: "instagram",
    label: "Instagram Direct",
    channel: "instagram",
    destinationType: "INSTAGRAM_DIRECT",
    cta: "INSTAGRAM_MESSAGE",
    appDestination: "INSTAGRAM_DIRECT",
    link: "https://www.instagram.com/",
  },
];

export const destinationMeta = (value) => AD_DESTINATIONS.find((d) => d.value === value) || AD_DESTINATIONS[0];

export const AD_OBJECTIVES = [
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement", hint: "Optimise for conversations started." },
  { value: "OUTCOME_LEADS", label: "Leads", hint: "Collect leads in the chat thread." },
  { value: "OUTCOME_SALES", label: "Sales", hint: "Drive purchases that happen in chat." },
];

export const objectiveLabel = (value) => AD_OBJECTIVES.find((o) => o.value === value)?.label || String(value || "").replace(/^OUTCOME_/, "").toLowerCase();

export const CTA_TYPES = [
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "SHOP_NOW", label: "Shop now" },
  { value: "SIGN_UP", label: "Sign up" },
  { value: "BOOK_TRAVEL", label: "Book now" },
  { value: "CONTACT_US", label: "Contact us" },
  { value: "GET_OFFER", label: "Get offer" },
  { value: "WHATSAPP_MESSAGE", label: "Send WhatsApp message" },
  { value: "MESSAGE_PAGE", label: "Send message" },
  { value: "INSTAGRAM_MESSAGE", label: "Send Instagram message" },
];

export const ctaLabel = (value) => CTA_TYPES.find((c) => c.value === value)?.label || value || "—";

export const CREATIVE_FORMATS = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
];

// Meta standard events for website / system conversions.
export const META_STANDARD_EVENTS = [
  "Purchase",
  "Lead",
  "CompleteRegistration",
  "SubmitApplication",
  "Contact",
  "Schedule",
  "Subscribe",
  "StartTrial",
  "InitiateCheckout",
  "AddToCart",
  "AddPaymentInfo",
  "ViewContent",
  "Search",
];

// Events Meta accepts with action_source "business_messaging".
export const META_MESSAGING_EVENTS = [
  "Purchase",
  "LeadSubmitted",
  "QualifiedLead",
  "InitiateCheckout",
  "AddToCart",
  "ViewContent",
  "OrderCreated",
  "OrderShipped",
  "OrderDelivered",
  "OrderCanceled",
  "OrderReturned",
  "CartAbandoned",
  "RatingProvided",
  "ReviewProvided",
];

// Default mappings: which Geiger tracked events become which Meta events.
export const CAPI_EVENT_CATALOG = [
  { key: "purchase", label: "Purchase", sources: ["order_placed", "purchase", "checkout_completed"], metaEvent: "Purchase", messagingEvent: "Purchase", valueFrom: "revenue", enabled: true },
  { key: "lead", label: "Lead", sources: ["lead_captured"], metaEvent: "Lead", messagingEvent: "LeadSubmitted", valueFrom: "none", enabled: true },
  { key: "deal_won", label: "Deal won", sources: ["deal_won"], metaEvent: "Purchase", messagingEvent: "Purchase", valueFrom: "revenue", enabled: false },
  { key: "form_submitted", label: "Form submitted", sources: ["form_submitted"], metaEvent: "SubmitApplication", messagingEvent: "LeadSubmitted", valueFrom: "none", enabled: false },
];

export function defaultCapiEvents() {
  return CAPI_EVENT_CATALOG.map((e) => ({ ...e, sources: [...e.sources] }));
}

// Tracked events that mean "this person opened a thread from an ad" (written by the inbound webhooks).
export const AD_REFERRAL_EVENTS = ["social.ad_click", "social.referral"];

// The ad id / ref / click id a referral event carries, whatever shape the webhook stored.
export function referralContext(properties = {}) {
  const p = properties && typeof properties === "object" ? properties : {};
  const r = p.referral && typeof p.referral === "object" ? p.referral : {};
  return {
    adId: String(p.adId ?? p.ad_id ?? r.ad_id ?? r.source_id ?? p.sourceId ?? "") || null,
    ref: String(p.ref ?? r.ref ?? "") || null,
    ctwaClid: String(p.ctwaClid ?? p.ctwa_clid ?? r.ctwa_clid ?? "") || null,
    channel: p.channel ?? null,
  };
}

export const RULE_METRICS = [
  { value: "cpl", label: "Cost per lead", kind: "money" },
  { value: "cost_per_conversation", label: "Cost per conversation", kind: "money" },
  { value: "cpc", label: "Cost per click", kind: "money" },
  { value: "ctr", label: "Click-through rate", kind: "percent" },
  { value: "spend", label: "Spend", kind: "money" },
];

export const ruleMetricMeta = (value) => RULE_METRICS.find((m) => m.value === value) || RULE_METRICS[0];

// The metric value a rule judges, from a snapshot's insights; null when it can't be computed.
export function insightMetric(insights = {}, metric) {
  const i = insights || {};
  const spend = Number(i.spend) || 0;
  switch (metric) {
    case "cpl":
      return Number(i.leads) > 0 ? spend / Number(i.leads) : null;
    case "cost_per_conversation":
      return Number(i.conversations) > 0 ? spend / Number(i.conversations) : null;
    case "cpc":
      return Number(i.clicks) > 0 ? spend / Number(i.clicks) : null;
    case "ctr":
      return Number(i.impressions) > 0 ? (Number(i.clicks) / Number(i.impressions)) * 100 : null;
    case "spend":
      return spend;
    default:
      return null;
  }
}

export const LEVELS = [
  { value: "campaign", label: "Campaign" },
  { value: "adset", label: "Ad set" },
  { value: "ad", label: "Ad" },
];

// Contact fields a lead-form question can map to; custom fields use "attributes.<key>".
export const LEAD_FIELD_TARGETS = [
  { value: "ignore", label: "Don't import" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "fullName", label: "Full name" },
];

// Meta's standard lead-form question keys -> contact fields.
const STANDARD_LEAD_KEYS = {
  email: "email",
  work_email: "email",
  phone_number: "phone",
  work_phone_number: "phone",
  first_name: "firstName",
  last_name: "lastName",
  full_name: "fullName",
};

export function defaultLeadMapping(questions = []) {
  const mapping = {};
  for (const q of questions || []) {
    const key = q?.key;
    if (!key) continue;
    const type = String(q.type || "").toLowerCase();
    mapping[key] = STANDARD_LEAD_KEYS[key] || STANDARD_LEAD_KEYS[type] || `attributes.${key.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
  }
  return mapping;
}

export const CONSENT_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
];

export const AUDIENCE_SCHEDULES = [
  { value: "manual", label: "Manual only" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

// When the next scheduled refresh is due after a run at `from`.
export function nextSyncAt(schedule, from = new Date()) {
  const base = new Date(from).getTime();
  if (schedule === "daily") return new Date(base + 24 * 3_600_000).toISOString();
  if (schedule === "weekly") return new Date(base + 7 * 24 * 3_600_000).toISOString();
  return null;
}

// Ads Manager deep link for an ad account (act_123 or 123).
export function adsManagerUrl(externalAccountId) {
  const id = String(externalAccountId || "").replace(/^act_/, "");
  return id ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${id}` : "https://adsmanager.facebook.com/";
}

// Currencies Meta bills without minor units (budgets are sent as whole numbers).
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "COP", "CRC", "HUF", "ISK", "PYG", "TWD", "IDR"]);

export const minorUnitFactor = (currency) => (ZERO_DECIMAL.has(String(currency || "").toUpperCase()) ? 1 : 100);
