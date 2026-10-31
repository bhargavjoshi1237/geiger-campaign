import { requirePermission } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { exportWorkspace } from "@/lib/settings/export";

// Downloads the workspace's data as one JSON file (requires campaign.settings.manage; rows read under RLS).
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_request, { params }) {
  return handle("settings.export", async () => {
    const { projectId } = await params;
    const { db } = await requirePermission(projectId, "campaign.settings.manage");
    const data = await exportWorkspace(db, projectId);
    const stamp = data.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="campaign-export-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
