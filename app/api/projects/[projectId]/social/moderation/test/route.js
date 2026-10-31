import { requirePermission } from "@/lib/server/auth";
import { badRequest, handle, notConfigured, readJson } from "@/lib/server/http";
import { aiConfigured, classifyComment } from "@/lib/social/ai_classify";

// The rules tester's AI check: classifies a sample comment as spam / toxic / negative with the configured LLM.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request, { params }) {
  return handle("social.moderation.test", async () => {
    const { projectId } = await params;
    await requirePermission(projectId, "campaign.social.edit");
    const { text } = await readJson(request);
    if (!String(text || "").trim()) throw badRequest("Enter a sample comment.");
    if (!aiConfigured()) throw notConfigured("AI isn't configured. Set CAMPAIGN_LLM_BASE_URL, CAMPAIGN_LLM_API_KEY and CAMPAIGN_LLM_MODEL.");
    const labels = await classifyComment(text);
    if (!labels) throw notConfigured("The AI provider didn't return a classification. Try again.");
    return { labels: { spam: labels.spam, toxicity: labels.toxicity, negative: labels.negative }, reason: labels.reason };
  });
}
