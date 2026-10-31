import { handle } from "@/lib/server/http";
import { syncTemplates } from "@/lib/channels/whatsapp_sync";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// Pulls review status, rejection reasons and quality from Meta; imports templates made in WhatsApp Manager.
export async function POST(_request, { params }) {
  return handle("channels.whatsapp.sync", async () => {
    const { projectId } = await params;
    const { user, admin } = await authorizeChannels(projectId);
    return syncTemplates(admin, { projectId, userId: user.id });
  });
}
