import { suggestSegments } from "@/lib/ai/tools";
import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Plain-language goal -> segment conditions restricted to the segment rule vocabulary (unknown fields and
// operators are dropped server-side); stored in campaign.ai_generations.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("ai.segment", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.ai.use");
    return suggestSegments(db, { projectId, userId: user.id }, await readJson(request));
  });
}
