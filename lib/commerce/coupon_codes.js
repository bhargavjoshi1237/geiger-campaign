import { ApiError, badRequest, notFound } from "@/lib/server/http";
import { MAX_CODES_PER_RUN, generateCouponCodes } from "./coupons";

// Bulk single-use coupon codes (server-only, user-scoped db so RLS enforces campaign.commerce.edit).
// Codes come from crypto.getRandomValues; a rare collision with an existing code is regenerated.

const CHUNK = 500;

export async function generateCodesForCoupon(db, projectId, couponId, { count, prefix, length } = {}, userId = null) {
  const n = Math.trunc(Number(count));
  if (!n || n < 1 || n > MAX_CODES_PER_RUN) {
    throw badRequest(`Generate between 1 and ${MAX_CODES_PER_RUN.toLocaleString("en-US")} codes at a time.`);
  }
  const { data: coupon, error } = await db
    .from("coupons")
    .select("id, code")
    .eq("project_id", projectId)
    .eq("id", couponId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ApiError(500, "Couldn't load the coupon.", "coupon_load_failed");
  if (!coupon) throw notFound("Coupon not found.");

  const options = { prefix: prefix ?? coupon.code, length };
  const batch = new Date().toISOString();
  const codes = generateCouponCodes(n, options);
  const created = [];

  for (let i = 0; i < codes.length; i += CHUNK) {
    let chunk = codes.slice(i, i + CHUNK);
    for (let attempt = 0; ; attempt += 1) {
      const rows = chunk.map((code) => ({ project_id: projectId, coupon_id: couponId, code, batch, created_by: userId }));
      const { error: insertError } = await db.from("coupon_codes").insert(rows);
      if (!insertError) {
        created.push(...chunk);
        break;
      }
      if (insertError.code !== "23505" || attempt >= 2) {
        console.error("[commerce.codes]", insertError.message);
        throw new ApiError(500, `Saved ${created.length} codes before an error. Try again for the rest.`, "codes_failed");
      }
      chunk = generateCouponCodes(chunk.length, { ...options, exclude: new Set([...created, ...codes]) });
    }
  }

  await db.from("coupons").update({ unique_codes: true }).eq("id", couponId);
  return { created: created.length, batch, codes: created };
}
