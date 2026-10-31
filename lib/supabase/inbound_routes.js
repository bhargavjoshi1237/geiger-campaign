"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.inbound_routes — inbound email routing rules. Each route has its own webhook
// URL keyed by secret_key (/api/public/inbound/email/<secret>); the server matches and runs the action.
// Pure: null / false / [] on failure, never throws or toasts.

const TABLE = "inbound_routes";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// 48 hex characters from the browser CSPRNG (the DB default covers server inserts).
export function newRouteSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeInboundRoute(row) {
  if (!row) return null;
  const meta = bag(row.metadata);
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    matchRecipient: row.match_recipient ?? "",
    matchSubject: row.match_subject ?? "",
    action: row.action ?? "create_conversation",
    config: bag(row.config),
    secretKey: row.secret_key ?? "",
    status: row.status ?? "active",
    position: Number(row.position ?? 0),
    receivedCount: Number(row.received_count ?? 0),
    lastReceivedAt: row.last_received_at ?? null,
    lastResult: meta.lastResult ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function inboundRouteToRow(input) {
  const row = {};
  const map = {
    name: "name",
    matchRecipient: "match_recipient",
    matchSubject: "match_subject",
    action: "action",
    status: "status",
    secretKey: "secret_key",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? "";
  if ("config" in input) row.config = bag(input.config);
  if ("position" in input) row.position = Number(input.position) || 0;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  return row;
}

export async function listInboundRoutes(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[inbound_routes.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeInboundRoute);
  } catch (e) {
    console.error("[inbound_routes.list]", e);
    return null;
  }
}

export async function createInboundRoute(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...inboundRouteToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    if (!payload.secret_key) payload.secret_key = newRouteSecret();
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[inbound_routes.create]", error.message);
      return null;
    }
    return normalizeInboundRoute(data);
  } catch (e) {
    console.error("[inbound_routes.create]", e);
    return null;
  }
}

export async function updateInboundRoute(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(inboundRouteToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[inbound_routes.update]", error.message);
      return null;
    }
    return normalizeInboundRoute(data);
  } catch (e) {
    console.error("[inbound_routes.update]", e);
    return null;
  }
}

export async function softDeleteInboundRoute(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[inbound_routes.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[inbound_routes.delete]", e);
    return false;
  }
}
