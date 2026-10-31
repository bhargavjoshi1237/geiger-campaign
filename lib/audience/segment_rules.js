// Segment rule engine (isomorphic, pure): the field/operator vocabulary segment conditions use and the
// evaluator shared by the Segments screen preview, AI segment suggestions, lead scoring and server audience
// resolution. A condition is { id, field, operator, value }; a segment matches "all" or "any".
// OWNER: Audience.

const DAY = 86_400_000;

// value: what the value control edits — "text" | "number" | "date" | "days" | "options" | "option" | "tag" |
// "tags" | "list" | "event" | "none". suffix: text shown after the value control.
export const SEGMENT_OPERATORS = [
  { key: "eq", label: "is", types: ["text", "number", "select"], value: "same" },
  { key: "neq", label: "is not", types: ["text", "number", "select"], value: "same" },
  { key: "contains", label: "contains", types: ["text"], value: "text" },
  { key: "not_contains", label: "does not contain", types: ["text"], value: "text" },
  { key: "starts_with", label: "starts with", types: ["text"], value: "text" },
  { key: "ends_with", label: "ends with", types: ["text"], value: "text" },
  { key: "gt", label: "is greater than", types: ["number"], value: "number" },
  { key: "gte", label: "is at least", types: ["number"], value: "number" },
  { key: "lt", label: "is less than", types: ["number"], value: "number" },
  { key: "lte", label: "is at most", types: ["number"], value: "number" },
  { key: "in", label: "is any of", types: ["select"], value: "options" },
  { key: "not_in", label: "is none of", types: ["select"], value: "options" },
  { key: "before", label: "is before", types: ["date"], value: "date" },
  { key: "after", label: "is after", types: ["date"], value: "date" },
  { key: "within_days", label: "is in the last", types: ["date"], value: "days", suffix: "days" },
  { key: "older_than_days", label: "is more than", types: ["date"], value: "days", suffix: "days ago" },
  { key: "is_true", label: "is true", types: ["boolean"], value: "none" },
  { key: "is_false", label: "is false", types: ["boolean"], value: "none" },
  { key: "has", label: "includes", types: ["tags"], value: "tag" },
  { key: "not_has", label: "does not include", types: ["tags"], value: "tag" },
  { key: "has_any", label: "includes any of", types: ["tags"], value: "tags" },
  { key: "has_none", label: "includes none of", types: ["tags"], value: "tags" },
  { key: "in_list", label: "is a member of", types: ["list"], value: "list" },
  { key: "not_in_list", label: "is not a member of", types: ["list"], value: "list" },
  { key: "performed", label: "at least", types: ["event"], value: "event" },
  { key: "not_performed", label: "fewer than", types: ["event"], value: "event" },
  { key: "is_set", label: "has a value", types: ["text", "number", "date", "select"], value: "none" },
  { key: "is_not_set", label: "is empty", types: ["text", "number", "date", "select"], value: "none" },
];

const OPERATOR_BY_KEY = Object.fromEntries(SEGMENT_OPERATORS.map((o) => [o.key, o]));

export function operatorsFor(type) {
  return SEGMENT_OPERATORS.filter((o) => o.types.includes(type)).map((o) => o.key);
}

export function getOperator(key) {
  return OPERATOR_BY_KEY[key] ?? null;
}

const STATUS_OPTIONS = [
  { value: "subscribed", label: "Subscribed" },
  { value: "pending", label: "Pending" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "bounced", label: "Bounced" },
  { value: "complained", label: "Complained" },
];

// Behaviour fields read the contact's deliveries / tracked events from the evaluation context.
export const ENGAGEMENT_FIELDS = ["engagement.opened", "engagement.clicked", "engagement.received"];

