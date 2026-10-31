import { handle, readJson } from "@/lib/server/http";
import { assertUuid, requireMember, requirePermission } from "@/lib/server/auth";
import { getStoreConnection, setStoreSecret } from "@/lib/commerce/connection";

// GET: ingest URL + secret status. POST: generate / rotate the signing secret (Shopify: save the pasted one).
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { projectId, storeId } = await params;
  return handle("commerce.connection.get", async () => {
    const { db } = await requireMember(projectId);
    return getStoreConnection(db, projectId, assertUuid(storeId, "store id"));
  });
}

export async function POST(request, { params }) {
  const { projectId, storeId } = await params;
  return handle("commerce.connection.rotate", async () => {
    const { db } = await requirePermission(projectId, "campaign.commerce.edit");
    const body = request.headers.get("content-type")?.includes("json") ? await readJson(request) : {};
    return setStoreSecret(db, projectId, assertUuid(storeId, "store id"), { secret: body?.secret });
  });
}
