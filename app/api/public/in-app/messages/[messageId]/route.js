import { assertUuid } from "@/lib/server/auth";
import { badRequest, handle, notFound, readJson } from "@/lib/server/http";
import { recordEvent } from "@/lib/events/record";
import { resolveSdkContact, resolveSdkProject } from "@/lib/channels/sdk";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

const RANK = { queued: 0, sent: 1, delivered: 2, read: 3, opened: 3, clicked: 4 };

// In-app SDK: { key, user, hash, action: "read" | "click" | "dismiss" } for one message.
export async function POST(request, { params }) {
  return handle("public.in_app.update", async () => {
    const { messageId } = await params;
    assertUuid(messageId, "message id");
    const db = requireAdminDb();
    const body = await readJson(request);
    const action = String(body.action || "");
    if (!["read", "click", "dismiss"].includes(action)) throw badRequest("action must be read, click or dismiss.");

    const { projectId } = await resolveSdkProject(db, request, body);
    const { contact } = await resolveSdkContact(db, projectId, { user: body.user, hash: body.hash });
    const { data: message } = await db
      .from("in_app_messages")
      .select("*")
      .eq("project_id", projectId)
      .eq("contact_id", contact.id)
      .eq("id", messageId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!message) throw notFound("No such message.");

    const now = new Date().toISOString();
    const patch =
      action === "dismiss"
        ? { status: "dismissed", dismissed_at: now, read_at: message.read_at || now }
        : action === "click"
          ? { status: "read", clicked_at: message.clicked_at || now, read_at: message.read_at || now }
          : { status: message.status === "unread" ? "read" : message.status, read_at: message.read_at || now };
    await db.from("in_app_messages").update(patch).eq("id", message.id);

    if (message.delivery_id && action !== "dismiss") {
      const { data: delivery } = await db.from("deliveries").select("status, open_count, click_count").eq("id", message.delivery_id).maybeSingle();
      if (delivery) {
        const next = action === "click" ? "clicked" : "read";
        await db
          .from("deliveries")
          .update({
            ...((RANK[next] ?? 0) > (RANK[delivery.status] ?? 0) ? { status: next } : {}),
            ...(action === "click"
              ? { clicked_at: now, click_count: Number(delivery.click_count || 0) + 1 }
              : { opened_at: now, open_count: Number(delivery.open_count || 0) + 1 }),
          })
          .eq("id", message.delivery_id);
      }
    }

    await recordEvent(db, {
      projectId,
      contactId: contact.id,
      name: `in_app.${action === "click" ? "clicked" : action === "dismiss" ? "dismissed" : "read"}`,
      properties: { messageId: message.id, ...(action === "click" && message.cta?.url ? { url: message.cta.url } : {}) },
      source: "web",
      deliveryId: message.delivery_id,
      campaignId: message.campaign_id,
    });
    return { ok: true };
  });
}
