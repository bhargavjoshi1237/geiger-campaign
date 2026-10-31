import { handle } from "@/lib/server/http";
import { publishCtwaAd } from "@/lib/ads/ctwa";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Publishes a Click-to-Message draft to Meta (campaign -> ad set -> creative -> ad), paused unless activate.
// A Meta rejection comes back as the ad with status "failed" and last_error, so the editor shows the step.
export async function POST(request, { params }) {
  return handle("ads.ctwa.publish", async () => {
    const { projectId, ctwaId, db } = await adsContext(params);
    const ad = await loadOwned(db, "ctwa_ads", projectId, ctwaId, "Ad");
    const body = await request.json().catch(() => ({}));
    const updated = await publishCtwaAd(db, ad, { activate: body?.activate === true });
    return { ad: updated };
  });
}
