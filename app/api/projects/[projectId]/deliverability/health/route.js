import { requireMember } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { getDeliverabilityHealth } from "@/lib/deliverability/health";

// Deliverability inputs for the campaign health score: domain authentication, blocklist listings,
// validation quality and warm-up state, with a 0–100 score and its reasons.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("deliverability.health", async () => {
    const { projectId } = await params;
    const { db } = await requireMember(projectId);
    return (await getDeliverabilityHealth(db, projectId)) || { score: null, reasons: [] };
  });
}
