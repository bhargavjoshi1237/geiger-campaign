import { badRequest, handle, notFound, readJson } from "@/lib/server/http";
import { resolveSdkContact, resolveSdkProject } from "@/lib/channels/sdk";
import { findChannelConnection } from "@/lib/channels/connect";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Web push SDK: register (or with action "unsubscribe", retire) a browser PushSubscription.
//   { key, subscription: PushSubscription.toJSON(), user?, hash?, anonymousId? }
// Passing user + hash (identity verification, as for in-app) links the subscription to that contact.
export async function POST(request) {
  return handle("public.push.subscribe", async () => {
    const db = requireAdminDb();
    const body = await readJson(request);
    const { projectId } = await resolveSdkProject(db, request, body);
    const endpoint = String(body.subscription?.endpoint || body.endpoint || "");
    if (!/^https:\/\//.test(endpoint)) throw badRequest("A PushSubscription endpoint is required.");

    if (body.action === "unsubscribe") {
      await db.from("push_subscriptions").update({ status: "unsubscribed" }).eq("project_id", projectId).eq("endpoint", endpoint);
      return { ok: true };
    }

    const keys = body.subscription?.keys || {};
    if (!keys.p256dh || !keys.auth) throw badRequest("The subscription's p256dh and auth keys are required.");
    const connection = await findChannelConnection(db, projectId, "push");
    if (!connection || connection.status !== "connected") throw notFound("Web push isn't set up for this project.");

    const contactId = body.user ? (await resolveSdkContact(db, projectId, { user: body.user, hash: body.hash })).contact.id : null;
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("push_subscriptions")
      .upsert(
        {
          project_id: projectId,
          connection_id: connection.id,
          endpoint,
          keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
          platform: "web",
          status: "active",
          user_agent: (request.headers.get("user-agent") || "").slice(0, 300),
          anonymous_id: body.anonymousId ? String(body.anonymousId).slice(0, 120) : null,
          last_seen_at: now,
          deleted_at: null,
          ...(contactId ? { contact_id: contactId } : {}),
        },
        { onConflict: "project_id,endpoint" },
      )
      .select("id")
      .single();
    if (error) throw badRequest("Couldn't save the subscription.");
    return { ok: true, id: data.id, linked: Boolean(contactId) };
  });
}
