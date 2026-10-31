import { assertUuid } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { getProjectConnection, verifyConnection } from "@/lib/channels/connect";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Live health check: Twilio account + numbers, WhatsApp quality rating and messaging tier, VAPID keys.
export async function POST(_request, { params }) {
  return handle("channels.verify", async () => {
    const { projectId, connectionId } = await params;
    assertUuid(connectionId, "connection id");
    const { admin } = await authorizeChannels(projectId);
    const connection = await getProjectConnection(admin, projectId, connectionId);
    return { connection: await verifyConnection(admin, connection) };
  });
}
