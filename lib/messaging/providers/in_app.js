import { notConnected } from "../connections";
import { channelSettings } from "@/lib/channels/policy";
import { deliveryContext, findContact } from "@/lib/channels/records";

// In-app messages: queues one row in campaign.in_app_messages for the contact, which the in-app SDK
// fetches (GET /api/public/in-app/messages) and marks read/clicked. `to` is a contact id or email;
// message = { title, body, cta: { label, url }, format: inbox|banner|modal, expiresAt | expiresInDays }.
export const name = "geiger_sdk";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATS = new Set(["inbox", "banner", "modal"]);

export async function send({ db, projectId, deliveryId, to, message, connection }) {
  if (!connection) return notConnected("In-app messaging");
  const base = { provider: name, connectionId: connection.id };
  if (connection.status !== "connected") return { ...base, status: "not_sent", error: "In-app messaging isn't enabled for this project." };

  const title = String(message?.title || "").trim();
  if (!title) return { ...base, status: "failed", error: "An in-app message needs a title." };

  const ctx = await deliveryContext(db, deliveryId);
  let contactId = ctx?.contact_id || null;
  if (!contactId && UUID.test(String(to))) contactId = String(to);
  if (!contactId && String(to).includes("@")) contactId = (await findContact(db, projectId, { email: to }))?.id || null;
  if (!contactId) return { ...base, status: "failed", error: "In-app recipients must be existing contacts.", subject: title };

  const settings = channelSettings(connection);
  const days = Number(message.expiresInDays ?? settings.defaultExpiryDays) || 0;
  const expiresAt = message.expiresAt || (days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null);
  const cta = message.cta && (message.cta.label || message.cta.url) ? { label: String(message.cta.label || ""), url: String(message.cta.url || "") } : {};

  const { data, error } = await db
    .from("in_app_messages")
    .insert({
      project_id: projectId,
      contact_id: contactId,
      delivery_id: deliveryId,
      campaign_id: ctx?.campaign_id || null,
      source_type: ctx?.source_type || "manual",
      source_id: ctx?.source_id || null,
      format: FORMATS.has(message.format) ? message.format : "inbox",
      title,
      body: String(message.body || ""),
      cta,
      status: "unread",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[providers.in_app]", error.message);
    return { ...base, status: "failed", error: "Couldn't queue the in-app message.", subject: title };
  }
  return { ...base, status: "sent", providerId: data.id, subject: title };
}
