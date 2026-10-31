import { requirePermission } from "@/lib/server/auth";
import { ApiError, handle, readJson } from "@/lib/server/http";
import { explainFindings, sanitizeInsightPayload } from "@/lib/reporting/narrative";

// POST /api/projects/:projectId/reporting/insights — narrates computed campaign findings with the LLM.
// Body: insightPayload() from lib/reporting/insights.js. 503 when AI isn't configured.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("reporting.insights", async () => {
    const { projectId } = await params;
    await requirePermission(projectId, "campaign.ai.use");
    const payload = sanitizeInsightPayload(await readJson(request));
    try {
      return await explainFindings(payload);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error("[api.reporting.insights] provider", error?.message);
      throw new ApiError(502, "The AI provider didn't return an explanation. Try again in a moment.", "provider_failed");
    }
  });
}
