import { handle, readJson } from "@/lib/server/http";
import { connectChannel } from "@/lib/channels/connect";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Connect (or reconnect) a channel: credentials are verified live against the provider and stored in
// channel_secrets; the response carries the connection row and, for in-app, the identity secret once.
export async function POST(request, { params }) {
  return handle("channels.connect", async () => {
    const { projectId } = await params;
    const { user, admin } = await authorizeChannels(projectId);
    const body = await readJson(request);
    const { connection, issuedSecret } = await connectChannel(admin, {
      projectId,
      userId: user.id,
      channel: String(body.channel || ""),
      credentials: body.credentials || {},
      rotate: Boolean(body.rotate),
      subject: body.subject,
    });
    return { connection, ...(issuedSecret ? { issuedSecret } : {}) };
  });
}
