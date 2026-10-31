import { handle, json, readJson } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { createEndpoint } from "@/lib/webhooks/endpoints";

// Add a webhook endpoint. Its signing `secret` is in this response only.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("integrations.webhooks.create", async () => {
    const { projectId } = await params;
    const { user } = await requirePermission(projectId, "campaign.integration.manage");
    const body = await readJson(request);
    return json(await createEndpoint(requireAdminDb(), projectId, body, user.id), 201);
  });
}
