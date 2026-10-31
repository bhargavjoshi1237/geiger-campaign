import { loadConnection } from "@/lib/messaging/connections";
import { aiConfigured, classifyComment } from "./ai_classify";
import { moderationState, performCommentAction } from "./comment_actions";
import { describeReasons, findMatchingRule } from "./moderation_eval";
import { networkForChannel } from "./networks";

// Comment moderation (server-only): evaluates the project's moderation rules (keywords/regex, links,
// competitor mentions, AI spam/toxicity/negative when configured; scoped per post/ad) against an incoming comment,
// performs the action through the platform API (hide/delete/reply), and writes the moderation log.
// Called by the Meta/Telegram webhooks after ingestInboundMessage; idempotent per comment id.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// Writes the visible state onto the ingested comment message so the Comments browser reflects it.
export async function markCommentMessage(db, projectId, commentId, patch) {
  const { data: rows } = await db
    .from("conversation_messages")
    .select("id, metadata")
    .eq("project_id", projectId)
    .eq("external_id", String(commentId))
    .limit(5);
  for (const row of rows || []) {
    await db
      .from("conversation_messages")
      .update({ metadata: { ...bag(row.metadata), moderation: { ...bag(bag(row.metadata).moderation), ...patch } } })
      .eq("id", row.id);
  }
}

// comment: { id, text, authorExternalId, authorName, postId, isAd }
export async function applyModeration(db, { projectId, connection, channel, comment }) {
  const none = { action: null, ruleId: null };
  if (!db || !projectId || !comment?.id) return none;
  const network = networkForChannel(channel || connection?.channel);
  // Never moderate the account's own replies.
  if (comment.authorExternalId && connection?.external_id && String(comment.authorExternalId) === String(connection.external_id)) return none;

  const { data: existing } = await db
    .from("moderation_log")
    .select("id, rule_id, action, status")
    .eq("project_id", projectId)
    .eq("comment_external_id", String(comment.id))
    .eq("source", "auto")
    .limit(1)
    .maybeSingle();
  if (existing) return { action: existing.action, ruleId: existing.rule_id, status: existing.status, logId: existing.id, duplicate: true };

  const { data: ruleRows, error } = await db
    .from("moderation_rules")
    .select("*")
    .eq("project_id", projectId)
    .eq("active", true)
    .is("deleted_at", null);
  if (error || !ruleRows?.length) return none;

  const evalComment = {
    text: comment.text || "",
    authorName: comment.authorName || "",
    authorExternalId: comment.authorExternalId || "",
    postId: comment.postId ? String(comment.postId) : null,
    isAd: Boolean(comment.isAd),
    network,
  };
  const rules = ruleRows.map((r) => ({ ...r, conditions: bag(r.conditions), scope: bag(r.scope) }));
  let match = findMatchingRule(rules, evalComment);
  let aiLabels = null;
  if (!match.rule && match.needsAi && aiConfigured()) {
    aiLabels = await classifyComment(evalComment.text);
    if (aiLabels) match = findMatchingRule(rules, evalComment, { aiLabels });
  }
  if (!match.rule) return none;

  const rule = match.rule;
  let status = "done";
  let errorText = null;
  let replyId = null;
  if (rule.action === "flag") {
    status = "flagged";
  } else {
    let conn = connection;
    let secrets = null;
    if (conn?.id) {
      const loaded = await loadConnection(db, projectId, conn.channel || channel, conn.id);
      conn = loaded.connection || conn;
      secrets = loaded.secrets;
    }
    const result = await performCommentAction({
      connection: conn,
      secrets,
      action: rule.action,
      commentId: comment.id,
      replyText: rule.reply_text,
      context: { chatId: comment.chatId },
    });
    if (!result.ok) {
      status = "failed";
      errorText = result.error || "The platform rejected the action.";
    }
    replyId = result.replyId || null;
  }

  const { data: log } = await db
    .from("moderation_log")
    .insert({
      project_id: projectId,
      rule_id: rule.id,
      connection_id: connection?.id || null,
      network: network || channel || "",
      comment_external_id: String(comment.id),
      post_external_id: comment.postId ? String(comment.postId) : null,
      text: String(comment.text || "").slice(0, 4000),
      author: comment.authorName || "",
      author_external_id: comment.authorExternalId || null,
      action: rule.action,
      source: "auto",
      status,
      reason: describeReasons(match.reasons),
      error: errorText,
      metadata: { ...(aiLabels ? { ai: aiLabels } : {}), ...(replyId ? { replyId } : {}), isAd: Boolean(comment.isAd) },
    })
    .select("id")
    .maybeSingle();

  if (status !== "failed") {
    await markCommentMessage(db, projectId, comment.id, {
      state: moderationState(rule.action),
      ruleId: rule.id,
      ruleName: rule.name,
      source: "auto",
      at: new Date().toISOString(),
    });
  }
  return { action: rule.action, ruleId: rule.id, status, logId: log?.id || null };
}
