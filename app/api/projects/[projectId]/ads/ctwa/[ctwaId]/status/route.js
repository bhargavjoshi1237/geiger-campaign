import { badRequest, handle, readJson } from "@/lib/server/http";
import { setCtwaStatus, syncEntryPoint } from "@/lib/ads/ctwa";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";

// Pause or resume a published Click-to-Message ad on Meta.
export async function POST(request, { params }) {
  return handle("ads.ctwa.status", async () => {
    const { projectId, ctwaId, db } = await adsContext(params);
    const ad = await loadOwned(db, "ctwa_ads", projectId, ctwaId, "Ad");
    const body = await readJson(request);
    if (!["ACTIVE", "PAUSED"].includes(body?.status)) throw badRequest("Status must be ACTIVE or PAUSED.");
    const updated = await setCtwaStatus(db, ad, body.status);
    await syncEntryPoint(db, updated);
    return { ad: updated };
  });
}
