import { handle } from "@/lib/server/http";
import { authenticateApiKey } from "@/lib/server/api_keys";
import { listCampaignsV1 } from "@/lib/integrations/api_v1";

// Developer API: list campaigns with their cached metrics (campaigns:read).
// GET ?limit=50&cursor=<next_cursor>&status=sent&channel=email
export const runtime = "nodejs";

export async function GET(request) {
  return handle("v1.campaigns.list", async () => {
    const { db, projectId } = await authenticateApiKey(request, { scope: "campaigns:read" });
    return listCampaignsV1(db, projectId, new URL(request.url));
  });
}
