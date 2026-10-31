import { handle } from "@/lib/server/http";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { rollApiKey } from "@/lib/integrations/api_keys";

// Replace a key's secret; the old one stops working at once and the new plaintext is returned once.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("integrations.api_keys.roll", async () => {
    const { projectId, keyId } = await params;
    await requirePermission(projectId, "campaign.integration.manage");
    return rollApiKey(requireAdminDb(), projectId, assertUuid(keyId, "key id"));
  });
}
