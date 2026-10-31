import { campaignRoute } from "@/lib/campaigns/route_context";
import { estimateCampaign } from "@/lib/campaigns/sender";
import { handle } from "@/lib/server/http";

// Recipients for the saved audience and why the rest are excluded.
// -> { recipients, excluded: { unsubscribed, suppressed, noAddress, noConsent }, dailyCap, warnings }
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request, { params }) {
  return handle("campaigns.estimate", async () => {
    const { admin, projectId, campaignId } = await campaignRoute(params);
    return estimateCampaign(admin, projectId, campaignId);
  });
}
