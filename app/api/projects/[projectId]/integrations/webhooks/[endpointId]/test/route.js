import { handle, readJson } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { sendTestEvent } from "@/lib/webhooks/endpoints";

// Send one signed sample event now and return the delivery with the endpoint's response.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("integrations.webhooks.test", async () => {
    const { projectId, endpointId } = await params;
    const { user } = await requirePermission(projectId, "campaign.integration.manage");
    const body = await readJson(request).catch(() => ({}));
    return sendTestEvent(requireAdminDb(), projectId, assertUuid(endpointId, "endpoint id"), { event: body?.event }, user.id);
  });
}
