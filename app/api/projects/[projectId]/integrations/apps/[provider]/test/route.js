import { handle } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { testApp } from "@/lib/integrations/apps";

// Send a test message through a connected native app.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("integrations.apps.test", async () => {
    const { projectId, provider } = await params;
    const { user } = await requirePermission(projectId, "campaign.integration.manage");
    return testApp(requireAdminDb(), projectId, provider, user.id);
  });
}
