import { handle, json, readJson } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { createSync } from "@/lib/data/syncs";

// Create a warehouse sync. Webhook syncs return their signing `secret` in this response only.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("data.syncs.create", async () => {
    const { projectId } = await params;
    const { user } = await requirePermission(projectId, "campaign.data.manage");
    const body = await readJson(request);
    return json(await createSync(requireAdminDb(), projectId, body, user.id), 201);
  });
}
