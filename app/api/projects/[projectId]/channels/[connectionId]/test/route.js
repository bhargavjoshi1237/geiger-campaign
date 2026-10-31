import { assertUuid } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { getProjectConnection, testConnection } from "@/lib/channels/connect";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// One real test send through dispatch (logged in deliveries with source_type = test).
export async function POST(request, { params }) {
  return handle("channels.test", async () => {
    const { projectId, connectionId } = await params;
    assertUuid(connectionId, "connection id");
    const { user, admin } = await authorizeChannels(projectId);
    const body = await readJson(request);
    const connection = await getProjectConnection(admin, projectId, connectionId);
    return testConnection(admin, { projectId, connection, userId: user.id, body });
  });
}
