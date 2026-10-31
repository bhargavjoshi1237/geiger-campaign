import { ingestInboundMessage } from "@/lib/inbox/ingest";
import { handleInboundEvent } from "@/lib/chat/engine";
import { handleConsentKeyword, stampWebhookEvent } from "./common";

// RCS Business Messaging callbacks (server-only, service-role db): user messages and suggestion taps become
// conversations (STOP/START keywords go to the consent ledger), and DELIVERED/READ receipts advance the delivery
// whose id we used as the RBM messageId.

async function applyReceipt(db, payload) {
  const status = payload.eventType === "READ" ? "read" : payload.eventType === "DELIVERED" ? "delivered" : null;
  if (!status || !payload.messageId) return;
  const { data: delivery } = await db.from("deliveries").select("id, status, delivered_at, opened_at").eq("provider_id", String(payload.messageId)).limit(1).maybeSingle();
  if (!delivery || delivery.status === "read" || (status === "delivered" && delivery.status === "delivered")) return;
  const at = payload.sendTime || new Date().toISOString();
  const patch = { status };
  if (!delivery.delivered_at) patch.delivered_at = at;
  if (status === "read" && !delivery.opened_at) {
    patch.opened_at = at;
    patch.open_count = 1;
  }
  const { error } = await db.from("deliveries").update(patch).eq("id", delivery.id);
  if (error) console.error("[webhooks.rcs.receipt]", error.message);
}

export async function processRcsEvent(db, connection, payload) {
  await stampWebhookEvent(db, connection);
  if (payload.eventType) return applyReceipt(db, payload);
  const phone = payload.senderPhoneNumber;
  const tap = payload.suggestionResponse || null;
  const text = payload.text || tap?.text || (payload.location ? "Shared a location" : "");
  if (!phone || (!text && !payload.userFile)) return null;

  const attachments = payload.userFile?.payload?.fileUri
    ? [{ type: String(payload.userFile.payload.mimeType || "").startsWith("image/") ? "image" : "file", url: payload.userFile.payload.fileUri }]
    : [];
  const result = await ingestInboundMessage(db, {
    projectId: connection.project_id,
    connection,
    channel: "rcs",
    kind: "sms",
    externalThreadId: phone,
    externalMessageId: payload.messageId,
    sender: { externalId: phone, phone },
    body: text,
    attachments,
    occurredAt: payload.sendTime,
    context: tap ? { type: "postback", payload: tap.postbackData || null } : {},
  });
  if (result.duplicate || !result.conversationId) return result;

  const consent = await handleConsentKeyword(db, {
    projectId: connection.project_id,
    connection,
    channel: "rcs",
    contactId: result.contactId,
    to: phone,
    text,
    messageId: payload.messageId,
  });
  if (consent) return result;

  await handleInboundEvent(db, {
    projectId: connection.project_id,
    connection,
    channel: "rcs",
    conversationId: result.conversationId,
    contactId: result.contactId,
    event: { type: tap ? "postback" : "message", text, externalMessageId: payload.messageId, payload: tap?.postbackData || null },
  });
  return result;
}
