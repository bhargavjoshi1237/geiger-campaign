import { assertUuid } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { sendTemplateTest } from "@/lib/channels/transactional";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Renders the template with its sample data (or `data`) and sends it to `to` as a test delivery.
export async function POST(request, { params }) {
  return handle("transactional.templates.test", async () => {
    const { projectId, templateId } = await params;
    assertUuid(templateId, "template id");
    const { user, admin } = await authorizeChannels(projectId, "campaign.transactional.manage");
    const body = await readJson(request);
    return sendTemplateTest(admin, { projectId, templateId, to: body.to, data: body.data, userId: user.id });
  });
}
