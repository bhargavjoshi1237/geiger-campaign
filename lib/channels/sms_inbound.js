import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";
import { json } from "@/lib/server/http";
import { channelSettings, matchSmsKeyword } from "./policy";
import { getMessage, TWILIO_STATUS, toE164, twiml, validateSignature } from "./twilio";
import { twilioInboundUrl, twilioStatusUrl } from "./connect";
import { findOrCreateContact, recordConsent, threadAutoReply, threadInbound } from "./records";

// Twilio webhooks (server-only, service-role db). Inbound SMS: verify X-Twilio-Signature, thread the
// message into the inbox, honour STOP/START/HELP keywords in the consent ledger with an auto-reply.
// Status callbacks: move the delivery forward (never backwards) and record delivered/failed events.

const STATUS_RANK = { queued: 0, sent: 1, failed: 2, delivered: 3, read: 4, replied: 5, clicked: 5 };

const TWILIO_ERRORS = {
  21610: "The recipient replied STOP — Twilio blocks further messages.",
  21614: "The number isn't a valid mobile number.",
  30003: "The handset is unreachable.",
  30004: "The message was blocked by the carrier or recipient.",
  30005: "Unknown destination number.",
  30006: "Landline or unreachable carrier.",
  30007: "Filtered by the carrier (spam or registration).",
  30008: "Unknown carrier error.",
};

async function readTwilioRequest(db, request, canonicalUrl) {
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  if (!params.AccountSid) return { error: json({ error: "Missing AccountSid." }, 400) };

  const { data: connection } = await db
    .from("channel_connections")
    .select("*")
    .eq("provider", "twilio")
    .eq("external_id", params.AccountSid)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!connection) return { error: json({ error: "No connection for this Twilio account." }, 404) };

  const { data: secretRow } = await db.from("channel_secrets").select("secrets").eq("connection_id", connection.id).maybeSingle();
  const authToken = secretRow?.secrets?.authToken;
  const signature = request.headers.get("x-twilio-signature");
  const valid = [canonicalUrl, request.url].some((url) => validateSignature(authToken, url, params, signature));
  if (!valid) return { error: json({ error: "Invalid Twilio signature." }, 403) };
  return { params, connection, secrets: secretRow?.secrets || {} };
}

