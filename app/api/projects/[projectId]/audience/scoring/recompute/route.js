import { requirePermission } from "@/lib/server/auth";
import { badRequest, handle } from "@/lib/server/http";
import { recomputeLeadScores } from "@/lib/audience/scoring";

// Recomputes every contact's lead score from the project's active scoring rules (tracked events, email
// engagement, attribute conditions, decay) and writes the changed scores. Runs under the caller's RLS.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_request, { params }) {
  const { projectId } = await params;
  return handle("audience.scoring.recompute", async () => {
    const { db } = await requirePermission(projectId, "campaign.contact.edit");
    const result = await recomputeLeadScores(db, projectId);
    if (!result.rules) throw badRequest("Turn on at least one scoring rule first.");
    return result;
  });
}
