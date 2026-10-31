import { assertUuid } from "@/lib/server/auth";
import { ApiError, handle } from "@/lib/server/http";
import { connectionContext } from "@/lib/social/accounts/route_context";
import { checkConnectionHealth } from "@/lib/social/accounts/health";

// Re-checks one connection's token, permissions and webhook subscription; returns the updated row.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("social.connection.health", async () => {
    const { connectionId } = await params;
    assertUuid(connectionId, "connection id");
    const { db, connection, secrets } = await connectionContext(params);
    const row = await checkConnectionHealth(db, connection, secrets);
    if (!row) throw new ApiError(500, "Couldn't record the health check.", "save_failed");
    return { connection: row };
  });
}
