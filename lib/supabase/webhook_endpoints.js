"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.webhook_endpoints. Creating an endpoint (it needs a signing secret) and rotating
// its secret go through /api/projects/:id/integrations/webhooks; edits, enable/disable and removal are here.
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "webhook_endpoints";

// active | failing (active with recent consecutive failures) | disabled
export function endpointState(row) {
  if (row.status === "disabled") return "disabled";
  return row.failureCount > 0 ? "failing" : "active";
}

export function normalizeWebhookEndpoint(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const endpoint = {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    url: row.url ?? "",
    description: row.description ?? "",
    events: Array.isArray(row.events) ? row.events : [],
    status: row.status === "disabled" ? "disabled" : "active",
    disabledReason: row.disabled_reason ?? null,
    failureCount: Number(row.failure_count ?? 0),
    secretHint: row.secret_hint ?? "",
    lastSuccessAt: row.last_success_at ?? null,
    lastFailureAt: row.last_failure_at ?? null,
    lastError: row.last_error ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
  return { ...endpoint, state: endpointState(endpoint) };
}

export function webhookEndpointToRow(input) {
  const row = {};
  if ("url" in input) row.url = String(input.url || "").trim();
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("events" in input) row.events = Array.isArray(input.events) ? input.events : [];
  if ("status" in input) row.status = input.status === "disabled" ? "disabled" : "active";
  if ("disabledReason" in input) row.disabled_reason = input.disabledReason || null;
  if ("failureCount" in input) row.failure_count = Number(input.failureCount) || 0;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export async function listWebhookEndpoints(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[webhook_endpoints.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeWebhookEndpoint);
  } catch (e) {
    console.error("[webhook_endpoints.list]", e);
    return null;
  }
}

export async function updateWebhookEndpoint(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(webhookEndpointToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[webhook_endpoints.update]", error.message);
      return null;
    }
    return normalizeWebhookEndpoint(data);
  } catch (e) {
    console.error("[webhook_endpoints.update]", e);
    return null;
  }
}

export async function softDeleteWebhookEndpoint(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString(), status: "disabled", disabled_reason: "manual" }).eq("id", id);
    if (error) {
      console.error("[webhook_endpoints.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[webhook_endpoints.delete]", e);
    return false;
  }
}
