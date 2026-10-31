import { assertUuid } from "@/lib/server/auth";
import { badRequest, handle } from "@/lib/server/http";
import { getProjectConnection, routeNumberInbound } from "@/lib/channels/connect";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Points a Twilio number's inbound SMS webhook at this app (inbox threads + STOP handling).
export async function POST(_request, { params }) {
  return handle("channels.numbers.inbound", async () => {
    const { projectId, connectionId, numberSid } = await params;
    assertUuid(connectionId, "connection id");
    if (!/^(PN|SC)[0-9a-f]{32}$/i.test(numberSid)) throw badRequest("A valid Twilio number SID is required.");
    const { admin } = await authorizeChannels(projectId);
    const connection = await getProjectConnection(admin, projectId, connectionId);
    if (connection.channel !== "sms") throw badRequest("Only SMS connections have numbers.");
    return { connection: await routeNumberInbound(admin, connection, numberSid) };
  });
}
