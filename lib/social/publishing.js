import { recordEvent } from "@/lib/events/record";
import { composeCaption, composeFirstComment, hasBlockingIssues, NETWORKS, validateTarget } from "./networks";
import { connectionUsable, graphAuth, loadSocialConnection, telegramAuth } from "./credentials";
import { publishFacebook, publishInstagram, publishTelegram } from "./publishers";

// Post publishing orchestrator (server-only, service-role db). Claims each eligible target with a compare-and-set
// on updated_at so the worker and a manual "publish now" can never post the same target twice, publishes through
// the network's official API, captures per-target errors with bounded automatic retries for transient failures,
// and rolls the post status up from its targets.

const MAX_AUTO_ATTEMPTS = 3;
const RETRY_BACKOFF_MIN = [5, 15, 45];
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

const media = (post) =>
  (Array.isArray(post.media) ? post.media : []).map((m) => ({
    url: m?.url || "",
    kind: m?.kind === "video" ? "video" : "image",
    altText: m?.altText || m?.alt_text || "",
  }));

async function claimTarget(db, target, now) {
  const resumable = target.status === "publishing" && bag(target.metadata).resume;
  if (!["pending", "failed"].includes(target.status) && !resumable) return null;
  const { data, error } = await db
    .from("social_post_targets")
    .update({ status: "publishing", metadata: { ...bag(target.metadata), claimedAt: now.toISOString() } })
    .eq("id", target.id)
    .eq("status", target.status)
    .eq("updated_at", target.updated_at)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[social.publish.claim]", error.message);
    return null;
  }
  return data;
}

async function loadHashtags(db, post) {
  if (!post.hashtag_set_id) return [];
  const { data } = await db.from("hashtag_sets").select("tags").eq("id", post.hashtag_set_id).is("deleted_at", null).maybeSingle();
  return Array.isArray(data?.tags) ? data.tags : [];
}

async function publishOne(db, { post, target, tags, deadline }) {
  const meta = bag(post.metadata);
  const placement = meta.hashtagPlacement === "first_comment" ? "first_comment" : "caption";
  const items = media(post);
  const caption = composeCaption(target.variant_text ?? post.body, tags, placement);
  const firstComment = composeFirstComment(post.first_comment, tags, placement);

  const issues = validateTarget({ network: target.network, format: target.format, text: caption, media: items, firstComment });
  if (hasBlockingIssues(issues)) {
    return { status: "failed", error: issues.filter((i) => i.level === "error").map((i) => i.message).join(" ") };
  }

  const { connection, secrets } = await loadSocialConnection(db, post.project_id, target.network, target.connection_id);
  if (!connectionUsable(connection)) {
    return { status: "failed", error: `${NETWORKS[target.network]?.label || "This account"} isn't connected — reconnect it in Social Accounts.` };
  }

  const resume = bag(target.metadata).resume || null;
  if (target.network === "instagram") {
    return publishInstagram({ auth: graphAuth(connection, secrets), format: target.format, caption, media: items, firstComment, resume, deadline });
  }
  if (target.network === "facebook") {
    return publishFacebook({ auth: graphAuth(connection, secrets), caption, media: items, firstComment });
  }
  if (target.network === "telegram") {
    return publishTelegram({ auth: telegramAuth(connection, secrets, bag(target.metadata).chatId), caption, media: items });
  }
  return { status: "failed", error: `Publishing to ${NETWORKS[target.network]?.label || target.network} isn't available.` };
}

// Derives the post status from its live targets.
export function rollupStatus(targets, current) {
  const live = targets.filter((t) => !t.deleted_at && t.status !== "cancelled");
  if (!live.length) return current === "publishing" ? "failed" : current;
  if (live.every((t) => t.status === "published")) return "published";
  if (live.some((t) => t.status === "publishing")) return "publishing";
  if (live.some((t) => t.status === "failed")) return "failed";
  return current;
}

async function rollupPost(db, post, now) {
  const { data: targets } = await db.from("social_post_targets").select("*").eq("post_id", post.id).is("deleted_at", null);
  const list = targets || [];
  const status = rollupStatus(list, post.status);
  const firstPublished = list
    .filter((t) => t.status === "published" && t.published_at)
    .map((t) => t.published_at)
    .sort()[0];
  const patch = { status };
  if (status === "published" || firstPublished) patch.published_at = post.published_at || firstPublished || now.toISOString();
  await db.from("social_posts").update(patch).eq("id", post.id);
  return { status, targets: list };
}

// Publishes the post's pending/failed targets (or only `targetIds`); safe to call repeatedly.
export async function publishPostTargets(db, { projectId, postId, targetIds = null, now = new Date(), deadline = Date.now() + 25_000, trigger = "manual" }) {
  const { data: post, error } = await db
    .from("social_posts")
    .select("*")
    .eq("id", postId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !post) return { ok: false, error: "Post not found." };

  let query = db.from("social_post_targets").select("*").eq("post_id", post.id).is("deleted_at", null);
  if (Array.isArray(targetIds) && targetIds.length) query = query.in("id", targetIds);
  const { data: targets } = await query;
  const tags = await loadHashtags(db, post);
  const results = [];

  for (const target of targets || []) {
    if (Date.now() > deadline) break;
    if (trigger === "manual" && target.status === "failed") target.metadata = { ...bag(target.metadata), nextRetryAt: null };
    const claimed = await claimTarget(db, target, now);
    if (!claimed) continue;

    let outcome;
    try {
      outcome = await publishOne(db, { post, target: claimed, tags, deadline });
    } catch (e) {
      console.error("[social.publish]", e);
      outcome = { status: "failed", error: "Publishing failed unexpectedly.", transient: true };
    }

    const meta = { ...bag(claimed.metadata), claimedAt: null };
    let patch;
    if (outcome.status === "published") {
      patch = {
        status: "published",
        external_id: outcome.externalId || null,
        permalink: outcome.permalink || null,
        error: null,
        attempts: (claimed.attempts || 0) + 1,
        published_at: new Date().toISOString(),
        metadata: { ...meta, ...bag(outcome.meta), resume: null, nextRetryAt: null },
      };
    } else if (outcome.status === "pending") {
      patch = { status: "publishing", error: null, metadata: { ...meta, resume: outcome.resume, resumeSince: meta.resumeSince || now.toISOString() } };
    } else {
      const attempts = (claimed.attempts || 0) + 1;
      const retry = outcome.transient && attempts < MAX_AUTO_ATTEMPTS;
      patch = {
        status: "failed",
        error: outcome.error || "Publishing failed.",
        attempts,
        metadata: {
          ...meta,
          resume: null,
          nextRetryAt: retry ? new Date(now.getTime() + RETRY_BACKOFF_MIN[attempts - 1] * 60_000).toISOString() : null,
        },
      };
    }
    await db.from("social_post_targets").update(patch).eq("id", claimed.id);
    results.push({ id: claimed.id, network: claimed.network, status: patch.status, error: patch.error ?? null, permalink: patch.permalink ?? claimed.permalink ?? "" });

    if (patch.status === "published") {
      await recordEvent(db, {
        projectId,
        name: "social.post_published",
        source: "social",
        campaignId: post.campaign_id || null,
        url: patch.permalink || null,
        properties: { postId: post.id, targetId: claimed.id, network: claimed.network, externalId: patch.external_id, trigger },
      });
    }
  }

  const rolled = await rollupPost(db, post, now);
  return { ok: true, postId: post.id, status: rolled.status, results };
}
