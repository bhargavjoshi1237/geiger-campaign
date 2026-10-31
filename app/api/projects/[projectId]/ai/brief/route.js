import { generateBrief } from "@/lib/ai/tools";
import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Structured campaign brief from goal/audience/offer/channel/tone/constraints, grounded in the workspace's
// send-time data and engagement baseline; stored in campaign.ai_generations.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("ai.brief", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.ai.use");
    return generateBrief(db, { projectId, userId: user.id }, await readJson(request));
  });
}
