import { requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { runCommentActions } from "@/lib/social/moderation_actions";

// Bulk hide / unhide / delete / reply on platform comments: { action, items: [{ messageId }], replyText }.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("social.moderation.actions", async () => {
    const { projectId } = await params;
    const body = await readJson(request);
    const key = body?.action === "reply" ? "campaign.inbox.reply" : "campaign.social.edit";
    const { db, user } = await requirePermission(projectId, key);
    return runCommentActions({ db, user, projectId, action: body?.action, items: body?.items, replyText: body?.replyText });
  });
}
