// Conversation routing (isomorphic, pure): which assignment rule and SLA policy a conversation falls
// under, and which teammate a rule picks. The server and the playground both run these over raw rows
// or view models (snake_case and camelCase are both read).

export const ROUTING_STRATEGIES = [
  { value: "round_robin", label: "Round robin", hint: "Rotate through the members in order." },
  { value: "least_busy", label: "Least busy", hint: "Give it to whoever holds the fewest open conversations." },
  { value: "manual", label: "Manual", hint: "Leave matching conversations in the unassigned queue." },
];

export const RULE_FIELDS = [
  { key: "kind", label: "Conversation type", type: "select", operators: ["is", "is_not"] },
  { key: "priority", label: "Priority", type: "select", operators: ["is", "is_not"] },
  { key: "tag", label: "Tag", type: "text", operators: ["has", "has_not"] },
  { key: "message", label: "First message", type: "text", operators: ["contains", "not_contains"] },
  { key: "source", label: "Comment source", type: "select", operators: ["is"] },
];

export const RULE_OPERATORS = {
  is: "is",
  is_not: "is not",
  has: "has",
  has_not: "doesn't have",
  contains: "contains",
  not_contains: "doesn't contain",
};

const pick = (obj, camel, snake) => obj?.[camel] ?? obj?.[snake];
const list = (v) => (Array.isArray(v) ? v : []);
const lower = (v) => String(v ?? "").trim().toLowerCase();

function conditionMatches(cond, conversation, ctx) {
  const value = lower(cond.value);
  const op = cond.operator;
  switch (cond.field) {
    case "kind":
    case "priority": {
      const actual = lower(conversation[cond.field]);
      return op === "is_not" ? actual !== value : actual === value;
    }
    case "tag": {
      const has = list(conversation.tags).some((t) => lower(t) === value);
      return op === "has_not" ? !has : has;
    }
    case "message": {
      const text = lower(ctx?.firstMessage);
      const found = value ? text.includes(value) : false;
      return op === "not_contains" ? !found : found;
    }
    case "source": {
      const meta = conversation.metadata && typeof conversation.metadata === "object" ? conversation.metadata : conversation;
      const isAd = Boolean(meta?.context?.isAd ?? meta?.isAd);
      return value === "ad" ? isAd : !isAd;
    }
    default:
      return true;
  }
}

export function ruleMatches(rule, conversation, ctx = {}) {
  if (!rule || pick(rule, "active", "active") === false) return false;
  const channels = list(rule.channels);
  if (channels.length && !channels.includes(conversation.channel)) return false;
  const spec = rule.conditions && typeof rule.conditions === "object" ? rule.conditions : {};
  const conditions = list(spec.conditions).filter((c) => c && c.field);
  if (!conditions.length) return true;
  const results = conditions.map((c) => conditionMatches(c, conversation, ctx));
  return spec.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

const byPosition = (a, b) =>
  (Number(a.position) || 0) - (Number(b.position) || 0) ||
  String(pick(a, "createdAt", "created_at") || "").localeCompare(String(pick(b, "createdAt", "created_at") || ""));

// The first active rule (by position) that matches, or null.
export function selectRule(rules, conversation, ctx) {
  return [...list(rules)].filter((r) => r.active !== false && !r.deleted_at && !r.deletedAt).sort(byPosition)
    .find((r) => ruleMatches(r, conversation, ctx)) || null;
}

// The teammate a rule assigns next: { assigneeId, nextIndex } or { assigneeId: null, reason }.
export function pickAssignee(rule, { openCounts = {} } = {}) {
  const members = list(rule?.members).filter(Boolean);
  if (!rule || rule.strategy === "manual") return { assigneeId: null, reason: "Rule leaves it unassigned." };
  if (!members.length) return { assigneeId: null, reason: "The rule has no members." };
  const cap = Number(pick(rule, "maxOpenPerMember", "max_open_per_member")) || null;
  const eligible = (id) => !cap || (openCounts[id] || 0) < cap;

  if (rule.strategy === "least_busy") {
    let best = null;
    for (const id of members) {
      if (!eligible(id)) continue;
      if (best == null || (openCounts[id] || 0) < (openCounts[best] || 0)) best = id;
    }
    return best ? { assigneeId: best, nextIndex: Number(pick(rule, "nextIndex", "next_index")) || 0 } : { assigneeId: null, reason: "Every member is at capacity." };
  }

  const start = (Number(pick(rule, "nextIndex", "next_index")) || 0) % members.length;
  for (let step = 0; step < members.length; step += 1) {
    const index = (start + step) % members.length;
    if (eligible(members[index])) return { assigneeId: members[index], nextIndex: (index + 1) % members.length };
  }
  return { assigneeId: null, reason: "Every member is at capacity." };
}

// The first active SLA policy (by position) whose channel/priority scope covers the conversation.
export function selectSlaPolicy(policies, conversation) {
  return [...list(policies)].filter((p) => p.active !== false && !p.deleted_at && !p.deletedAt).sort(byPosition).find((p) => {
    const channels = list(p.channels);
    const priorities = list(p.priorities);
    if (channels.length && !channels.includes(conversation.channel)) return false;
    if (priorities.length && !priorities.includes(conversation.priority || "normal")) return false;
    return true;
  }) || null;
}

// Open-conversation counts per assignee (open + pending), for capacity and least-busy.
export function openCountsByAssignee(conversations) {
  const counts = {};
  for (const c of list(conversations)) {
    const assignee = pick(c, "assigneeId", "assignee_id");
    if (!assignee || c.deleted_at || c.deletedAt) continue;
    if (c.status !== "open" && c.status !== "pending") continue;
    counts[assignee] = (counts[assignee] || 0) + 1;
  }
  return counts;
}
