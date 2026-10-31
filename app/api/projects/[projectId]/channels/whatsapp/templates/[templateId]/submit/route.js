import { assertUuid } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { submitTemplate } from "@/lib/channels/whatsapp_sync";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Submits the saved template to Meta for review (or resubmits an edit of a submitted one).
export async function POST(_request, { params }) {
  return handle("channels.whatsapp.submit", async () => {
    const { projectId, templateId } = await params;
    assertUuid(templateId, "template id");
    const { admin } = await authorizeChannels(projectId);
    return { template: await submitTemplate(admin, { projectId, templateId }) };
  });
}
