import { badRequest, handle, readJson, unauthorized } from "@/lib/server/http";
import { verifyToken } from "@/lib/server/tokens";
import { recordEvent } from "@/lib/events/record";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

const RANK = { queued: 0, sent: 1, delivered: 2, clicked: 4 };

// Web push service worker beacon: { token, event: "shown" | "clicked" } with the signed token from the payload.
export async function POST(request) {
  return handle("public.push.event", async () => {
    const db = requireAdminDb();
    const body = await readJson(request);
    const payload = verifyToken(body.token, "push");
    if (!payload?.d) throw unauthorized("Invalid push token.");
    const event = body.event === "clicked" ? "clicked" : body.event === "shown" ? "delivered" : null;
    if (!event) throw badRequest("event must be shown or clicked.");

    const { data: delivery } = await db
      .from("deliveries")
      .select("id, project_id, status, contact_id, campaign_id, click_count")
      .eq("id", payload.d)
      .maybeSingle();
    if (!delivery) return { ok: true };
    const now = new Date().toISOString();
    await db
      .from("deliveries")
      .update({
        ...((RANK[event] ?? 0) > (RANK[delivery.status] ?? 0) ? { status: event } : {}),
        ...(event === "clicked" ? { clicked_at: now, click_count: Number(delivery.click_count || 0) + 1 } : { delivered_at: now }),
      })
      .eq("id", delivery.id);
    if (event === "clicked") {
      await recordEvent(db, {
        projectId: delivery.project_id,
        contactId: delivery.contact_id,
        name: "push.clicked",
        source: "web",
        deliveryId: delivery.id,
        campaignId: delivery.campaign_id,
      });
    }
    return { ok: true };
  });
}
