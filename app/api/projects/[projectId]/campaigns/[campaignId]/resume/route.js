import { after } from "next/server";
import { AFTER_RESPONSE_MS, campaignRoute } from "@/lib/campaigns/route_context";
import { resumeCampaignSend } from "@/lib/campaigns/sender";
import { handle } from "@/lib/server/http";

// Resumes a paused campaign and keeps delivering right after the response.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request, { params }) {
  return handle("campaigns.resume", async () => {
    const { admin, projectId, campaignId } = await campaignRoute(params, "campaign.campaign.send");
    const { response, run } = await resumeCampaignSend(admin, projectId, campaignId);
    after(() => run(Date.now() + AFTER_RESPONSE_MS).catch((error) => console.error("[api.campaigns.resume.after]", error)));
    return response;
  });
}
