"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Read-only data layer for campaign.webhook_deliveries — the delivery log for endpoints and apps. Rows are
// written by the server (emit, worker, test/replay routes). Pure: null / [] on failure, never throws.

const TABLE = "webhook_deliveries";

export function normalizeWebhookDelivery(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    endpointId: row.endpoint_id ?? null,
    integrationId: row.integration_id ?? null,
    event: row.event ?? "",
    eventId: row.event_id ?? null,
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    // delivering is a short lease inside a worker attempt; it reads as queued.
    status: row.status === "delivering" ? "queued" : row.status ?? "queued",
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: row.next_attempt_at ?? null,
    requestUrl: row.request_url ?? "",
    requestHeaders: row.request_headers && typeof row.request_headers === "object" ? row.request_headers : {},
    responseStatus: row.response_status ?? null,
    responseBody: row.response_body ?? "",
    responseMs: row.response_ms ?? null,
    lastError: row.last_error ?? null,
    isTest: Boolean(row.is_test),
    replayOf: row.replay_of ?? null,
    deliveredAt: row.delivered_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// Filters: { endpointId, integrationId, status, since, limit }.
export async function listWebhookDeliveries(projectId, { endpointId, integrationId, status, since, limit = 200 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (endpointId) query = query.eq("endpoint_id", endpointId);
    if (integrationId) query = query.eq("integration_id", integrationId);
    if (status) query = query.eq("status", status);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[webhook_deliveries.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeWebhookDelivery);
  } catch (e) {
    console.error("[webhook_deliveries.list]", e);
    return null;
  }
}
