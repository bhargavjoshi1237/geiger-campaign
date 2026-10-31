import { after } from "next/server";
import { verifyMetaSignature } from "@/lib/social/meta_graph";
import { adminClient } from "@/lib/supabase/admin";
import { processMetaWebhook } from "@/lib/social/accounts/inbound/meta";

// Meta webhook (Messenger, Instagram, WhatsApp Cloud API, Lead Ads). GET answers the subscription challenge with
// META_WEBHOOK_VERIFY_TOKEN; POST verifies X-Hub-Signature-256 over the raw body, acknowledges at once and
// processes after the response so Meta never times out and retries.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const url = new URL(request.url);
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (expected && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === expected) {
    return new Response(url.searchParams.get("hub.challenge") || "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request) {
  const raw = await request.text();
  if (!process.env.META_APP_SECRET) return new Response("Not configured", { status: 503 });
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) {
    console.error("[webhooks.meta] invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("OK", { status: 200 });
  }
  const db = adminClient();
  if (!db) {
    console.error("[webhooks.meta] SUPABASE_SERVICE_ROLE_KEY isn't configured");
    return new Response("OK", { status: 200 });
  }
  after(async () => {
    try {
      await processMetaWebhook(db, payload);
    } catch (error) {
      console.error("[webhooks.meta]", error);
    }
  });
  return new Response("OK", { status: 200 });
}
