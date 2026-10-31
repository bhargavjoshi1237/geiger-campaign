import { extractApiKey, verifyApiKey } from "@/lib/server/api_keys";
import { assertUuid } from "@/lib/server/auth";
import { handle, notFound, unauthorized } from "@/lib/server/http";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Developer API: the current state of one message sent with this project's key.
export async function GET(request, { params }) {
  return handle("v1.messages.get", async () => {
    const { messageId } = await params;
    assertUuid(messageId, "message id");
    const db = requireAdminDb();
    const auth = await verifyApiKey(db, extractApiKey(request), { scope: "messages:send" });
    if (!auth?.projectId || auth.kind === "public") throw unauthorized("Pass a secret API key with the messages:send scope.");

    const { data } = await db
      .from("deliveries")
      .select("id, channel, status, to_address, subject, source_type, error, sent_at, delivered_at, opened_at, clicked_at, bounced_at, created_at")
      .eq("project_id", auth.projectId)
      .eq("id", messageId)
      .maybeSingle();
    if (!data) throw notFound("No message with that id.");
    return {
      id: data.id,
      channel: data.channel,
      status: data.status,
      to: data.to_address,
      subject: data.subject,
      source: data.source_type,
      error: data.error,
      createdAt: data.created_at,
      sentAt: data.sent_at,
      deliveredAt: data.delivered_at,
      openedAt: data.opened_at,
      clickedAt: data.clicked_at,
      bouncedAt: data.bounced_at,
    };
  });
}
