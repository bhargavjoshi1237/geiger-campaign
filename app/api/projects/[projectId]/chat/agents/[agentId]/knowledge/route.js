import { requirePermission, assertUuid } from "@/lib/server/auth";
import { ApiError, handle, notFound, readJson } from "@/lib/server/http";
import { refreshKnowledge } from "@/lib/chat/ai_agent";

// Re-reads an agent's URL knowledge sources server-side and caches the extracted text on each item, so the
// agent answers from what the pages say today. Body { knowledge? } refreshes an unsaved list.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("chat.agents.knowledge", async () => {
    const { projectId, agentId } = await params;
    assertUuid(agentId, "agent id");
    const { db } = await requirePermission(projectId, "campaign.chat.edit");
    const body = await readJson(request).catch(() => ({}));

    const { data: row, error } = await db
      .from("ai_agents")
      .select("id, knowledge")
      .eq("id", agentId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new ApiError(500, "Couldn't load the agent.");
    if (!row) throw notFound("That agent doesn't exist.");

    const source = Array.isArray(body?.knowledge) ? body.knowledge : row.knowledge || [];
    const knowledge = await refreshKnowledge(source.slice(0, 40));
    const { error: updateError } = await db.from("ai_agents").update({ knowledge }).eq("id", row.id);
    if (updateError) throw new ApiError(500, "Couldn't save the refreshed knowledge.");
    return { knowledge };
  });
}
