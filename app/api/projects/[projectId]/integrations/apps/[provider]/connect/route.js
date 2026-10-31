import { handle, readJson } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { connectApp } from "@/lib/integrations/apps";

// Connect a native app (Slack: incoming webhook URL + events) and send a test message.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("integrations.apps.connect", async () => {
    const { projectId, provider } = await params;
    const { user } = await requirePermission(projectId, "campaign.integration.manage");
    const body = await readJson(request);
    return connectApp(requireAdminDb(), projectId, provider, body, user.id);
  });
}
