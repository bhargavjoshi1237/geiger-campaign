import { generateSubjectLines } from "@/lib/ai/tools";
import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Subject line + preheader options informed by the workspace's best past subjects; stored in campaign.ai_generations.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("ai.subject_lines", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.ai.use");
    return generateSubjectLines(db, { projectId, userId: user.id }, await readJson(request));
  });
}
