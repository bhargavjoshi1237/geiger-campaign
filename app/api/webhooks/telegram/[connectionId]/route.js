import { after } from "next/server";
import { verifyTelegramSecret } from "@/lib/social/telegram";
import { adminClient } from "@/lib/supabase/admin";
import { processTelegramUpdate } from "@/lib/social/accounts/inbound/telegram";

// Telegram bot webhook, one URL per connected bot. X-Telegram-Bot-Api-Secret-Token must match the secret set with
// setWebhook. Private chats go to the inbox + chat engine, groups and channels to Communities.
export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  const { connectionId } = await params;
  if (!UUID.test(connectionId || "")) return new Response("Not found", { status: 404 });
  const db = adminClient();
  if (!db) return new Response("Not configured", { status: 503 });

  const { data: connection } = await db
    .from("channel_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("channel", "telegram")
    .is("deleted_at", null)
    .maybeSingle();
  if (!connection) return new Response("Not found", { status: 404 });
  const { data: secretRow } = await db.from("channel_secrets").select("secrets").eq("connection_id", connection.id).maybeSingle();
  const secrets = secretRow?.secrets || {};
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"), secrets.webhookSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await request.json().catch(() => null);
  if (!update) return new Response("OK", { status: 200 });
  after(async () => {
    try {
      await processTelegramUpdate(db, connection, secrets, update);
    } catch (error) {
      console.error("[webhooks.telegram]", connectionId, update?.update_id, error);
    }
  });
  return new Response("OK", { status: 200 });
}
