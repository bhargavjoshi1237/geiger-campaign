import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { stopOutreach } from "@/lib/creators/outreach";
import { WRITE_KEY } from "@/lib/creators/server";

// POST -> pauses the sequence; enrolled creators keep their place and continue when it's started again.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  const { projectId, outreachId } = await params;
  return handle("creators.outreach.stop", async () => {
    assertUuid(outreachId, "sequence id");
    const { db } = await requirePermission(projectId, WRITE_KEY);
    return stopOutreach(db, { projectId, outreachId });
  });
}
