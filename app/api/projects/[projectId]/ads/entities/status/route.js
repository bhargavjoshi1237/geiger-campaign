import { ApiError, badRequest, handle, readJson } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/auth";
import { requireAdAccount } from "@/lib/ads/accounts";
import { graphErrorMessage, setEntityStatus } from "@/lib/ads/meta_ads";
import { adsContext } from "@/lib/ads/route_context";

export const runtime = "nodejs";

// Pause or resume a campaign, ad set or ad on Meta and mirror it onto the snapshot.
export async function POST(request, { params }) {
  return handle("ads.entities.status", async () => {
    const { projectId, db } = await adsContext(params);
    const body = await readJson(request);
    const status = body?.status;
    if (!["ACTIVE", "PAUSED"].includes(status)) throw badRequest("Status must be ACTIVE or PAUSED.");
    if (!["campaign", "adset", "ad"].includes(body?.level)) throw badRequest("Unknown level.");
    assertUuid(body?.accountId, "ad account id");
    const externalId = String(body?.externalId || "");
    if (!/^\d+$/.test(externalId)) throw badRequest("A valid Meta id is required.");
    const { account, token } = await requireAdAccount(db, projectId, body.accountId);
    const res = await setEntityStatus(token, externalId, status);
    if (!res.ok) throw new ApiError(502, graphErrorMessage(res), "meta_failed");
    const { data } = await db
      .from("ad_campaign_snapshots")
      .update({ status, effective_status: status })
      .eq("ad_account_id", account.id)
      .eq("level", body.level)
      .eq("external_id", externalId)
      .select("*")
      .maybeSingle();
    return { snapshot: data || null };
  });
}
