import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSubscribed, webhookEnvelope } from "./catalog";
import { deliverByIds } from "./deliver";

// Outgoing webhooks (server-only): queue an event for every active endpoint subscribed to it (and every
// connected Slack app that chose it); the webhooks worker delivers with an HMAC-SHA256 signature and
// retries. Inside a request the first attempt runs right after the response. Never throws.

const EVENT_NAME = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;

// Queues one delivery per target and returns the inserted rows (also used by test sends).
export async function queueDeliveries(db, { projectId, event, data, endpointIds = [], integrationIds = [], isTest = false, createdBy = null }) {
  const eventId = randomUUID();
  const payload = webhookEnvelope({ id: eventId, event, projectId, data });
  const base = { project_id: projectId, event, event_id: eventId, payload, status: "queued", attempts: 0, next_attempt_at: new Date().toISOString(), is_test: isTest, created_by: createdBy };
  const rows = [
    ...endpointIds.map((endpointId) => ({ ...base, endpoint_id: endpointId })),
    ...integrationIds.map((integrationId) => ({ ...base, integration_id: integrationId })),
  ];
  if (!rows.length) return [];
  const { data: inserted, error } = await db.from("webhook_deliveries").insert(rows).select("*");
  if (error) {
    console.error("[webhooks.queue]", error.message);
    return [];
  }
  return inserted || [];
}

// Runs the first attempt after the current response; outside a request scope the worker picks it up.
export function deliverSoon(db, ids) {
  if (!ids.length) return;
  try {
    after(() => deliverByIds(db, ids).catch((e) => console.error("[webhooks.soon]", e)));
  } catch {
    // Not inside a request — the next worker tick delivers.
  }
}

export async function emitWebhook(db, projectId, event, payload = {}) {
  try {
    const sb = adminClient() || db;
    if (!sb || !projectId || !EVENT_NAME.test(String(event || ""))) return 0;
    const [endpointsRes, appsRes] = await Promise.all([
      sb.from("webhook_endpoints").select("id, events").eq("project_id", projectId).eq("status", "active").is("deleted_at", null),
      sb.from("integrations").select("id, config").eq("project_id", projectId).eq("provider", "slack").eq("status", "connected").is("deleted_at", null),
    ]);
    if (endpointsRes.error) console.error("[webhooks.emit]", endpointsRes.error.message);
    if (appsRes.error) console.error("[webhooks.emit]", appsRes.error.message);
    const endpointIds = (endpointsRes.data || []).filter((e) => isSubscribed(e.events, event)).map((e) => e.id);
    const integrationIds = (appsRes.data || []).filter((a) => isSubscribed(a.config?.events, event)).map((a) => a.id);
    const rows = await queueDeliveries(sb, { projectId, event, data: payload, endpointIds, integrationIds });
    deliverSoon(sb, rows.map((r) => r.id));
    return rows.length;
  } catch (e) {
    console.error("[webhooks.emit]", e);
    return 0;
  }
}
