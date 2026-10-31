import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { createJoinLink } from "@/lib/communities/links";

// Creates a /j/<slug> join link; for Telegram it also creates a named invite link so joins are attributed.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("communities.joinLinks.create", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.community.edit");
    const body = await readJson(request);
    return createJoinLink(db, {
      projectId,
      userId: user.id,
      channelId: body?.channelId,
      name: body?.name,
      slug: body?.slug,
      utm: body?.utm,
      memberLimit: body?.memberLimit,
      expiresAt: body?.expiresAt,
      createsJoinRequest: body?.createsJoinRequest,
    });
  });
}
