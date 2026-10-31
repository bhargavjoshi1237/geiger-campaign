import { badRequest } from "@/lib/server/http";
import { deliverByIds } from "@/lib/webhooks/deliver";
import { queueDeliveries } from "@/lib/webhooks/emit";
import { WEBHOOK_EVENT_KEYS } from "@/lib/webhooks/catalog";
import { appByKey } from "./catalog";
import { slackUrlError } from "./slack";

// Native app connections (server-only, admin db). Slack is the one native app today: an incoming webhook
// URL (stored in integration_secrets) plus the events to post, with a test message on connect.

function nativeApp(provider) {
  const app = appByKey(provider);
  if (!app || app.kind !== "native") throw badRequest(`${app?.name || "That app"} doesn't connect here.`);
  return app;
}

async function findIntegration(db, projectId, provider) {
  const { data } = await db.from("integrations").select("*").eq("project_id", projectId).eq("provider", provider).is("deleted_at", null).maybeSingle();
  return data || null;
}

async function sendTest(db, projectId, integration, userId) {
  const [queued] = await queueDeliveries(db, { projectId, event: "contact.created", data: {}, integrationIds: [integration.id], isTest: true, createdBy: userId });
  if (!queued) return null;
  const [delivered] = await deliverByIds(db, [queued.id]);
  return delivered || queued;
}

export async function connectApp(db, projectId, provider, input, userId) {
  const app = nativeApp(provider);
  const webhookUrl = String(input?.webhookUrl || "").trim();
  const urlError = slackUrlError(webhookUrl);
  if (urlError) throw badRequest(urlError);
  const events = [...new Set((input?.events || []).filter((e) => WEBHOOK_EVENT_KEYS.includes(e)))];
  const config = { channel: String(input?.channel || "").trim().slice(0, 80), events: events.length ? events : ["contact.created", "campaign.sent"] };
  const now = new Date().toISOString();

  const existing = await findIntegration(db, projectId, provider);
  const fields = { name: app.name, status: "connected", config: { ...(existing?.config || {}), ...config }, connected_at: now, failure_count: 0, last_error: null };
  const { data: integration, error } = existing
    ? await db.from("integrations").update(fields).eq("id", existing.id).select("*").single()
    : await db.from("integrations").insert({ project_id: projectId, provider, created_by: userId, ...fields }).select("*").single();
  if (error) throw new Error(error.message);

  const { error: secretError } = await db
    .from("integration_secrets")
    .upsert({ project_id: projectId, integration_id: integration.id, secrets: { webhook_url: webhookUrl } }, { onConflict: "integration_id" });
  if (secretError) throw new Error(secretError.message);

  const delivery = await sendTest(db, projectId, integration, userId);
  const { data: fresh } = await db.from("integrations").select("*").eq("id", integration.id).single();
  return { integration: fresh || integration, delivery };
}

export async function disconnectApp(db, projectId, provider) {
  nativeApp(provider);
  const existing = await findIntegration(db, projectId, provider);
  if (!existing) return { integration: null };
  await db.from("integration_secrets").delete().eq("integration_id", existing.id);
  const { data, error } = await db.from("integrations").update({ status: "disconnected", failure_count: 0, last_error: null }).eq("id", existing.id).select("*").single();
  if (error) throw new Error(error.message);
  return { integration: data };
}

export async function testApp(db, projectId, provider, userId) {
  nativeApp(provider);
  const existing = await findIntegration(db, projectId, provider);
  if (!existing || existing.status === "disconnected") throw badRequest("Connect the app first.");
  const delivery = await sendTest(db, projectId, existing, userId);
  const { data: fresh } = await db.from("integrations").select("*").eq("id", existing.id).single();
  return { integration: fresh || existing, delivery };
}
