import { runFlow } from "./flow_graph";
import { personalize } from "./matching";
import { runAiTurn } from "./ai_agent";
import { performHandover } from "./handover";
import { enrollByTrigger } from "./sequences";
import { applyContactChanges, bumpStats, factsFromContact, loadRow, personOf, recordChatEvent } from "./store";
import { sendBotMessage } from "./send";

// DM flow runner (server-only): starts and resumes dm_flow_sessions, interprets the published graph with
// lib/chat/flow_graph.js and applies its effects — messages through the guardrails, tag / field writes,
// AI turns, goals, handover and jumps. One running session per conversation.

const STATUS = { waiting: "waiting", completed: "completed", handover: "handed_over", jump: "completed", expired: "expired", error: "failed" };
const MAX_JUMPS = 3;

const graphOf = (flow) => flow?.published_graph || flow?.graph || { nodes: [], edges: [] };

export async function loadLiveFlow(db, flowId) {
  const flow = await loadRow(db, "dm_flows", flowId);
  if (!flow || flow.deleted_at || flow.status !== "active") return null;
  return flow;
}

// The running session for this conversation, or a pending one a comment-to-DM left for this contact.
export async function findSession(ctx) {
  if (ctx.conversation?.id) {
    const { data } = await ctx.db
      .from("dm_flow_sessions")
      .select("*")
      .eq("conversation_id", ctx.conversation.id)
      .in("status", ["active", "waiting"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (ctx.contact?.id) {
    const { data } = await ctx.db
      .from("dm_flow_sessions")
      .select("*")
      .eq("contact_id", ctx.contact.id)
      .eq("channel", ctx.channel)
      .is("conversation_id", null)
      .eq("status", "waiting")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      if (ctx.conversation?.id) {
        await ctx.db.from("dm_flow_sessions").update({ conversation_id: ctx.conversation.id }).eq("id", data.id);
        data.conversation_id = ctx.conversation.id;
      }
      return data;
    }
  }
  return null;
}

async function cancelRunning(ctx, exceptId = null) {
  if (!ctx.conversation?.id) return;
  let query = ctx.db
    .from("dm_flow_sessions")
    .update({ status: "cancelled", completed_at: new Date().toISOString(), waiting_for: "none" })
    .eq("conversation_id", ctx.conversation.id)
    .in("status", ["active", "waiting"]);
  if (exceptId) query = query.neq("id", exceptId);
  await query;
}

// A session waiting for the person's first DM reply (comment-to-DM): the flow starts when they answer.
export async function createPendingSession(ctx, flowId, { source = {}, expiresAt }) {
  const flow = await loadLiveFlow(ctx.db, flowId);
  if (!flow) return null;
  const { data, error } = await ctx.db
    .from("dm_flow_sessions")
    .insert({
      project_id: ctx.projectId,
      flow_id: flow.id,
      conversation_id: null,
      contact_id: ctx.contact?.id || null,
      channel: ctx.channel,
      connection_id: ctx.connection?.id || null,
      current_node_id: null,
      waiting_for: "reply",
      expires_at: expiresAt,
      status: "waiting",
      context: { state: {}, source },
    })
    .select("*")
    .single();
  if (error) console.error("[chat.flows.pending]", error.message);
  return data || null;
}

export async function startFlow(ctx, flowId, { input = null, source = {}, depth = 0 } = {}) {
  const flow = await loadLiveFlow(ctx.db, flowId);
  if (!flow) return { handled: false, reason: "flow_inactive" };
  await cancelRunning(ctx);
  const { data: session, error } = await ctx.db
    .from("dm_flow_sessions")
    .insert({
      project_id: ctx.projectId,
      flow_id: flow.id,
      conversation_id: ctx.conversation?.id || null,
      contact_id: ctx.contact?.id || null,
      channel: ctx.channel,
      connection_id: ctx.connection?.id || null,
      status: "active",
      context: { state: {}, source },
    })
    .select("*")
    .single();
  if (error || !session) {
    console.error("[chat.flows.start]", error?.message);
    return { handled: false, reason: "session_failed" };
  }
  await bumpStats(ctx.db, "dm_flows", flow.id, { started: 1 });
  await recordChatEvent(ctx, "social.flow_started", { flowId: flow.id, automationId: source.automationId || null });
  return execute(ctx, flow, session, { input, depth });
}

export async function continueSession(ctx, session, { input = null, timeout = false } = {}) {
  const flow = await loadLiveFlow(ctx.db, session.flow_id);
  if (!flow) {
    await ctx.db.from("dm_flow_sessions").update({ status: "cancelled", completed_at: new Date().toISOString(), waiting_for: "none" }).eq("id", session.id);
    return { handled: false, reason: "flow_inactive" };
  }
  if (!timeout && !session.current_node_id) {
    await bumpStats(ctx.db, "dm_flows", flow.id, { started: 1 });
    await recordChatEvent(ctx, "social.flow_started", { flowId: flow.id, automationId: session.context?.source?.automationId || null });
  }
  return execute(ctx, flow, session, { input, timeout });
}

async function applyEffects(ctx, flow, session, effects) {
  const out = { handedOver: false, sent: 0, blocked: [] };
  const person = personOf(ctx.contact, ctx.channel);
  const automationId = session.context?.source?.automationId || null;
  for (const effect of effects) {
    if (out.handedOver) break;
    switch (effect.type) {
      case "send": {
        const message = { ...effect.message, text: personalize(effect.message.text, person) };
        const result = await sendBotMessage(ctx, message, {
          kind: "flow",
          flowId: flow.id,
          automationId,
          nodeId: effect.nodeId,
          sessionId: session.id,
          source: { type: "flow", id: flow.id },
        });
        if (result.status === "sent" || result.status === "queued") out.sent += 1;
        else out.blocked.push(result.reason);
        break;
      }
      case "set_tags":
        await applyContactChanges(ctx.db, ctx.contact, { addTags: effect.add, removeTags: effect.remove });
        for (const tag of effect.add || []) await enrollByTrigger(ctx, { type: "tag_added", tag });
        break;
      case "set_field":
        await applyContactChanges(ctx.db, ctx.contact, { fields: [{ key: effect.key, value: effect.value }] });
        break;
      case "goal":
        await bumpStats(ctx.db, "dm_flows", flow.id, { goals: 1 });
        await recordChatEvent(ctx, "social.flow_goal", { flowId: flow.id, goal: effect.name, nodeId: effect.nodeId, automationId });
        break;
      case "ai": {
        const result = await runAiTurn(ctx, effect.agentId, effect.text, { flowId: flow.id, nodeId: effect.nodeId, sessionId: session.id });
        if (result.handedOver) out.handedOver = true;
        break;
      }
      case "handover":
        await performHandover(ctx, {
          reason: "flow",
          action: { assigneeId: effect.assigneeId, team: effect.team, priority: effect.priority, notify: true },
          message: effect.message,
        });
        out.handedOver = true;
        break;
      default:
        break;
    }
  }
  return out;
}

async function execute(ctx, flow, session, { input = null, timeout = false, depth = 0 } = {}) {
  const prior = session.context?.state || {};
  const result = runFlow(graphOf(flow), {
    state: { ...prior, nodeId: session.current_node_id || prior.nodeId || null, waiting: session.waiting_for && session.waiting_for !== "none" && session.current_node_id ? session.waiting_for : null },
    input,
    timeout,
    facts: factsFromContact(ctx.contact, ctx.channel),
    settings: flow.settings || {},
  });
  const applied = await applyEffects(ctx, flow, session, result.effects);
  const status = applied.handedOver ? "handed_over" : STATUS[result.status] || "completed";
  const done = status !== "waiting";
  const now = new Date().toISOString();
  await ctx.db
    .from("dm_flow_sessions")
    .update({
      current_node_id: result.state.nodeId,
      waiting_for: done ? "none" : result.waitingFor,
      expires_at: done ? null : result.expiresAt ?? session.expires_at,
      status,
      context: { ...(session.context || {}), state: result.state },
      ...(done ? { completed_at: now } : {}),
    })
    .eq("id", session.id);

  if (status === "completed" || status === "expired" || status === "handed_over") {
    const key = { completed: "completed", expired: "expired", handed_over: "handedOver" }[status];
    await bumpStats(ctx.db, "dm_flows", flow.id, { [key]: 1 });
  }
  if (status === "completed" && result.status !== "jump") {
    await recordChatEvent(ctx, "social.flow_completed", { flowId: flow.id, automationId: session.context?.source?.automationId || null });
    await enrollByTrigger(ctx, { type: "flow_completed", flowId: flow.id });
  }
  if (result.status === "jump" && result.jumpTo && depth < MAX_JUMPS && !applied.handedOver) {
    return startFlow(ctx, result.jumpTo, { input: null, source: { type: "jump", flowId: flow.id, automationId: session.context?.source?.automationId || null }, depth: depth + 1 });
  }
  return { handled: true, flowId: flow.id, sessionId: session.id, status, sent: applied.sent, blocked: applied.blocked };
}

// Worker: sessions whose reply timeout passed or whose delay is over.
export async function processDueSessions(db, { now = new Date(), deadline = Infinity, limit = 100, buildContext }) {
  const { data, error } = await db
    .from("dm_flow_sessions")
    .select("*")
    .eq("status", "waiting")
    .lte("expires_at", now.toISOString())
    .order("expires_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[chat.flows.due]", error.message);
    return { processed: 0, error: true };
  }
  const summary = { processed: 0, resumed: 0, expired: 0 };
  for (const session of data || []) {
    if (Date.now() > deadline) break;
    summary.processed += 1;
    if (!session.current_node_id) {
      // A pending comment-to-DM flow the person never answered.
      await db.from("dm_flow_sessions").update({ status: "expired", completed_at: now.toISOString(), waiting_for: "none" }).eq("id", session.id);
      await bumpStats(db, "dm_flows", session.flow_id, { expired: 1 });
      summary.expired += 1;
      continue;
    }
    const ctx = await buildContext(db, {
      projectId: session.project_id,
      channel: session.channel,
      connectionId: session.connection_id,
      conversationId: session.conversation_id,
      contactId: session.contact_id,
    });
    const result = await continueSession(ctx, session, { timeout: true });
    if (result.status === "expired") summary.expired += 1;
    else summary.resumed += 1;
  }
  return summary;
}
