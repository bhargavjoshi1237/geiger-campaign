// Form field model shared by the builder, the public renderers and server-side validation. Pure: no React,
// no database. A field is { id, type, key, label, placeholder, helpText, required, options, channel, param, defaultValue }.

export const FIELD_TYPES = [
  { type: "email", label: "Email", description: "Required for email consent and double opt-in." },
  { type: "text", label: "Short text", description: "Names, company, job title or any custom field." },
  { type: "textarea", label: "Long text", description: "A free-form message." },
  { type: "phone", label: "Phone", description: "Saved to the contact's phone for SMS and WhatsApp." },
  { type: "select", label: "Dropdown", description: "One choice from a fixed list." },
  { type: "checkbox", label: "Checkbox", description: "A yes/no answer saved as a custom field." },
  { type: "consent", label: "Consent", description: "An explicit opt-in checkbox for one channel." },
  { type: "hidden", label: "Hidden (UTM)", description: "Captures a UTM parameter or page value silently." },
];

export const FIELD_TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.type, t.label]));

// Where a text field's value lands on the contact; anything else is a custom attribute.
export const TEXT_TARGETS = [
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "attribute", label: "Custom field" },
];

export const CONSENT_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "push", label: "Push" },
];

export const CONSENT_CHANNEL_LABEL = Object.fromEntries(CONSENT_CHANNELS.map((c) => [c.value, c.label]));

export const HIDDEN_PARAMS = [
  { value: "utm_source", label: "utm_source" },
  { value: "utm_medium", label: "utm_medium" },
  { value: "utm_campaign", label: "utm_campaign" },
  { value: "utm_term", label: "utm_term" },
  { value: "utm_content", label: "utm_content" },
  { value: "referrer", label: "Referrer" },
  { value: "page_url", label: "Page URL" },
  { value: "static", label: "Fixed value" },
];

// Keys the server maps onto contact columns instead of custom attributes.
export const RESERVED_KEYS = new Set(["email", "phone", "first_name", "last_name"]);

