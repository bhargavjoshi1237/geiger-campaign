// Automation node vocabulary (isomorphic, pure): every node type the canvas offers and the engine runs —
// its palette group, default config, outgoing handles and a one-line summary. Icons live in the screens.

export const NODE_GROUPS = [
  { key: "messages", label: "Messages" },
  { key: "timing", label: "Timing" },
  { key: "logic", label: "Logic" },
  { key: "contact", label: "Contact" },
  { key: "integrations", label: "Integrations" },
];

// Message node type -> dispatch channel.
export const MESSAGE_CHANNELS = {
  send_email: "email",
  send_sms: "sms",
  send_whatsapp: "whatsapp",
  send_push: "push",
};

export const WAIT_UNITS = [
  { value: "minutes", label: "Minutes", ms: 60_000 },
  { value: "hours", label: "Hours", ms: 3_600_000 },
  { value: "days", label: "Days", ms: 86_400_000 },
  { value: "weeks", label: "Weeks", ms: 604_800_000 },
];

// ISO weekday numbers (1 = Monday … 7 = Sunday).
export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" },
];

const OUT = [{ id: "out", label: "" }];

export const NODE_TYPES = [
  {
    key: "trigger",
    label: "Trigger",
    kindLabel: "When this happens",
    group: null,
    description: "What enrolls a contact.",
    defaults: () => ({ key: "list_joined", type: "event", event: "list_joined", filters: [] }),
  },
  {
    key: "send_email",
    label: "Send email",
    kindLabel: "Email",
    group: "messages",
    channel: "email",
    description: "Send a personalised email with merge tags and tracking.",
    defaults: () => ({
      source: "compose",
      campaignId: null,
      subject: "",
      preheader: "",
      heading: "",
      body: "",
      buttonLabel: "",
      buttonUrl: "",
      fromName: "",
      fromEmail: "",
      replyTo: "",
    }),
  },
  {
    key: "send_sms",
    label: "Send SMS",
    kindLabel: "SMS",
    group: "messages",
    channel: "sms",
    description: "Text the contact's phone number. Needs SMS opt-in.",
    defaults: () => ({ body: "", connectionId: null }),
  },
  {
    key: "send_whatsapp",
    label: "Send WhatsApp",
    kindLabel: "WhatsApp",
    group: "messages",
    channel: "whatsapp",
    description: "Send an approved template or a session message. Needs WhatsApp opt-in.",
    defaults: () => ({ templateName: "", language: "en", body: "", connectionId: null }),
  },
  {
    key: "send_push",
    label: "Send push",
    kindLabel: "Push",
    group: "messages",
    channel: "push",
    description: "Notify the contact's subscribed browsers and devices.",
    defaults: () => ({ title: "", body: "", url: "" }),
  },
  {
    key: "wait",
    label: "Wait",
    kindLabel: "Wait",
    group: "timing",
    description: "Pause for a duration, until a day and time, or until an event happens.",
    defaults: () => ({
      mode: "duration",
      amount: 1,
      unit: "days",
      weekdays: [1, 2, 3, 4, 5],
      time: "09:00",
      timezone: "contact",
      event: "",
      filters: [],
      timeoutAmount: 3,
      timeoutUnit: "days",
    }),
  },
  {
    key: "condition",
    label: "Condition",
    kindLabel: "If / else",
    group: "logic",
    description: "Branch on contact fields, a recent event, or engagement with an earlier message.",
    defaults: () => ({
      mode: "rules",
      source: "inline",
      conditionSetId: null,
      match: "all",
      conditions: [],
      event: "",
      filters: [],
      performed: true,
      withinDays: 7,
      messageNodeId: null,
      engagement: "opened",
    }),
  },
  {
    key: "split",
    label: "Random split",
    kindLabel: "Split",
    group: "logic",
    description: "Send contacts down paths by percentage to test variations.",
    defaults: () => ({
      branches: [
        { key: "a", label: "Path A", percent: 50 },
        { key: "b", label: "Path B", percent: 50 },
      ],
    }),
  },
  {
    key: "goal",
    label: "Goal",
    kindLabel: "Goal",
    group: "logic",
    description: "The outcome this automation drives. Contacts who reach it convert.",
    defaults: () => ({ source: "inline", goalId: null, event: "", filters: [], windowDays: null, ifNotMet: "continue", waitDays: 7 }),
  },
  {
    key: "exit",
    label: "Exit",
    kindLabel: "Exit",
    group: "logic",
    description: "End the automation for this contact.",
    defaults: () => ({ reason: "" }),
  },
  {
    key: "update_contact",
    label: "Update contact",
    kindLabel: "Update",
    group: "contact",
    description: "Add or remove tags, set fields, or change the lead score.",
    defaults: () => ({ addTags: [], removeTags: [], fields: [], leadScoreDelta: 0 }),
  },
  {
    key: "list",
    label: "List membership",
    kindLabel: "List",
    group: "contact",
    description: "Subscribe the contact to a list or remove them from one.",
    defaults: () => ({ action: "add", listId: null }),
  },
  {
    key: "webhook",
    label: "Webhook",
    kindLabel: "Webhook",
    group: "integrations",
    description: "POST the contact and step to a URL, signed, or to your webhook endpoints.",
    defaults: () => ({ target: "url", url: "", secret: "", event: "automation.step" }),
  },
  {
    key: "notify",
    label: "Notify team",
    kindLabel: "Notify",
    group: "integrations",
    description: "Email a teammate when a contact reaches this step.",
    defaults: () => ({ userId: null, email: "", subject: "", message: "" }),
  },
];

const BY_KEY = new Map(NODE_TYPES.map((t) => [t.key, t]));

