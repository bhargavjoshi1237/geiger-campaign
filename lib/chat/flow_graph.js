// DM flow graphs (isomorphic, pure): node vocabulary, outgoing handles, validation and the interpreter
// the engine, the simulator and the canvas all share. runFlow() never performs I/O — it returns effects
// (send, set tags, set field, AI reply, goal, handover, jump) for the caller to apply.

import { DEFAULT_HANDOVER_LABEL, HUMAN_PAYLOAD, MAX_REPLY_OPTIONS, QUICK_REPLY_TITLE_MAX } from "./rules";
import { normalizeText } from "./matching";

export const FLOW_NODE_TYPES = [
  "start",
  "message",
  "wait_reply",
  "condition",
  "set_tag",
  "set_field",
  "delay",
  "ai_step",
  "goal",
  "handover",
  "jump_flow",
];

// Replies wait at most this long by default — inside Meta's 24h window.
export const DEFAULT_REPLY_TIMEOUT_MINUTES = 23 * 60;
const META_WINDOW_MINUTES = 24 * 60;
const WINDOWED = new Set(["instagram", "messenger", "whatsapp"]);

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);

export function defaultNodeData(type) {
  switch (type) {
    case "start":
      return {};
    case "message":
      return { text: "", buttons: [] };
    case "wait_reply":
      return { text: "", saveTo: "attributes.answer", validation: "any", timeoutMinutes: 60, retryText: "" };
    case "condition":
      return { match: "all", rules: [{ id: uid(), field: "tag", operator: "has", value: "" }] };
    case "set_tag":
      return { add: [], remove: [] };
    case "set_field":
      return { key: "", value: "" };
    case "delay":
      return { minutes: 60 };
    case "ai_step":
      return { agentId: null, greeting: "", maxTurns: 6 };
    case "goal":
      return { name: "" };
    case "handover":
      return { message: "Thanks — a teammate will pick this up here shortly.", assigneeId: null, team: "", priority: "normal" };
    case "jump_flow":
      return { flowId: null };
    default:
      return {};
  }
}

export const replyOptions = (node) => (node?.data?.buttons || []).filter((b) => b && b.type !== "url");
export const linkButtons = (node) => (node?.data?.buttons || []).filter((b) => b && b.type === "url");

// Outgoing handles per node; edges carry the handle id as sourceHandle ("next" when omitted).
export function nodeHandles(node) {
  switch (node?.type) {
    case "message": {
      const replies = replyOptions(node);
      if (!replies.length) return [{ id: "next", label: "" }];
      return [...replies.map((b) => ({ id: `btn:${b.id}`, label: b.title || "Option" })), { id: "else", label: "Anything else" }];
    }
    case "wait_reply":
      return [
        { id: "next", label: "Answered" },
        { id: "timeout", label: "No reply" },
      ];
    case "condition":
      return [
        { id: "true", label: "Yes" },
        { id: "false", label: "No" },
      ];
    case "handover":
    case "jump_flow":
      return [];
    default:
      return [{ id: "next", label: "" }];
  }
}

export function emptyGraph() {
  return {
    nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  };
}

const nodesOf = (graph) => (Array.isArray(graph?.nodes) ? graph.nodes : []);
const edgesOf = (graph) => (Array.isArray(graph?.edges) ? graph.edges : []);

export function startNode(graph) {
  return nodesOf(graph).find((n) => n.type === "start") || null;
}

export function nextNodeId(graph, nodeId, handle = "next") {
  const edge = edgesOf(graph).find((e) => e.source === nodeId && (e.sourceHandle || "next") === handle);
  return edge ? edge.target : null;
}

