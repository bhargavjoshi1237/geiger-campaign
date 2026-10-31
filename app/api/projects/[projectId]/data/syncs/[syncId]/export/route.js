import { forbidden, handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { hasPermission, requireAdminDb } from "@/lib/integrations/admin_db";
import { exportSync, loadSync } from "@/lib/data/syncs";

// Stream a sync's source as a CSV / JSONL attachment (?format=csv|jsonl). Contact exports also need contact.export.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request, { params }) {
  return handle("data.syncs.export", async () => {
    const { projectId, syncId } = await params;
    const ctx = await requirePermission(projectId, "campaign.data.manage");
    const db = requireAdminDb();
    const id = assertUuid(syncId, "sync id");
    const sync = await loadSync(db, projectId, id);
    if (sync.source === "contacts" && !(await hasPermission(ctx, projectId, "campaign.contact.export"))) {
      throw forbidden("Exporting contacts needs the contact export permission.");
    }
    const format = new URL(request.url).searchParams.get("format");
    return exportSync(db, projectId, id, { format, userId: ctx.user.id });
  });
}
