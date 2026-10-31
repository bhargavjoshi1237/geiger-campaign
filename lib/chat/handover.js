import { adminPublicClient } from "@/lib/supabase/admin";
import { looksNegative } from "./rules";
import { matchKeyword } from "./matching";
import { bumpStats, chatMeta, listActiveRows, mergeChatMeta, recordChatEvent } from "./store";
import { sendBotMessage } from "./send";

// Human handover (server-only): evaluates the project's handover rules against an inbound message and
// hands the conversation to a person — handled_by = 'human', assignment / priority from the rule, every
// running flow, sequence and queued reply for the thread stopped, the assignee notified.

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

// signals: { text, sentiment, aiConfidence }
export async function evaluateHandoverRules(ctx, signals = {}) {
  const rules = await listActiveRows(ctx.db, "handover_rules", ctx.projectId, { order: "priority" });
  const chat = chatMeta(ctx.conversation);
  const tags = (ctx.contact?.tags || []).map((t) => String(t).toLowerCase());
  const negative = signals.sentiment ? signals.sentiment === "negative" : looksNegative(signals.text);

  for (const rule of rules) {
    if ((rule.channels || []).length && !rule.channels.includes(ctx.channel)) continue;
    const c = rule.conditions || {};
    const checks = [];
    if ((c.keywords || []).length) checks.push({ key: "keyword", ok: Boolean(matchKeyword(signals.text, c.keywords, "contains")) });
    if (c.sentiment === "negative") checks.push({ key: "sentiment", ok: negative });
    if (Number(c.noMatchCount) > 0) checks.push({ key: "no_match", ok: Number(chat.noMatchCount || 0) >= Number(c.noMatchCount) });
    if ((c.vipTags || []).length) checks.push({ key: "vip", ok: c.vipTags.some((t) => tags.includes(String(t).toLowerCase())) });
    if (c.aiConfidenceBelow != null && c.aiConfidenceBelow !== "") {
      checks.push({ key: "ai_confidence", ok: signals.aiConfidence != null && Number(signals.aiConfidence) < Number(c.aiConfidenceBelow) });
    }
    if (!checks.length) continue;
    const passed = c.match === "all" ? checks.every((x) => x.ok) : checks.some((x) => x.ok);
    if (passed) return { rule, reason: checks.filter((x) => x.ok).map((x) => x.key).join(",") };
  }
  return null;
}

async function notifyAssignee(ctx, assigneeId, reason) {
  const db = adminPublicClient();
  if (!db || !assigneeId) return;
  const now = new Date().toISOString();
  const { error } = await db.from("flow_notifications").insert({
    user_id: assigneeId,
    title: "Conversation handed to you",
    description: `A ${ctx.channel} conversation needs a person (${reason}).`,
    type: "alert",
    icon: "UserCheck",
    time: now,
    read: false,
    extra: { type: "conversation", conversationId: ctx.conversation?.id || null, projectId: ctx.projectId },
    bg_color: "bg-amber-500/10",
    icon_color: "text-amber-600 dark:text-amber-400",
    created_at: now,
  });
  if (error) console.error("[chat.handover.notify]", error.message);
}

// action: { assigneeId, team, priority, notify, pauseBot, message }
export async function performHandover(ctx, { reason = "requested", rule = null, action = {}, message = null } = {}) {
  const conversation = ctx.conversation;
  const now = new Date().toISOString();
  if (conversation?.id) {
    const patch = { handled_by: "human", status: "open" };
    if (action.assigneeId) patch.assignee_id = action.assigneeId;
    if (PRIORITIES.has(action.priority)) patch.priority = action.priority;
    const { error } = await ctx.db.from("conversations").update(patch).eq("id", conversation.id);
    if (error) console.error("[chat.handover.conversation]", error.message);
    Object.assign(conversation, patch);
    await mergeChatMeta(ctx.db, "conversations", conversation, {
      paused: action.pauseBot !== false,
      handover: { at: now, reason, ruleId: rule?.id || null, team: action.team || null },
      noMatchCount: 0,
    });

    await ctx.db
      .from("dm_flow_sessions")
      .update({ status: "handed_over", completed_at: now, waiting_for: "none" })
      .eq("conversation_id", conversation.id)
      .in("status", ["active", "waiting"]);
    await ctx.db
      .from("chat_sequence_enrollments")
      .update({ status: "stopped", stop_reason: "handover", next_run_at: null })
      .eq("conversation_id", conversation.id)
      .eq("status", "active");
    await ctx.db
      .from("chat_outbox")
      .update({ status: "cancelled", reason: "handover" })
      .eq("conversation_id", conversation.id)
      .eq("status", "queued");
  }

  const text = message ?? action.message ?? "";
  if (String(text).trim()) await sendBotMessage(ctx, { text }, { force: true, kind: "handover", source: { type: "flow", id: rule?.id || null } });
  if (action.notify && action.assigneeId) await notifyAssignee(ctx, action.assigneeId, reason);
  if (rule?.id) {
    await bumpStats(ctx.db, "handover_rules", rule.id, { fired: 1 });
    await ctx.db.from("handover_rules").update({ last_fired_at: now }).eq("id", rule.id);
  }
  await recordChatEvent(ctx, "social.handover", { reason, ruleId: rule?.id || null, conversationId: conversation?.id || null });
  return { handedOver: true, reason, ruleId: rule?.id || null };
}
