import { assertUuid } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { connectionContext } from "@/lib/social/accounts/route_context";
import { sendTestMessage } from "@/lib/social/accounts/manage";

// Sends one real test message through dispatch (platform rules apply, so a closed window is refused with the reason).
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("social.connection.test", async () => {
    const { connectionId } = await params;
    assertUuid(connectionId, "connection id");
    const { projectId, user, db, connection } = await connectionContext(params);
    const body = await readJson(request);
    return sendTestMessage(db, { projectId, userId: user.id, connection, to: body?.to, text: body?.text });
  });
}
