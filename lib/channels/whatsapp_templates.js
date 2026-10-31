// WhatsApp message templates (isomorphic, pure): the composer draft <-> Meta's component format, the
// policy linter run before submission, preview rendering with sample values and the send-time
// parameter builder. Components are stored exactly as Meta's message_templates API expects them.

export const TEMPLATE_CATEGORIES = [
  { value: "marketing", label: "Marketing", hint: "Promotions and offers. Billed at the highest per-message rate." },
  { value: "utility", label: "Utility", hint: "Updates about an order, account or request the customer started." },
  { value: "authentication", label: "Authentication", hint: "One-time passcodes, using Meta's fixed OTP format." },
];

export const TEMPLATE_LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "es", label: "Spanish" },
  { code: "es_MX", label: "Spanish (MEX)" },
  { code: "pt_BR", label: "Portuguese (BR)" },
  { code: "pt_PT", label: "Portuguese (POR)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "ar", label: "Arabic" },
];

export const languageLabel = (code) => TEMPLATE_LANGUAGES.find((l) => l.code === code)?.label || code || "—";

// Meta status -> ours (draft is local-only, before the first submission).
const META_STATUS = {
  APPROVED: "approved",
  PENDING: "pending",
  IN_APPEAL: "pending",
  PENDING_DELETION: "paused",
  REJECTED: "rejected",
  DISABLED: "disabled",
  PAUSED: "paused",
  LIMIT_EXCEEDED: "paused",
  ARCHIVED: "disabled",
};

export const fromMetaStatus = (status) => META_STATUS[String(status || "").toUpperCase()] || "pending";

// Meta's rejected_reason enum -> plain copy.
const REJECTION_COPY = {
  ABUSIVE_CONTENT: "Meta flagged the content as abusive.",
  INVALID_FORMAT: "The template format is invalid (variables, length or structure).",
  PROMOTIONAL: "The content reads as promotional for its category — try Marketing.",
  TAG_CONTENT_MISMATCH: "The content doesn't match the selected category.",
  SCAM: "Meta flagged the content as a possible scam.",
  INCORRECT_CATEGORY: "The category doesn't match the content.",
};

export function rejectionCopy(reason) {
  if (!reason || reason === "NONE") return "";
  return REJECTION_COPY[reason] || String(reason).replace(/_/g, " ").toLowerCase();
}

export const QUALITY_RATINGS = {
  GREEN: { label: "High", variant: "success" },
  YELLOW: { label: "Medium", variant: "warning" },
  RED: { label: "Low", variant: "danger" },
  UNKNOWN: { label: "Unknown", variant: "neutral" },
  NA: { label: "Not rated", variant: "neutral" },
};

const TIERS = {
  TIER_50: "50",
  TIER_250: "250",
  TIER_1K: "1K",
  TIER_10K: "10K",
  TIER_100K: "100K",
  TIER_UNLIMITED: "Unlimited",
};

export function messagingTierLabel(tier) {
  if (!tier) return "—";
  const value = TIERS[String(tier).toUpperCase()];
  return value ? (value === "Unlimited" ? "Unlimited" : `${value} customers / 24h`) : String(tier);
}

// Highest {{n}} used in a string, and the list of indexes in order of appearance.
export function variableIndexes(text) {
  return Array.from(String(text || "").matchAll(/\{\{\s*(\d+)\s*\}\}/g), (m) => Number(m[1]));
}

export function variableCount(text) {
  const indexes = variableIndexes(text);
  return indexes.length ? Math.max(...indexes) : 0;
}

const fill = (text, samples) =>
  String(text || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const value = samples?.[Number(n) - 1];
    return value ? String(value) : `{{${n}}}`;
  });

const sized = (list, n) => Array.from({ length: n }, (_, i) => list?.[i] ?? "");

export const EMPTY_TEMPLATE_DRAFT = {
  name: "",
  language: "en_US",
  category: "marketing",
  headerType: "none",
  headerText: "",
  headerSamples: [],
  body: "",
  bodySamples: [],
  footer: "",
  buttons: [],
  securityRecommendation: true,
  codeExpirationMinutes: "",
  otpButtonText: "Copy code",
};

