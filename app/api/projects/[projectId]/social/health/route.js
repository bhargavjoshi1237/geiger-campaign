import { handle } from "@/lib/server/http";
import { socialContext } from "@/lib/social/accounts/route_context";
import { listProjectConnections } from "@/lib/social/accounts/store";
import { checkConnectionHealth } from "@/lib/social/accounts/health";
import { SOCIAL_CHANNELS } from "@/lib/social/accounts/catalog";

// Re-checks every social connection in the project (token, permissions, webhooks) and returns the fresh rows.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  return handle("social.health.all", async () => {
    const { projectId, db } = await socialContext(params);
    const rows = (await listProjectConnections(db, projectId, SOCIAL_CHANNELS)).slice(0, 25);
    const connections = [];
    for (const row of rows) {
      const { data: secretRow } = await db.from("channel_secrets").select("secrets").eq("connection_id", row.id).maybeSingle();
      connections.push((await checkConnectionHealth(db, row, secretRow?.secrets || {})) || row);
    }
    return { connections };
  });
}
