import { ApiError, handle } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/auth";
import { requireAdAccount, syncAccountSnapshots } from "@/lib/ads/accounts";
import { adsContext } from "@/lib/ads/route_context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pulls campaigns, ad sets, ads and their insights live from the Marketing API into the snapshots.
export async function POST(request, { params }) {
  return handle("ads.accounts.sync", async () => {
    const { projectId, accountId, db } = await adsContext(params);
    assertUuid(accountId, "ad account id");
    const body = await request.json().catch(() => ({}));
    const datePreset = ["last_7d", "last_14d", "last_30d"].includes(body?.datePreset) ? body.datePreset : "last_7d";
    const { account, token } = await requireAdAccount(db, projectId, accountId);
    const result = await syncAccountSnapshots(db, account, token, { datePreset });
    if (!result.ok) throw new ApiError(502, result.error, "meta_failed");
    return result;
  });
}
