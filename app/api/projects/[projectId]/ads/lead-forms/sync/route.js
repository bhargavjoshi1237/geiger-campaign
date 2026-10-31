import { handle } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/auth";
import { syncLeadForms } from "@/lib/ads/leads";
import { adsContext } from "@/lib/ads/route_context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pulls lead forms from every page of the connected ad accounts and subscribes the pages to leadgen.
export async function POST(request, { params }) {
  return handle("ads.leadForms.sync", async () => {
    const { projectId, db } = await adsContext(params);
    const body = await request.json().catch(() => ({}));
    const accountId = body?.accountId ? assertUuid(body.accountId, "ad account id") : null;
    return syncLeadForms(db, projectId, { accountId });
  });
}
