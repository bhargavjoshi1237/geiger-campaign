// Automation trigger catalog and matcher (isomorphic, pure). Event triggers match tracked_events by
// name + property filters; date and inactivity triggers are found by the worker's scheduled scan;
// manual triggers only enroll by hand, test or API. Any event name works, including future social.* events.

export const TRIGGER_CATEGORIES = ["Subscription", "Forms", "Engagement", "E-commerce", "Lifecycle", "Custom"];

export const PROPERTY_OPERATORS = [
  { key: "eq", label: "is" },
  { key: "neq", label: "is not" },
  { key: "contains", label: "contains" },
  { key: "not_contains", label: "doesn't contain" },
  { key: "gt", label: "is greater than" },
  { key: "gte", label: "is at least" },
  { key: "lt", label: "is less than" },
  { key: "lte", label: "is at most" },
  { key: "exists", label: "is set", valueless: true },
  { key: "not_exists", label: "is not set", valueless: true },
];

export const VALUELESS_PROPERTY_OPERATORS = new Set(PROPERTY_OPERATORS.filter((o) => o.valueless).map((o) => o.key));

// params: property filters the catalog surfaces as named inputs (input: list | campaign | text | number).
export const TRIGGER_CATALOG = [
  {
    key: "contact_created",
    label: "Contact is created",
    category: "Subscription",
    type: "event",
    event: "contact_created",
    description: "A new contact is added from any source — a form, an import, the API or by hand.",
    params: [],
  },
  {
    key: "list_joined",
    label: "Joins a list",
    category: "Subscription",
    type: "event",
    event: "list_joined",
    description: "A contact subscribes to a list, including re-subscribing.",
    params: [{ property: "list_id", label: "List", input: "list", operator: "eq", optional: true, anyLabel: "Any list" }],
  },
  {
    key: "list_left",
    label: "Leaves a list",
    category: "Subscription",
    type: "event",
    event: "list_left",
    description: "A contact unsubscribes from or is removed from a list.",
    params: [{ property: "list_id", label: "List", input: "list", operator: "eq", optional: true, anyLabel: "Any list" }],
  },
  {
    key: "tag_added",
    label: "Tag is added",
    category: "Subscription",
    type: "event",
    event: "tag_added",
    description: "A tag is added to a contact by hand, an import, the API or another automation.",
    params: [{ property: "tag", label: "Tag", input: "text", operator: "eq", placeholder: "e.g. vip" }],
  },
  {
    key: "tag_removed",
    label: "Tag is removed",
    category: "Subscription",
    type: "event",
    event: "tag_removed",
    description: "A tag is taken off a contact.",
    params: [{ property: "tag", label: "Tag", input: "text", operator: "eq", placeholder: "e.g. trial" }],
  },
  {
    key: "unsubscribed",
    label: "Unsubscribes",
    category: "Subscription",
    type: "event",
    event: "unsubscribed",
    description: "A contact's status changes to unsubscribed.",
    params: [],
  },
  {
    key: "form_submitted",
    label: "Submits a form",
    category: "Forms",
    type: "event",
    event: "form_submitted",
    description: "A contact submits a hosted form, popup or landing page form.",
    params: [{ property: "form_id", label: "Form ID", input: "text", operator: "eq", optional: true, placeholder: "Any form" }],
  },
  {
    key: "email_opened",
    label: "Opens an email",
    category: "Engagement",
    type: "event",
    event: "email_opened",
    description: "A contact opens a campaign or automation email.",
    params: [{ property: "campaign_id", label: "Campaign", input: "campaign", operator: "eq", optional: true, anyLabel: "Any email" }],
  },
  {
    key: "email_clicked",
    label: "Clicks an email link",
    category: "Engagement",
    type: "event",
    event: "email_clicked",
    description: "A contact clicks a tracked link in an email.",
    params: [{ property: "url", label: "Link contains", input: "text", operator: "contains", optional: true, placeholder: "Any link" }],
  },
  {
    key: "page_viewed",
    label: "Views a page",
    category: "Engagement",
    type: "event",
    event: "page_viewed",
    description: "A known contact views a page on your site with the tracking snippet installed.",
    params: [{ property: "url", label: "URL contains", input: "text", operator: "contains", optional: true, placeholder: "e.g. /pricing" }],
  },
  {
    key: "order_completed",
    label: "Completes an order",
    category: "E-commerce",
    type: "event",
    event: "order_completed",
    description: "A contact places an order in a connected store.",
    params: [{ property: "revenue", label: "Order total at least", input: "number", operator: "gte", optional: true, placeholder: "Any amount" }],
  },
  {
    key: "cart_abandoned",
    label: "Abandons a cart",
    category: "E-commerce",
    type: "event",
    event: "cart_abandoned",
    description: "A checkout is started but not completed in a connected store.",
    params: [],
  },
  {
    key: "product_viewed",
    label: "Views a product",
    category: "E-commerce",
    type: "event",
    event: "product_viewed",
    description: "A known contact views a product page.",
    params: [{ property: "product_id", label: "Product ID", input: "text", operator: "eq", optional: true, placeholder: "Any product" }],
  },
  {
    key: "date_attribute",
    label: "Date field anniversary",
    category: "Lifecycle",
    type: "date",
    description: "Every year on a contact date field such as a birthday — or a set number of days before or after it.",
    params: [],
  },
  {
    key: "inactivity",
    label: "Becomes inactive",
    category: "Lifecycle",
    type: "inactivity",
    description: "A subscribed contact has had no tracked activity for a number of days.",
    params: [],
  },
  {
    key: "custom_event",
    label: "Custom event",
    category: "Custom",
    type: "event",
    event: "",
    description: "Any event from your site, app, the API or a connected channel — including social events such as social.comment.",
    params: [],
  },
  {
    key: "manual",
    label: "Added manually",
    category: "Custom",
    type: "manual",
    description: "Contacts only enter when added by a test, by hand or through the API.",
    params: [],
  },
];

