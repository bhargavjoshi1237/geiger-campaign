import { telegramRequest } from "@/lib/social/telegram";
import { unsubscribePage } from "@/lib/social/oauth/meta";
import { dispatch } from "@/lib/messaging/dispatch";
import { badRequest } from "@/lib/server/http";
import { sanitizeSettings, startersChanged, syncProfile } from "./settings";

// Managing a connected social account (server-only, service-role db; routes authorize campaign.channel.manage):
// settings + platform starter sync, test messages through dispatch, and disconnect (webhook teardown + secret wipe).

export async function updateSocialConnection(db, connection, secrets, patch = {}) {
  const config = { ...(connection.config || {}) };
  const health = { ...(connection.health || {}) };
  const row = {};
  let profileSync = null;

  if ("brand" in patch) config.brand = String(patch.brand || "").trim().slice(0, 80) || connection.name;
  if ("name" in patch && String(patch.name || "").trim()) row.name = String(patch.name).trim().slice(0, 120);
  if (patch.settings && typeof patch.settings === "object") {
    const prev = config.settings || {};
    const next = sanitizeSettings(connection.channel, patch.settings, prev);
    config.settings = next;
    if (startersChanged(prev, next)) {
      profileSync = await syncProfile(connection, secrets, next);
      health.profileSync = profileSync;
    }
  }

  const { data, error } = await db.from("channel_connections").update({ ...row, config, health }).eq("id", connection.id).select("*").single();
  if (error) {
    console.error("[social.manage.update]", error.message);
    return { connection: null, profileSync };
  }
  return { connection: data, profileSync };
}

export async function sendTestMessage(db, { projectId, userId, connection, to, text }) {
  const body = String(text || "").trim();
  const recipient = String(to || "").trim();
  if (!recipient) throw badRequest("Choose who receives the test message.");
  if (!body) throw badRequest("Write the test message first.");

  const { data: thread } = await db
    .from("conversations")
    .select("id, contact_id")
    .eq("connection_id", connection.id)
    .eq("external_thread_id", recipient)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const result = await dispatch({
    db,
    projectId,
    channel: connection.channel,
    to: recipient,
    contactId: thread?.contact_id || null,
    connectionId: connection.id,
    source: { type: "test", id: null },
    message: { text: body.slice(0, 1000), conversationId: thread?.id || null },
    metadata: { test: true, sentBy: userId },
  });

  if (thread && (result.status === "sent" || result.status === "delivered")) {
    const now = new Date().toISOString();
    const { error } = await db.from("conversation_messages").insert({
      project_id: projectId,
      conversation_id: thread.id,
      direction: "outbound",
      sender_type: "agent",
      sender_id: userId,
      body: body.slice(0, 1000),
      external_id: result.providerId || null,
      status: "sent",
      delivery_id: result.deliveryId,
      sent_at: now,
      metadata: { test: true },
    });
    if (error) console.error("[social.manage.test.message]", error.message);
    await db.from("conversations").update({ last_message_at: now }).eq("id", thread.id);
  }
  return { status: result.status, error: result.error || null, deliveryId: result.deliveryId || null };
}

export async function disconnectSocialConnection(db, connection, secrets) {
  const notes = [];
  if ((connection.channel === "messenger" || connection.channel === "instagram") && secrets?.pageAccessToken) {
    const pageId = connection.config?.pageId || connection.external_id;
    // Keep the Page subscribed while its other channel (Messenger or Instagram) is still connected.
    const { data: siblings } = await db
      .from("channel_connections")
      .select("id, channel, external_id, config")
      .in("channel", ["messenger", "instagram"])
      .is("deleted_at", null)
      .neq("id", connection.id);
    const shared = (siblings || []).some((c) => String(c.config?.pageId || c.external_id) === String(pageId));
    if (!shared) {
      const res = await unsubscribePage(pageId, secrets.pageAccessToken);
      if (!res.ok) notes.push(`Meta: ${res.error}`);
    }
  }
  if (connection.channel === "telegram" && secrets?.botToken) {
    const res = await telegramRequest(secrets.botToken, "deleteWebhook", { drop_pending_updates: false });
    if (!res.ok) notes.push(`Telegram: ${res.error}`);
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("channel_connections")
    .update({ status: "disconnected", deleted_at: now, health: { ...(connection.health || {}), disconnectedAt: now, reauthRequired: false } })
    .eq("id", connection.id);
  if (error) {
    console.error("[social.manage.disconnect]", error.message);
    return { ok: false, notes };
  }
  const { error: wipeError } = await db.from("channel_secrets").update({ secrets: {} }).eq("connection_id", connection.id);
  if (wipeError) console.error("[social.manage.disconnect.secrets]", wipeError.message);
  return { ok: true, notes };
}
