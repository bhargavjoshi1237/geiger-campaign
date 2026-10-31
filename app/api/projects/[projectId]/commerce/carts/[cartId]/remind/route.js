import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { sendCartReminder } from "@/lib/commerce/cart_reminder";

// POST -> { status, deliveryId, remindersSent, lastRemindedAt }: email the shopper a link back to checkout.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  const { projectId, cartId } = await params;
  return handle("commerce.cart_reminder", async () => {
    const { db } = await requirePermission(projectId, "campaign.commerce.edit");
    return sendCartReminder(db, projectId, assertUuid(cartId, "cart id"));
  });
}
