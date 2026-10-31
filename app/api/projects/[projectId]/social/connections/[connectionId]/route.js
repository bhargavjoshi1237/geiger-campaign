import { assertUuid } from "@/lib/server/auth";
import { ApiError, handle, readJson } from "@/lib/server/http";
import { connectionContext } from "@/lib/social/accounts/route_context";
import { disconnectSocialConnection, updateSocialConnection } from "@/lib/social/accounts/manage";

// PATCH: channel settings / brand / name (conversation starters sync to the platform). DELETE: disconnect.
export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  return handle("social.connection.update", async () => {
    const { connectionId } = await params;
    assertUuid(connectionId, "connection id");
    const { db, connection, secrets } = await connectionContext(params);
    const body = await readJson(request);
    const result = await updateSocialConnection(db, connection, secrets, body || {});
    if (!result.connection) throw new ApiError(500, "Couldn't save the settings.", "save_failed");
    return result;
  });
}

export async function DELETE(_request, { params }) {
  return handle("social.connection.disconnect", async () => {
    const { connectionId } = await params;
    assertUuid(connectionId, "connection id");
    const { db, connection, secrets } = await connectionContext(params);
    const result = await disconnectSocialConnection(db, connection, secrets);
    if (!result.ok) throw new ApiError(500, "Couldn't disconnect the account.", "save_failed");
    return result;
  });
}