const BASE_FIELDS = [
  { key: "email", label: "Email", type: "text", group: "Contact" },
  { key: "firstName", label: "First name", type: "text", group: "Contact" },
  { key: "lastName", label: "Last name", type: "text", group: "Contact" },
  { key: "phone", label: "Phone", type: "text", group: "Contact" },
  { key: "status", label: "Subscription status", type: "select", group: "Contact", options: STATUS_OPTIONS },
  { key: "source", label: "Source", type: "text", group: "Contact" },
  { key: "timezone", label: "Timezone", type: "text", group: "Contact" },
  { key: "locale", label: "Language", type: "text", group: "Contact" },
  { key: "leadScore", label: "Lead score", type: "number", group: "Contact" },
  { key: "createdAt", label: "Signup date", type: "date", group: "Contact" },
  { key: "lastActivityAt", label: "Last activity", type: "date", group: "Contact" },
  { key: "tags", label: "Tags", type: "tags", group: "Membership" },
  { key: "lists", label: "List membership", type: "list", group: "Membership" },
  { key: "engagement.opened", label: "Email opens", type: "event", group: "Engagement" },
  { key: "engagement.clicked", label: "Email clicks", type: "event", group: "Engagement" },
  { key: "engagement.received", label: "Messages received", type: "event", group: "Engagement" },
  { key: "event", label: "Tracked event", type: "event", group: "Engagement" },
];

export const SEGMENT_FIELDS = BASE_FIELDS.map((f) => ({ ...f, operators: operatorsFor(f.type) }));

const CUSTOM_TYPE = { text: "text", number: "number", date: "date", boolean: "boolean", select: "select" };

// The full vocabulary for one project: built-ins with list/tag options filled in plus one field per custom
// field definition (`attributes.<key>`). customFields: [{ key, label, type, options }], lists: [{ id, name }].
export function buildSegmentFields({ customFields = [], lists = [], tags = [] } = {}) {
  const custom = customFields
    .filter((f) => f?.key)
    .map((f) => {
      const type = CUSTOM_TYPE[f.type] || "text";
      return {
        key: `attributes.${f.key}`,
        label: f.label || f.key,
        type,
        group: "Custom fields",
        operators: operatorsFor(type),
        options: type === "select" ? (f.options || []).map((o) => (typeof o === "object" ? o : { value: String(o), label: String(o) })) : undefined,
      };
    });
  const listOptions = lists.map((l) => ({ value: String(l.id), label: l.name || "Untitled list" }));
  const tagOptions = tags.map((t) => (typeof t === "object" ? { value: t.name, label: t.name } : { value: t, label: t }));
  const builtIns = SEGMENT_FIELDS.map((f) => {
    if (f.type === "list") return { ...f, options: listOptions };
    if (f.type === "tags") return { ...f, options: tagOptions };
    return f;
  });
  const contactFields = builtIns.filter((f) => f.group === "Contact");
  const rest = builtIns.filter((f) => f.group !== "Contact");
  return [...contactFields, ...custom, ...rest];
}

export function getField(key, fields = SEGMENT_FIELDS) {
  const found = fields.find((f) => f.key === key) || SEGMENT_FIELDS.find((f) => f.key === key);
  if (found) return found;
  if (typeof key === "string" && key.startsWith("attributes.")) {
    return { key, label: key.slice("attributes.".length), type: "text", group: "Custom fields", operators: operatorsFor("text") };
  }
  return null;
}

export function defaultValueFor(field, operatorKey) {
  const op = getOperator(operatorKey);
  const kind = op?.value === "same" ? field?.type : op?.value;
  if (kind === "none") return null;
  if (kind === "options" || kind === "tags") return [];
  if (kind === "days") return 30;
  if (kind === "event") return { name: "", count: 1, days: 30 };
  if (kind === "number") return "";
  if (kind === "select") return field?.options?.[0]?.value ?? "";
  if (kind === "list" || kind === "tag") return field?.options?.[0]?.value ?? "";
  return "";
}

// A fresh condition for a field key, with its first operator and a sensible default value.
export function newCondition(fieldKey = "email", fields = SEGMENT_FIELDS, id = null) {
  const field = getField(fieldKey, fields) || SEGMENT_FIELDS[0];
  const operator = field.operators[0];
  return { id: id || globalThis.crypto.randomUUID(), field: field.key, operator, value: defaultValueFor(field, operator) };
}

const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

