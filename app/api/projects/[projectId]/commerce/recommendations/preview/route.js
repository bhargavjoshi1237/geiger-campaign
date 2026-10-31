import { badRequest, handle, readJson } from "@/lib/server/http";
import { assertUuid, requireMember } from "@/lib/server/auth";
import { recommendForRule } from "@/lib/commerce/recommendations_server";

// POST { rule: { strategy, filters, limit, storeId }, contactId?, productId? } -> { items, needs, basis }.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { projectId } = await params;
  return handle("commerce.recommendations.preview", async () => {
    const { db } = await requireMember(projectId);
    const body = await readJson(request);
    if (!body?.rule || typeof body.rule !== "object") throw badRequest("A rule is required.");
    const rule = { ...body.rule, storeId: body.rule.storeId ? assertUuid(body.rule.storeId, "store id") : null };
    return recommendForRule(db, projectId, rule, {
      contactId: body.contactId ? assertUuid(body.contactId, "contact id") : null,
      productIds: body.productId ? [assertUuid(body.productId, "product id")] : [],
    });
  });
}
