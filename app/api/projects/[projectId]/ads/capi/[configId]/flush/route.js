import { badRequest, handle, notConfigured } from "@/lib/server/http";
import { enqueueConversions, flushCapiQueue, loadCapiToken } from "@/lib/ads/capi";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Scans new conversions and posts everything queued for this dataset now, instead of waiting for the worker.
export async function POST(_request, { params }) {
  return handle("ads.capi.flush", async () => {
    const { projectId, configId, db } = await adsContext(params);
    const config = await loadOwned(db, "capi_configs", projectId, configId, "Dataset");
    if (!config.dataset_id) throw badRequest("Save the dataset id first.");
    const token = await loadCapiToken(db, config);
    if (!token) throw notConfigured("Add an access token for this dataset first.");
    const queued = await enqueueConversions(db, config);
    const fresh = await loadOwned(db, "capi_configs", projectId, configId, "Dataset");
    const flushed = await flushCapiQueue(db, fresh, token, { deadline: Date.now() + 45_000 });
    return { enqueued: queued.enqueued || 0, skipped: queued.skipped || 0, sent: flushed.sent, failed: flushed.failed };
  });
}
