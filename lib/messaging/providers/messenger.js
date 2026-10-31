import { sendMetaMessage } from "@/lib/social/accounts/meta_send";

// Messenger provider: Messenger Platform Send API (POST /{page-id}/messages with the Page token). `to` is the
// person's PSID; inside the 24h window as RESPONSE, HUMAN_AGENT for human replies up to 7 days, or a marketing
// messages opt-in token (message.notificationToken). Returns { status, providerId, error, cost }.
export const name = "messenger";

export async function send(ctx) {
  return sendMetaMessage(ctx, "Messenger");
}
