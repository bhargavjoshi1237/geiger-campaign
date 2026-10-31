import { requirePermission, assertUuid } from "@/lib/server/auth";
import { ApiError, handle, notFound, readJson } from "@/lib/server/http";
import { simulateTurn } from "@/lib/chat/simulate";
import { askAgent, decideHandover } from "@/lib/chat/ai_agent";

// Flow simulator: runs one turn of the (unsaved) graph without sending anything. AI steps call the real
// LLM when it's configured; otherwise the transcript says the live flow would hand over at that point.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("chat.flows.simulate", async () => {
    const { projectId, flowId } = await params;
    assertUuid(flowId, "flow id");
    const { db } = await requirePermission(projectId, "campaign.chat.edit");
    const body = await readJson(request);

    const { data: flow, error } = await db
      .from("dm_flows")
      .select("*")
      .eq("id", flowId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new ApiError(500, "Couldn't load the flow.");
    if (!flow) throw notFound("That flow doesn't exist.");

    const graph = body?.graph && typeof body.graph === "object" ? body.graph : flow.graph;
    const channels = Array.isArray(body?.channels) ? body.channels : flow.channels || [];
    const channel = channels[0] || "instagram";
    const agents = new Map();

    const ai = async (agentId, text, history) => {
      if (!agentId) return { unavailable: true, note: "This AI step has no agent selected." };
      if (!agents.has(agentId)) {
        const { data } = await db.from("ai_agents").select("*").eq("id", agentId).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
        agents.set(agentId, data || null);
      }
      const agent = agents.get(agentId);
      if (!agent) return { unavailable: true, note: "The selected AI agent no longer exists." };
      const result = await askAgent(agent, { channel, history, text });
      if (!result.ok) return { unavailable: true, note: result.status === 503 ? "AI isn't configured — a live conversation hands over to a person here." : result.error };
      const decision = decideHandover(agent, result, text);
      return { ...result, handover: decision.handover, reason: decision.reason };
    };

    return simulateTurn(
      graph,
      {
        state: body?.state || {},
        facts: { channel, ...(body?.facts || {}) },
        input: body?.input || null,
        timeout: Boolean(body?.timeout),
        settings: body?.settings || flow.settings || {},
        channels,
        history: Array.isArray(body?.history) ? body.history.slice(-12) : [],
        person: body?.person || {},
      },
      { ai },
    );
  });
}
