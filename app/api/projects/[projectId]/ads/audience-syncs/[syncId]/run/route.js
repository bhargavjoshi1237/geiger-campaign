import { handle } from "@/lib/server/http";
import { runAudienceSync } from "@/lib/ads/audiences";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";
export const maxDuration = 120;

// Hashes the segment and uploads it to the Custom Audience now; the row carries the outcome (synced / failed).
export async function POST(_request, { params }) {
  return handle("ads.audienceSyncs.run", async () => {
    const { projectId, syncId, db } = await adsContext(params);
    const sync = await loadOwned(db, "audience_syncs", projectId, syncId, "Audience sync");
    const result = await runAudienceSync(db, sync);
    return { sync: result.sync, error: result.ok ? null : result.error };
  });
}
