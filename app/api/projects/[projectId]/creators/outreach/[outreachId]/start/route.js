import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { startOutreach } from "@/lib/creators/outreach";
import { WRITE_KEY, serviceDb } from "@/lib/creators/server";

// POST -> enrols the sequence's creators, sends the steps already due and activates the sequence
// (also resumes a paused one). Later steps are sent by the creators worker.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  const { projectId, outreachId } = await params;
  return handle("creators.outreach.start", async () => {
    assertUuid(outreachId, "sequence id");
    await requirePermission(projectId, WRITE_KEY);
    return startOutreach(serviceDb(), { projectId, outreachId });
  });
}