// Composer draft -> Meta components.
export function componentsFromDraft(draft) {
  if (draft.category === "authentication") {
    const minutes = Number(draft.codeExpirationMinutes);
    return [
      { type: "BODY", add_security_recommendation: Boolean(draft.securityRecommendation) },
      ...(minutes > 0 ? [{ type: "FOOTER", code_expiration_minutes: minutes }] : []),
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: draft.otpButtonText || "Copy code" }] },
    ];
  }

  const components = [];
  if (draft.headerType === "text" && draft.headerText.trim()) {
    const count = variableCount(draft.headerText);
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: draft.headerText.trim(),
      ...(count ? { example: { header_text: sized(draft.headerSamples, count) } } : {}),
    });
  }
  const bodyCount = variableCount(draft.body);
  components.push({
    type: "BODY",
    text: draft.body.trim(),
    ...(bodyCount ? { example: { body_text: [sized(draft.bodySamples, bodyCount)] } } : {}),
  });
  if (draft.footer.trim()) components.push({ type: "FOOTER", text: draft.footer.trim() });
  const buttons = (draft.buttons || []).map((b) => {
    if (b.type === "url") {
      const dynamic = variableCount(b.url) > 0;
      return { type: "URL", text: b.text.trim(), url: b.url.trim(), ...(dynamic ? { example: [b.urlSample || ""] } : {}) };
    }
    if (b.type === "phone") return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone.replace(/[^\d+]/g, "") };
    return { type: "QUICK_REPLY", text: b.text.trim() };
  });
  if (buttons.length) components.push({ type: "BUTTONS", buttons });
  return components;
}

// Meta components -> composer draft (inverse of componentsFromDraft).
export function draftFromTemplate(template) {
  const components = Array.isArray(template?.components) ? template.components : [];
  const find = (type) => components.find((c) => String(c.type).toUpperCase() === type);
  const header = find("HEADER");
  const body = find("BODY");
  const footer = find("FOOTER");
  const buttons = find("BUTTONS")?.buttons || [];
  const otp = buttons.find((b) => String(b.type).toUpperCase() === "OTP");

  return {
    ...EMPTY_TEMPLATE_DRAFT,
    name: template?.name || "",
    language: template?.language || "en_US",
    category: template?.category || "marketing",
    headerType: header?.format === "TEXT" && header.text ? "text" : "none",
    headerText: header?.text || "",
    headerSamples: header?.example?.header_text || [],
    body: body?.text || "",
    bodySamples: body?.example?.body_text?.[0] || [],
    footer: footer?.text || "",
    buttons: otp
      ? []
      : buttons.map((b, i) => {
          const type = String(b.type).toUpperCase();
          return {
            id: `b${i}`,
            type: type === "URL" ? "url" : type === "PHONE_NUMBER" ? "phone" : "quick_reply",
            text: b.text || "",
            url: b.url || "",
            urlSample: Array.isArray(b.example) ? b.example[0] || "" : "",
            phone: b.phone_number || "",
          };
        }),
    securityRecommendation: body?.add_security_recommendation ?? true,
    codeExpirationMinutes: footer?.code_expiration_minutes ? String(footer.code_expiration_minutes) : "",
    otpButtonText: otp?.text || "Copy code",
  };
}

// Pre-submission policy linter: everything Meta rejects outright for format reasons.
export function validateTemplateDraft(draft) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });

  if (!draft.name) add("name", "Add a template name.");
  else if (!/^[a-z0-9_]+$/.test(draft.name)) add("name", "Names use lowercase letters, numbers and underscores only.");
  else if (draft.name.length > 512) add("name", "Names are 512 characters at most.");

  if (draft.category === "authentication") {
    const minutes = Number(draft.codeExpirationMinutes);
    if (draft.codeExpirationMinutes && (!Number.isInteger(minutes) || minutes < 1 || minutes > 90)) {
      add("codeExpirationMinutes", "Code expiry is a whole number of minutes between 1 and 90.");
    }
    if ((draft.otpButtonText || "").length > 25) add("otpButtonText", "Button text is 25 characters at most.");
    return issues;
  }

  const sequential = (text, field, label) => {
    const indexes = variableIndexes(text);
    const max = indexes.length ? Math.max(...indexes) : 0;
    for (let n = 1; n <= max; n += 1) {
      if (!indexes.includes(n)) {
        add(field, `${label} variables must run in order from {{1}} — {{${n}}} is missing.`);
        break;
      }
    }
    return max;
  };

  if (draft.headerType === "text") {
    if (!draft.headerText.trim()) add("headerText", "Add header text or remove the header.");
    if (draft.headerText.length > 60) add("headerText", "Header text is 60 characters at most.");
    const count = sequential(draft.headerText, "headerText", "Header");
    if (count > 1) add("headerText", "A text header can hold one variable.");
    if (count && !String(draft.headerSamples?.[0] || "").trim()) add("headerSamples", "Add a sample value for the header variable.");
  }

  const body = draft.body.trim();
  if (!body) add("body", "The body is required.");
  if (body.length > 1024) add("body", "The body is 1,024 characters at most.");
  const bodyCount = sequential(body, "body", "Body");
  if (/^\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}$/.test(body)) {
    add("body", "The body can't start or end with a variable.");
  }
  for (let i = 0; i < bodyCount; i += 1) {
    if (!String(draft.bodySamples?.[i] || "").trim()) {
      add("bodySamples", `Add a sample value for {{${i + 1}}}.`);
      break;
    }
  }

  if (draft.footer.length > 60) add("footer", "The footer is 60 characters at most.");
  if (variableCount(draft.footer)) add("footer", "The footer can't contain variables.");

  const buttons = draft.buttons || [];
  if (buttons.length > 10) add("buttons", "Templates hold 10 buttons at most.");
  if (buttons.filter((b) => b.type === "url").length > 2) add("buttons", "Use at most two website buttons.");
  if (buttons.filter((b) => b.type === "phone").length > 1) add("buttons", "Use at most one call button.");
  buttons.forEach((b, i) => {
    const label = `Button ${i + 1}`;
    if (!b.text.trim()) add("buttons", `${label} needs text.`);
    if (b.text.length > 25) add("buttons", `${label} text is 25 characters at most.`);
    if (b.type === "url") {
      if (!/^https:\/\//i.test(b.url.trim())) add("buttons", `${label} needs an https:// URL.`);
      const count = variableCount(b.url);
      if (count > 1) add("buttons", `${label} URL can hold one variable.`);
      if (count && !/\{\{\s*1\s*\}\}$/.test(b.url.trim())) add("buttons", `${label} URL variable must be at the end.`);
      if (count && !String(b.urlSample || "").trim()) add("buttons", `${label} needs a sample for its URL variable.`);
    }
    if (b.type === "phone" && !/^\+?\d{6,20}$/.test(b.phone.replace(/[\s()-]/g, ""))) {
      add("buttons", `${label} needs a phone number in international format.`);
    }
  });
  return issues;
}

