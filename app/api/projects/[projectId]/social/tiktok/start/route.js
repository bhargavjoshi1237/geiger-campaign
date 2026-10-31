import { handle, readJson } from "@/lib/server/http";
import { socialContext } from "@/lib/social/accounts/route_context";
import { startTikTokConnect } from "@/lib/social/accounts/connect";

// Starts TikTok business account authorization; refuses EEA/CH/UK accounts, where TikTok offers no messaging.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("social.tiktok.start", async () => {
    const { projectId, user } = await socialContext(params);
    const body = await readJson(request);
    return startTikTokConnect({ projectId, userId: user.id, region: body?.region, tab: body?.tab || null });
  });
}
