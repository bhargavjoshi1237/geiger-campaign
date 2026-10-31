import { assertUuid } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { deleteTemplate } from "@/lib/channels/whatsapp_sync";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Deletes the template on Meta (if it was submitted) and here.
export async function DELETE(_request, { params }) {
  return handle("channels.whatsapp.delete", async () => {
    const { projectId, templateId } = await params;
    assertUuid(templateId, "template id");
    const { admin } = await authorizeChannels(projectId);
    await deleteTemplate(admin, { projectId, templateId });
    return { ok: true };
  });
}
