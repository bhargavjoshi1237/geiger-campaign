// Automation row <-> view-model mapping (isomorphic, pure). Shared by the browser data layer
// (lib/supabase/automations.js, automation_library.js), server routes and the playground.

import { emptyGraph, sanitizeGraph, triggerFromGraph } from "./graph.js";

export const AUTOMATION_KINDS = ["workflow", "journey"];
export const AUTOMATION_STATUSES = ["draft", "active", "paused", "archived"];
export const ENROLLMENT_STATUSES = ["active", "waiting", "completed", "exited", "failed"];
export const RUNNING_STATUSES = ["active", "waiting"];

export const DEFAULT_SETTINGS = Object.freeze({
  reentry: false,
  exitOnGoal: true,
  quietHours: Object.freeze({ enabled: false, start: "21:00", end: "08:00", timezone: "contact" }),
  frequencyCap: Object.freeze({ enabled: false, max: 3, periodDays: 7 }),
});

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeSettings(value) {
  const s = obj(value);
  return {
    reentry: Boolean(s.reentry ?? DEFAULT_SETTINGS.reentry),
    exitOnGoal: s.exitOnGoal === undefined ? DEFAULT_SETTINGS.exitOnGoal : Boolean(s.exitOnGoal),
    quietHours: { ...DEFAULT_SETTINGS.quietHours, ...obj(s.quietHours) },
    frequencyCap: { ...DEFAULT_SETTINGS.frequencyCap, ...obj(s.frequencyCap) },
  };
}

export function normalizeStats(value) {
  const s = obj(value);
  const n = (k) => Number(s[k]) || 0;
  const enrolled = n("enrolled");
  const converted = n("converted");
  return {
    enrolled,
    active: n("active"),
    waiting: n("waiting"),
    completed: n("completed"),
    exited: n("exited"),
    failed: n("failed"),
    converted,
    inProgress: n("active") + n("waiting"),
    conversionRate: enrolled ? converted / enrolled : null,
    updatedAt: s.updatedAt || null,
  };
}

export function normalizeAutomation(row) {
  if (!row) return null;
  const meta = obj(row.metadata);
  const graph = row.graph && Array.isArray(row.graph.nodes) && row.graph.nodes.length ? row.graph : emptyGraph(Object.keys(obj(row.trigger)).length ? row.trigger : undefined);
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    kind: row.kind === "journey" ? "journey" : "workflow",
    name: row.name ?? "Untitled automation",
    description: row.description ?? "",
    status: AUTOMATION_STATUSES.includes(row.status) ? row.status : "draft",
    trigger: triggerFromGraph(graph) || obj(row.trigger),
    graph,
    settings: normalizeSettings(row.settings),
    stats: normalizeStats(row.stats),
    publishedAt: row.published_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// camelCase patch -> columns; emits a column only when its key is present. A graph patch also
// re-derives the trigger column from the graph's trigger node so the engine never reads a stale one.
export function automationToRow(input) {
  const row = {};
  if ("kind" in input) row.kind = input.kind === "journey" ? "journey" : "workflow";
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled automation";
  if ("description" in input) row.description = String(input.description || "");
  if ("status" in input) row.status = AUTOMATION_STATUSES.includes(input.status) ? input.status : "draft";
  if ("graph" in input) {
    row.graph = sanitizeGraph(input.graph);
    row.trigger = triggerFromGraph(row.graph) || {};
  } else if ("trigger" in input) {
    row.trigger = obj(input.trigger);
  }
  if ("settings" in input) row.settings = normalizeSettings(input.settings);
  if ("stats" in input) row.stats = obj(input.stats);
  if ("publishedAt" in input) row.published_at = input.publishedAt || null;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = obj(input.metadata);
  return row;
}

function normalizeContactRef(row) {
  if (!row) return null;
  const firstName = row.first_name ?? "";
  const lastName = row.last_name ?? "";
  return {
    id: row.id,
    email: row.email ?? "",
    phone: row.phone ?? "",
    firstName,
    lastName,
    status: row.status ?? "subscribed",
    name: [firstName, lastName].filter(Boolean).join(" ") || row.email || row.phone || "Unnamed contact",
  };
}

export function normalizeEnrollment(row) {
  if (!row) return null;
  const meta = obj(row.metadata);
  const context = obj(row.context);
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    automationId: row.automation_id ?? null,
    contactId: row.contact_id ?? null,
    contact: normalizeContactRef(row.contact),
    status: ENROLLMENT_STATUSES.includes(row.status) ? row.status : "active",
    currentNodeId: row.current_node_id ?? null,
    nextRunAt: row.next_run_at ?? null,
    triggerKey: row.trigger_key ?? null,
    context,
    test: Boolean(context.test),
    converted: Boolean(context.convertedAt),
    convertedAt: context.convertedAt ?? null,
    enteredAt: row.entered_at ?? row.created_at ?? null,
    completedAt: row.completed_at ?? null,
    exitReason: row.exit_reason ?? "",
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function normalizeStepLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    automationId: row.automation_id ?? null,
    enrollmentId: row.enrollment_id ?? null,
    contactId: row.contact_id ?? null,
    contact: normalizeContactRef(row.contact),
    nodeId: row.node_id ?? "",
    nodeType: row.node_type ?? "",
    action: row.action ?? "",
    status: row.status ?? "ok",
    detail: obj(row.detail),
    createdAt: row.created_at ?? null,
  };
}

export function normalizeConditionSet(row) {
  if (!row) return null;
  const meta = obj(row.metadata);
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled condition",
    description: row.description ?? "",
    match: row.match === "any" ? "any" : "all",
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function conditionSetToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled condition";
  if ("description" in input) row.description = String(input.description || "");
  if ("match" in input) row.match = input.match === "any" ? "any" : "all";
  if ("conditions" in input) row.conditions = Array.isArray(input.conditions) ? input.conditions : [];
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = obj(input.metadata);
  return row;
}

export function normalizeGoal(row) {
  if (!row) return null;
  const meta = obj(row.metadata);
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled goal",
    description: row.description ?? "",
    event: row.event_name ?? "",
    filters: Array.isArray(row.filters) ? row.filters : [],
    windowDays: row.window_days == null ? null : Number(row.window_days),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function goalToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled goal";
  if ("description" in input) row.description = String(input.description || "");
  if ("event" in input) row.event_name = String(input.event || "").trim();
  if ("filters" in input) row.filters = Array.isArray(input.filters) ? input.filters : [];
  if ("windowDays" in input) row.window_days = input.windowDays === "" || input.windowDays == null ? null : Math.max(0, Math.round(Number(input.windowDays) || 0));
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = obj(input.metadata);
  return row;
}
