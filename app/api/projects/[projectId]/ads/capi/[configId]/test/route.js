import { ApiError, badRequest, handle, notConfigured } from "@/lib/server/http";
import { loadCapiToken, sendCapiTestEvent } from "@/lib/ads/capi";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";

// Sends one event to Meta's Test Events tool with the dataset's test_event_code and logs it.
export async function POST(_request, { params }) {
  return handle("ads.capi.test", async () => {
    const { projectId, configId, db } = await adsContext(params);
    const config = await loadOwned(db, "capi_configs", projectId, configId, "Dataset");
    if (!config.dataset_id) throw badRequest("Save the dataset id first.");
    if (!config.test_event_code) throw badRequest("Add the test event code from Events Manager → Test events.");
    const token = await loadCapiToken(db, config);
    if (!token) throw notConfigured("Add an access token for this dataset first.");
    const result = await sendCapiTestEvent(db, config, token);
    if (!result.ok) throw new ApiError(502, result.error, "meta_failed");
    return { event: result.event, response: result.response };
  });
}