// { errors: [{ nodeId, message }], warnings: [...] } — publish is refused while errors remain.
export function validateFlow(graph, { channels = [] } = {}) {
  const errors = [];
  const warnings = [];
  const nodes = nodesOf(graph);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = startNode(graph);
  if (!start) errors.push({ nodeId: null, message: "The flow needs a start node." });
  if (nodes.filter((n) => n.type === "start").length > 1) errors.push({ nodeId: null, message: "Only one start node is allowed." });
  if (start && !nextNodeId(graph, start.id)) errors.push({ nodeId: start.id, message: "Connect the start node to the first step." });

  for (const edge of edgesOf(graph)) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) warnings.push({ nodeId: edge.source, message: "A connector points at a step that no longer exists." });
  }

  // Reachability from start.
  const reachable = new Set();
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const e of edgesOf(graph)) if (e.source === id && byId.has(e.target)) queue.push(e.target);
  }

  const windowed = channels.some((c) => WINDOWED.has(c));
  const maxReplies = channels.length ? Math.min(...channels.map((c) => MAX_REPLY_OPTIONS[c] ?? 12)) : 12;

  for (const node of nodes) {
    const d = node.data || {};
    if (node.type !== "start" && !reachable.has(node.id)) warnings.push({ nodeId: node.id, message: "Not connected to the start — it never runs." });
    switch (node.type) {
      case "message": {
        if (!String(d.text || "").trim()) errors.push({ nodeId: node.id, message: "Message text is empty." });
        const replies = replyOptions(node);
        if (replies.length > maxReplies) errors.push({ nodeId: node.id, message: `This channel allows ${maxReplies} reply options plus “Talk to a person”.` });
        for (const b of replies) {
          if (!String(b.title || "").trim()) errors.push({ nodeId: node.id, message: "A reply option has no label." });
          if (String(b.title || "").length > QUICK_REPLY_TITLE_MAX) errors.push({ nodeId: node.id, message: `Reply options are limited to ${QUICK_REPLY_TITLE_MAX} characters.` });
        }
        for (const b of linkButtons(node)) {
          if (!/^https?:\/\//i.test(String(b.url || ""))) errors.push({ nodeId: node.id, message: `Link button “${b.title || "Untitled"}” needs a full URL.` });
        }
        break;
      }
      case "wait_reply":
        if (!String(d.text || "").trim()) errors.push({ nodeId: node.id, message: "The question is empty." });
        if (!String(d.saveTo || "").trim()) errors.push({ nodeId: node.id, message: "Choose where to save the answer." });
        if (windowed && Number(d.timeoutMinutes) > META_WINDOW_MINUTES) warnings.push({ nodeId: node.id, message: "Waits longer than 24 hours outlive the messaging window." });
        break;
      case "condition":
        if (!(d.rules || []).length) errors.push({ nodeId: node.id, message: "Add at least one condition." });
        break;
      case "set_tag":
        if (!(d.add || []).length && !(d.remove || []).length) errors.push({ nodeId: node.id, message: "Choose tags to add or remove." });
        break;
      case "set_field":
        if (!String(d.key || "").trim()) errors.push({ nodeId: node.id, message: "Choose a field to set." });
        break;
      case "delay":
        if (!(Number(d.minutes) > 0)) errors.push({ nodeId: node.id, message: "Set how long to wait." });
        if (windowed && Number(d.minutes) >= META_WINDOW_MINUTES) errors.push({ nodeId: node.id, message: "Delays of 24 hours or more land outside the messaging window — Meta will reject the next message." });
        break;
      case "ai_step":
        if (!d.agentId) errors.push({ nodeId: node.id, message: "Choose an AI agent." });
        break;
      case "jump_flow":
        if (!d.flowId) errors.push({ nodeId: node.id, message: "Choose the flow to jump to." });
        break;
      default:
        break;
    }
  }
  return { errors, warnings };
}

// Facts the conditions read: { channel, tags, attributes, email, phone, name }.
function readField(field, facts, state) {
  if (field === "tag") return facts.tags || [];
  if (field === "channel") return facts.channel || "";
  if (field === "reply") return state.vars?.lastReply || "";
  if (field === "email") return facts.email || "";
  if (field === "phone") return facts.phone || "";
  if (String(field).startsWith("attributes.")) return facts.attributes?.[field.slice(11)] ?? "";
  return state.vars?.[field] ?? "";
}

export function evaluateRule(rule, facts, state) {
  const value = readField(rule.field, facts, state);
  const target = String(rule.value ?? "").trim().toLowerCase();
  const asText = Array.isArray(value) ? "" : String(value ?? "").toLowerCase();
  switch (rule.operator) {
    case "has":
      return Array.isArray(value) && value.some((t) => String(t).toLowerCase() === target);
    case "not_has":
      return Array.isArray(value) && !value.some((t) => String(t).toLowerCase() === target);
    case "exists":
      return Array.isArray(value) ? value.length > 0 : asText !== "";
    case "not_exists":
      return Array.isArray(value) ? value.length === 0 : asText === "";
    case "equals":
      return asText === target;
    case "not_equals":
      return asText !== target;
    case "contains":
      return Boolean(target) && asText.includes(target);
    default:
      return false;
  }
}

export function evaluateCondition(data, facts, state) {
  const rules = data?.rules || [];
  if (!rules.length) return false;
  return data.match === "any" ? rules.some((r) => evaluateRule(r, facts, state)) : rules.every((r) => evaluateRule(r, facts, state));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateAnswer(validation, text) {
  const value = String(text || "").trim();
  if (!value) return null;
  if (validation === "email") return EMAIL.test(value) ? value.toLowerCase() : null;
  if (validation === "phone") {
    const digits = value.replace(/[^\d+]/g, "");
    return digits.replace(/\D/g, "").length >= 7 ? digits : null;
  }
  if (validation === "number") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? String(n) : null;
  }
  return value;
}

