import { after } from "next/server";
import { verifyRbmSignature } from "@/lib/social/oauth/google";
import { adminClient } from "@/lib/supabase/admin";
import { processRcsEvent } from "@/lib/social/accounts/inbound/rcs";

// RCS Business Messaging agent webhook, one URL per connected agent. The console's verification request posts
// { clientToken, secret } and expects the secret back; events arrive as { message: { data: base64 } } signed
// with X-Goog-Signature = base64(HMAC-SHA512(clientToken, decoded data)).
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
    .eq("channel", "rcs")
    .is("deleted_at", null)
    .maybeSingle();
  if (!connection) return new Response("Not found", { status: 404 });
  const { data: secretRow } = await db.from("channel_secrets").select("secrets").eq("connection_id", connection.id).maybeSingle();
  const clientToken = secretRow?.secrets?.webhookClientToken;
  if (!clientToken) return new Response("Webhook client token not set", { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body) return new Response("Bad request", { status: 400 });

  if (body.clientToken !== undefined && body.secret !== undefined) {
    if (body.clientToken !== clientToken) return new Response("Invalid client token", { status: 400 });
    return new Response(String(body.secret), { status: 200, headers: { "content-type": "text/plain" } });
  }

  const data = body.message?.data;
  if (!data) return new Response("OK", { status: 200 });
  const decoded = Buffer.from(data, "base64");
  if (!verifyRbmSignature(decoded, request.headers.get("x-goog-signature"), clientToken)) return new Response("Unauthorized", { status: 401 });
  let payload;
  try {
    payload = JSON.parse(decoded.toString("utf8"));
  } catch {
    return new Response("OK", { status: 200 });
  }
  after(async () => {
    try {
      await processRcsEvent(db, connection, payload);
    } catch (error) {
      console.error("[webhooks.rcs]", connectionId, error);
    }
  });
  return new Response("OK", { status: 200 });
}
