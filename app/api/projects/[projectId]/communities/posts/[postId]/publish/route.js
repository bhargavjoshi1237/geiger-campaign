import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { publishPostNow } from "@/lib/communities/service";

// Publishes an automated Telegram post now through the channel's bot.
export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return handle("communities.posts.publish", async () => {
    const { projectId, postId } = await params;
    assertUuid(postId, "post id");
    const { db } = await requirePermission(projectId, "campaign.community.edit");
    return publishPostNow(db, { projectId, postId });
  });
}
