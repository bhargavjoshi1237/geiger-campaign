import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { linkTelegramChat } from "@/lib/communities/service";

// Links a Telegram channel or group to a connected bot after verifying the bot is an admin (getChatMember).
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("communities.telegram.link", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.community.edit");
    const body = await readJson(request);
    return linkTelegramChat(db, {
      projectId,
      userId: user.id,
      connectionId: body?.connectionId,
      chat: body?.chat,
      platform: body?.platform,
    });
  });
}
