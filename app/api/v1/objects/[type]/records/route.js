import { handle, readJson } from "@/lib/server/http";
import { authenticateApiKey } from "@/lib/server/api_keys";
import { upsertObjectRecordsV1 } from "@/lib/integrations/api_v1";

// Developer API: upsert custom object records by external id (data:write).
// PUT { records: [{ external_id, contact_id | email, data: { … } }] } (≤ 500).
export const runtime = "nodejs";

export async function PUT(request, { params }) {
  return handle("v1.objects.records", async () => {
    const { type } = await params;
    const { db, projectId } = await authenticateApiKey(request, { scope: "data:write" });
    return upsertObjectRecordsV1(db, projectId, type, await readJson(request));
  });
}
