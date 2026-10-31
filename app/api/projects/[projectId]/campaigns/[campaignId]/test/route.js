import { campaignRoute } from "@/lib/campaigns/route_context";
import { sendCampaignTest } from "@/lib/campaigns/sender";
import { handle, readJson } from "@/lib/server/http";

// Sends the campaign to up to 5 addresses with a [Test] subject and sample-contact merge data.
// body { to: ["a@b.co"], contactId?, variant? } -> { sent, failed, errors }
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("campaigns.test", async () => {
    const { admin, projectId, campaignId } = await campaignRoute(params, "campaign.campaign.edit");
    const body = (await readJson(request)) || {};
    return sendCampaignTest(admin, {
      projectId,
      campaignId,
      to: body.to,
      contactId: typeof body.contactId === "string" ? body.contactId : null,
      variant: typeof body.variant === "string" ? body.variant : null,
    });
  });
}
