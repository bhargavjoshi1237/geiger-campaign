import { dispatch } from "@/lib/messaging/dispatch";
import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";
import { DEFAULT_OPT_IN_KEYWORDS, DEFAULT_OPT_OUT_KEYWORDS } from "../catalog";

// Shared pieces of the inbound webhook processors (server-only, service-role db): connection lookup by provider
// account, the consent ledger (STOP/START keywords, blocked bots, Messenger marketing opt-ins) and read receipts.

export async function connectionFor(db, channel, externalId) {
  if (!externalId) return null;
  const { data } = await db
    .from("channel_connections")
    .select("*")
    .eq("channel", channel)
    .eq("external_id", String(externalId))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function secretsFor(db, connectionId) {
  const { data } = await db.from("channel_secrets").select("secrets").eq("connection_id", connectionId).maybeSingle();
  return data?.secrets || {};
}

export async function threadExists(db, connectionId, threadId) {
  const { data } = await db
    .from("conversations")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("external_thread_id", String(threadId))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function contactForIdentity(db, projectId, channel, externalId) {
  if (!externalId) return null;
  const { data } = await db
    .from("contacts")
    .select("id")
    .eq("project_id", projectId)
    .eq(`metadata->identities->>${channel}`, String(externalId))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

// Appends a row to the consent ledger (latest row per contact + channel wins).
export async function recordConsent(db, { projectId, contactId, channel, status, source, proof = {} }) {
  if (!contactId) return false;
  const { error } = await db.from("contact_consents").insert({
    project_id: projectId,
    contact_id: contactId,
    channel,
    status,
    source,
    proof,
    captured_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[social.consent]", error.message);
    return false;
  }
  await recordEvent(db, { projectId, contactId, name: status === "opted_out" ? "consent.opted_out" : "consent.opted_in", properties: { channel, source }, source: "system" });
  if (status === "opted_out") await emitWebhook(db, projectId, "contact.unsubscribed", { contactId, channel, source });
  return true;
}

const normalizeKeyword = (text) => String(text || "").trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();

// STOP / START style keywords on messaging channels: logs consent, confirms in-thread, and reports what happened
// ("opted_out" | "opted_in" | null) so the caller can skip chat automation for the keyword itself.
export async function handleConsentKeyword(db, { projectId, connection, channel, contactId, to, text, messageId }) {
  const settings = connection?.config?.settings || {};
  const word = normalizeKeyword(text);
  if (!word || word.length > 20) return null;
  const optOut = (settings.optOutKeywords?.length ? settings.optOutKeywords : DEFAULT_OPT_OUT_KEYWORDS).map(normalizeKeyword);
  const optIn = (settings.optInKeywords?.length ? settings.optInKeywords : DEFAULT_OPT_IN_KEYWORDS).map(normalizeKeyword);
  const status = optOut.includes(word) ? "opted_out" : optIn.includes(word) ? "opted_in" : null;
  if (!status) return null;

  await recordConsent(db, { projectId, contactId, channel, status, source: "keyword", proof: { keyword: word, messageId, text: String(text).slice(0, 160) } });
  const brand = connection?.config?.brand || connection?.name || "us";
  await dispatch({
    db,
    projectId,
    channel,
    to,
    contactId,
    connectionId: connection?.id || null,
    source: { type: "transactional", id: null },
    idempotencyKey: `consent:${channel}:${messageId}`,
    message: {
      text:
        status === "opted_out"
          ? `You're unsubscribed and won't get more messages from ${brand}. Reply START to resubscribe.`
          : `You're subscribed to messages from ${brand} again. Reply STOP to unsubscribe.`,
    },
    metadata: { consentConfirmation: status },
  });
  return status;
}

// Marks outbound messages in a thread delivered/read from a platform receipt (watermark or message ids).
export async function markOutbound(db, { connectionId, threadId, status, watermark = null, mids = null }) {
  const { data: thread } = await db
    .from("conversations")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("external_thread_id", String(threadId))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!thread) return;
  let query = db
    .from("conversation_messages")
    .update({ status })
    .eq("conversation_id", thread.id)
    .eq("direction", "outbound")
    .in("status", status === "read" ? ["sent", "delivered"] : ["sent"]);
  if (mids?.length) query = query.in("external_id", mids.map(String));
  else if (watermark) query = query.lte("sent_at", new Date(Number(watermark)).toISOString());
  const { error } = await query;
  if (error) console.error("[social.receipts]", error.message);
}

// Throttled "last webhook event" stamp on the connection health, shown on the channel screen.
export async function stampWebhookEvent(db, connection) {
  const last = connection.health?.webhook?.lastEventAt;
  if (last && Date.now() - new Date(last).getTime() < 5 * 60_000) return;
  const health = { ...(connection.health || {}), webhook: { ...(connection.health?.webhook || {}), lastEventAt: new Date().toISOString() } };
  const { error } = await db.from("channel_connections").update({ health }).eq("id", connection.id);
  if (error) console.error("[social.webhook.stamp]", error.message);
}
