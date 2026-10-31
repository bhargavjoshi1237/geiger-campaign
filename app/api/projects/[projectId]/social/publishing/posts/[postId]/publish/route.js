import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { requestPublish } from "@/lib/social/publish_request";

// Publish now, or retry failed targets ({ targetIds }), through each network's official API.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("social.publish", async () => {
    const { projectId, postId } = await params;
    assertUuid(postId, "post id");
    const { db, user } = await requirePermission(projectId, "campaign.social.publish");
    const body = await readJson(request).catch(() => ({}));
    const targetIds = Array.isArray(body?.targetIds) ? body.targetIds.filter((id) => typeof id === "string") : null;
    return requestPublish({ db, user, projectId, postId, targetIds });
  });
}