const BY_KEY = new Map(TRIGGER_CATALOG.map((t) => [t.key, t]));
const BY_EVENT = new Map(TRIGGER_CATALOG.filter((t) => t.event).map((t) => [t.event, t]));

export const CATALOG_EVENT_NAMES = new Set(BY_EVENT.keys());

export function triggerCatalogEntry(keyOrTrigger) {
  if (!keyOrTrigger) return null;
  if (typeof keyOrTrigger === "string") return BY_KEY.get(keyOrTrigger) || null;
  const t = keyOrTrigger;
  if (t.key && BY_KEY.has(t.key)) return BY_KEY.get(t.key);
  if (t.type === "event" && t.event && BY_EVENT.has(t.event)) return BY_EVENT.get(t.event);
  if (t.type === "event") return BY_KEY.get("custom_event");
  return TRIGGER_CATALOG.find((e) => e.type === t.type) || null;
}

// A fresh trigger config for a catalog entry.
export function defaultTrigger(key = "list_joined") {
  const entry = BY_KEY.get(key) || BY_KEY.get("list_joined");
  if (entry.type === "date") return { key: entry.key, type: "date", field: "birthday", offsetDays: 0, recurring: true, time: "09:00" };
  if (entry.type === "inactivity") return { key: entry.key, type: "inactivity", days: 60 };
  if (entry.type === "manual") return { key: entry.key, type: "manual" };
  return { key: entry.key, type: "event", event: entry.event || "", filters: [] };
}

export function newFilterId() {
  return `f_${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36)}`;
}

// The property bag a trigger filter reads: event properties plus the event's own columns.
export function eventSubject(event) {
  if (!event) return {};
  const props = event.properties && typeof event.properties === "object" ? event.properties : {};
  return {
    ...props,
    source: event.source ?? props.source,
    url: event.url || props.url,
    campaign_id: event.campaign_id ?? event.campaignId ?? props.campaign_id,
    revenue: event.revenue ?? props.revenue,
  };
}

const readPath = (obj, path) => String(path || "").split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

const asNumber = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

