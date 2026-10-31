import { handle, readJson } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { generateCodesForCoupon } from "@/lib/commerce/coupon_codes";

// POST { count, prefix?, length? } -> { created, batch, codes } — cryptographically random single-use codes.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { projectId, couponId } = await params;
  return handle("commerce.coupon_codes", async () => {
    const { db, user } = await requirePermission(projectId, "campaign.commerce.edit");
    const body = await readJson(request);
    return generateCodesForCoupon(db, projectId, assertUuid(couponId, "coupon id"), body || {}, user.id);
  });
}
