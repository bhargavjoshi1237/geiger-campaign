import { notConnected } from "../connections";
import { sendMessage, toE164 } from "@/lib/channels/twilio";
import { channelSettings } from "@/lib/channels/policy";
import { deliveryContext, findContact, latestConsent } from "@/lib/channels/records";
import { publicUrl } from "@/lib/server/urls";

// SMS through Twilio's Messages API. message = { body, from?, mediaUrls? }; `from` falls back to the
// connection's default sender. Refuses numbers whose latest SMS consent is opted out (STOP) and appends
// the opt-out notice to a recipient's first message when the SMS settings ask for it.
export const name = "twilio";

export async function send({ db, projectId, deliveryId, to, message, connection, secrets }) {
  if (!connection) return notConnected("SMS");
  const base = { provider: name, connectionId: connection.id };
  if (connection.status !== "connected") return { ...base, status: "not_sent", error: "The SMS connection needs attention — verify it on the SMS screen." };

  const phone = toE164(to);
  if (!phone) return { ...base, status: "failed", error: "The recipient phone number is invalid." };
  const body = String(message?.body ?? message?.text ?? "").trim();
  if (!body) return { ...base, status: "failed", error: "An SMS needs a body." };

  const settings = channelSettings(connection);
  const numbers = Array.isArray(connection.config?.numbers) ? connection.config.numbers : [];
  const from = message.from || settings.defaultSender || numbers.find((n) => n.capabilities?.includes("sms"))?.number;
  if (!from) return { ...base, status: "not_sent", error: "Choose a default SMS sender on the SMS screen." };

  const ctx = await deliveryContext(db, deliveryId);
  const contactId = ctx?.contact_id || (await findContact(db, projectId, { phone }))?.id || null;
  const consent = await latestConsent(db, projectId, contactId, "sms");
  if (consent?.status === "opted_out") return { ...base, status: "not_sent", error: "The recipient opted out of SMS (STOP)." };

  let text = body;
  if (settings.appendOptOutNotice && settings.optOutNotice && !/\bSTOP\b/i.test(body)) {
    const { count } = await db
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("channel", "sms")
      .in("to_address", Array.from(new Set([String(to), phone])))
      .in("status", ["sent", "delivered", "read", "replied"]);
    if (!count) text = `${body}\n\n${settings.optOutNotice}`;
  }

  const res = await sendMessage(secrets, {
    to: phone,
    from,
    body: text,
    mediaUrls: Array.isArray(message.mediaUrls) ? message.mediaUrls : [],
    statusCallback: publicUrl("/api/webhooks/twilio/status"),
  });
  const subject = text.slice(0, 140);
  if (!res.ok) return { ...base, status: "failed", error: res.error.message, uncertain: res.error.uncertain, subject };
  return { ...base, status: "sent", providerId: res.data?.sid || null, subject, cost: Math.abs(Number(res.data?.price)) || 0 };
}
