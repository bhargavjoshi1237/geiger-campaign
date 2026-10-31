import { loadCampaignReport } from "@/lib/campaigns/report";
import { campaignRoute } from "@/lib/campaigns/route_context";
import { handle, notFound } from "@/lib/server/http";

// The campaign report, read under the caller's RLS.
// -> { metrics, links, timeline, variants, winner, statuses, send }
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request, { params }) {
  return handle("campaigns.report", async () => {
    const { db, projectId, campaignId } = await campaignRoute(params, null, { needsAdmin: false });
    const report = await loadCampaignReport(db, projectId, campaignId);
    if (!report) throw notFound("Campaign not found.");
    return report;
  });
}
