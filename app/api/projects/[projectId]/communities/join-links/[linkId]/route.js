import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { revokeJoinLink } from "@/lib/communities/links";

// Deletes a join link and revokes its Telegram invite link.
export const runtime = "nodejs";

export async function DELETE(_request, { params }) {
  return handle("communities.joinLinks.delete", async () => {
    const { projectId, linkId } = await params;
    assertUuid(linkId, "join link id");
    const { db } = await requirePermission(projectId, "campaign.community.edit");
    return revokeJoinLink(db, { projectId, linkId });
  });
}
