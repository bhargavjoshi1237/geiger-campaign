import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { runSyncNow } from "@/lib/data/syncs";

// Run a webhook sync now: push every row changed since its cursor in signed batches.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request, { params }) {
  return handle("data.syncs.run", async () => {
    const { projectId, syncId } = await params;
    const { user } = await requirePermission(projectId, "campaign.data.manage");
    return runSyncNow(requireAdminDb(), projectId, assertUuid(syncId, "sync id"), user.id);
  });
}
