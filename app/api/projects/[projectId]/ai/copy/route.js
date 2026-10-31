import { generateCopy } from "@/lib/ai/tools";
import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Three copy variants for a content type in the workspace's brand voice; stored in campaign.ai_generations.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("ai.copy", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.ai.use");
    return generateCopy(db, { projectId, userId: user.id }, await readJson(request));
  });
}
