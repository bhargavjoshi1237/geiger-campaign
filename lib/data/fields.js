// Field schema for custom objects and catalogs (pure, client-safe). A schema is
// [{ key, label, type, required, options }]; record/item data is a { [key]: value } bag validated against it.

export const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / no" },
  { value: "date", label: "Date" },
  { value: "select", label: "Single select" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
];

const TYPE_KEYS = new Set(FIELD_TYPES.map((t) => t.value));

export function fieldTypeLabel(type) {
  return FIELD_TYPES.find((t) => t.value === type)?.label || "Text";
}

// "Plan name" -> "plan_name"; always starts with a letter so it's a valid API name.
export function toKey(label, fallback = "field") {
  const key = String(label || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 63);
  if (!key) return fallback;
  return /^[a-z]/.test(key) ? key : `${fallback}_${key}`.slice(0, 63);
}

export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

// Cleans a schema: valid unique keys, known types, trimmed labels, options only for select.
export function sanitizeFields(fields) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(fields) ? fields : []) {
    if (!raw || typeof raw !== "object") continue;
    const label = String(raw.label || raw.key || "").trim();
    let key = KEY_PATTERN.test(raw.key || "") ? raw.key : toKey(label);
    while (seen.has(key)) key = `${key}_2`.slice(0, 63);
    seen.add(key);
    const type = TYPE_KEYS.has(raw.type) ? raw.type : "text";
    const field = { key, label: label || key, type, required: Boolean(raw.required) };
    if (type === "select") {
      field.options = [...new Set((Array.isArray(raw.options) ? raw.options : []).map((o) => String(o).trim()).filter(Boolean))];
    }
    out.push(field);
  }
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One raw value (form input or CSV cell) -> { value, error }. Empty -> null.
export function coerceValue(field, raw) {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return { value: null, error: field.required ? `${field.label} is required.` : null };
  }
  const text = typeof raw === "string" ? raw.trim() : raw;
  switch (field.type) {
    case "number": {
      const n = typeof text === "number" ? text : Number(String(text).replace(/[,\s]/g, ""));
      return Number.isFinite(n) ? { value: n, error: null } : { value: null, error: `${field.label} must be a number.` };
    }
    case "boolean": {
      if (typeof text === "boolean") return { value: text, error: null };
      const s = String(text).toLowerCase();
      if (["true", "yes", "y", "1"].includes(s)) return { value: true, error: null };
      if (["false", "no", "n", "0"].includes(s)) return { value: false, error: null };
      return { value: null, error: `${field.label} must be yes or no.` };
    }
    case "date": {
      const d = new Date(text);
      return Number.isNaN(d.getTime()) ? { value: null, error: `${field.label} must be a date.` } : { value: d.toISOString().slice(0, 10), error: null };
    }
    case "select": {
      const s = String(text);
      if (field.options?.length && !field.options.includes(s)) return { value: null, error: `${field.label} must be one of ${field.options.join(", ")}.` };
      return { value: s, error: null };
    }
    case "url": {
      try {
        const u = new URL(String(text));
        return /^https?:$/.test(u.protocol) ? { value: u.toString(), error: null } : { value: null, error: `${field.label} must be a web address.` };
      } catch {
        return { value: null, error: `${field.label} must be a web address.` };
      }
    }
    case "email": {
      const s = String(text).toLowerCase();
      return EMAIL.test(s) ? { value: s, error: null } : { value: null, error: `${field.label} must be an email address.` };
    }
    default:
      return { value: String(text).slice(0, 5000), error: null };
  }
}

// Validates a whole data bag against the schema. Unknown keys are kept as text so nothing is lost.
export function validateData(fields, input) {
  const data = {};
  const errors = [];
  const known = new Set();
  for (const field of fields || []) {
    known.add(field.key);
    const { value, error } = coerceValue(field, input?.[field.key]);
    if (error) errors.push(error);
    if (value !== null) data[field.key] = value;
  }
  for (const [key, value] of Object.entries(input || {})) {
    if (known.has(key) || value === null || value === undefined || value === "") continue;
    if (KEY_PATTERN.test(key)) data[key] = typeof value === "object" ? value : String(value).slice(0, 5000);
  }
  return { data, errors };
}

// A record's display label: its primary field, else the first text field, else the external id.
export function recordLabel(fields, data, { primaryField, externalId } = {}) {
  const pick = (key) => (key && data?.[key] != null && data[key] !== "" ? String(data[key]) : "");
  return pick(primaryField) || pick((fields || []).find((f) => f.type === "text")?.key) || externalId || "Untitled";
}

export function formatValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (field?.type === "boolean") return value ? "Yes" : "No";
  if (field?.type === "number") return Number(value).toLocaleString("en-US");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
