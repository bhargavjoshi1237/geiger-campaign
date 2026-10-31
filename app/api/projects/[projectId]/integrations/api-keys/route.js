import { handle, json, readJson } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { requireAdminDb } from "@/lib/integrations/admin_db";
import { issueApiKey } from "@/lib/integrations/api_keys";

// Issue an API key. The plaintext `key` is in this response only; the database keeps its sha256.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("integrations.api_keys.create", async () => {
    const { projectId } = await params;
    const { user } = await requirePermission(projectId, "campaign.integration.manage");
    const body = await readJson(request);
    return json(await issueApiKey(requireAdminDb(), projectId, body, user.id), 201);
  });
}
