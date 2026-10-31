import { commentAction } from "@/lib/inbox/server";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Comment thread actions on Meta: public reply, one private reply DM, hide / unhide and delete.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request, { params }) {
  return handle("inbox.comment", async () => {
    const { projectId, conversationId } = await params;
    assertUuid(conversationId, "conversation id");
    const { db, user } = await requirePermission(projectId, "campaign.inbox.reply");
    return commentAction({ db, projectId, conversationId, user, input: await readJson(request) });
  });
}
