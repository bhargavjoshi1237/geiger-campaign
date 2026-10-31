import { handle, json, readJson } from "@/lib/server/http";
import { authenticateApiKey } from "@/lib/server/api_keys";
import { listContactsV1, upsertContactV1 } from "@/lib/integrations/api_v1";

// Developer API: list contacts (contacts:read) and create-or-update one by email / phone (contacts:write).
// GET ?limit=50&cursor=<next_cursor>&email=&status=&updated_since=   POST { email, phone, first_name, … }
export const runtime = "nodejs";

export async function GET(request) {
  return handle("v1.contacts.list", async () => {
    const { db, projectId } = await authenticateApiKey(request, { scope: "contacts:read" });
    return listContactsV1(db, projectId, new URL(request.url));
  });
}

export async function POST(request) {
  return handle("v1.contacts.upsert", async () => {
    const { db, projectId } = await authenticateApiKey(request, { scope: "contacts:write" });
    const result = await upsertContactV1(db, projectId, await readJson(request));
    return json(result, result.created ? 201 : 200);
  });
}
