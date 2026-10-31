import { explainHealth } from "@/lib/ai/tools";
import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Recomputes the deterministic health score server-side and asks the LLM to explain it (workspace or one
// campaign); stored in campaign.ai_generations.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("ai.health_explain", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.ai.use");
    return explainHealth(db, { projectId, userId: user.id }, await readJson(request));
  });
}
