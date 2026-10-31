import { handle, readJson } from "@/lib/server/http";
import { socialContext } from "@/lib/social/accounts/route_context";
import { connectRcsAgent } from "@/lib/social/accounts/connect";

// Connects a Google RBM agent with its service-account key (validated by signing in before it's stored).
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("social.rcs.connect", async () => {
    const { projectId, user, db } = await socialContext(params);
    const body = await readJson(request);
    const connection = await connectRcsAgent(db, { projectId, userId: user.id, input: body });
    return { connection };
  });
}
