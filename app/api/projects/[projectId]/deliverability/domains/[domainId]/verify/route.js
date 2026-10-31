import { assertUuid, requirePermission } from "@/lib/server/auth";
import { ApiError, handle, notFound } from "@/lib/server/http";
import { verifyAndSaveDomain } from "@/lib/deliverability/verify";

// Live DNS verification of one sending domain: looks up every provider record plus SPF/DKIM/DMARC/BIMI,
// stores found values, per-record status and the authentication analysis, and returns the saved row.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  return handle("deliverability.domains.verify", async () => {
    const { projectId, domainId } = await params;
    assertUuid(domainId, "domain id");
    const { db } = await requirePermission(projectId, "campaign.deliverability.manage");
    const { data: row } = await db
      .from("sending_domains")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", domainId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) throw notFound("Sending domain not found.");
    const saved = await verifyAndSaveDomain(db, row);
    if (!saved) throw new ApiError(500, "Couldn't save the DNS check.", "save_failed");
    return { domain: saved };
  });
}