// The outbound message for a node, with the mandatory handover option on any message that offers replies.
export function buildNodeMessage(node, settings = {}) {
  const replies = replyOptions(node);
  const links = linkButtons(node);
  const quickReplies = replies.map((b) => ({ title: String(b.title || "").slice(0, QUICK_REPLY_TITLE_MAX), payload: `btn:${b.id}` }));
  if (quickReplies.length) quickReplies.push({ title: settings.handoverLabel || DEFAULT_HANDOVER_LABEL, payload: HUMAN_PAYLOAD });
  return {
    text: String(node?.data?.text || ""),
    ...(quickReplies.length ? { quickReplies } : {}),
    ...(links.length ? { buttons: links.map((b) => ({ type: "url", title: b.title || "Open", url: b.url })) } : {}),
  };
}

function matchReplyOption(node, input) {
  const replies = replyOptions(node);
  const payload = String(input?.payload || "");
  if (payload.startsWith("btn:")) {
    const byPayload = replies.find((b) => `btn:${b.id}` === payload);
    if (byPayload) return byPayload;
  }
  const text = normalizeText(input?.text);
  return text ? replies.find((b) => normalizeText(b.title) === text) || null : null;
}

const MAX_PATH = 60;

// Runs the graph from the session state. Returns { effects, state, status, waitingFor, expiresAt }.
// status: waiting | completed | handover | jump | expired | error.
export function runFlow(graph, { state: initial = {}, input = null, facts: initialFacts = {}, settings = {}, timeout = false, now = Date.now(), maxSteps = 30 } = {}) {
  const byId = new Map(nodesOf(graph).map((n) => [n.id, n]));
  const facts = { ...initialFacts };
  facts.tags = [...(initialFacts.tags || [])];
  facts.attributes = { ...(initialFacts.attributes || {}) };
  const state = { nodeId: null, waiting: null, vars: {}, retries: 0, aiTurns: 0, path: [], ...initial };
  state.vars = { ...(state.vars || {}) };
  state.path = [...(state.path || [])];
  const effects = [];
  let inputUsed = false;
  let cursor = null;

  const replyTimeout = Number(settings.replyTimeoutMinutes) || DEFAULT_REPLY_TIMEOUT_MINUTES;
  const finish = (status, extra = {}) => ({
    effects,
    state: { ...state, waiting: status === "waiting" ? state.waiting : null },
    facts,
    status,
    waitingFor: status === "waiting" ? state.waiting : "none",
    expiresAt: extra.expiresAt ?? null,
    ...extra,
  });
  const wait = (node, kind, minutes) => {
    state.nodeId = node.id;
    state.waiting = kind;
    return finish("waiting", { expiresAt: new Date(now + Math.max(1, Number(minutes) || replyTimeout) * 60_000).toISOString() });
  };

  if (input?.text) state.vars.lastReply = String(input.text);

  // Resume a waiting node, or start from the top.
  if (state.nodeId && state.waiting) {
    const node = byId.get(state.nodeId);
    if (!node) return finish("completed");
    if (timeout) {
      if (state.waiting === "delay") cursor = nextNodeId(graph, node.id);
      else {
        cursor = node.type === "wait_reply" ? nextNodeId(graph, node.id, "timeout") : null;
        if (!cursor) return finish("expired");
      }
      state.waiting = null;
    } else if (state.waiting === "delay") {
      // A message during a delay doesn't skip it; expiresAt null keeps the session's resume time.
      return finish("waiting");
    } else if (state.waiting === "buttons") {
      inputUsed = true;
      const option = matchReplyOption(node, input);
      if (option) {
        state.vars[`choice:${node.id}`] = option.title;
        cursor = nextNodeId(graph, node.id, `btn:${option.id}`);
      } else {
        cursor = nextNodeId(graph, node.id, "else");
        if (!cursor) {
          state.retries = (state.retries || 0) + 1;
          if (state.retries > 2) return finish("completed");
          effects.push({ type: "send", nodeId: node.id, message: { ...buildNodeMessage(node, settings), text: settings.fallbackText || "Please choose one of the options below." } });
          return finish("waiting", { expiresAt: new Date(now + replyTimeout * 60_000).toISOString() });
        }
      }
      state.waiting = null;
      state.retries = 0;
    } else if (state.waiting === "reply") {
      inputUsed = true;
      const d = node.data || {};
      const value = validateAnswer(d.validation, input?.text);
      if (value == null) {
        state.retries = (state.retries || 0) + 1;
        if (state.retries > 2) {
          cursor = nextNodeId(graph, node.id, "timeout");
          if (!cursor) return finish("completed");
        } else {
          effects.push({ type: "send", nodeId: node.id, message: { text: d.retryText || "Sorry, that doesn't look right — could you try again?" } });
          return finish("waiting", { expiresAt: new Date(now + (Number(d.timeoutMinutes) || replyTimeout) * 60_000).toISOString() });
        }
      } else {
        effects.push({ type: "set_field", nodeId: node.id, key: d.saveTo, value });
        applyField(facts, d.saveTo, value);
        state.vars[`answer:${node.id}`] = value;
        cursor = nextNodeId(graph, node.id, "next");
      }
      state.waiting = null;
      state.retries = 0;
    } else if (state.waiting === "ai") {
      inputUsed = true;
      const d = node.data || {};
      effects.push({ type: "ai", nodeId: node.id, agentId: d.agentId, text: String(input?.text || "") });
      state.aiTurns = (state.aiTurns || 0) + 1;
      if (state.aiTurns < (Number(d.maxTurns) || 6)) return finish("waiting", { expiresAt: new Date(now + replyTimeout * 60_000).toISOString() });
      cursor = nextNodeId(graph, node.id, "next");
      state.waiting = null;
    }
  } else {
    const start = startNode(graph);
    if (!start) return finish("error", { error: "The flow has no start node." });
    cursor = start.id;
  }

  let steps = 0;
  while (cursor) {
    if (steps++ >= maxSteps) {
      effects.push({ type: "note", text: "Stopped: the flow loops without waiting for a reply." });
      return finish("error", { error: "loop" });
    }
    const node = byId.get(cursor);
    if (!node) break;
    state.nodeId = node.id;
    state.path.push(node.id);
    if (state.path.length > MAX_PATH) state.path = state.path.slice(-MAX_PATH);
    const d = node.data || {};

    switch (node.type) {
      case "start":
        cursor = nextNodeId(graph, node.id);
        break;
      case "message":
        effects.push({ type: "send", nodeId: node.id, message: buildNodeMessage(node, settings) });
        if (replyOptions(node).length) return wait(node, "buttons", replyTimeout);
        cursor = nextNodeId(graph, node.id);
        break;
      case "wait_reply":
        effects.push({ type: "send", nodeId: node.id, message: { text: String(d.text || "") } });
        return wait(node, "reply", Number(d.timeoutMinutes) || replyTimeout);
      case "condition":
        cursor = nextNodeId(graph, node.id, evaluateCondition(d, facts, state) ? "true" : "false");
        break;
      case "set_tag": {
        const add = (d.add || []).filter(Boolean);
        const remove = (d.remove || []).filter(Boolean);
        effects.push({ type: "set_tags", nodeId: node.id, add, remove });
        facts.tags = [...new Set([...facts.tags.filter((t) => !remove.includes(t)), ...add])];
        cursor = nextNodeId(graph, node.id);
        break;
      }
      case "set_field":
        effects.push({ type: "set_field", nodeId: node.id, key: d.key, value: d.value ?? "" });
        applyField(facts, d.key, d.value ?? "");
        cursor = nextNodeId(graph, node.id);
        break;
      case "delay":
        return wait(node, "delay", Number(d.minutes) || 1);
      case "ai_step":
        if (String(d.greeting || "").trim()) effects.push({ type: "send", nodeId: node.id, message: { text: d.greeting } });
        state.aiTurns = 0;
        if (input?.text && !inputUsed) {
          inputUsed = true;
          effects.push({ type: "ai", nodeId: node.id, agentId: d.agentId, text: String(input.text) });
          state.aiTurns = 1;
        }
        return wait(node, "ai", replyTimeout);
      case "goal":
        effects.push({ type: "goal", nodeId: node.id, name: d.name || "Goal" });
        cursor = nextNodeId(graph, node.id);
        break;
      case "handover":
        effects.push({ type: "handover", nodeId: node.id, message: d.message || "", assigneeId: d.assigneeId || null, team: d.team || "", priority: d.priority || null });
        return finish("handover");
      case "jump_flow":
        effects.push({ type: "jump", nodeId: node.id, flowId: d.flowId });
        return finish("jump", { jumpTo: d.flowId });
      default:
        cursor = nextNodeId(graph, node.id);
    }
  }
  return finish("completed");
}

function applyField(facts, key, value) {
  if (!key) return;
  if (key === "email") facts.email = value;
  else if (key === "phone") facts.phone = value;
  else if (String(key).startsWith("attributes.")) facts.attributes = { ...facts.attributes, [key.slice(11)]: value };
}
