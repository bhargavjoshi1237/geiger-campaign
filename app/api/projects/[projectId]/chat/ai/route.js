import { requireMember } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { getCampaignLlmConfig } from "@/lib/llm/chat_completions";

// Whether AI replies can run: the AI agent screen shows an honest "AI isn't configured" state when the
// CAMPAIGN_LLM_* env is unset. Never returns the key.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("chat.ai.status", async () => {
    const { projectId } = await params;
    await requireMember(projectId);
    const config = getCampaignLlmConfig();
    return { configured: Boolean(config), model: config?.model || null };
  });
}
