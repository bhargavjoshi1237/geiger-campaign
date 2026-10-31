import { handle, readJson } from "@/lib/server/http";
import { socialContext } from "@/lib/social/accounts/route_context";
import { startMetaConnect } from "@/lib/social/accounts/connect";

// Starts Facebook Login for Business for Instagram and/or Messenger; the browser navigates to the returned url.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("social.meta.start", async () => {
    const { projectId, user } = await socialContext(params);
    const body = await readJson(request);
    return startMetaConnect({ projectId, userId: user.id, channels: body?.channels, tab: body?.tab || null });
  });
}
