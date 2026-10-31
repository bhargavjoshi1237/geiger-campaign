import { handle, readJson } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { rotateEndpointSecret } from "@/lib/webhooks/endpoints";

// New signing secret (returned once). The previous one keeps signing for 24h unless `expireNow`.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("integrations.webhooks.rotate", async () => {
    const { projectId, endpointId } = await params;
    await requirePermission(projectId, "campaign.integration.manage");
    const body = await readJson(request).catch(() => ({}));
    return rotateEndpointSecret(requireAdminDb(), projectId, assertUuid(endpointId, "endpoint id"), { expireNow: Boolean(body?.expireNow) });
  });
}
