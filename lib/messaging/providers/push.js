import { notConnected } from "../connections";
import { sendWebPush } from "@/lib/channels/web_push";
import { channelSettings } from "@/lib/channels/policy";
import { deliveryContext } from "@/lib/channels/records";
import { isSigningConfigured, signToken } from "@/lib/server/tokens";
import { publicUrl } from "@/lib/server/urls";

// Web push (VAPID + aes128gcm, no third-party service). `to` is a contact id (every active subscription
// of that contact) or one push_subscriptions id; message = { title, body, url, icon, tag }. Dead
// endpoints (404/410) are expired so they're never retried. Native iOS/Android push isn't supported.
export const name = "web_push";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function send({ db, projectId, deliveryId, to, message, connection, secrets }) {
  if (!connection) return notConnected("Web push");
  const base = { provider: name, connectionId: connection.id };
  const publicKey = connection.config?.vapidPublicKey;
  if (connection.status !== "connected" || !publicKey || !secrets?.vapidPrivateKey) {
    return { ...base, status: "not_sent", error: "Web push isn't set up — generate VAPID keys on the Push screen." };
  }
  const title = String(message?.title || "").trim();
  if (!title) return { ...base, status: "failed", error: "A push notification needs a title." };

  const ctx = await deliveryContext(db, deliveryId);
  const target = ctx?.contact_id || (UUID.test(String(to)) ? String(to) : null);
  if (!target) return { ...base, status: "failed", error: "Push recipients are contacts or subscription ids." };

  const { data: subscriptions } = await db
    .from("push_subscriptions")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "active")
    .is("deleted_at", null)
    .or(`contact_id.eq.${target},id.eq.${target}`)
    .limit(20);
  if (!subscriptions?.length) return { ...base, status: "not_sent", error: "The recipient has no active push subscription.", subject: title };

  const settings = channelSettings(connection);
  let token = null;
  if (deliveryId && isSigningConfigured()) token = signToken({ k: "push", d: deliveryId, p: projectId }, { ttlDays: 30 });
  const payload = {
    title,
    body: String(message.body || ""),
    url: message.url || "",
    icon: message.icon || "",
    tag: message.tag || "",
    ...(token ? { track: { url: publicUrl("/api/public/push/event"), token } } : {}),
  };
  const vapid = { publicKey, privateKey: secrets.vapidPrivateKey, subject: connection.config?.subject };

  const results = [];
  for (const subscription of subscriptions) {
    const res = await sendWebPush({
      subscription,
      payload,
      vapid,
      ttlSeconds: Number(settings.ttlSeconds) || 86_400,
      urgency: settings.urgency || "normal",
      topic: message.tag,
    });
    results.push(res);
    const now = new Date().toISOString();
    if (res.ok) await db.from("push_subscriptions").update({ last_sent_at: now }).eq("id", subscription.id);
    else if (res.gone) await db.from("push_subscriptions").update({ status: "expired" }).eq("id", subscription.id);
  }

  const delivered = results.find((r) => r.ok);
  if (delivered) return { ...base, status: "sent", providerId: delivered.messageId, subject: title };
  return { ...base, status: "failed", error: results[0]?.error || "Every push endpoint rejected the notification.", subject: title };
}
