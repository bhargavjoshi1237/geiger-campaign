import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { refreshCreatorMetrics } from "@/lib/creators/profiles";
import { WRITE_KEY, asApiError, serviceDb } from "@/lib/creators/server";

// POST -> re-reads the creator's public Instagram metrics and returns the updated row.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  const { projectId, creatorId } = await params;
  return handle("creators.refresh", async () => {
    assertUuid(creatorId, "creator id");
    await requirePermission(projectId, WRITE_KEY);
    try {
      return { creator: await refreshCreatorMetrics(serviceDb(), { projectId, creatorId }) };
    } catch (error) {
      throw asApiError(error);
    }
  });
}
