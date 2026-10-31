import { botPaused, bumpStats, buildContext, latestConsent } from "./store";
import { deliverNow } from "./send";

// Outbox drain (server-only, worker): automated replies deferred by quiet hours go out once quiet hours end —
// unless the messaging window closed meanwhile, the person opted out or a human took the thread over.

export async function drainOutbox(db, { now = new Date(), deadline = Infinity, limit = 100 } = {}) {
  const { data, error } = await db
    .from("chat_outbox")
    .select("*")
    .eq("status", "queued")
    .lte("send_after", now.toISOString())
    .order("send_after", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[chat.outbox.due]", error.message);
    return { processed: 0, error: true };
  }
  const summary = { processed: 0, sent: 0, skipped: 0, failed: 0 };
  for (const row of data || []) {
    if (Date.now() > deadline) break;
    summary.processed += 1;
    const source = row.source || {};
    const automationId = source.type === "automation" ? source.id : null;
    const close = async (status, reason, extra = {}) => {
      await db
        .from("chat_outbox")
        .update({ status, reason, attempts: (row.attempts || 0) + 1, ...extra })
        .eq("id", row.id);
    };

    if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
      await close("skipped", "window_closed");
      summary.skipped += 1;
      if (automationId) await bumpStats(db, "chat_automations", automationId, { queued: -1, dmsBlocked: 1 });
      continue;
    }
    const ctx = await buildContext(db, {
      projectId: row.project_id,
      channel: row.channel,
      connectionId: row.connection_id,
      conversationId: row.conversation_id,
      contactId: row.contact_id,
    });
    if ((await latestConsent(db, row.contact_id, row.channel)) === "opted_out") {
      await close("cancelled", "opted_out");
      summary.skipped += 1;
      continue;
    }
    if (await botPaused(db, ctx.conversation)) {
      await close("cancelled", "bot_paused");
      summary.skipped += 1;
      continue;
    }

    const result = await deliverNow(ctx, {
      to: row.to_address,
      message: row.message,
      opts: {
        kind: source.kind || null,
        automationId,
        flowId: source.type === "flow" ? source.id : null,
        sequenceId: source.type === "sequence" ? source.id : null,
        nodeId: source.nodeId || null,
        capped: Boolean(source.capped),
        privateReply: source.privateReply || null,
        idempotencyKey: `chatoutbox:${row.id}`,
        source: { type: "flow", id: source.id || null },
      },
    });

    if (result.status === "sent" || result.status === "duplicate") {
      await close("sent", null, { delivery_id: result.deliveryId || null, sent_at: now.toISOString() });
      summary.sent += 1;
      if (automationId) await bumpStats(db, "chat_automations", automationId, { queued: -1, dmsSent: 1 });
    } else if (result.status === "blocked") {
      await close("skipped", result.reason);
      summary.skipped += 1;
      if (automationId) await bumpStats(db, "chat_automations", automationId, { queued: -1, dmsBlocked: 1 });
    } else {
      await close("failed", String(result.reason || result.status).slice(0, 200), { delivery_id: result.deliveryId || null });
      summary.failed += 1;
      if (automationId) await bumpStats(db, "chat_automations", automationId, { queued: -1 });
    }
  }
  return summary;
}
