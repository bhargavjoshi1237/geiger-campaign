import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { syncTelegramMembers } from "@/lib/communities/service";

// Snapshots a Telegram chat's member count now (getChatMemberCount).
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("communities.channels.sync", async () => {
    const { projectId, channelId } = await params;
    assertUuid(channelId, "channel id");
    const { db, user } = await requirePermission(projectId, "campaign.community.edit");
    return syncTelegramMembers(db, { projectId, channelId, userId: user.id });
  });
}