function compareValue(actual, operator, expected) {
  switch (operator) {
    case "exists":
      return actual != null && actual !== "";
    case "not_exists":
      return actual == null || actual === "";
    case "eq":
      return Array.isArray(actual) ? actual.map(String).includes(String(expected)) : String(actual ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
    case "neq":
      return !compareValue(actual, "eq", expected);
    case "contains":
      return String(Array.isArray(actual) ? actual.join(" ") : actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "not_contains":
      return !compareValue(actual, "contains", expected);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a == null || b == null) return false;
      return operator === "gt" ? a > b : operator === "gte" ? a >= b : operator === "lt" ? a < b : a <= b;
    }
    default:
      return false;
  }
}

// Every filter must match. Filters without a property, or with an empty value on a valued operator, are ignored.
export function matchesPropertyFilters(subject, filters = []) {
  for (const f of Array.isArray(filters) ? filters : []) {
    if (!f?.property) continue;
    const operator = f.operator || "eq";
    if (!VALUELESS_PROPERTY_OPERATORS.has(operator) && (f.value === "" || f.value == null)) continue;
    if (!compareValue(readPath(subject, f.property), operator, f.value)) return false;
  }
  return true;
}

// Does a tracked event (raw row or normalized) start this event trigger?
export function matchesEventTrigger(trigger, event) {
  if (!trigger || trigger.type !== "event" || !trigger.event || !event) return false;
  if (String(event.name) !== String(trigger.event)) return false;
  return matchesPropertyFilters(eventSubject(event), trigger.filters);
}

export function isScheduledTrigger(trigger) {
  return trigger?.type === "date" || trigger?.type === "inactivity";
}

const offsetText = (days) => {
  const n = Number(days) || 0;
  if (!n) return "on";
  return `${Math.abs(n)} ${Math.abs(n) === 1 ? "day" : "days"} ${n < 0 ? "before" : "after"}`;
};

// "Joins a list · Newsletter". refs: { lists, campaigns } for id -> name.
export function describeTrigger(trigger, refs = {}) {
  if (!trigger || !trigger.type) return "No trigger";
  const entry = triggerCatalogEntry(trigger);
  if (trigger.type === "date") {
    const offset = offsetText(trigger.offsetDays);
    return `${offset === "on" ? "On" : offset} ${trigger.field || "a date field"}${trigger.recurring === false ? "" : ", yearly"}`;
  }
  if (trigger.type === "inactivity") return `No activity for ${Number(trigger.days) || 0} days`;
  if (trigger.type === "manual") return "Added manually";
  const label = entry?.key === "custom_event" ? trigger.event || "Custom event" : entry?.label || trigger.event;
  const details = [];
  for (const param of entry?.params || []) {
    const f = (trigger.filters || []).find((x) => x.property === param.property);
    if (!f || f.value === "" || f.value == null) continue;
    if (param.input === "list") details.push((refs.lists || []).find((l) => l.id === f.value)?.name || "a list");
    else if (param.input === "campaign") details.push((refs.campaigns || []).find((c) => c.id === f.value)?.name || "a campaign");
    else details.push(String(f.value));
  }
  const extra = (trigger.filters || []).filter((f) => f.property && !(entry?.params || []).some((p) => p.property === f.property)).length;
  if (extra) details.push(`${extra} ${extra === 1 ? "filter" : "filters"}`);
  return details.length ? `${label} · ${details.join(" · ")}` : label;
}

// Validation issues for a trigger config (messages only; the caller attaches the node id).
export function triggerIssues(trigger) {
  const issues = [];
  if (!trigger || !trigger.type) return ["Choose what starts this automation."];
  if (trigger.type === "event") {
    if (!String(trigger.event || "").trim()) issues.push("Name the event that starts this automation.");
    const entry = triggerCatalogEntry(trigger);
    for (const param of entry?.params || []) {
      if (param.optional) continue;
      const f = (trigger.filters || []).find((x) => x.property === param.property);
      if (!f || String(f.value ?? "").trim() === "") issues.push(`${param.label} is required.`);
    }
  }
  if (trigger.type === "date" && !String(trigger.field || "").trim()) issues.push("Choose the date field to watch.");
  if (trigger.type === "inactivity" && !(Number(trigger.days) >= 1)) issues.push("Inactivity needs at least 1 day.");
  return issues;
}
