import { requirePermission, assertUuid } from "@/lib/server/auth";
import { ApiError, badRequest, handle, notConfigured, notFound, readJson } from "@/lib/server/http";
import { askAgent, decideHandover, toAgent } from "@/lib/chat/ai_agent";

// AI agent sandbox: answers a test conversation with the agent's (possibly unsaved) persona, instructions and
// knowledge through the configured LLM, and says whether a live conversation would hand over. 503 when AI
// isn't configured.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("chat.agents.test", async () => {
    const { projectId, agentId } = await params;
    assertUuid(agentId, "agent id");
    const { db } = await requirePermission(projectId, "campaign.chat.edit");
    const body = await readJson(request);
    const messages = Array.isArray(body?.messages) ? body.messages.filter((m) => m && String(m.content || "").trim()) : [];
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") throw badRequest("Send a test message first.");

    const { data: row, error } = await db
      .from("ai_agents")
      .select("*")
      .eq("id", agentId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new ApiError(500, "Couldn't load the agent.");
    if (!row) throw notFound("That agent doesn't exist.");

    const agent = toAgent({ ...row, ...(body?.agent && typeof body.agent === "object" ? body.agent : {}) });
    const history = messages.slice(0, -1).slice(-12).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
    const text = String(last.content);
    const result = await askAgent(agent, { channel: body?.channel || agent.channels[0] || "instagram", history, text });
    if (!result.ok) {
      if (result.status === 503) throw notConfigured(result.error);
      throw new ApiError(502, result.error, "llm_failed");
    }
    const decision = decideHandover(agent, result, text);
    return {
      reply: result.reply,
      confidence: result.confidence,
      intent: result.intent,
      sentiment: result.sentiment,
      handover: decision.handover,
      reason: decision.reason,
    };
  });
}
