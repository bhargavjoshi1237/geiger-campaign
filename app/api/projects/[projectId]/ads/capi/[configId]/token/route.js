import { ApiError, badRequest, handle, readJson } from "@/lib/server/http";
import { graphRequest } from "@/lib/social/meta_graph";
import { graphErrorMessage } from "@/lib/ads/meta_ads";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";

// Stores the Conversions API access token (server-only) after checking it can read the dataset.
export async function POST(request, { params }) {
  return handle("ads.capi.token", async () => {
    const { projectId, configId, db } = await adsContext(params);
    const config = await loadOwned(db, "capi_configs", projectId, configId, "Dataset");
    const body = await readJson(request);
    const accessToken = String(body?.accessToken || "").trim();
    if (accessToken.length < 20) throw badRequest("Paste the full access token.");
    if (!config.dataset_id) throw badRequest("Save the dataset id first.");
    const check = await graphRequest(config.dataset_id, { token: accessToken, query: { fields: "id,name" } });
    if (!check.ok) throw new ApiError(400, graphErrorMessage(check, "That token can't read this dataset."), "meta_rejected");
    const { error } = await db
      .from("capi_secrets")
      .upsert({ project_id: projectId, capi_config_id: config.id, secrets: { accessToken } }, { onConflict: "capi_config_id" });
    if (error) throw new ApiError(500, "Couldn't store the token.", "save_failed");
    const { data } = await db.from("capi_configs").update({ token_set: true, last_error: null }).eq("id", config.id).select("*").single();
    return { config: data, dataset: { id: String(check.data?.id || config.dataset_id), name: check.data?.name || "" } };
  });
}
