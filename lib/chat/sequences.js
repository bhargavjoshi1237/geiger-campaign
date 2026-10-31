import { messagingWindow } from "@/lib/inbox/window";
import { dispatch } from "@/lib/messaging/dispatch";
import { personalize } from "./matching";
import { bumpStats, buildContext, contactAddress, listActiveRows, loadRow, personOf, recordChatEvent } from "./store";
import { sendBotMessage } from "./send";

// Chat sequences (server-only): timed follow-up messages after a trigger. Each step waits its delay, then
// sends through the guardrails; a step that would land outside the messaging window is blocked (WhatsApp
// steps may carry an approved template for that case) and the enrollment stops with the reason.

const MINUTE = 60_000;

async function stepsOf(db, sequenceId) {
  const { data } = await db
    .from("chat_sequence_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  return data || [];
}

export async function enrollInSequence(ctx, sequenceOrId, { source = {} } = {}) {
  const sequence = typeof sequenceOrId === "string" ? await loadRow(ctx.db, "chat_sequences", sequenceOrId) : sequenceOrId;
  if (!sequence || sequence.status !== "active" || sequence.deleted_at || !ctx.contact?.id) return null;
  if ((sequence.channels || []).length && !sequence.channels.includes(ctx.channel)) return null;
  const steps = await stepsOf(ctx.db, sequence.id);
  if (!steps.length) return null;
  const { data, error } = await ctx.db
    .from("chat_sequence_enrollments")
    .insert({
      project_id: ctx.projectId,
      sequence_id: sequence.id,
      contact_id: ctx.contact.id,
      conversation_id: ctx.conversation?.kind === "dm" ? ctx.conversation.id : null,
      channel: ctx.channel,
      connection_id: ctx.connection?.id || null,
      current_step: 0,
      next_run_at: new Date(Date.now() + Math.max(0, Number(steps[0].delay_minutes) || 0) * MINUTE).toISOString(),
      status: "active",
      source,
    })
    .select("id")
    .single();
  // A unique violation means the contact is already running this sequence.
  if (error) return null;
  await bumpStats(ctx.db, "chat_sequences", sequence.id, { enrolled: 1 });
  return data.id;
}

// trigger: { type: automation | flow_completed | tag_added, automationId, flowId, tag }
export async function enrollByTrigger(ctx, trigger) {
  const sequences = await listActiveRows(ctx.db, "chat_sequences", ctx.projectId);
  let enrolled = 0;
  for (const sequence of sequences) {
    const t = sequence.trigger || {};
    if (t.type !== trigger.type) continue;
    if (trigger.type === "automation" && t.automationId !== trigger.automationId) continue;
    if (trigger.type === "flow_completed" && t.flowId !== trigger.flowId) continue;
    if (trigger.type === "tag_added" && String(t.tag || "").toLowerCase() !== String(trigger.tag || "").toLowerCase()) continue;
    if (await enrollInSequence(ctx, sequence, { source: trigger })) enrolled += 1;
  }
  return enrolled;
}

// An inbound reply stops sequences that are set to stop on reply.
export async function stopOnReply(ctx) {
  if (!ctx.contact?.id) return 0;
  const { data } = await ctx.db
    .from("chat_sequence_enrollments")
    .select("id, sequence_id")
    .eq("contact_id", ctx.contact.id)
    .eq("channel", ctx.channel)
    .eq("status", "active");
  let stopped = 0;
  for (const row of data || []) {
    const sequence = await loadRow(ctx.db, "chat_sequences", row.sequence_id);
    if (sequence?.settings?.stopOnReply === false) continue;
    await ctx.db.from("chat_sequence_enrollments").update({ status: "stopped", stop_reason: "replied", next_run_at: null }).eq("id", row.id);
    await bumpStats(ctx.db, "chat_sequences", row.sequence_id, { stopped: 1 });
    stopped += 1;
  }
  return stopped;
}

async function finish(db, row, status, reason = null) {
  await db.from("chat_sequence_enrollments").update({ status, stop_reason: reason, next_run_at: null }).eq("id", row.id);
  await bumpStats(db, "chat_sequences", row.sequence_id, status === "completed" ? { completed: 1 } : status === "blocked" ? { blocked: 1 } : { stopped: 1 });
}

// WhatsApp outside the 24h window: an approved template is the only allowed message.
async function sendTemplate(ctx, row, step) {
  const to = contactAddress(ctx.contact, ctx.conversation, ctx.channel);
  if (!to) return { status: "blocked", reason: "no_address" };
  const result = await dispatch({
    db: ctx.db,
    projectId: ctx.projectId,
    channel: "whatsapp",
    to,
    contactId: ctx.contact?.id || null,
    connectionId: ctx.connection?.id || null,
    source: { type: "flow", id: row.sequence_id },
    idempotencyKey: `chatseq:${row.id}:${row.current_step}`,
    message: { template: step.template },
    metadata: { chat: { kind: "sequence", sequenceId: row.sequence_id, enrollmentId: row.id } },
  });
  return { status: ["sent", "delivered"].includes(result.status) ? "sent" : result.status, reason: result.error };
}

export async function processDueEnrollments(db, { now = new Date(), deadline = Infinity, limit = 100 } = {}) {
  const { data, error } = await db
    .from("chat_sequence_enrollments")
    .select("*")
    .eq("status", "active")
    .is("deleted_at", null)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[chat.sequences.due]", error.message);
    return { processed: 0, error: true };
  }
  const summary = { processed: 0, sent: 0, blocked: 0, completed: 0, queued: 0 };
  for (const row of data || []) {
    if (Date.now() > deadline) break;
    summary.processed += 1;
    const sequence = await loadRow(db, "chat_sequences", row.sequence_id);
    if (!sequence || sequence.deleted_at || sequence.status !== "active") {
      if (sequence?.status === "paused") continue;
      await finish(db, row, "stopped", "sequence_inactive");
      continue;
    }
    const steps = await stepsOf(db, row.sequence_id);
    const step = steps[row.current_step];
    if (!step) {
      await finish(db, row, "completed");
      summary.completed += 1;
      continue;
    }

    const ctx = await buildContext(db, { projectId: row.project_id, channel: row.channel, connectionId: row.connection_id, conversationId: row.conversation_id, contactId: row.contact_id });
    const window = messagingWindow({ channel: row.channel, last_inbound_at: ctx.conversation?.last_inbound_at ?? null }, { now: now.getTime() });
    let result;
    if (window.windowed && !window.open) {
      result = row.channel === "whatsapp" && step.template?.name ? await sendTemplate(ctx, row, step) : { status: "blocked", reason: window.requiresTemplate ? "template_required" : "window_closed" };
    } else {
      const text = personalize(step.message?.text || "", personOf(ctx.contact, row.channel));
      result = await sendBotMessage(
        ctx,
        { text, ...(step.message?.buttons?.length ? { buttons: step.message.buttons.filter((b) => b.type === "url") } : {}) },
        { kind: "sequence", sequenceId: row.sequence_id, source: { type: "flow", id: row.sequence_id }, quietHours: sequence.settings?.quietHours, idempotencyKey: `chatseq:${row.id}:${row.current_step}` },
      );
    }

    if (result.status === "blocked") {
      await finish(db, row, "blocked", result.reason);
      summary.blocked += 1;
      continue;
    }
    if (result.status === "failed" || result.status === "not_sent") {
      await finish(db, row, "failed", String(result.reason || result.status).slice(0, 200));
      continue;
    }
    if (result.status === "queued") summary.queued += 1;
    else if (result.status === "sent" || result.status === "duplicate") summary.sent += 1;
    if (result.status === "sent") {
      await bumpStats(db, "chat_sequences", row.sequence_id, { sent: 1 });
      await recordChatEvent(ctx, "social.sequence_step", { sequenceId: row.sequence_id, step: row.current_step });
    }

    const nextIndex = row.current_step + 1;
    const next = steps[nextIndex];
    if (!next) {
      await db.from("chat_sequence_enrollments").update({ current_step: nextIndex, last_sent_at: now.toISOString() }).eq("id", row.id);
      await finish(db, { ...row, current_step: nextIndex }, "completed");
      summary.completed += 1;
    } else {
      await db
        .from("chat_sequence_enrollments")
        .update({
          current_step: nextIndex,
          last_sent_at: now.toISOString(),
          next_run_at: new Date(now.getTime() + Math.max(1, Number(next.delay_minutes) || 0) * MINUTE).toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return summary;
}
