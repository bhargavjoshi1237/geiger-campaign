import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle, notFound } from "@/lib/server/http";
import { countSegment } from "@/lib/audience/resolve";

// Re-evaluates a saved segment over every contact in the project and caches contact_count / computed_at.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_request, { params }) {
  const { projectId, segmentId } = await params;
  return handle("audience.segments.evaluate", async () => {
    assertUuid(segmentId, "segment id");
    const { db } = await requirePermission(projectId, "campaign.contact.edit");
    const { data: segment, error } = await db
      .from("segments")
      .select("id, match, conditions")
      .eq("project_id", projectId)
      .eq("id", segmentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!segment) throw notFound("That segment no longer exists.");

    const { count, total, sampleIds } = await countSegment(db, projectId, segment);
    const computedAt = new Date().toISOString();
    const { error: writeError } = await db
      .from("segments")
      .update({ contact_count: count, computed_at: computedAt })
      .eq("id", segmentId);
    if (writeError) throw new Error(writeError.message);
    return { count, total, sampleIds, computedAt };
  });
}