export async function handleInboundSms(db, request) {
  const { params, connection, error } = await readTwilioRequest(db, request, twilioInboundUrl());
  if (error) return error;

  const projectId = connection.project_id;
  const from = toE164(params.From);
  const body = String(params.Body || "");
  const settings = channelSettings(connection);
  const keyword = matchSmsKeyword(body, settings);

  const { contact } = await findOrCreateContact(db, projectId, { phone: from, source: "sms_inbound" });
  const media = Array.from({ length: Number(params.NumMedia) || 0 }, (_, i) => ({
    url: params[`MediaUrl${i}`],
    contentType: params[`MediaContentType${i}`] || "",
  })).filter((m) => m.url);
  const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "";

  const thread = await threadInbound(db, {
    projectId,
    channel: "sms",
    kind: "sms",
    connectionId: connection.id,
    contactId: contact?.id || null,
    threadKey: from,
    title: name || from,
    body,
    attachments: media,
    externalId: params.MessageSid,
    metadata: { to: params.To, keyword },
  });
  if (thread?.duplicate) return twiml(null);
  const conversationId = thread?.conversation?.id || null;

  if (contact && (keyword === "opt_out" || keyword === "opt_in")) {
    await recordConsent(db, {
      projectId,
      contactId: contact.id,
      channel: "sms",
      status: keyword === "opt_out" ? "opted_out" : "opted_in",
      source: "sms_keyword",
      proof: { keyword: body.trim(), messageSid: params.MessageSid, from, to: params.To, receivedAt: new Date().toISOString() },
    });
    if (keyword === "opt_out") await emitWebhook(db, projectId, "contact.unsubscribed", { contactId: contact.id, channel: "sms", source: "sms_keyword" });
  }

  // A reply marks the contact's latest SMS delivery as replied.
  if (contact) {
    const { data: last } = await db
      .from("deliveries")
      .select("id")
      .eq("project_id", projectId)
      .eq("channel", "sms")
      .eq("contact_id", contact.id)
      .in("status", ["sent", "delivered"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) await db.from("deliveries").update({ status: "replied" }).eq("id", last.id);
  }

  await recordEvent(db, {
    projectId,
    contactId: contact?.id || null,
    name: keyword ? `sms.${keyword}` : "sms.received",
    properties: { from, to: params.To, messageSid: params.MessageSid, conversationId },
    source: "system",
  });
  await emitWebhook(db, projectId, "message.received", { channel: "sms", conversationId, contactId: contact?.id || null, from, to: params.To, body });
  if (thread?.created) await emitWebhook(db, projectId, "conversation.created", { channel: "sms", conversationId, contactId: contact?.id || null });

  const reply = settings.autoReply
    ? keyword === "opt_out"
      ? settings.optOutReply
      : keyword === "opt_in"
        ? settings.optInReply
        : keyword === "help"
          ? settings.helpReply
          : null
    : null;
  if (reply) await threadAutoReply(db, { projectId, conversationId, body: reply });
  return twiml(reply);
}

export async function handleSmsStatus(db, request) {
  const { params, connection, secrets, error } = await readTwilioRequest(db, request, twilioStatusUrl());
  if (error) return error;
  const next = TWILIO_STATUS[String(params.MessageStatus || "").toLowerCase()];
  if (!next || !params.MessageSid) return new Response(null, { status: 204 });

  const { data: delivery } = await db
    .from("deliveries")
    .select("id, status, contact_id, campaign_id, metadata, cost")
    .eq("project_id", connection.project_id)
    .eq("provider_id", params.MessageSid)
    .maybeSingle();
  if (!delivery) return new Response(null, { status: 204 });

  const current = STATUS_RANK[delivery.status] ?? 0;
  const forward = (STATUS_RANK[next] ?? 0) > current && !(next === "failed" && current >= STATUS_RANK.delivered);
  if (!forward) return new Response(null, { status: 204 });

  const code = Number(params.ErrorCode) || null;
  const patch = {
    status: next,
    metadata: { ...(delivery.metadata || {}), twilioStatus: params.MessageStatus, ...(code ? { errorCode: code } : {}) },
    ...(next === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
    ...(next === "failed" ? { error: TWILIO_ERRORS[code] || `Twilio error ${code || "unknown"}.` } : {}),
  };
  if ((next === "delivered" || next === "failed") && !Number(delivery.cost)) {
    const message = await getMessage(secrets, params.MessageSid);
    const price = Math.abs(Number(message.data?.price));
    if (message.ok && price) {
      patch.cost = price;
      patch.currency = String(message.data.price_unit || "USD").toUpperCase();
    }
  }
  await db.from("deliveries").update(patch).eq("id", delivery.id);
  await db.from("conversation_messages").update({ status: next === "failed" ? "failed" : next }).eq("delivery_id", delivery.id);

  if (code === 21610 && delivery.contact_id) {
    await recordConsent(db, {
      projectId: connection.project_id,
      contactId: delivery.contact_id,
      channel: "sms",
      status: "opted_out",
      source: "carrier_block",
      proof: { errorCode: code, messageSid: params.MessageSid },
    });
  }
  if (next === "delivered" || next === "failed") {
    await recordEvent(db, {
      projectId: connection.project_id,
      contactId: delivery.contact_id,
      name: next === "delivered" ? "sms.delivered" : "sms.failed",
      properties: { messageSid: params.MessageSid, ...(code ? { errorCode: code } : {}) },
      source: "system",
      deliveryId: delivery.id,
      campaignId: delivery.campaign_id,
    });
  }
  return new Response(null, { status: 204 });
}
