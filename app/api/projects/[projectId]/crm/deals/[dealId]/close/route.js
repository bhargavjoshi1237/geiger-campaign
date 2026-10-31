import { handle, readJson } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { adminClient } from "@/lib/supabase/admin";
import { closeDeal } from "@/lib/crm/server";

// Mark a deal won / lost / reopen it: body { status: "open" | "won" | "lost", lostReason? } -> { deal } (raw row).
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("crm.deals.close", async () => {
    const { projectId, dealId } = await params;
    const { db } = await requirePermission(projectId, "campaign.crm.edit");
    assertUuid(dealId, "deal id");
    const body = await readJson(request);
    return closeDeal(db, {
      projectId,
      dealId,
      status: body?.status,
      lostReason: body?.lostReason,
      adminDb: adminClient(),
    });
  });
}
