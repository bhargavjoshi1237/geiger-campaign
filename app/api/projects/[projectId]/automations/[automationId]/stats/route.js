import { handle } from "@/lib/server/http";
import { automationStats } from "@/lib/automations/server";

// GET /api/projects/:projectId/automations/:automationId/stats — totals plus per-node counts
// ({ totals, current, processed }) for the canvas and performance tiles (any project member).
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("automations.stats", async () => {
    const { projectId, automationId } = await params;
    return automationStats(projectId, automationId);
  });
}
