import { ApiError, notConfigured, notFound } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";
import { publishPostTargets } from "./publishing";

// "Publish now" / "Retry" from the workspace (server-only). The caller already holds campaign.social.publish;
// a post that hasn't been approved additionally needs campaign.approval.decide (recorded as a self-approval).
// Publishing runs on the service-role client so target claims and status rollups bypass the client trigger.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export async function requestPublish({ db, user, projectId, postId, targetIds = null }) {
  const admin = adminClient();
  if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured.");

  const { data: post } = await db
    .from("social_posts")
    .select("*")
    .eq("id", postId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!post) throw notFound("Post not found.");

  const patch = { status: "publishing" };
  if (post.status === "draft" || post.status === "in_review") {
    const { data: canApprove } = await db.rpc("rbac_allows", { p_permission: "campaign.approval.decide", p_project: projectId });
    if (!canApprove) throw new ApiError(409, "This post needs approval before it can be published.", "approval_required");
    const approval = bag(post.approval);
    const at = new Date().toISOString();
    patch.approval = {
      ...approval,
      decision: "approved",
      decidedAt: at,
      decidedBy: user.id,
      history: [...(Array.isArray(approval.history) ? approval.history : []), { action: "approved", by: user.id, at, note: "Approved on publish" }],
    };
  } else if (post.status === "published" && !(Array.isArray(targetIds) && targetIds.length)) {
    throw new ApiError(409, "This post is already published.", "already_published");
  }

  const { data: targets } = await admin.from("social_post_targets").select("id, status").eq("post_id", post.id).is("deleted_at", null);
  if (!(targets || []).length) throw new ApiError(409, "Pick at least one connected account before publishing.", "no_targets");

  await admin.from("social_posts").update(patch).eq("id", post.id);
  const result = await publishPostTargets(admin, { projectId, postId: post.id, targetIds, deadline: Date.now() + 40_000, trigger: "manual" });
  if (!result.ok) throw notFound(result.error);
  return result;
}
