"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.entry_points — ig.me / m.me / t.me / wa.me ref links, QR codes, website widgets
// and click-to-message ad entries, each pointing at a DM flow or an automation. Scan / click / conversation
// counters are written by the public redirect and the chat engine. Pure: null / false / [].

const TABLE = "entry_points";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeEntryPoint(row) {
  if (!row) return null;
  const config = bag(row.config);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled entry point",
    kind: row.kind ?? "ref_link",
    channel: row.channel ?? "instagram",
    connectionId: row.connection_id ?? null,
    ref: row.ref ?? "",
    url: row.url ?? "",
    flowId: row.flow_id ?? null,
    automationId: row.automation_id ?? null,
    status: row.status ?? "active",
    scans: Number(row.scans ?? 0),
    clicks: Number(row.clicks ?? 0),
    conversations: Number(row.conversations ?? 0),
    config: {
      ...config,
      track: config.track !== false,
      prefill: config.prefill ?? "",
      widget: { label: "Message us", position: "bottom-right", ...bag(config.widget) },
      adIds: Array.isArray(config.adIds) ? config.adIds.map(String) : [],
    },
    lastScannedAt: row.last_scanned_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function entryPointToRow(input) {
  const row = {};
  const map = {
    name: "name",
    kind: "kind",
    channel: "channel",
    connectionId: "connection_id",
    ref: "ref",
    url: "url",
    flowId: "flow_id",
    automationId: "automation_id",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? (col === "ref" || col === "url" ? "" : null);
  if ("config" in input) row.config = bag(input.config);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listEntryPoints(projectId, { limit = 500 } = {}) {
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
      console.error("[entry_points.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeEntryPoint);
  } catch (e) {
    console.error("[entry_points.list]", e);
    return null;
  }
}

export async function getEntryPoint(projectId, id) {
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
      console.error("[entry_points.get]", error.message);
      return null;
    }
    return normalizeEntryPoint(data);
  } catch (e) {
    console.error("[entry_points.get]", e);
    return null;
  }
}

export async function createEntryPoint(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...entryPointToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[entry_points.create]", error.message);
      return null;
    }
    return normalizeEntryPoint(data);
  } catch (e) {
    console.error("[entry_points.create]", e);
    return null;
  }
}

export async function updateEntryPoint(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(entryPointToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[entry_points.update]", error.message);
      return null;
    }
    return normalizeEntryPoint(data);
  } catch (e) {
    console.error("[entry_points.update]", e);
    return null;
  }
}

export async function softDeleteEntryPoint(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "paused" })
      .eq("id", id);
    if (error) {
      console.error("[entry_points.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[entry_points.delete]", e);
    return false;
  }
}
