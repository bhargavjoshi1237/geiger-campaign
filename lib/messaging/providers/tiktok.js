import { refreshTikTokToken, tiktokRequest } from "@/lib/social/oauth/tiktok";
import { tiktokRegionRestricted } from "@/lib/social/accounts/catalog";
import { tagDelivery } from "@/lib/social/accounts/guards";
import { notConnected, saveConnectionSecrets } from "../connections";

// TikTok provider: TikTok API for Business direct messages (POST business/message/send/, recipient_type
// CONVERSATION). Business accounts only, never in the EEA/CH/UK, text only, and only within 48 hours of the
// person's last message. `to` is the TikTok conversation id (or the person's TikTok user id).
// Returns { status, providerId, error, cost }.
export const name = "tiktok";

const WINDOW_MS = 48 * 3_600_000;

async function findThread(db, connection, to) {
  const { data: byThread } = await db
    .from("conversations")
    .select("id, external_thread_id, last_inbound_at, contact_id")
    .eq("connection_id", connection.id)
    .eq("external_thread_id", String(to))
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (byThread) return byThread;
  const { data: byUser } = await db
    .from("conversations")
    .select("id, external_thread_id, last_inbound_at, contact_id")
    .eq("connection_id", connection.id)
    .eq("metadata->>externalUserId", String(to))
    .is("deleted_at", null)
    .order("last_inbound_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return byUser || null;
}

async function accessToken(db, connection, secrets) {
  if (secrets.expiresAt && new Date(secrets.expiresAt).getTime() - Date.now() < 5 * 60_000 && secrets.refreshToken) {
    const refreshed = await refreshTikTokToken(secrets.refreshToken);
    if (!refreshed.ok) return null;
    const { accessToken: token, refreshToken, expiresAt, refreshExpiresAt } = refreshed;
    await saveConnectionSecrets(db, { projectId: connection.project_id, connectionId: connection.id, secrets: { accessToken: token, refreshToken, expiresAt, refreshExpiresAt } });
    return token;
  }
  return secrets.accessToken || null;
}

export async function send({ db, deliveryId, to, message = {}, connection, secrets }) {
  if (!connection) return notConnected("TikTok");
  const block = async (rule, error) => {
    await tagDelivery(db, deliveryId, { blockedBy: rule });
    return { status: "not_sent", error };
  };
  if (connection.status === "disconnected") return { status: "not_sent", error: "TikTok is disconnected." };
  if (tiktokRegionRestricted(connection.config?.region)) {
    return block("region", "TikTok doesn't offer business messaging in the EEA, Switzerland or the UK.");
  }
  if (!secrets?.accessToken) return { status: "not_sent", error: "The TikTok token isn't stored — reconnect the account." };

  const thread = await findThread(db, connection, to);
  if (!thread?.last_inbound_at) return block("window", "This person hasn't messaged the TikTok account, so it can't start a conversation.");
  if (Date.now() - new Date(thread.last_inbound_at).getTime() > WINDOW_MS) {
    return block("window", "Outside TikTok's 48-hour reply window. Wait for the person to message again.");
  }
  if (thread.contact_id) {
    const { data: contact } = await db.from("contacts").select("attributes").eq("id", thread.contact_id).maybeSingle();
    if (tiktokRegionRestricted(contact?.attributes?.country)) {
      return block("region", "TikTok business messaging isn't available for people in the EEA, Switzerland or the UK.");
    }
  }

  const text = String(message.text ?? message.body ?? "").trim();
  if (!text) return { status: "failed", error: "TikTok messages must include text (images aren't supported here yet)." };
  const token = await accessToken(db, connection, secrets);
  if (!token) return { status: "failed", error: "TikTok refused to refresh the access token — reconnect the account." };

  const res = await tiktokRequest("business/message/send/", {
    token,
    method: "POST",
    body: {
      business_id: connection.external_id,
      recipient_type: "CONVERSATION",
      recipient: thread.external_thread_id,
      message_type: "TEXT",
      text: { body: text.slice(0, 1000) },
    },
  });
  if (!res.ok) return { status: "failed", error: res.error || "TikTok refused the message.", cost: 0 };
  return { status: "sent", providerId: res.data?.message?.message_id || null, error: null, cost: 0, connectionId: connection.id };
}
