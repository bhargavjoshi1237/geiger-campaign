import { handle, json, notFound } from "@/lib/server/http";
import { resolveSdkProject } from "@/lib/channels/sdk";
import { findChannelConnection } from "@/lib/channels/connect";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Web push SDK: the VAPID public key the page passes to pushManager.subscribe().
export async function GET(request) {
  return handle("public.push.config", async () => {
    const db = requireAdminDb();
    const { projectId } = await resolveSdkProject(db, request);
    const connection = await findChannelConnection(db, projectId, "push");
    if (!connection || connection.status !== "connected" || !connection.config?.vapidPublicKey) {
      throw notFound("Web push isn't set up for this project.");
    }
    return json({ vapidPublicKey: connection.config.vapidPublicKey }, 200, { "Cache-Control": "public, max-age=300" });
  });
}
