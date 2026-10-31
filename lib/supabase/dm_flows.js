"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.dm_flows (node graphs edited on the DM flow canvas) and read-only
// campaign.dm_flow_sessions (who is inside which flow, written by the chat engine). Publishing goes through
// the chat status route, which validates the graph and snapshots it. Pure: null / false / [].

const TABLE = "dm_flows";
const SESSIONS = "dm_flow_sessions";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeGraph(value) {
  const g = bag(value);
  return { ...g, nodes: list(g.nodes), edges: list(g.edges) };
}

export function normalizeDmFlow(row) {
  if (!row) return null;
  const stats = bag(row.stats);
  const settings = bag(row.settings);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled flow",
    description: row.description ?? "",
    status: row.status ?? "draft",
    channels: list(row.channels),
    graph: normalizeGraph(row.graph),
    publishedGraph: row.published_graph ? normalizeGraph(row.published_graph) : null,
    entry: bag(row.entry),
    settings: {
      ...settings,
      handoverLabel: settings.handoverLabel ?? "",
      replyTimeoutMinutes: Number(settings.replyTimeoutMinutes ?? 0) || null,
      fallbackText: settings.fallbackText ?? "",
    },
    stats: {
      started: Number(stats.started ?? 0),
      completed: Number(stats.completed ?? 0),
      handedOver: Number(stats.handedOver ?? 0),
      expired: Number(stats.expired ?? 0),
      goals: Number(stats.goals ?? 0),
    },
    version: Number(row.version ?? 0),
    publishedAt: row.published_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function dmFlowToRow(input) {
  const row = {};
  const map = { name: "name", description: "description", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("channels" in input) row.channels = list(input.channels);
  if ("graph" in input) row.graph = normalizeGraph(input.graph);
  if ("settings" in input) row.settings = bag(input.settings);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listDmFlows(projectId, { limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[dm_flows.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDmFlow);
  } catch (e) {
    console.error("[dm_flows.list]", e);
    return null;
  }
}

export async function getDmFlow(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[dm_flows.get]", error.message);
      return null;
    }
    return normalizeDmFlow(data);
  } catch (e) {
    console.error("[dm_flows.get]", e);
    return null;
  }
}

export async function createDmFlow(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...dmFlowToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[dm_flows.create]", error.message);
      return null;
    }
    return normalizeDmFlow(data);
  } catch (e) {
    console.error("[dm_flows.create]", e);
    return null;
  }
}

export async function updateDmFlow(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(dmFlowToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[dm_flows.update]", error.message);
      return null;
    }
    return normalizeDmFlow(data);
  } catch (e) {
    console.error("[dm_flows.update]", e);
    return null;
  }
}

export async function softDeleteDmFlow(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", id);
    if (error) {
      console.error("[dm_flows.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[dm_flows.delete]", e);
    return false;
  }
}

export function normalizeFlowSession(row) {
  if (!row) return null;
  const context = bag(row.context);
  return {
    id: row.id,
    flowId: row.flow_id ?? null,
    conversationId: row.conversation_id ?? null,
    contactId: row.contact_id ?? null,
    channel: row.channel ?? "",
    currentNodeId: row.current_node_id ?? null,
    waitingFor: row.waiting_for ?? "none",
    expiresAt: row.expires_at ?? null,
    status: row.status ?? "active",
    path: list(bag(context.state).path),
    source: bag(context.source),
    startedAt: row.started_at ?? row.created_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

// Read-only. Filters: { flowId, status (string | string[]), limit }.
export async function listFlowSessions(projectId, { flowId, status, limit = 200 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(SESSIONS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (flowId) query = query.eq("flow_id", flowId);
    if (status) query = Array.isArray(status) ? query.in("status", status) : query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[dm_flows.sessions]", error.message);
      return null;
    }
    return (data || []).map(normalizeFlowSession);
  } catch (e) {
    console.error("[dm_flows.sessions]", e);
    return null;
  }
}
