import { sendReply } from "@/lib/inbox/server";
import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";

// Reply in a thread: enforces the platform messaging window (WhatsApp template outside 24h, Meta HUMAN_AGENT
// tag up to 7 days), sends through dispatch on the conversation's channel and records the outbound message.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request, { params }) {
  return handle("inbox.reply", async () => {
    const { projectId, conversationId } = await params;
    assertUuid(conversationId, "conversation id");
    const { db, user } = await requirePermission(projectId, "campaign.inbox.reply");
    return sendReply({ db, projectId, conversationId, user, input: await readJson(request) });
  });
}
