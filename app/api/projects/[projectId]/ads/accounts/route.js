import { handle, json, readJson } from "@/lib/server/http";
import { connectWithToken } from "@/lib/ads/connect";
import { adsContext } from "@/lib/ads/route_context";

export const runtime = "nodejs";

// Connects an ad account with a Business Manager system-user token (validated against the Marketing API).
export async function POST(request, { params }) {
  return handle("ads.accounts.connect", async () => {
    const { projectId, user, db } = await adsContext(params);
    const body = await readJson(request);
    const account = await connectWithToken(db, { projectId, userId: user.id, accessToken: body?.accessToken, adAccountId: body?.adAccountId });
    return json({ account }, 201);
  });
}
