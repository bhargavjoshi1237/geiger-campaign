import { bulkUpdate } from "@/lib/inbox/server";
import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Bulk thread actions: resolve, reopen, snooze, priority, tag / untag, assign, read state, bot ownership.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("inbox.bulk", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.inbox.reply");
    return bulkUpdate({ db, projectId, user, input: await readJson(request) });
  });
}
