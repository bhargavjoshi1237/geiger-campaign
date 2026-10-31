import { handle } from "@/lib/server/http";
import { handleSmsStatus } from "@/lib/channels/sms_inbound";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Twilio message status callback (signature-verified): advances the matching delivery.
export async function POST(request) {
  return handle("webhooks.twilio.status", async () => handleSmsStatus(requireAdminDb(), request));
}
