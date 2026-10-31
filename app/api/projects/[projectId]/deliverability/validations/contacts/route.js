import { assertUuid, requirePermission } from "@/lib/server/auth";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";
import { validateContactBatch } from "@/lib/deliverability/validate_contacts";

// Validates one bounded batch of contacts (body { scope: { type: all|list|segment, id }, cursor, batchSize,
// skipFresh }). The client repeats with nextCursor until done.
export const runtime = "nodejs";
export const maxDuration = 60;

const SCOPES = new Set(["all", "list", "segment"]);

export async function POST(request, { params }) {
  return handle("deliverability.validations.contacts", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.deliverability.manage");
    const body = await readJson(request);
    const scope = body?.scope || { type: "all" };
    if (!SCOPES.has(scope.type)) throw badRequest("Choose all contacts, a list or a segment.");
    if (scope.type !== "all") assertUuid(scope.id, `${scope.type} id`);
    return validateContactBatch(db, adminClient(), projectId, {
      scope,
      cursor: body?.cursor,
      batchSize: body?.batchSize,
      skipFresh: Boolean(body?.skipFresh),
      createdBy: user.id,
    });
  });
}
