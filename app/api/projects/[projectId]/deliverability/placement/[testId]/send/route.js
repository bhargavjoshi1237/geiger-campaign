import { assertUuid, requirePermission } from "@/lib/server/auth";
import { ApiError, handle, notFound } from "@/lib/server/http";
import { sendPlacementTest } from "@/lib/deliverability/placement";

// Sends a placement test to its seed mailboxes through dispatch (source type "test") and returns the
// test with one pending result per mailbox, ready for the user to record where each copy landed.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  return handle("deliverability.placement.send", async () => {
    const { projectId, testId } = await params;
    assertUuid(testId, "test id");
    const { db, user } = await requirePermission(projectId, "campaign.deliverability.manage");
    const { data: test } = await db
      .from("placement_tests")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", testId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!test) throw notFound("Placement test not found.");
    const saved = await sendPlacementTest(db, { projectId, test, userId: user.id });
    if (!saved) throw new ApiError(500, "The test was sent but its results couldn't be saved.", "save_failed");
    return { test: saved };
  });
}