export function nodeDefinition(type) {
  return BY_KEY.get(type) || null;
}

export function defaultNodeConfig(type) {
  return nodeDefinition(type)?.defaults() ?? {};
}

export function isMessageNode(type) {
  return type in MESSAGE_CHANNELS;
}

// Outgoing handles a node exposes; edges carry the handle id as sourceHandle.
export function nodeHandles(node) {
  const config = node?.data?.config || {};
  switch (node?.type) {
    case "exit":
      return [];
    case "condition":
      return [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ];
    case "split":
      return (Array.isArray(config.branches) ? config.branches : []).map((b) => ({ id: b.key, label: b.label || b.key }));
    case "wait":
      return config.mode === "event"
        ? [
            { id: "event", label: "Happened" },
            { id: "timeout", label: "Timed out" },
          ]
        : OUT;
    default:
      return OUT;
  }
}

export function handleLabel(node, handleId) {
  return nodeHandles(node).find((h) => h.id === (handleId || "out"))?.label || "";
}

export function unitLabel(amount, unit) {
  const n = Number(amount) || 0;
  const base = (WAIT_UNITS.find((u) => u.value === unit)?.label || unit || "").toLowerCase();
  return `${n} ${n === 1 ? base.replace(/s$/, "") : base}`;
}

export function durationMs(amount, unit) {
  return (Number(amount) || 0) * (WAIT_UNITS.find((u) => u.value === unit)?.ms || 0);
}

const truncate = (text, n = 60) => {
  const value = String(text || "").trim();
  return value.length > n ? `${value.slice(0, n - 1)}…` : value;
};

const weekdayList = (days) => {
  const list = (Array.isArray(days) ? days : []).map(Number).sort();
  if (list.length === 7) return "any day";
  if (list.join() === "1,2,3,4,5") return "a weekday";
  if (list.join() === "6,7") return "the weekend";
  return list.map((d) => WEEKDAYS.find((w) => w.value === d)?.short).filter(Boolean).join(", ") || "—";
};

// One readable line describing a node's config. refs: { lists, campaigns, conditionSets, goals, nodes }.
export function summarizeNode(node, refs = {}) {
  const c = node?.data?.config || {};
  const nameOf = (rows, id) => (rows || []).find((r) => r.id === id)?.name;
  switch (node?.type) {
    case "send_email":
      if (c.source === "campaign") return nameOf(refs.campaigns, c.campaignId) ? `Uses “${nameOf(refs.campaigns, c.campaignId)}”` : "Pick a campaign to reuse";
      return c.subject ? truncate(c.subject) : "Add a subject line";
    case "send_sms":
      return c.body ? truncate(c.body) : "Write the message";
    case "send_whatsapp":
      return c.templateName ? `Template “${c.templateName}”` : c.body ? truncate(c.body) : "Choose a template or message";
    case "send_push":
      return c.title ? truncate(c.title) : "Add a title";
    case "wait":
      if (c.mode === "until") return `Until ${weekdayList(c.weekdays)} at ${c.time || "09:00"}`;
      if (c.mode === "event") return c.event ? `Until ${c.event}, up to ${unitLabel(c.timeoutAmount, c.timeoutUnit)}` : "Choose the event to wait for";
      return `Wait ${unitLabel(c.amount, c.unit)}`;
    case "condition":
      if (c.mode === "event") {
        if (!c.event) return "Choose an event";
        return `${c.performed === false ? "Hasn't done" : "Did"} ${c.event} in ${Number(c.withinDays) || 0}d`;
      }
      if (c.mode === "message") {
        const target = (refs.nodes || []).find((n) => n.id === c.messageNodeId);
        return target ? `${c.engagement === "clicked" ? "Clicked" : "Opened"} “${summarizeNode(target, refs)}”` : "Pick an earlier message";
      }
      if (c.source === "saved") return nameOf(refs.conditionSets, c.conditionSetId) || "Pick a saved condition";
      return c.conditions?.length ? `${c.conditions.length} ${c.conditions.length === 1 ? "rule" : "rules"} · match ${c.match === "any" ? "any" : "all"}` : "Add a rule";
    case "split":
      return (c.branches || []).map((b) => `${b.label || b.key} ${Number(b.percent) || 0}%`).join(" · ") || "Add paths";
    case "goal":
      if (c.source === "saved") return nameOf(refs.goals, c.goalId) || "Pick a saved goal";
      return c.event ? `Contact does ${c.event}` : "Choose the goal event";
    case "exit":
      return c.reason ? truncate(c.reason) : "End of the path";
    case "update_contact": {
      const parts = [];
      if (c.addTags?.length) parts.push(`+${c.addTags.join(", +")}`);
      if (c.removeTags?.length) parts.push(`−${c.removeTags.join(", −")}`);
      if (c.fields?.length) parts.push(`${c.fields.length} ${c.fields.length === 1 ? "field" : "fields"}`);
      if (Number(c.leadScoreDelta)) parts.push(`score ${Number(c.leadScoreDelta) > 0 ? "+" : ""}${Number(c.leadScoreDelta)}`);
      return parts.length ? truncate(parts.join(" · ")) : "Choose what to change";
    }
    case "list": {
      const list = nameOf(refs.lists, c.listId);
      if (!list) return "Choose a list";
      return c.action === "remove" ? `Remove from ${list}` : `Add to ${list}`;
    }
    case "webhook":
      if (c.target === "endpoints") return `Emit ${c.event || "automation.step"}`;
      return c.url ? truncate(c.url.replace(/^https?:\/\//, ""), 48) : "Add the URL";
    case "notify":
      return c.email ? `Email ${c.email}` : "Choose a teammate";
    default:
      return "";
  }
}
