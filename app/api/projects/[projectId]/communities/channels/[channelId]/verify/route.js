import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { verifyTelegramChannel } from "@/lib/communities/service";

// Re-checks the bot's admin rights and the chat's title, handle and member count.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("communities.channels.verify", async () => {
    const { projectId, channelId } = await params;
    assertUuid(channelId, "channel id");
    const { db } = await requirePermission(projectId, "campaign.community.edit");
    return verifyTelegramChannel(db, { projectId, channelId });
  });
}
