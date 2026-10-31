import { publishPostTargets } from "./publishing";
import { refreshInsights } from "./insights";
import { runDueListening } from "./listening_run";

// social worker job, run by app/api/internal/worker on every scheduler tick (server-only, service-role db):
// 1) publishes scheduled posts that are due, 2) resumes Instagram containers still processing, 3) retries
// transient per-target failures with backoff, 4) refreshes stale insights snapshots, 5) runs due listening
// queries. Every step is bounded and idempotent (targets are claimed with compare-and-set before publishing).
export const name = "social";

const STALE_PUBLISHING_MS = 15 * 60_000;
const MAX_RESUME_MS = 2 * 3600_000;
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const left = (deadline) => deadline - Date.now();

async function publishDue(db, now, deadline, summary) {
  const { data: due } = await db
    .from("social_posts")
    .select("id, project_id, status, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", now.toISOString())
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(10);
  for (const post of due || []) {
    if (left(deadline) < 30_000) break;
    const { data: claimed } = await db
      .from("social_posts")
      .update({ status: "publishing" })
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    const res = await publishPostTargets(db, { projectId: post.project_id, postId: post.id, now, deadline: Math.min(deadline, Date.now() + 60_000), trigger: "schedule" });
    summary.published += res.results?.filter((r) => r.status === "published").length || 0;
    summary.failed += res.results?.filter((r) => r.status === "failed").length || 0;
  }
}

async function resumeAndRetry(db, now, deadline, summary) {
  const { data: rows } = await db
    .from("social_post_targets")
    .select("*")
    .in("status", ["publishing", "failed"])
    .is("deleted_at", null)
    .order("updated_at", { ascending: true })
    .limit(100);
  const byPost = new Map();
  for (const t of rows || []) {
    const meta = bag(t.metadata);
    const age = now.getTime() - new Date(t.updated_at).getTime();
    if (t.status === "publishing" && meta.resume) {
      // Containers Instagram never finishes processing are given up on rather than polled forever.
      if (now.getTime() - new Date(meta.resumeSince || t.updated_at).getTime() > MAX_RESUME_MS) {
        await db.from("social_post_targets").update({ status: "failed", error: "Instagram didn't finish processing the media within 2 hours.", metadata: { ...meta, resume: null } }).eq("id", t.id);
        summary.failed += 1;
        continue;
      }
      if (!byPost.has(t.post_id)) byPost.set(t.post_id, { projectId: t.project_id, ids: [] });
      byPost.get(t.post_id).ids.push(t.id);
      summary.resumed += 1;
    } else if (t.status === "publishing" && age > STALE_PUBLISHING_MS) {
      // A crash mid-call may or may not have published; never auto-repeat it — surface it for a manual retry.
      await db.from("social_post_targets").update({ status: "failed", error: "Publishing was interrupted. Check the account before retrying.", metadata: { ...meta, claimedAt: null, nextRetryAt: null } }).eq("id", t.id);
      summary.failed += 1;
    } else if (t.status === "failed" && meta.nextRetryAt && new Date(meta.nextRetryAt) <= now) {
      if (!byPost.has(t.post_id)) byPost.set(t.post_id, { projectId: t.project_id, ids: [] });
      byPost.get(t.post_id).ids.push(t.id);
      summary.retried += 1;
    }
  }
  for (const [postId, { projectId, ids }] of byPost) {
    if (left(deadline) < 30_000) break;
    const res = await publishPostTargets(db, { projectId, postId, targetIds: ids, now, deadline: Math.min(deadline, Date.now() + 45_000), trigger: "retry" });
    summary.published += res.results?.filter((r) => r.status === "published").length || 0;
  }
}

export async function run({ db, now = new Date(), deadline = Date.now() + 120_000 }) {
  const summary = { published: 0, failed: 0, resumed: 0, retried: 0, insights: null, listening: null };
  await publishDue(db, now, deadline, summary);
  if (left(deadline) > 30_000) await resumeAndRetry(db, now, deadline, summary);
  if (left(deadline) > 30_000) {
    const insights = await refreshInsights(db, { now, deadline: Math.min(deadline - 10_000, Date.now() + 60_000) });
    summary.insights = { accounts: insights.accounts, posts: insights.posts, errors: insights.errors.length };
  }
  if (left(deadline) > 30_000) {
    summary.listening = await runDueListening(db, { now, deadline: Math.min(deadline - 10_000, Date.now() + 45_000) });
  }
  return summary;
}
