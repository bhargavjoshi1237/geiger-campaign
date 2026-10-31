import { handle } from "@/lib/server/http";
import { pauseAutomation } from "@/lib/automations/server";

// POST /api/projects/:projectId/automations/:automationId/pause — stops new enrollments and holds everyone
// already enrolled in place (campaign.automation.publish).
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("automations.pause", async () => {
    const { projectId, automationId } = await params;
    return pauseAutomation(projectId, automationId);
  });
}
