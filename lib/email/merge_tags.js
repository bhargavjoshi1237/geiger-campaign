// Merge tags (isomorphic, pure): {{first_name}}, {{first_name|there}} fallbacks, {{attributes.plan}} and
// {{contact.plan}} paths. Used by the builder preview, the Personalization screen and every server send.
// OWNER: Campaigns.

// {{ key }} / {{ key | fallback }} / {{ key | "fallback" }}; keys are word chars and dots.
const TAG_PATTERN = /\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;

// Built-in contact fields every project has, in picker order.
export const CONTACT_MERGE_FIELDS = [
  { key: "first_name", label: "First name", type: "text" },
  { key: "last_name", label: "Last name", type: "text" },
  { key: "full_name", label: "Full name", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "country", label: "Country", type: "text" },
  { key: "company", label: "Company", type: "text" },
  { key: "timezone", label: "Timezone", type: "text" },
  { key: "locale", label: "Locale", type: "text" },
  { key: "tags", label: "Tags", type: "tags" },
  { key: "lead_score", label: "Lead score", type: "number" },
  { key: "status", label: "Subscription status", type: "text" },
];

// Filled per send by the delivery engine (links) or by the renderer (dates).
export const SYSTEM_MERGE_TAGS = [
  { key: "unsubscribe_url", label: "Unsubscribe link", type: "url" },
  { key: "preferences_url", label: "Preference center link", type: "url" },
  { key: "view_in_browser_url", label: "View in browser link", type: "url" },
  { key: "current_year", label: "Current year", type: "number" },
  { key: "current_date", label: "Today's date", type: "text" },
];

const BUILT_IN_KEYS = new Set([...CONTACT_MERGE_FIELDS, ...SYSTEM_MERGE_TAGS].map((f) => f.key));

const unquote = (s) => String(s ?? "").trim().replace(/^(?:"|&quot;|'|&#39;)([\s\S]*)(?:"|&quot;|'|&#39;)$/, "$1");

// Reads a dotted key from merge data; arrays render comma-separated.
export function resolveMergeValue(data, key) {
  const value = String(key || "")
    .split(".")
    .reduce((acc, part) => (acc == null ? acc : acc[part]), data || {});
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return "";
  return value;
}

// Replaces every tag with its value (or fallback). `escape` runs on each inserted value, so HTML callers
// can escape substitutions without touching the surrounding markup.
export function applyMergeTags(text, data = {}, { escape } = {}) {
  return String(text ?? "").replace(TAG_PATTERN, (_, key, fallback) => {
    const value = resolveMergeValue(data, key);
    const out = value == null || value === "" ? unquote(fallback ?? "") : String(value);
    return escape ? escape(out) : out;
  });
}

// Distinct keys a text uses, in order of first appearance.
export function extractMergeTags(text) {
  const keys = [];
  for (const match of String(text ?? "").matchAll(TAG_PATTERN)) if (!keys.includes(match[1])) keys.push(match[1]);
  return keys;
}

// The token to insert for a key; custom fields that shadow a built-in use the attributes path.
export function formatMergeTag(key, fallback = "") {
  const value = String(fallback || "").trim();
  return value ? `{{${key}|${value}}}` : `{{${key}}}`;
}

export function customFieldMergeKey(fieldKey) {
  return BUILT_IN_KEYS.has(fieldKey) ? `attributes.${fieldKey}` : fieldKey;
}

// Picker vocabulary: contact fields, then custom fields ([{ key, label, type }] from listCustomFields), then system tags.
export function mergeTagGroups(customFields = []) {
  return [
    { group: "Contact", fields: CONTACT_MERGE_FIELDS },
    {
      group: "Custom fields",
      fields: (customFields || [])
        .filter((f) => f?.key)
        .map((f) => ({ key: customFieldMergeKey(f.key), label: f.label || f.key, type: f.type || "text", custom: true })),
    },
    { group: "Links and dates", fields: SYSTEM_MERGE_TAGS },
  ].filter((g) => g.fields.length);
}

// The merge data a contact contributes. Accepts a raw contacts row or a normalized contact model;
// custom field values are available both at the root and under attributes./contact.
export function contactMergeData(contact = {}) {
  const c = contact || {};
  const attributes = c.attributes && typeof c.attributes === "object" ? c.attributes : {};
  const first = c.first_name ?? c.firstName ?? "";
  const last = c.last_name ?? c.lastName ?? "";
  const fields = {
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(" "),
    email: c.email ?? "",
    phone: c.phone ?? "",
    city: attributes.city ?? c.city ?? "",
    country: attributes.country ?? c.country ?? "",
    company: attributes.company ?? c.company ?? "",
    timezone: c.timezone ?? "",
    locale: c.locale ?? "",
    tags: Array.isArray(c.tags) ? c.tags : [],
    lead_score: c.lead_score ?? c.leadScore ?? 0,
    status: c.status ?? "",
    contact_id: c.id ?? null,
  };
  return { ...attributes, ...fields, attributes, contact: { ...attributes, ...fields } };
}

// Values the renderer always provides unless the caller overrides them.
export function systemMergeData(now = new Date()) {
  return {
    current_year: String(now.getUTCFullYear()),
    current_date: now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  };
}
