import { badRequest, notFound } from "@/lib/server/http";
import { lastFour, newSigningSecret } from "@/lib/integrations/secrets";
import { ALL_EVENTS, WEBHOOK_EVENT_KEYS, webhookEvent } from "./catalog";
import { deliverByIds } from "./deliver";
import { queueDeliveries } from "./emit";
import { destinationUrlError } from "./urls";

// Webhook endpoint operations that need the signing secret or an immediate delivery (server-only, admin
// db): create (secret returned once), rotate (old secret keeps signing for 24h), test, replay and retry.

const ROTATION_GRACE_MS = 24 * 3_600_000;

export function cleanEvents(events) {
  const list = Array.isArray(events) ? events : [];
  if (list.includes(ALL_EVENTS)) return [ALL_EVENTS];
  const picked = WEBHOOK_EVENT_KEYS.filter((k) => list.includes(k));
  if (!picked.length) throw badRequest("Subscribe to at least one event.");
  return picked;
}

async function loadEndpoint(db, projectId, endpointId) {
  const { data } = await db.from("webhook_endpoints").select("*").eq("id", endpointId).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (!data) throw notFound("That webhook endpoint doesn't exist.");
  return data;
}

export async function createEndpoint(db, projectId, input, userId) {
  const url = String(input?.url || "").trim();
  const urlError = destinationUrlError(url);
  if (urlError) throw badRequest(urlError);
  const events = cleanEvents(input?.events);
  const secret = newSigningSecret();
  const { data: endpoint, error } = await db
    .from("webhook_endpoints")
    .insert({ project_id: projectId, url, description: String(input?.description || "").trim().slice(0, 300), events, secret_hint: lastFour(secret), created_by: userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const { error: secretError } = await db.from("webhook_secrets").insert({ project_id: projectId, endpoint_id: endpoint.id, secret });
  if (secretError) {
    await db.from("webhook_endpoints").delete().eq("id", endpoint.id);
    throw new Error(secretError.message);
  }
  return { endpoint, secret };
}

export async function rotateEndpointSecret(db, projectId, endpointId, { expireNow = false } = {}) {
  await loadEndpoint(db, projectId, endpointId);
  const { data: current } = await db.from("webhook_secrets").select("secret").eq("endpoint_id", endpointId).maybeSingle();
  const secret = newSigningSecret();
  const row = {
    project_id: projectId,
    endpoint_id: endpointId,
    secret,
    previous_secret: !expireNow && current?.secret ? current.secret : null,
    previous_expires_at: !expireNow && current?.secret ? new Date(Date.now() + ROTATION_GRACE_MS).toISOString() : null,
  };
  const { error } = await db.from("webhook_secrets").upsert(row, { onConflict: "endpoint_id" });
  if (error) throw new Error(error.message);
  const { data: endpoint } = await db.from("webhook_endpoints").update({ secret_hint: lastFour(secret) }).eq("id", endpointId).select("*").single();
  return { endpoint, secret, previousExpiresAt: row.previous_expires_at };
}

// One signed sample event sent right now; the delivery row (with the response) comes back.
export async function sendTestEvent(db, projectId, endpointId, { event } = {}, userId = null) {
  const endpoint = await loadEndpoint(db, projectId, endpointId);
  const chosen = webhookEvent(event) || webhookEvent(endpoint.events.find((e) => e !== ALL_EVENTS)) || webhookEvent("contact.created");
  const [queued] = await queueDeliveries(db, { projectId, event: chosen.key, data: chosen.sample, endpointIds: [endpointId], isTest: true, createdBy: userId });
  if (!queued) throw new Error("Couldn't queue the test event.");
  const [delivered] = await deliverByIds(db, [queued.id]);
  return { delivery: delivered || queued };
}

async function loadDelivery(db, projectId, deliveryId) {
  const { data } = await db.from("webhook_deliveries").select("*").eq("id", deliveryId).eq("project_id", projectId).maybeSingle();
  if (!data) throw notFound("That delivery doesn't exist.");
  return data;
}

// A new delivery of the same event (same event id, so receivers can dedupe) attempted now.
export async function replayDelivery(db, projectId, deliveryId, userId = null) {
  const original = await loadDelivery(db, projectId, deliveryId);
  const { data: queued, error } = await db
    .from("webhook_deliveries")
    .insert({
      project_id: projectId,
      endpoint_id: original.endpoint_id,
      integration_id: original.integration_id,
      event: original.event,
      event_id: original.event_id,
      payload: original.payload,
      status: "queued",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      is_test: original.is_test,
      replay_of: original.id,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const [delivered] = await deliverByIds(db, [queued.id]);
  return { delivery: delivered || queued };
}

// Pulls a waiting or failed delivery forward and attempts it now.
export async function retryDelivery(db, projectId, deliveryId) {
  const original = await loadDelivery(db, projectId, deliveryId);
  if (original.status === "delivered") throw badRequest("That delivery already succeeded — replay it instead.");
  const { error } = await db.from("webhook_deliveries").update({ status: "queued", next_attempt_at: new Date().toISOString() }).eq("id", deliveryId);
  if (error) throw new Error(error.message);
  const [delivered] = await deliverByIds(db, [deliveryId]);
  return { delivery: delivered || { ...original, status: "queued" } };
}
