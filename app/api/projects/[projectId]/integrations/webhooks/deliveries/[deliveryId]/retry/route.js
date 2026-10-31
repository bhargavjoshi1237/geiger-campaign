import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { retryDelivery } from "@/lib/webhooks/endpoints";

// Attempt a waiting or failed delivery now instead of at its next backoff slot.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("integrations.webhooks.retry", async () => {
    const { projectId, deliveryId } = await params;
    await requirePermission(projectId, "campaign.integration.manage");
    return retryDelivery(requireAdminDb(), projectId, assertUuid(deliveryId, "delivery id"));
  });
}