const LIMITS = { text: 300, textarea: 5000, hidden: 500, select: 300 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export function slugKey(label) {
  return (
    String(label || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  );
}

function shortId() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// A key not already used by `fields`, suffixing _2, _3… when needed.
export function uniqueKey(base, fields = [], exceptId = null) {
  const taken = new Set(fields.filter((f) => f.id !== exceptId).map((f) => f.key));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

const DEFAULT_LABEL = {
  email: "Email",
  text: "First name",
  textarea: "Message",
  phone: "Phone",
  select: "Choose one",
  checkbox: "Yes, I'm interested",
  consent: "Email me news and offers",
  hidden: "utm_source",
};

export function newField(type, fields = []) {
  const nameTaken = type === "text" && fields.some((f) => f.key === "first_name");
  const label = nameTaken ? "Short answer" : DEFAULT_LABEL[type] || "Field";
  const base =
    type === "email" ? "email" : type === "phone" ? "phone" : type === "hidden" ? "utm_source" : type === "text" && !nameTaken ? "first_name" : slugKey(label);
  const field = {
    id: shortId(),
    type,
    key: uniqueKey(base, fields),
    label,
    placeholder: "",
    helpText: "",
    required: type === "email",
    options: type === "select" ? ["Option 1", "Option 2"] : [],
    channel: type === "consent" ? "email" : "",
    param: type === "hidden" ? "utm_source" : "",
    defaultValue: "",
  };
  return field;
}

export function defaultFormFields() {
  const email = { ...newField("email"), placeholder: "you@example.com" };
  const first = { ...newField("text", [email]), label: "First name", key: "first_name", required: false };
  return [email, first];
}

// Publish blockers for a field list, as plain sentences.
export function formIssues(fields = []) {
  const issues = [];
  if (!fields.some((f) => f.type === "email" || f.type === "phone")) {
    issues.push("Add an email or phone field so submissions can become contacts.");
  }
  const keys = new Map();
  for (const f of fields) keys.set(f.key, (keys.get(f.key) || 0) + 1);
  for (const [key, count] of keys) if (count > 1) issues.push(`Two fields save to "${key}". Give each a unique key.`);
  for (const f of fields) {
    if (!String(f.label || "").trim() && f.type !== "hidden") issues.push("Every visible field needs a label.");
    if (f.type === "select" && !(f.options || []).filter(Boolean).length) issues.push(`"${f.label}" needs at least one option.`);
    if (f.type === "consent" && !f.channel) issues.push(`"${f.label}" needs a consent channel.`);
  }
  return [...new Set(issues)];
}

const truthy = (v) => v === true || v === "true" || v === "on" || v === "1" || v === 1 || v === "yes";

// The public view of a form's fields: what a renderer needs, nothing about routing or lists.
export function publicFields(fields = []) {
  return fields.map((f) => ({
    id: f.id,
    type: f.type,
    key: f.key,
    label: f.label,
    placeholder: f.placeholder || "",
    helpText: f.helpText || "",
    required: Boolean(f.required),
    options: Array.isArray(f.options) ? f.options.filter(Boolean) : [],
    channel: f.channel || "",
    param: f.param || "",
    defaultValue: f.defaultValue || "",
  }));
}

// Validates one submission against the field config. Returns { values, consent, utm, errors } where
// `errors` maps field keys to a message; an empty object means the submission is acceptable.
export function validateSubmission(fields = [], input = {}, { pageUtm = {} } = {}) {
  const values = {};
  const consent = {};
  const utm = {};
  const errors = {};

  for (const field of fields) {
    const raw = input[field.key];
    const label = field.label || field.key;

    if (field.type === "checkbox" || field.type === "consent") {
      const checked = truthy(raw);
      if (field.required && !checked) errors[field.key] = field.type === "consent" ? "Please confirm to continue." : `${label} is required.`;
      if (field.type === "consent") {
        if (field.channel) consent[field.channel] = checked || Boolean(consent[field.channel]);
      } else {
        values[field.key] = checked;
      }
      continue;
    }

    let value = raw == null ? "" : String(Array.isArray(raw) ? raw[0] : raw).trim();
    if (field.type === "hidden") {
      if (field.param === "static") value = field.defaultValue || "";
      value = value.slice(0, LIMITS.hidden);
      if (value) {
        values[field.key] = value;
        if (field.param?.startsWith("utm_")) utm[field.param.slice(4)] = value;
      }
      continue;
    }

    if (!value) {
      if (field.required) errors[field.key] = `${label} is required.`;
      continue;
    }

    if (field.type === "email") {
      value = value.toLowerCase();
      if (value.length > 254 || !EMAIL_RE.test(value)) {
        errors[field.key] = "Enter a valid email address.";
        continue;
      }
    } else if (field.type === "phone") {
      const compact = value.replace(/[\s().-]/g, "");
      if (!PHONE_RE.test(compact)) {
        errors[field.key] = "Enter a valid phone number, including the country code.";
        continue;
      }
      value = compact;
    } else if (field.type === "select") {
      const options = (field.options || []).filter(Boolean);
      if (!options.includes(value)) {
        errors[field.key] = `Choose one of the listed options for ${label}.`;
        continue;
      }
    } else {
      const max = LIMITS[field.type] || LIMITS.text;
      if (value.length > max) {
        errors[field.key] = `${label} must be ${max} characters or fewer.`;
        continue;
      }
    }
    values[field.key] = value;
  }

  // UTM captured from the page URL (embed script / hosted page) fills anything the fields didn't.
  for (const key of ["source", "medium", "campaign", "term", "content"]) {
    const v = pageUtm?.[key] ?? pageUtm?.[`utm_${key}`];
    if (!utm[key] && typeof v === "string" && v.trim()) utm[key] = v.trim().slice(0, 200);
  }

  return { values, consent, utm, errors };
}

// Contact columns and custom attributes from validated values.
export function contactFromValues(fields = [], values = {}) {
  const contact = { email: "", phone: "", firstName: "", lastName: "", attributes: {} };
  for (const field of fields) {
    if (!(field.key in values)) continue;
    const value = values[field.key];
    if (field.type === "email" && !contact.email) contact.email = value;
    else if (field.type === "phone" && !contact.phone) contact.phone = value;
    else if (field.key === "first_name") contact.firstName = value;
    else if (field.key === "last_name") contact.lastName = value;
    else if (field.type !== "hidden") contact.attributes[field.key] = value;
  }
  return contact;
}
