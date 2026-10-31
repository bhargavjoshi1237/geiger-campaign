import { after } from "next/server";
import { verifyTikTokSignature } from "@/lib/social/oauth/tiktok";
import { adminClient } from "@/lib/supabase/admin";
import { processTikTokEvent } from "@/lib/social/accounts/inbound/tiktok";

// TikTok API for Business DIRECT_MESSAGE webhook (one callback for the app). Tiktok-Signature is an HMAC of
// "<timestamp>.<raw body>" with the app secret and must be at most 5 seconds old.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const raw = await request.text();
  if (!process.env.TIKTOK_APP_SECRET) return new Response("Not configured", { status: 503 });
  if (!verifyTikTokSignature(raw, request.headers.get("tiktok-signature"))) return new Response("Unauthorized", { status: 401 });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("OK", { status: 200 });
  }
  const db = adminClient();
  if (!db) return new Response("OK", { status: 200 });
  after(async () => {
    try {
      await processTikTokEvent(db, event);
    } catch (error) {
      console.error("[webhooks.tiktok]", error);
    }
  });
  return new Response("OK", { status: 200 });
}
