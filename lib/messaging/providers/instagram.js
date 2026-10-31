import { sendMetaMessage } from "@/lib/social/accounts/meta_send";

// Instagram provider: Instagram Messaging over the Messenger Platform Send API (POST /{page-id}/messages with
// the linked Page token). `to` is the person's IGSID; the 24h window and trigger caps are enforced before sending.
// Returns { status: "sent" | "failed" | "not_sent", providerId, error, cost }.
export const name = "instagram";

export async function send(ctx) {
  return sendMetaMessage(ctx, "Instagram");
}
