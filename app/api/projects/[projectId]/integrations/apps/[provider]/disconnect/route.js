import { handle } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { disconnectApp } from "@/lib/integrations/apps";

// Disconnect a native app and delete its stored credentials.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("integrations.apps.disconnect", async () => {
    const { projectId, provider } = await params;
    await requirePermission(projectId, "campaign.integration.manage");
    return disconnectApp(requireAdminDb(), projectId, provider);
  });
}
