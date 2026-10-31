import { ApiError, handle } from "@/lib/server/http";
import { backfillLeads } from "@/lib/ads/leads";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";
export const maxDuration = 120;

// Lands leads Meta still holds for this form (up to 90 days) that Campaign hasn't captured yet.
export async function POST(request, { params }) {
  return handle("ads.leadForms.backfill", async () => {
    const { projectId, formId, db } = await adsContext(params);
    const form = await loadOwned(db, "lead_forms", projectId, formId, "Lead form");
    const body = await request.json().catch(() => ({}));
    const result = await backfillLeads(db, projectId, form, { days: Number(body?.days) || 90 });
    if (!result.ok) throw new ApiError(502, result.error, "meta_failed");
    return { fetched: result.fetched, created: result.created, updated: result.updated, duplicates: result.duplicates, failed: result.failed };
  });
}
