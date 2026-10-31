import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { replayDelivery } from "@/lib/webhooks/endpoints";

// Re-send a past delivery as a new attempt with the same event id.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("integrations.webhooks.replay", async () => {
    const { projectId, deliveryId } = await params;
    const { user } = await requirePermission(projectId, "campaign.integration.manage");
    return replayDelivery(requireAdminDb(), projectId, assertUuid(deliveryId, "delivery id"), user.id);
  });
}
