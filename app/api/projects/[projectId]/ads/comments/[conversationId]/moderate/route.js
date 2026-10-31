import { ApiError, badRequest, handle, readJson } from "@/lib/server/http";
import { setCommentHidden } from "@/lib/ads/rules";
import { adsContext, loadOwned } from "@/lib/ads/route_context";

export const runtime = "nodejs";

// Hides or unhides an ad comment on Facebook / Instagram and records it on the thread's ad context.
export async function POST(request, { params }) {
  return handle("ads.comments.moderate", async () => {
    const { projectId, conversationId, db } = await adsContext(params);
    const conversation = await loadOwned(db, "conversations", projectId, conversationId, "Comment");
    if (conversation.kind !== "comment") throw badRequest("That thread isn't a comment.");
    const body = await readJson(request);
    if (!["hide", "unhide"].includes(body?.action)) throw badRequest("Action must be hide or unhide.");
    const hidden = body.action === "hide";
    const result = await setCommentHidden(db, { projectId, conversation, hidden });
    if (!result.ok) throw new ApiError(502, result.error, "meta_failed");
    const metadata = conversation.metadata && typeof conversation.metadata === "object" ? conversation.metadata : {};
    const ad = { ...(metadata.ad || {}), moderation: { action: hidden ? "hidden" : "visible", reason: "manual", at: new Date().toISOString() } };
    const { data } = await db.from("conversations").update({ metadata: { ...metadata, ad } }).eq("id", conversation.id).select("*").single();
    return { conversation: data };
  });
}
