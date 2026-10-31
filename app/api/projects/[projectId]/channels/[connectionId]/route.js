import { assertUuid } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { disconnectConnection, getProjectConnection } from "@/lib/channels/connect";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Disconnect: the connection is soft-deleted and its stored credentials are wiped.
export async function DELETE(_request, { params }) {
  return handle("channels.disconnect", async () => {
    const { projectId, connectionId } = await params;
    assertUuid(connectionId, "connection id");
    const { admin } = await authorizeChannels(projectId);
    const connection = await getProjectConnection(admin, projectId, connectionId);
    await disconnectConnection(admin, connection);
    return { ok: true };
  });
}
