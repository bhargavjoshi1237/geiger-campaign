import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { rotateSyncSecret } from "@/lib/data/syncs";

// New signing secret for a webhook sync (returned once; the old one stops at once).
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("data.syncs.rotate", async () => {
    const { projectId, syncId } = await params;
    await requirePermission(projectId, "campaign.data.manage");
    return rotateSyncSecret(requireAdminDb(), projectId, assertUuid(syncId, "sync id"));
  });
}
