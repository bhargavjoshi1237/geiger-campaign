// Display rules for dynamic content (isomorphic, pure): a block's `visibleIf: { field, operator, value }`
// is evaluated against the recipient's merge data at render time; a block without a rule always shows.
// OWNER: Campaigns.

import { resolveMergeValue } from "./merge_tags";

export const VISIBILITY_OPERATORS = [
  { key: "equals", label: "is", needsValue: true },
  { key: "not_equals", label: "is not", needsValue: true },
  { key: "contains", label: "contains", needsValue: true },
  { key: "not_contains", label: "doesn't contain", needsValue: true },
  { key: "starts_with", label: "starts with", needsValue: true },
  { key: "in", label: "is one of", needsValue: true, hint: "Comma-separated values" },
  { key: "gt", label: "is greater than", needsValue: true },
  { key: "lt", label: "is less than", needsValue: true },
  { key: "is_set", label: "is set", needsValue: false },
  { key: "is_not_set", label: "is empty", needsValue: false },
  { key: "has_tag", label: "has tag", needsValue: true, field: "tags" },
  { key: "not_has_tag", label: "doesn't have tag", needsValue: true, field: "tags" },
];

const OPERATOR = Object.fromEntries(VISIBILITY_OPERATORS.map((o) => [o.key, o]));

const norm = (v) => String(v ?? "").trim().toLowerCase();
const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

function rawValue(data, field) {
  return String(field || "")
    .split(".")
    .reduce((acc, part) => (acc == null ? acc : acc[part]), data || {});
}

// Normalizes a stored rule; null when the block has no (complete) rule.
export function normalizeRule(rule) {
  if (!rule || typeof rule !== "object" || !rule.operator) return null;
  const operator = OPERATOR[rule.operator] ? rule.operator : "equals";
  const field = OPERATOR[operator].field || String(rule.field || "").trim();
  if (!field) return null;
  return { field, operator, value: rule.value ?? "" };
}

// True when the recipient should see the block.
export function evaluateCondition(rule, data = {}) {
  const r = normalizeRule(rule);
  if (!r) return true;
  const raw = rawValue(data, r.field);
  const list = Array.isArray(raw) ? raw.map(norm) : null;
  const text = list ? list.join(", ") : norm(resolveMergeValue(data, r.field));
  const target = norm(r.value);
  switch (r.operator) {
    case "equals":
      return list ? list.includes(target) : text === target;
    case "not_equals":
      return list ? !list.includes(target) : text !== target;
    case "contains":
      return list ? list.some((v) => v.includes(target)) : text.includes(target);
    case "not_contains":
      return list ? !list.some((v) => v.includes(target)) : !text.includes(target);
    case "starts_with":
      return text.startsWith(target);
    case "in": {
      const options = target.split(",").map((s) => s.trim()).filter(Boolean);
      return list ? list.some((v) => options.includes(v)) : options.includes(text);
    }
    case "gt":
    case "lt": {
      const a = Number(raw);
      const b = Number(r.value);
      if (Number.isNaN(a) || Number.isNaN(b) || isEmpty(raw)) return false;
      return r.operator === "gt" ? a > b : a < b;
    }
    case "is_set":
      return !isEmpty(raw);
    case "is_not_set":
      return isEmpty(raw);
    case "has_tag":
      return (Array.isArray(raw) ? raw : []).map(norm).includes(target);
    case "not_has_tag":
      return !(Array.isArray(raw) ? raw : []).map(norm).includes(target);
    default:
      return true;
  }
}

// "City is Lisbon", "Tags has tag vip". `labelFor(field)` maps a field key to its label.
export function describeCondition(rule, labelFor = (k) => k) {
  const r = normalizeRule(rule);
  if (!r) return "Always shown";
  const op = OPERATOR[r.operator];
  const field = labelFor(r.field) || r.field;
  return op.needsValue ? `${field} ${op.label} ${r.value || "…"}` : `${field} ${op.label}`;
}

export function operatorNeedsValue(key) {
  return OPERATOR[key]?.needsValue !== false;
}
