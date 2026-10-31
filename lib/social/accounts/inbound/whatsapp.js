import { ingestInboundMessage } from "@/lib/inbox/ingest";
import { handleInboundEvent } from "@/lib/chat/engine";
import { connectionFor, handleConsentKeyword, stampWebhookEvent } from "./common";

// WhatsApp Cloud API webhook changes (server-only, service-role db): inbound messages (ingest + STOP/START consent
// + chat engine), delivery statuses (deliveries by provider_id, with Meta's pricing category), template review
// results (message_templates by external_id) and phone-number quality / messaging-limit updates.

const RANK = { queued: 0, not_sent: 0, sent: 1, delivered: 2, read: 3, opened: 3 };
const TEMPLATE_STATUS = { APPROVED: "approved", REJECTED: "rejected", PENDING: "pending", PAUSED: "paused", DISABLED: "rejected", IN_APPEAL: "pending" };
const MEDIA = ["image", "video", "audio", "document", "sticker"];

async function whatsappConnection(db, phoneNumberId) {
  const direct = await connectionFor(db, "whatsapp", phoneNumberId);
  if (direct) return direct;
  const { data } = await db
    .from("channel_connections")
    .select("*")
    .eq("channel", "whatsapp")
    .eq("config->>phoneNumberId", String(phoneNumberId))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data || null;
}

function messageText(msg) {
  if (msg.text?.body) return msg.text.body;
  if (msg.button?.text) return msg.button.text;
  if (msg.interactive?.button_reply) return msg.interactive.button_reply.title || "";
  if (msg.interactive?.list_reply) return msg.interactive.list_reply.title || "";
  for (const type of MEDIA) if (msg[type]?.caption) return msg[type].caption;
  if (msg.location) return [msg.location.name, msg.location.address].filter(Boolean).join(", ") || "Shared a location";
  return "";
}

const messagePayload = (msg) => msg.button?.payload || msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || null;

async function handleMessage(db, connection, msg, profiles) {
  const name = profiles.find((c) => c.wa_id === msg.from)?.profile?.name;
  const body = messageText(msg);
  const payload = messagePayload(msg);
  const ref = msg.referral || null;
  const isAd = ref?.source_type === "ad";
  const occurredAt = Number(msg.timestamp) * 1000 || Date.now();
  const attachments = MEDIA.filter((type) => msg[type]).map((type) => ({ type, mediaId: msg[type].id, mimeType: msg[type].mime_type || null }));

  const result = await ingestInboundMessage(db, {
    projectId: connection.project_id,
    connection,
    channel: "whatsapp",
    kind: "dm",
    externalThreadId: msg.from,
    externalMessageId: msg.id,
    sender: { externalId: msg.from, phone: `+${msg.from}`, name },
    body,
    attachments,
    occurredAt,
    context: {
      type: payload ? "postback" : ref ? "referral" : undefined,
      payload,
      adId: isAd ? ref.source_id : undefined,
      referral: ref ? { source: isAd ? "ADS" : "POST", ref: ref.ctwa_clid || null, sourceId: ref.source_id || null, sourceUrl: ref.source_url || null, headline: ref.headline || null } : undefined,
      // Click-to-WhatsApp entry points open a 72-hour free messaging window.
      freeEntryPointExpiresAt: ref ? new Date(occurredAt + 72 * 3_600_000).toISOString() : undefined,
    },
  });
  if (result.duplicate || !result.conversationId) return;

  const consent = await handleConsentKeyword(db, {
    projectId: connection.project_id,
    connection,
    channel: "whatsapp",
    contactId: result.contactId,
    to: msg.from,
    text: body,
    messageId: msg.id,
  });
  if (consent) return;

  await handleInboundEvent(db, {
    projectId: connection.project_id,
    connection,
    channel: "whatsapp",
    conversationId: result.conversationId,
    contactId: result.contactId,
    event: { type: payload ? "postback" : ref ? "referral" : "message", text: body, externalMessageId: msg.id, payload, ref: ref?.ctwa_clid || null, adId: isAd ? ref.source_id : null },
  });
}

