import { adminClient } from "@/lib/supabase/admin";
import { loadConnection } from "./connections";
import { PROVIDERS } from "./providers";

// The single outbound path for every channel (server-only): log -> provider -> update log.
// Every send is recorded in campaign.deliveries first ("queued"), so a failed or uncertain delivery is
// still auditable, then handed to the channel's provider (email goes through geiger-dash). Callers
// authorize first; this runs on the service role because deliveries are server-written.
//
//   dispatch({
//     projectId, channel: "email", to: "a@b.co", contactId,
//     source: { type: "campaign", id: campaignId }, campaignId, variant: "B",
//     idempotencyKey: `campaign:${campaignId}:${contactId}`,
//     message: { subject, html, from } | async ({ deliveryId }) => ({ subject, html, from }),
//   })
//
// `message` may be a function so the body can embed the delivery id (tracking pixel, signed links).
// Returns { status, deliveryId, providerId, error, duplicate? } and never throws.

export const DELIVERY_STATUS = Object.freeze({
  queued: "queued",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  notSent: "not_sent",
});

export async function dispatch({
  db = adminClient(),
  projectId,
  channel,
  to,
  contactId = null,
  connectionId = null,
  source = { type: "campaign", id: null },
  campaignId = null,
  variant = null,
  idempotencyKey = null,
  message,
  metadata = {},
}) {
  if (!db) return { status: DELIVERY_STATUS.notSent, deliveryId: null, error: "Server database access isn't configured." };
  if (!projectId || !channel || !to) {
    return { status: DELIVERY_STATUS.failed, deliveryId: null, error: "projectId, channel and to are required." };
  }
  const provider = PROVIDERS[channel];
  if (!provider) return { status: DELIVERY_STATUS.failed, deliveryId: null, error: `Unknown channel "${channel}".` };

  if (idempotencyKey) {
    const { data: existing } = await db
      .from("deliveries")
      .select("id, status, provider_id, error")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return {
        status: existing.status,
        deliveryId: existing.id,
        providerId: existing.provider_id,
        error: existing.error,
        duplicate: true,
      };
    }
  }

  const { data: row, error: logError } = await db
    .from("deliveries")
    .insert({
      project_id: projectId,
      channel,
      status: DELIVERY_STATUS.queued,
      contact_id: contactId,
      to_address: String(to),
      source_type: source?.type || "campaign",
      source_id: source?.id || null,
      campaign_id: campaignId,
      variant,
      connection_id: connectionId,
      idempotency_key: idempotencyKey,
      metadata,
    })
    .select("id")
    .single();
  if (logError || !row) {
    console.error("[messaging.dispatch] log insert failed", logError?.message);
    return { status: DELIVERY_STATUS.failed, deliveryId: null, error: "Couldn't record the delivery." };
  }
  const deliveryId = row.id;

  let result;
  try {
    const built = typeof message === "function" ? await message({ deliveryId }) : message;
    const { connection, secrets } =
      channel === "email" ? { connection: null, secrets: null } : await loadConnection(db, projectId, channel, connectionId);
    result = await provider.send({ db, projectId, deliveryId, to, message: built || {}, connection, secrets, idempotencyKey });
  } catch (error) {
    console.error(`[messaging.dispatch.${channel}]`, error);
    result = { status: DELIVERY_STATUS.failed, error: "The provider outcome is unknown.", uncertain: true };
  }

  const now = new Date().toISOString();
  const status = result?.status || DELIVERY_STATUS.failed;
  await db
    .from("deliveries")
    .update({
      status,
      provider: result?.provider || provider.name,
      provider_id: result?.providerId || null,
      connection_id: result?.connectionId || connectionId,
      subject: result?.subject ?? null,
      error: result?.error ? String(result.error).slice(0, 500) : null,
      cost: Number(result?.cost) || 0,
      ...(status === DELIVERY_STATUS.sent || status === DELIVERY_STATUS.delivered ? { sent_at: now } : {}),
    })
    .eq("id", deliveryId);

  return { status, deliveryId, providerId: result?.providerId || null, error: result?.error || null };
}