// What the recipient sees, with samples substituted (for the composer preview and test sends).
export function renderTemplatePreview(draft) {
  if (draft.category === "authentication") {
    const minutes = Number(draft.codeExpirationMinutes);
    return {
      header: "",
      body: `*123456* is your verification code.${draft.securityRecommendation ? " For your security, do not share this code." : ""}`,
      footer: minutes > 0 ? `This code expires in ${minutes} minutes.` : "",
      buttons: [{ type: "otp", text: draft.otpButtonText || "Copy code" }],
    };
  }
  return {
    header: draft.headerType === "text" ? fill(draft.headerText, draft.headerSamples) : "",
    body: fill(draft.body, draft.bodySamples),
    footer: draft.footer,
    buttons: (draft.buttons || []).map((b) => ({ type: b.type, text: b.text })),
  };
}

// Sample values a stored template carries, shaped as send-time variables (used for test sends).
export function sampleVariables(template) {
  const draft = draftFromTemplate(template);
  if (draft.category === "authentication") return { body: ["123456"] };
  const buttons = {};
  draft.buttons.forEach((b, i) => {
    if (b.type === "url" && variableCount(b.url)) buttons[i] = b.urlSample;
  });
  return { header: draft.headerSamples, body: draft.bodySamples, buttons };
}

// Send-time components for /messages: variables = { header: [..], body: [..], buttons: { [index]: value } }.
export function templateParameters(template, variables = {}) {
  const components = Array.isArray(template?.components) ? template.components : [];
  const text = (value) => ({ type: "text", text: String(value ?? "") });
  const out = [];
  const isAuth = template?.category === "authentication";

  const header = components.find((c) => c.type === "HEADER" && c.format === "TEXT");
  if (header && variableCount(header.text)) {
    out.push({ type: "header", parameters: sized(variables.header, variableCount(header.text)).map(text) });
  }
  const body = components.find((c) => c.type === "BODY");
  const bodyCount = isAuth ? 1 : variableCount(body?.text);
  if (bodyCount) out.push({ type: "body", parameters: sized(variables.body, bodyCount).map(text) });

  const buttons = components.find((c) => c.type === "BUTTONS")?.buttons || [];
  buttons.forEach((b, index) => {
    const type = String(b.type).toUpperCase();
    if (type === "OTP") {
      out.push({ type: "button", sub_type: "url", index: String(index), parameters: [text(variables.body?.[0])] });
    } else if (type === "URL" && variableCount(b.url)) {
      out.push({ type: "button", sub_type: "url", index: String(index), parameters: [text(variables.buttons?.[index])] });
    }
  });
  return out;
}

// Missing send-time values, so a send fails before it reaches Meta.
export function missingTemplateVariables(template, variables = {}) {
  return templateParameters(template, variables).flatMap((c) =>
    c.parameters.filter((p) => !String(p.text || "").trim()).map(() => c.type),
  );
}
