"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.integrations — one row per connected app. Connecting and disconnecting (they
// carry credentials) go through /api/projects/:id/integrations/apps/:provider; non-secret settings
// ({ channel, events }) are edited here. Pure: null / false / [] on failure, never throws or toasts.

const TABLE = "integrations";

export function normalizeIntegration(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const config = row.config && typeof row.config === "object" ? row.config : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    provider: row.provider ?? "",
    name: row.name ?? "",
    status: row.status ?? "disconnected",
    config: { ...config, events: Array.isArray(config.events) ? config.events : [] },
    failureCount: Number(row.failure_count ?? 0),
    lastSuccessAt: row.last_success_at ?? null,
    lastError: row.last_error ?? null,
    connectedAt: row.connected_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function listIntegrations(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().from(TABLE).select("*").eq("project_id", projectId).is("deleted_at", null);
    if (error) {
      console.error("[integrations.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeIntegration);
  } catch (e) {
    console.error("[integrations.list]", e);
    return null;
  }
}

// Shallow-merges non-secret settings into config.
export async function updateIntegrationConfig(id, configPatch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data: current, error: readError } = await sb.from(TABLE).select("config").eq("id", id).single();
    if (readError) {
      console.error("[integrations.update]", readError.message);
      return null;
    }
    const { data, error } = await sb
      .from(TABLE)
      .update({ config: { ...(current?.config || {}), ...configPatch } })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[integrations.update]", error.message);
      return null;
    }
    return normalizeIntegration(data);
  } catch (e) {
    console.error("[integrations.update]", e);
    return null;
  }
}
