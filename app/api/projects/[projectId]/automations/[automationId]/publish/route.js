import { handle } from "@/lib/server/http";
import { publishAutomation } from "@/lib/automations/server";

// POST /api/projects/:projectId/automations/:automationId/publish — validates the graph and goes live
// (campaign.automation.publish); 422 with { errors } when the graph isn't ready.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("automations.publish", async () => {
    const { projectId, automationId } = await params;
    return publishAutomation(projectId, automationId);
  });
}
