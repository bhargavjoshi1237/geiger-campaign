import { after } from "next/server";
import { AFTER_RESPONSE_MS, campaignRoute } from "@/lib/campaigns/route_context";
import { startCampaignSend } from "@/lib/campaigns/sender";
import { handle, readJson } from "@/lib/server/http";

// Sends now (queues the audience and starts delivering right after the response) or schedules for later.
// body { mode: "now" | "schedule", scheduledAt?, strategy?: { mode: "now" | "scheduled" | "timezone" | "optimized" } }
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request, { params }) {
  return handle("campaigns.send", async () => {
    const { admin, user, projectId, campaignId } = await campaignRoute(params, "campaign.campaign.send");
    const body = (await readJson(request)) || {};
    const { response, run } = await startCampaignSend(admin, {
      projectId,
      campaignId,
      mode: body.mode || "now",
      scheduledAt: body.scheduledAt || null,
      strategy: body.strategy && typeof body.strategy === "object" ? body.strategy : null,
      userId: user.id,
    });
    if (run) {
      after(() => run(Date.now() + AFTER_RESPONSE_MS).catch((error) => console.error("[api.campaigns.send.after]", error)));
    }
    return response;
  });
}
