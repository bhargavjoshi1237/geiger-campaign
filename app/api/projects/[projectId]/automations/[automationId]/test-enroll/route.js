import { handle, readJson } from "@/lib/server/http";
import { testEnroll } from "@/lib/automations/server";

// POST /api/projects/:projectId/automations/:automationId/test-enroll { contactId, skipWaits } — enrolls one
// contact now and runs the path as far as it goes; returns the steps it took (campaign.automation.edit).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("automations.testEnroll", async () => {
    const { projectId, automationId } = await params;
    return testEnroll(projectId, automationId, await readJson(request));
  });
}
