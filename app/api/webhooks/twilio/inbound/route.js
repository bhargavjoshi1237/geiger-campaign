import { handle } from "@/lib/server/http";
import { handleInboundSms } from "@/lib/channels/sms_inbound";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Twilio inbound SMS webhook (signature-verified): inbox thread, STOP/START/HELP, TwiML auto-reply.
export async function POST(request) {
  return handle("webhooks.twilio.inbound", async () => handleInboundSms(requireAdminDb(), request));
}
