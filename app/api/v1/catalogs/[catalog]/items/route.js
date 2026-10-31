import { handle, readJson } from "@/lib/server/http";
import { authenticateApiKey } from "@/lib/server/api_keys";
import { upsertCatalogItemsV1 } from "@/lib/integrations/api_v1";

// Developer API: upsert catalog items by external id (data:write). PUT { items: [{ external_id, ...fields }] } (≤ 500).
export const runtime = "nodejs";

export async function PUT(request, { params }) {
  return handle("v1.catalogs.items", async () => {
    const { catalog } = await params;
    const { db, projectId } = await authenticateApiKey(request, { scope: "data:write" });
    return upsertCatalogItemsV1(db, projectId, catalog, await readJson(request));
  });
}
