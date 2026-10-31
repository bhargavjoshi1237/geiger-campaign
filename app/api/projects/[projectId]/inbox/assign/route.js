import { assignConversations } from "@/lib/inbox/server";
import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Manual assignment, or auto-assign through the routing rules (round robin / least busy) + SLA policies.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("inbox.assign", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.inbox.reply");
    return assignConversations({ db, projectId, user, input: await readJson(request) });
  });
}
