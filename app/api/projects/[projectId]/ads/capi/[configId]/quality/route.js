import { ApiError, badRequest, handle, notConfigured } from "@/lib/server/http";
import { fetchDatasetQuality, loadCapiToken } from "@/lib/ads/capi";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";

// Refreshes Event Match Quality from Meta's Dataset Quality API and stores it on the dataset config.
export async function POST(_request, { params }) {
  return handle("ads.capi.quality", async () => {
    const { projectId, configId, db } = await adsContext(params);
    const config = await loadOwned(db, "capi_configs", projectId, configId, "Dataset");
    if (!config.dataset_id) throw badRequest("Save the dataset id first.");
    const token = await loadCapiToken(db, config);
    if (!token) throw notConfigured("Add an access token for this dataset first.");
    const result = await fetchDatasetQuality(db, config, token);
    if (!result.ok) throw new ApiError(502, result.error, "meta_failed");
    return { config: result.config, quality: result.quality };
  });
}
