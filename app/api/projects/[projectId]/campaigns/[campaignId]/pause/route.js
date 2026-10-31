import { campaignRoute } from "@/lib/campaigns/route_context";
import { pauseCampaignSend } from "@/lib/campaigns/sender";
import { handle } from "@/lib/server/http";

// Pauses a sending campaign; queued recipients wait until it is resumed.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("campaigns.pause", async () => {
    const { admin, projectId, campaignId } = await campaignRoute(params, "campaign.campaign.send");
    return pauseCampaignSend(admin, projectId, campaignId);
  });
}
