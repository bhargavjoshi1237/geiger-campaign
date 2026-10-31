import { handle } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { exportPayoutsCsv } from "@/lib/creators/payouts";
import { WRITE_KEY } from "@/lib/creators/server";

// GET ?period=YYYY-MM&status=pending|approved|paid -> payout ledger as CSV, for paying outside Geiger.
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { projectId } = await params;
  return handle("creators.payouts.export", async () => {
    const { db } = await requirePermission(projectId, WRITE_KEY);
    const search = new URL(request.url).searchParams;
    const period = search.get("period");
    const csv = await exportPayoutsCsv(db, { projectId, period, status: search.get("status") });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="creator-payouts${period ? `-${period}` : ""}.csv"`,
        "cache-control": "no-store",
      },
    });
  });
}
