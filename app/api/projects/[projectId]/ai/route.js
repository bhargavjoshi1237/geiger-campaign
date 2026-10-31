import { getCampaignLlmConfig } from "@/lib/llm/chat_completions";
import { requireMember } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

// AI assistant status for the screens: whether an LLM is configured, so they can say so before anyone
// fills a form. Never exposes the key or base URL.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("ai.status", async () => {
    const { projectId } = await params;
    await requireMember(projectId);
    const config = getCampaignLlmConfig();
    return { configured: Boolean(config), model: config?.model ?? null };
  });
}
