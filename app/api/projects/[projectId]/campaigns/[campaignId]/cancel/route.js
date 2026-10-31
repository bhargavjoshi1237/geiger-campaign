import { campaignRoute } from "@/lib/campaigns/route_context";
import { cancelCampaignSend } from "@/lib/campaigns/sender";
import { handle } from "@/lib/server/http";

// Unschedules a scheduled campaign (back to draft) or stops a sending one (remaining recipients cancelled).
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("campaigns.cancel", async () => {
    const { admin, projectId, campaignId } = await campaignRoute(params, "campaign.campaign.send");
    return cancelCampaignSend(admin, projectId, campaignId);
  });
}