// Incomplete conditions (no field, unknown operator, missing value) are ignored by the evaluator; the UI
// refuses to save them.
export function isConditionComplete(condition) {
  if (!condition?.field || !condition?.operator) return false;
  const op = getOperator(condition.operator);
  if (!op) return false;
  if (op.value === "none") return true;
  if (op.value === "event") {
    if (condition.field === "event") return !isBlank(condition.value?.name);
    return true;
  }
  return !isBlank(condition.value);
}

const SNAKE = {
  firstName: "first_name",
  lastName: "last_name",
  leadScore: "lead_score",
  createdAt: "created_at",
  lastActivityAt: "last_activity_at",
  unsubscribedAt: "unsubscribed_at",
};

function readField(contact, field) {
  if (field.startsWith("attributes.")) {
    const key = field.slice("attributes.".length);
    return contact?.attributes?.[key];
  }
  if (field in (contact || {})) return contact[field];
  const snake = SNAKE[field];
  return snake ? contact?.[snake] : undefined;
}

const lower = (v) => String(v ?? "").trim().toLowerCase();
const asList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean);

function asNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function asTime(v) {
  if (v === null || v === undefined || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(String(v).length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isFinite(t) ? t : null;
}

function asBool(v) {
  if (typeof v === "boolean") return v;
  const s = lower(v);
  if (["true", "yes", "y", "1", "on"].includes(s)) return true;
  if (["false", "no", "n", "0", "off"].includes(s)) return false;
  return null;
}

const timeOf = (row, camel, snake) => asTime(row?.[camel] ?? row?.[snake]);

// How many times the behaviour happened inside the condition's window.
function countOccurrences(field, value, ctx, now) {
  const days = asNumber(value?.days);
  const since = days && days > 0 ? now - days * DAY : null;
  const inWindow = (t) => t !== null && (since === null || t >= since);
  const deliveries = Array.isArray(ctx?.deliveries) ? ctx.deliveries : [];
  if (field === "engagement.opened") {
    return deliveries.filter((d) => inWindow(timeOf(d, "openedAt", "opened_at"))).length;
  }
  if (field === "engagement.clicked") {
    return deliveries.filter((d) => inWindow(timeOf(d, "clickedAt", "clicked_at"))).length;
  }
  if (field === "engagement.received") {
    return deliveries.filter((d) => {
      if (["failed", "not_sent", "queued"].includes(d.status)) return false;
      if (value?.channel && d.channel !== value.channel) return false;
      return inWindow(timeOf(d, "sentAt", "sent_at") ?? timeOf(d, "createdAt", "created_at"));
    }).length;
  }
  const name = lower(value?.name);
  const events = Array.isArray(ctx?.events) ? ctx.events : [];
  return events.filter((e) => lower(e.name) === name && inWindow(timeOf(e, "occurredAt", "occurred_at"))).length;
}

function evaluate(contact, condition, ctx, now) {
  const { field, operator, value } = condition;
  const fieldMeta = getField(field);

  if (fieldMeta?.type === "event") {
    const count = countOccurrences(field, value, ctx, now);
    const needed = Math.max(1, asNumber(value?.count) || 1);
    return operator === "performed" ? count >= needed : count < needed;
  }

  if (field === "lists") {
    const ids = ctx?.listIds instanceof Set ? ctx.listIds : new Set(ctx?.listIds || []);
    const member = ids.has(String(value));
    return operator === "in_list" ? member : !member;
  }

  if (field === "tags") {
    const tags = new Set((Array.isArray(contact?.tags) ? contact.tags : []).map(lower));
    if (operator === "has") return tags.has(lower(value));
    if (operator === "not_has") return !tags.has(lower(value));
    const wanted = asList(value).map(lower);
    if (operator === "has_any") return wanted.some((t) => tags.has(t));
    if (operator === "has_none") return !wanted.some((t) => tags.has(t));
    return false;
  }

  const raw = readField(contact, field);
  const blank = isBlank(raw);

  switch (operator) {
    case "is_set":
      return !blank;
    case "is_not_set":
      return blank;
    case "is_true":
      return asBool(raw) === true;
    case "is_false":
      return asBool(raw) !== true;
    case "eq":
    case "neq": {
      let same;
      const a = asNumber(raw);
      const b = asNumber(value);
      if (fieldMeta?.type === "number" && a !== null && b !== null) same = a === b;
      else same = lower(raw) === lower(value);
      return operator === "eq" ? same : !same;
    }
    case "contains":
      return lower(raw).includes(lower(value));
    case "not_contains":
      return !lower(raw).includes(lower(value));
    case "starts_with":
      return lower(raw).startsWith(lower(value));
    case "ends_with":
      return lower(raw).endsWith(lower(value));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = asNumber(raw);
      const b = asNumber(value);
      if (a === null || b === null) return false;
      if (operator === "gt") return a > b;
      if (operator === "gte") return a >= b;
      if (operator === "lt") return a < b;
      return a <= b;
    }
    case "in":
    case "not_in": {
      const hit = asList(value).map(lower).includes(lower(raw));
      return operator === "in" ? !blank && hit : !hit;
    }
    case "before":
    case "after": {
      const t = asTime(raw);
      const ref = asTime(value);
      if (t === null || ref === null) return false;
      return operator === "before" ? t < ref : t >= ref + DAY;
    }
    case "within_days":
    case "older_than_days": {
      const t = asTime(raw);
      const days = asNumber(value);
      if (t === null || days === null) return false;
      const cutoff = now - days * DAY;
      return operator === "within_days" ? t >= cutoff : t < cutoff;
    }
    default:
      return false;
  }
}

// contact: normalized contact view model (raw rows work too); ctx: { listIds: Set, events, deliveries, now }
// for that contact — list membership, its tracked events and its deliveries. Incomplete conditions are skipped.
export function matchesConditions(contact, { match = "all", conditions = [] } = {}, ctx = {}) {
  const usable = (conditions || []).filter(isConditionComplete);
  if (!usable.length) return true;
  const now = typeof ctx?.now === "number" ? ctx.now : Date.now();
  return match === "any"
    ? usable.some((c) => evaluate(contact, c, ctx, now))
    : usable.every((c) => evaluate(contact, c, ctx, now));
}

// What a rule needs loaded besides the contacts themselves, so callers fetch only that.
export function conditionNeeds(conditionsOrRules) {
  const list = (conditionsOrRules || []).flat().filter(Boolean);
  const needs = { lists: false, deliveries: false, eventNames: new Set(), sinceDays: 0, allTime: false };
  for (const c of list) {
    if (!isConditionComplete(c)) continue;
    if (c.field === "lists") needs.lists = true;
    const meta = getField(c.field);
    if (meta?.type !== "event") continue;
    if (c.field === "event") needs.eventNames.add(String(c.value?.name || "").trim());
    else needs.deliveries = true;
    const days = asNumber(c.value?.days);
    if (days && days > 0) needs.sinceDays = Math.max(needs.sinceDays, days);
    else needs.allTime = true;
  }
  return needs;
}

function valueLabel(condition, field) {
  const { operator, value } = condition;
  const op = getOperator(operator);
  if (!op || op.value === "none") return "";
  const optionLabel = (v) => field?.options?.find((o) => String(o.value) === String(v))?.label ?? v;
  if (Array.isArray(value)) return value.map(optionLabel).join(", ");
  const text = optionLabel(value);
  return op.suffix ? `${text} ${op.suffix}` : String(text ?? "");
}

function eventLabel(condition, field) {
  const count = Math.max(1, asNumber(condition.value?.count) || 1);
  const days = asNumber(condition.value?.days);
  const window = days ? `in the last ${days} days` : "ever";
  const name = condition.field === "event" ? `Event "${condition.value?.name || "…"}"` : field.label;
  const amount =
    condition.operator === "performed"
      ? count === 1 ? "at least once" : `at least ${count} times`
      : count === 1 ? "none" : `fewer than ${count}`;
  return `${name}: ${amount} ${window}`;
}

// "Lead score is at least 75", "Email opens: none in the last 90 days" -> readable one-liners.
export function describeCondition(condition, fields = SEGMENT_FIELDS) {
  const field = getField(condition?.field, fields);
  const op = getOperator(condition?.operator);
  if (!field || !op) return "Incomplete condition";
  if (field.type === "event") return eventLabel(condition, field);
  return `${field.label} ${op.label} ${valueLabel(condition, field)}`.trim();
}
