import { handle } from "@/lib/server/http";
import { routeAdComments } from "@/lib/ads/rules";
import { adsContext } from "@/lib/ads/route_context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Applies ad-comment rules to this project's comment threads from the last 3 days now.
export async function POST(_request, { params }) {
  return handle("ads.comments.apply", async () => {
    const { projectId, db } = await adsContext(params);
    return routeAdComments(db, { projectId, sinceHours: 72 });
  });
}
