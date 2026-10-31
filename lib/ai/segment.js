// Segment-suggestion vocabulary guard (isomorphic, pure). The model may only use fields and operators from
// lib/audience/segment_rules.js (passed in at runtime, custom fields included); anything else is dropped
// with a reason, and each value is coerced to what its operator expects so matchesConditions evaluates it.

const optionValue = (o) => (o && typeof o === "object" ? o.value ?? o.key ?? o.label : o);
const optionLabel = (o) => (o && typeof o === "object" ? o.label ?? o.value ?? o.key : o);
const CUSTOM_TYPES = ["text", "number", "date", "boolean", "select"];

// fields: the project's segment fields (buildSegmentFields output, or SEGMENT_FIELDS); custom fields missing
// from it are added as attributes.<key>.
export function buildVocabulary(fields = [], operators = [], customFields = []) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const cf of customFields) {
    const key = `attributes.${cf?.key}`;
    if (!cf?.key || byKey.has(key)) continue;
    const type = CUSTOM_TYPES.includes(cf.type) ? cf.type : "text";
    byKey.set(key, {
      key,
      label: cf.label || cf.key,
      type,
      operators: operators.filter((o) => (o.types || []).includes(type)).map((o) => o.key),
      options: type === "select" ? (cf.options || []).map((o) => (typeof o === "object" ? o : { value: String(o), label: String(o) })) : undefined,
    });
  }
  return { fields: byKey, operators: new Map(operators.map((o) => [o.key, o])) };
}

const VALUE_HINT = {
  none: "no value (null)",
  days: "a number of days",
  options: "an array of the field's values",
  tags: "an array of tag names",
  tag: "one tag name",
  list: "one list id",
  date: "a date YYYY-MM-DD",
  number: "a number",
  text: "text",
};

// Compact description for the prompt: one line per field, then the operators and their value shapes.
export function describeVocabulary(vocab, { eventNames = [] } = {}) {
  const lines = [];
  for (const f of vocab.fields.values()) {
    const ops = (f.operators || []).filter((k) => vocab.operators.has(k));
    if (!ops.length) continue;
    let line = `- ${f.key} (${f.type}): ${f.label}. operators: ${ops.join(", ")}`;
    const options = Array.isArray(f.options) ? f.options : [];
    if (options.length && ["select", "list", "tags"].includes(f.type)) {
      line += `. values: ${options.slice(0, 40).map((o) => (f.type === "list" ? `${optionValue(o)} = "${optionLabel(o)}"` : optionValue(o))).join("; ")}`;
    }
    if (f.type === "event") {
      line += f.key === "event"
        ? `. value: { "name": "<event name>", "count": <min times>, "days": <window, optional> }`
        : `. value: { "count": <min times>, "days": <window, optional> }`;
    }
    lines.push(line);
  }
  const opLines = [...vocab.operators.values()].map((o) => {
    const kind = o.value === "same" ? "same type as the field" : VALUE_HINT[o.value] || o.value || "";
    return `- ${o.key}: ${o.label}${kind ? ` (value: ${kind})` : ""}`;
  });
  const events = eventNames.length ? `\nTracked event names in use: ${eventNames.slice(0, 40).join(", ")}` : "";
  return `Fields:\n${lines.join("\n")}\nOperators:\n${opLines.join("\n")}${events}`;
}

const ok = (value) => ({ ok: true, value });
const no = (reason) => ({ ok: false, reason });
const blank = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
const ymd = (v) => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

function matchOption(field, value, lists) {
  const options = Array.isArray(field.options) && field.options.length
    ? field.options
    : field.type === "list"
      ? lists.map((l) => ({ value: l.id, label: l.name }))
      : [];
  if (!options.length) return field.type === "list" ? null : String(value).trim();
  const v = String(value).trim().toLowerCase();
  const hit = options.find((o) => String(optionValue(o)).toLowerCase() === v || String(optionLabel(o)).toLowerCase() === v);
  return hit ? optionValue(hit) : null;
}

function coerce(field, operator, value, lists) {
  const kind = operator.value === "same" ? field.type : operator.value || field.type;
  if (kind === "none") return ok(null);
  if (kind === "event") {
    const v = value && typeof value === "object" && !Array.isArray(value) ? value : field.key === "event" ? { name: value } : {};
    const out = { count: Math.max(1, Math.round(Number(v.count) || 1)) };
    const days = Math.round(Number(v.days));
    if (days > 0) out.days = days;
    if (field.key === "event") {
      const name = String(v.name ?? "").trim();
      if (!name) return no("needs an event name");
      out.name = name;
    }
    if (v.channel && field.key === "engagement.received") out.channel = String(v.channel);
    return ok(out);
  }
  if (blank(value)) return no("needs a value");
  switch (kind) {
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? ok(n) : no("value isn't a number");
    }
    case "days": {
      const n = Math.round(Number(value));
      return n > 0 ? ok(n) : no("needs a number of days");
    }
    case "date": {
      const d = ymd(value);
      return d ? ok(d) : no("value isn't a date");
    }
    case "select":
    case "option":
    case "list": {
      const v = matchOption(field, Array.isArray(value) ? value[0] : value, lists);
      return v == null ? no(field.type === "list" ? "unknown list" : "value isn't one of the field's options") : ok(v);
    }
    case "options": {
      const values = (Array.isArray(value) ? value : [value]).map((x) => matchOption(field, x, lists)).filter((x) => x != null);
      return values.length ? ok(values) : no("values aren't the field's options");
    }
    case "tags": {
      const tags = (Array.isArray(value) ? value : String(value).split(",")).map((t) => String(t).trim()).filter(Boolean);
      return tags.length ? ok(tags) : no("needs at least one tag");
    }
    case "tag":
      return ok(String(Array.isArray(value) ? value[0] : value).trim());
    default:
      return typeof value === "object" ? no("value isn't text") : ok(String(value).trim());
  }
}

// -> { match, conditions: valid [{ id, field, operator, value }], dropped: [{ field, operator, reason }] }
export function validateConditions({ match, conditions } = {}, vocab, lists = []) {
  const valid = [];
  const dropped = [];
  (Array.isArray(conditions) ? conditions : []).slice(0, 12).forEach((c, i) => {
    const field = vocab.fields.get(String(c?.field || ""));
    const operatorKey = String(c?.operator || "");
    const operator = vocab.operators.get(operatorKey);
    if (!field) return dropped.push({ field: c?.field ?? "", operator: operatorKey, reason: "unknown field" });
    if (!operator || !(field.operators || []).includes(operatorKey)) {
      return dropped.push({ field: field.key, operator: operatorKey, reason: "operator not allowed for this field" });
    }
    const coerced = coerce(field, operator, c?.value, lists);
    if (!coerced.ok) return dropped.push({ field: field.key, operator: operatorKey, reason: coerced.reason });
    valid.push({ id: typeof c?.id === "string" && c.id ? c.id : `c${i + 1}`, field: field.key, operator: operatorKey, value: coerced.value });
  });
  return { match: match === "any" ? "any" : "all", conditions: valid, dropped };
}
