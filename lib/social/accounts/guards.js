// Send-time platform guardrails shared by the social providers (server-only, service-role db): the conversation
// that defines the messaging window, the one-automated-DM-per-24h cap for comment/story triggers, and a merge
// of guard context into the delivery's metadata so later checks (and reports) can see why it was sent.

const DAY = 86_400_000;
export const TRIGGERED = ["comment", "story_reply", "story_mention"];
const SENT = ["sent", "delivered", "read", "opened", "clicked", "replied"];

export async function findThread(db, connection, to, conversationId = null) {
  let query = db.from("conversations").select("*").is("deleted_at", null);
  query = conversationId ? query.eq("id", conversationId) : query.eq("connection_id", connection.id).eq("external_thread_id", String(to));
  const { data } = await query.limit(1).maybeSingle();
  return data || null;
}

// True when this connection already sent an automated trigger DM to `to` in the last 24h.
export async function automatedCapReached(db, { connection, channel, to, deliveryId }) {
  const { data, error } = await db
    .from("deliveries")
    .select("id")
    .eq("channel", channel)
    .eq("connection_id", connection.id)
    .eq("to_address", String(to))
    .in("status", SENT)
    .in("metadata->>trigger", TRIGGERED)
    .gte("created_at", new Date(Date.now() - DAY).toISOString())
    .neq("id", deliveryId)
    .limit(1);
  if (error) console.error("[social.guards.cap]", error.message);
  return Boolean(data?.length);
}

// True when a private reply was already sent for this comment (Meta allows one per comment).
export async function privateReplySent(db, { connection, commentId, deliveryId }) {
  const { data, error } = await db
    .from("deliveries")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("metadata->>commentId", String(commentId))
    .in("status", SENT)
    .neq("id", deliveryId)
    .limit(1);
  if (error) console.error("[social.guards.privateReply]", error.message);
  return Boolean(data?.length);
}

export async function tagDelivery(db, deliveryId, patch) {
  if (!deliveryId) return;
  const { data } = await db.from("deliveries").select("metadata").eq("id", deliveryId).maybeSingle();
  const metadata = { ...(data?.metadata || {}), ...patch };
  const { error } = await db.from("deliveries").update({ metadata }).eq("id", deliveryId);
  if (error) console.error("[social.guards.tag]", error.message);
}

export const hoursSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity);
