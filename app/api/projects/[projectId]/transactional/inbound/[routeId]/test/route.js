import { assertUuid } from "@/lib/server/auth";
import { handle, notFound } from "@/lib/server/http";
import { runInboundRoute, sampleInboundEmail } from "@/lib/channels/inbound_email";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Runs the route against a sample email. Webhook routes really POST (flagged test: true); conversation
// and tag routes only report whether the sample matched, without writing contacts or threads.
export async function POST(_request, { params }) {
  return handle("transactional.inbound.test", async () => {
    const { projectId, routeId } = await params;
    assertUuid(routeId, "route id");
    const { admin } = await authorizeChannels(projectId, "campaign.transactional.manage");
    const { data: route } = await admin
      .from("inbound_routes")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", routeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!route) throw notFound("That route doesn't exist.");
    const email = sampleInboundEmail(route);
    return { email: { to: email.to[0]?.email, subject: email.subject }, result: await runInboundRoute(admin, route, email, { test: true }) };
  });
}
