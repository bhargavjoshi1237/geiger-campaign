import { handle } from "@/lib/server/http";
import { exitEnrollment } from "@/lib/automations/server";

// POST /api/projects/:projectId/automations/:automationId/enrollments/:enrollmentId/exit — removes a running
// contact from the automation (campaign.automation.edit).
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("automations.exitEnrollment", async () => {
    const { projectId, automationId, enrollmentId } = await params;
    return exitEnrollment(projectId, automationId, enrollmentId);
  });
}
