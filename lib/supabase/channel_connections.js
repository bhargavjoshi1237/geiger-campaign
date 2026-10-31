"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.channel_connections — connected sending/receiving accounts per channel.
// Non-secret config only: credentials are posted to the connect routes and stored server-side in
// campaign.channel_secrets, which the browser can never read. Pure: null / false / [] on failure.

const TABLE = "channel_connections";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function normalizeConnection(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    channel: row.channel ?? "email",
    provider: row.provider ?? "",
    name: row.name ?? "",
    externalId: row.external_id ?? null,
    handle: row.display_handle ?? "",
    status: row.status ?? "pending",
    config: bag(row.config),
    health: bag(row.health),
    connectedAt: row.connected_at ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function connectionToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    channel: "channel",
    provider: "provider",
    name: "name",
    externalId: "external_id",
    handle: "display_handle",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("config" in input) row.config = bag(input.config);
  if ("health" in input) row.health = bag(input.health);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  if ("connectedAt" in input) row.connected_at = input.connectedAt || null;
  return row;
}

export async function listConnections(projectId, { channel } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (channel) query = Array.isArray(channel) ? query.in("channel", channel) : query.eq("channel", channel);
    const { data, error } = await query;
    if (error) {
      console.error("[channel_connections.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeConnection);
  } catch (e) {
    console.error("[channel_connections.list]", e);
    return null;
  }
}

// The project's connection for one channel (the oldest live row), or null when there is none.
export async function getChannelConnection(projectId, channel) {
  if (!projectId || !channel || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .eq("channel", channel)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[channel_connections.getChannel]", error.message);
      return null;
    }
    return normalizeConnection(data);
  } catch (e) {
    console.error("[channel_connections.getChannel]", e);
    return null;
  }
}

// Shallow-merges client-owned keys (settings, senders) into metadata so server-written config/health
// are never clobbered. Returns the merged metadata, or null on failure.
export async function mergeConnectionMeta(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("merge_meta", { p_table: TABLE, p_id: id, p_patch: bag(patch) });
    if (error) {
      console.error("[channel_connections.mergeMeta]", error.message);
      return null;
    }
    return bag(data);
  } catch (e) {
    console.error("[channel_connections.mergeMeta]", e);
    return null;
  }
}

export async function createConnection(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...connectionToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[channel_connections.create]", error.message);
      return null;
    }
    return normalizeConnection(data);
  } catch (e) {
    console.error("[channel_connections.create]", e);
    return null;
  }
}

export async function updateConnection(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(connectionToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[channel_connections.update]", error.message);
      return null;
    }
    return normalizeConnection(data);
  } catch (e) {
    console.error("[channel_connections.update]", e);
    return null;
  }
}

export async function softDeleteConnection(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "disconnected" })
      .eq("id", id);
    if (error) {
      console.error("[channel_connections.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[channel_connections.delete]", e);
    return false;
  }
}
