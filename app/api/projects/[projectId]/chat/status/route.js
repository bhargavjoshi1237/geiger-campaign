import { requirePermission, assertUuid } from "@/lib/server/auth";
import { ApiError, badRequest, handle, json, notFound, readJson } from "@/lib/server/http";
import { CHAT_RESOURCES, preparePublish } from "@/lib/chat/publish";

// Publish / pause / archive a chat resource (automation, flow, sequence, AI agent, entry point, handover rule).
// Publishing validates first and answers 422 with every problem; a flow publish snapshots its graph.
export const runtime = "nodejs";

const ACTIONS = new Set(["publish", "pause", "archive"]);

export async function POST(request, { params }) {
  return handle("chat.status", async () => {
    const { projectId } = await params;
    const { db } = await requirePermission(projectId, "campaign.chat.edit");
    const body = await readJson(request);
    const resource = CHAT_RESOURCES[body?.resource];
    if (!resource) throw badRequest("Unknown chat resource.");
    if (!ACTIONS.has(body?.action)) throw badRequest("Action must be publish, pause or archive.");
    assertUuid(body?.id, `${resource.label} id`);

    const { data: row, error } = await db
      .from(resource.table)
      .select("*")
      .eq("id", body.id)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new ApiError(500, `Couldn't load the ${resource.label}.`);
    if (!row) throw notFound(`That ${resource.label} doesn't exist.`);

    let patch;
    if (body.action === "publish") {
      let steps = [];
      if (body.resource === "sequences") {
        const { data } = await db.from("chat_sequence_steps").select("*").eq("sequence_id", row.id).is("deleted_at", null).order("position");
        steps = data || [];
      }
      const prepared = preparePublish(body.resource, row, { steps });
      if (prepared.errors.length) return json({ error: prepared.errors[0], errors: prepared.errors, code: "invalid" }, 422);
      patch = prepared.patch;
    } else if (body.action === "pause") {
      patch = { status: "paused" };
    } else {
      if (!resource.published) throw badRequest(`A ${resource.label} can't be archived — pause or delete it.`);
      patch = { status: "archived" };
    }

    const { data: updated, error: updateError } = await db.from(resource.table).update(patch).eq("id", row.id).select("*").single();
    if (updateError) throw new ApiError(500, `Couldn't update the ${resource.label}.`);
    return { row: updated };
  });
}
