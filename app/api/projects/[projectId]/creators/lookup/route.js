import { handle, readJson } from "@/lib/server/http";
import { requirePermission } from "@/lib/server/auth";
import { lookupInstagramCreator } from "@/lib/creators/instagram";
import { WRITE_KEY, asApiError, serviceDb } from "@/lib/creators/server";

// POST { handle } -> public Instagram profile + computed audience via business discovery (409 when no
// Instagram professional account is connected).
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { projectId } = await params;
  return handle("creators.lookup", async () => {
    await requirePermission(projectId, WRITE_KEY);
    const body = await readJson(request);
    try {
      return { profile: await lookupInstagramCreator(serviceDb(), projectId, body?.handle) };
    } catch (error) {
      throw asApiError(error);
    }
  });
}
