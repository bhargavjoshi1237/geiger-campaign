import { handle } from "@/lib/server/http";
import { evaluateAdRules } from "@/lib/ads/rules";
import { adsContext } from "@/lib/ads/route_context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Evaluates this project's automated rules now (the worker does the same every tick).
export async function POST(_request, { params }) {
  return handle("ads.rules.run", async () => {
    const { projectId, db } = await adsContext(params);
    return evaluateAdRules(db, { projectId });
  });
}
