import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { revokeApiKey } from "@/lib/integrations/api_keys";

// Revoke a key permanently.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("integrations.api_keys.revoke", async () => {
    const { projectId, keyId } = await params;
    await requirePermission(projectId, "campaign.integration.manage");
    return revokeApiKey(requireAdminDb(), projectId, assertUuid(keyId, "key id"));
  });
}