// Advances a delivery from a WhatsApp status; statuses can arrive out of order, so only move forward.
async function applyStatus(db, status) {
  const { data: delivery } = await db
    .from("deliveries")
    .select("id, status, metadata, delivered_at, opened_at, open_count")
    .eq("provider_id", String(status.id))
    .limit(1)
    .maybeSingle();
  if (!delivery) return;
  const at = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
  const next = status.status === "failed" ? "failed" : status.status;
  const current = delivery.status;
  const patch = {};

  if (next === "failed") {
    if (["queued", "sent"].includes(current)) {
      const err = status.errors?.[0];
      patch.status = "failed";
      patch.error = err ? `${err.title || err.message || "Failed"}${err.error_data?.details ? ` — ${err.error_data.details}` : ""} (${err.code})`.slice(0, 500) : "WhatsApp couldn't deliver the message.";
    }
  } else if (RANK[next] != null && RANK[next] > (RANK[current] ?? 0)) {
    patch.status = next;
    if ((next === "delivered" || next === "read") && !delivery.delivered_at) patch.delivered_at = at;
    if (next === "read" && !delivery.opened_at) {
      patch.opened_at = at;
      patch.open_count = Math.max(1, Number(delivery.open_count) || 0);
    }
  }

  const pricing = status.pricing
    ? { billable: status.pricing.billable ?? null, category: status.pricing.category || null, model: status.pricing.pricing_model || null, type: status.pricing.type || null }
    : null;
  if (pricing || status.conversation) {
    patch.metadata = {
      ...(delivery.metadata || {}),
      ...(pricing ? { pricing } : {}),
      ...(status.conversation ? { waConversation: { id: status.conversation.id, origin: status.conversation.origin?.type || null } } : {}),
    };
    if (pricing?.billable === false) patch.cost = 0;
  }
  if (!Object.keys(patch).length) return;
  const { error } = await db.from("deliveries").update(patch).eq("id", delivery.id);
  if (error) console.error("[webhooks.whatsapp.status]", error.message);
  if (patch.status) {
    const { error: msgError } = await db.from("conversation_messages").update({ status: patch.status }).eq("delivery_id", delivery.id);
    if (msgError) console.error("[webhooks.whatsapp.status.message]", msgError.message);
  }
}

async function applyTemplateStatus(db, value) {
  const status = TEMPLATE_STATUS[value.event];
  if (!status || !value.message_template_id) return;
  const { error } = await db
    .from("message_templates")
    .update({ status, rejection_reason: status === "rejected" ? value.reason || value.event : null })
    .eq("external_id", String(value.message_template_id));
  if (error) console.error("[webhooks.whatsapp.template]", error.message);
}

async function applyQuality(db, entry, value) {
  const digits = String(value.display_phone_number || "").replace(/\D/g, "");
  const { data: rows } = await db.from("channel_connections").select("*").eq("channel", "whatsapp").is("deleted_at", null).eq("config->>wabaId", String(entry.id));
  const connection = (rows || []).find((c) => String(c.display_handle || c.config?.displayPhoneNumber || "").replace(/\D/g, "") === digits) || rows?.[0];
  if (!connection) return;
  const health = {
    ...(connection.health || {}),
    qualityEvent: value.event || null,
    messagingLimitTier: value.current_limit || connection.health?.messagingLimitTier || null,
    qualityUpdatedAt: new Date().toISOString(),
    ...(value.event === "FLAGGED" ? { lastError: "Meta flagged this number's quality — its messaging limit may drop." } : {}),
  };
  const { error } = await db.from("channel_connections").update({ health }).eq("id", connection.id);
  if (error) console.error("[webhooks.whatsapp.quality]", error.message);
}

export async function processWhatsAppChange(db, entry, change) {
  const value = change.value || {};
  if (change.field === "message_template_status_update") return applyTemplateStatus(db, value);
  if (change.field === "phone_number_quality_update") return applyQuality(db, entry, value);
  if (change.field !== "messages") return;

  for (const status of value.statuses || []) await applyStatus(db, status);
  if (!value.messages?.length) return;
  const connection = await whatsappConnection(db, value.metadata?.phone_number_id);
  if (!connection) return;
  await stampWebhookEvent(db, connection);
  for (const msg of value.messages) {
    try {
      await handleMessage(db, connection, msg, value.contacts || []);
    } catch (error) {
      console.error("[webhooks.whatsapp.message]", msg?.id, error);
    }
  }
}
