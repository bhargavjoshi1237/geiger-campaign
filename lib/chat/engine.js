// Chat automation engine (server-only): matches an inbound social/chat event against the project's chat
// automations (comment-to-DM, keyword triggers, story replies/mentions, welcome, default reply, entry-point
// referrals), enforces the guardrails (24h window, one automated DM per user per 24h from comment/story
// triggers, quiet hours, opt-out keywords, human handover) and runs the reply / DM flow / AI agent step.
// Match order: referral / entry point -> running flow session -> keyword -> comment / story trigger ->
// welcome -> AI agent -> default reply. Every send goes through lib/chat/send.js (dispatch + guardrails).

import { CAPPED_KINDS, DEFAULT_HANDOVER_LABEL, HUMAN_PAYLOAD, isHandoverRequest, refFromText } from "./rules";
import { findMatch, personalize, pickVariant } from "./matching";
import { agentForChannel, runAiTurn } from "./ai_agent";
import { evaluateHandoverRules, performHandover } from "./handover";
import { continueSession, createPendingSession, findSession, startFlow } from "./flows";
import { enrollByTrigger, enrollInSequence, stopOnReply } from "./sequences";
import { handleOptKeywords } from "./opt_out";
import { postPublicReply, sendBotMessage } from "./send";
import {
  applyContactChanges,
  botPaused,
  bumpStats,
  chatMeta,
  latestConsent,
  listActiveRows,
  loadRow,
  mergeChatMeta,
  personOf,
  recordChatEvent,
  toAutomation,
} from "./store";

const DAY = 86_400_000;
const DEFAULT_HANDOVER_MESSAGE = "Thanks — a teammate will reply here shortly.";
const MESSAGE_TYPES = new Set(["message", "postback"]);

// event: { type: "message"|"comment"|"story_reply"|"story_mention"|"postback"|"referral",
//          text, externalMessageId, commentId, postId, adId, payload, ref }
export async function handleInboundEvent(db, { projectId, connection, channel, conversationId, contactId, event }) {
  if (!db || !projectId || !channel || !event?.type) return { handled: false, automationId: null };
  try {
    return await handle(db, { projectId, connection, channel, conversationId, contactId, event });
  } catch (error) {
    console.error("[chat.engine]", error);
    return { handled: false, automationId: null, error: "engine_failed" };
  }
}

function normalizeEvent(event, channel) {
  const ev = { ...event, text: String(event.text || "") };
  if (!ev.ref && channel === "telegram") ev.ref = ev.text.match(/^\/start\s+([A-Za-z0-9_-]{1,64})/)?.[1] || null;
  if (!ev.ref && channel === "whatsapp") ev.ref = refFromText(ev.text);
  if (ev.type === "postback" && !ev.text && ev.payload && !String(ev.payload).startsWith("btn:") && !String(ev.payload).startsWith("auto:")) ev.text = String(ev.payload);
  return ev;
}

const done = (automationId = null, extra = {}) => ({ handled: true, automationId, ...extra });
const skipped = (reason, extra = {}) => ({ handled: false, automationId: null, reason, ...extra });

async function handle(db, { projectId, connection, channel, conversationId, contactId, event }) {
  const [conversation, contact] = await Promise.all([loadRow(db, "conversations", conversationId), loadRow(db, "contacts", contactId)]);
  const ctx = { db, projectId, connection, channel, conversation, contact, event: normalizeEvent(event, channel), now: Date.now() };
  const ev = ctx.event;
  const isMessage = MESSAGE_TYPES.has(ev.type);
  const inThread = isMessage || ev.type === "referral" || ev.type === "story_reply" || ev.type === "story_mention";

  // Opt-out / opt-in come first and always work.
  if (isMessage) {
    const opt = await handleOptKeywords(ctx);
    if (opt.handled) return done(null, { action: opt.action });
  }
  if ((await latestConsent(db, contact?.id, channel)) === "opted_out") return skipped("opted_out");

  if (isMessage) {
    await trackReply(ctx);
    await stopOnReply(ctx);
  }

  // A person owns this thread: the bot stays quiet.
  if (inThread && (await botPaused(db, conversation))) return skipped("human");

  // Asking for a human always works, from any flow or reply.
  if (isMessage && isHandoverRequest(ev.text, ev.payload)) {
    const match = await evaluateHandoverRules(ctx, { text: ev.text });
    await performHandover(ctx, {
      reason: "requested",
      rule: match?.rule || null,
      action: match?.rule?.action || { notify: true },
      message: match?.rule?.action?.message || DEFAULT_HANDOVER_MESSAGE,
    });
    return done(null, { action: "handover" });
  }

  if (isMessage) {
    const match = await evaluateHandoverRules(ctx, { text: ev.text });
    if (match) {
      await performHandover(ctx, { reason: `rule:${match.reason}`, rule: match.rule, action: match.rule.action || {}, message: match.rule.action?.message || null });
      return done(null, { action: "handover", ruleId: match.rule.id });
    }
  }

  const automations = (await listActiveRows(db, "chat_automations", projectId)).map(toAutomation);
  const facts = { channel, connectionId: connection?.id || null, ref: ev.ref || null, firstMessage: false };

  // 1. Referral / entry point.
  if (ev.ref || (ev.adId && inThread)) {
    const result = await runEntryPoint(ctx, automations, facts);
    if (result) return result;
  }

  // 2. A flow already running in this conversation.
  if (isMessage) {
    const session = await findSession(ctx);
    if (session) {
      const result = await continueSession(ctx, session, { input: ev });
      if (result.handled) {
        await resetNoMatch(ctx);
        return done(null, { flowId: result.flowId, sessionId: result.sessionId, status: result.status });
      }
    }
  }

  // 3. Keyword triggers.
  if (isMessage) {
    const match = findMatch(automations, ["keyword"], ev, facts);
    if (match) return runAutomation(ctx, match.automation, { keyword: match.keyword });
  }

  // 4. Comment and story triggers.
  const kindsFor = { comment: ["comment_to_dm"], story_reply: ["story_reply"], story_mention: ["story_mention"] }[ev.type];
  if (kindsFor) {
    const match = findMatch(automations, kindsFor, ev, facts);
    if (match) return runAutomation(ctx, match.automation, { keyword: match.keyword });
    if (ev.type === "comment") return skipped("no_match");
  }

  // 5. Welcome message on the first message of a conversation.
  if (isMessage) {
    facts.firstMessage = await isFirstMessage(ctx);
    const match = facts.firstMessage ? findMatch(automations, ["welcome"], ev, facts) : null;
    if (match) return runAutomation(ctx, match.automation, { keyword: null });
  }

  // 6. AI agent.
  if (ev.type === "message" && ev.text.trim()) {
    const agent = await agentForChannel(ctx);
    if (agent) {
      const result = await runAiTurn(ctx, agent, ev.text);
      if (result.handled) {
        if (!result.handedOver) await resetNoMatch(ctx);
        return done(null, { agentId: agent.id, action: result.handedOver ? "handover" : "ai_reply" });
      }
    }
  }

  // 7. Default reply (at most once per conversation per cooldown).
  if (ev.type === "message") {
    await bumpNoMatch(ctx);
    const match = findMatch(automations, ["default_reply"], ev, facts);
    if (match && defaultReplyAllowed(ctx, match.automation)) return runAutomation(ctx, match.automation, { keyword: null });
    return skipped("no_match");
  }
  return skipped("no_match");
}

async function resetNoMatch(ctx) {
  if (ctx.conversation && chatMeta(ctx.conversation).noMatchCount) await mergeChatMeta(ctx.db, "conversations", ctx.conversation, { noMatchCount: 0 });
}

async function bumpNoMatch(ctx) {
  if (!ctx.conversation) return;
  await mergeChatMeta(ctx.db, "conversations", ctx.conversation, { noMatchCount: Number(chatMeta(ctx.conversation).noMatchCount || 0) + 1 });
}

function defaultReplyAllowed(ctx, automation) {
  const hours = Number(automation.guardrails?.cooldownHours ?? 24);
  const last = chatMeta(ctx.conversation).defaultReplyAt?.[automation.id];
  return !last || Date.now() - new Date(last).getTime() >= hours * 3_600_000;
}

async function isFirstMessage(ctx) {
  if (!ctx.conversation?.id || ctx.conversation.kind !== "dm") return false;
  const { data } = await ctx.db
    .from("conversation_messages")
    .select("id")
    .eq("conversation_id", ctx.conversation.id)
    .eq("direction", "inbound")
    .limit(2);
  return (data || []).length <= 1;
}

// A reply inside 24h of an automated DM counts toward that automation's funnel.
async function trackReply(ctx) {
  if (!ctx.contact) return;
  const last = chatMeta(ctx.contact).lastAutomated?.[ctx.channel];
  if (!last?.automationId || last.replied || Date.now() - new Date(last.at).getTime() > DAY) return;
  await recordChatEvent(ctx, "social.dm_reply", { automationId: last.automationId, conversationId: ctx.conversation?.id || null });
  const lastAutomated = { ...(chatMeta(ctx.contact).lastAutomated || {}), [ctx.channel]: { ...last, replied: true } };
  await mergeChatMeta(ctx.db, "contacts", ctx.contact, { lastAutomated });
}

async function markAutomated(ctx, automationId) {
  if (!ctx.contact) return;
  const lastAutomated = { ...(chatMeta(ctx.contact).lastAutomated || {}), [ctx.channel]: { automationId, at: new Date().toISOString(), replied: false } };
  await mergeChatMeta(ctx.db, "contacts", ctx.contact, { lastAutomated });
}

// The DM an automation sends: link buttons stay buttons; reply buttons become quick replies plus the handover option.
function buildDm(automation, person) {
  const dm = automation.actions?.dm || {};
  const buttons = (dm.buttons || []).filter((b) => b && String(b.title || "").trim());
  const links = buttons.filter((b) => b.type === "url" && /^https?:\/\//i.test(String(b.url || "")));
  const replies = buttons.filter((b) => b.type !== "url");
  const quickReplies = replies.map((b) => ({ title: String(b.title).slice(0, 20), payload: `auto:${automation.id}:${b.id}` }));
  if (quickReplies.length) quickReplies.push({ title: automation.actions?.handoverLabel || DEFAULT_HANDOVER_LABEL, payload: HUMAN_PAYLOAD });
  return {
    text: personalize(dm.text, person),
    ...(links.length ? { buttons: links.map((b) => ({ type: "url", title: b.title, url: b.url })) } : {}),
    ...(quickReplies.length ? { quickReplies } : {}),
  };
}

async function findEntryPoint(ctx, ev) {
  const { data } = await ctx.db
    .from("entry_points")
    .select("*")
    .eq("project_id", ctx.projectId)
    .eq("channel", ctx.channel)
    .eq("status", "active")
    .is("deleted_at", null);
  const rows = data || [];
  if (ev.ref) {
    const ref = String(ev.ref).toLowerCase();
    const byRef = rows.find((r) => String(r.ref || "").toLowerCase() === ref);
    if (byRef) return byRef;
  }
  if (ev.adId) return rows.find((r) => r.kind === "ctwa" && (r.config?.adIds || []).includes(String(ev.adId))) || null;
  return null;
}

async function runEntryPoint(ctx, automations, facts) {
  const ev = ctx.event;
  const entry = await findEntryPoint(ctx, ev);
  if (entry) {
    await ctx.db.rpc("chat_bump_entry", { p_id: entry.id, p_field: "conversations" });
    await recordChatEvent(ctx, "social.entry_point", { entryPointId: entry.id, ref: entry.ref, kind: entry.kind, adId: ev.adId || null });
    if (entry.flow_id) {
      const result = await startFlow(ctx, entry.flow_id, { input: MESSAGE_TYPES.has(ev.type) ? ev : null, source: { type: "entry_point", id: entry.id } });
      if (result.handled) return done(null, { entryPointId: entry.id, flowId: entry.flow_id });
    }
    if (entry.automation_id) {
      const automation = automations.find((a) => a.id === entry.automation_id);
      if (automation) return runAutomation(ctx, automation, { keyword: entry.ref, entryPointId: entry.id });
    }
  }
  const match = findMatch(automations, ["referral"], ev, facts);
  if (match) return runAutomation(ctx, match.automation, { keyword: match.keyword, entryPointId: entry?.id || null });
  return entry ? done(null, { entryPointId: entry.id, action: "no_target" }) : null;
}

const OK = new Set(["sent", "queued", "duplicate"]);

async function runAutomation(ctx, automation, { keyword = null, entryPointId = null } = {}) {
  const ev = ctx.event;
  const { id, kind } = automation;
  const actions = automation.actions || {};
  const guardrails = automation.guardrails || {};
  const dm = actions.dm || {};
  const person = personOf(ctx.contact, ctx.channel);
  const now = new Date();

  await recordChatEvent(ctx, "social.automation_triggered", {
    automationId: id,
    kind,
    keyword,
    postId: ev.postId || null,
    commentId: ev.commentId || null,
    adId: ev.adId || null,
    entryPointId,
  });
  if (kind === "keyword" && keyword) await recordChatEvent(ctx, "social.keyword", { automationId: id, keyword });
  await bumpStats(ctx.db, "chat_automations", id, { triggered: 1 });
  await ctx.db.from("chat_automations").update({ last_triggered_at: now.toISOString() }).eq("id", id);
  if (ctx.conversation) {
    const patch = { lastAutomationId: id };
    if (kind === "default_reply") patch.defaultReplyAt = { ...(chatMeta(ctx.conversation).defaultReplyAt || {}), [id]: now.toISOString() };
    else patch.noMatchCount = 0;
    await mergeChatMeta(ctx.db, "conversations", ctx.conversation, patch);
  }

  let dmResult = null;
  if (kind === "comment_to_dm") {
    const commentId = ev.commentId;
    const idempotencyKey =
      guardrails.oncePerPost !== false && ev.postId && ctx.contact?.id ? `chatdm:${id}:${ev.postId}:${ctx.contact.id}` : `chatdm:${id}:${commentId}`;
    if (commentId && String(dm.text || "").trim()) {
      dmResult = await sendBotMessage(ctx, buildDm(automation, person), {
        kind,
        automationId: id,
        capped: true,
        privateReply: { commentId },
        quietHours: guardrails.quietHours,
        idempotencyKey,
        source: { type: "flow", id },
      });
      if (dm.flowId && (dmResult.status === "sent" || dmResult.status === "queued")) {
        await createPendingSession(ctx, dm.flowId, { source: { type: "automation", automationId: id }, expiresAt: new Date(now.getTime() + DAY).toISOString() });
      }
    }
    // The public reply follows the DM ("check your DMs" must be true), and isn't repeated for a repeat commenter.
    const replyText = pickVariant(actions.publicReplies, automation.stats?.publicReplies);
    const dmOk = !String(dm.text || "").trim() || dmResult?.status === "sent" || dmResult?.status === "queued";
    if (commentId && replyText && dmOk) {
      const reply = await postPublicReply(ctx, { commentId, text: personalize(replyText, person) });
      if (reply.ok) {
        await bumpStats(ctx.db, "chat_automations", id, { publicReplies: 1 });
        await recordChatEvent(ctx, "social.public_reply", { automationId: id, commentId, postId: ev.postId || null });
      }
    }
  } else if (dm.flowId) {
    const result = await startFlow(ctx, dm.flowId, { input: MESSAGE_TYPES.has(ev.type) ? ev : null, source: { type: "automation", automationId: id } });
    dmResult = { status: result.handled ? (result.sent ? "sent" : "blocked") : "blocked", reason: result.handled ? result.blocked?.[0] || null : result.reason };
  } else if (String(dm.text || "").trim()) {
    dmResult = await sendBotMessage(ctx, buildDm(automation, person), {
      kind,
      automationId: id,
      capped: CAPPED_KINDS.has(kind),
      quietHours: guardrails.quietHours,
      source: { type: "flow", id },
    });
  }

  if (dmResult) {
    const counter = dmResult.status === "sent" ? { dmsSent: 1 } : dmResult.status === "queued" ? { queued: 1 } : OK.has(dmResult.status) ? null : { dmsBlocked: 1 };
    if (counter) await bumpStats(ctx.db, "chat_automations", id, counter);
    if (dmResult.status === "sent") await markAutomated(ctx, id);
    // Blocked DMs are logged with the guardrail that stopped them, so the screens can show why.
    if (!OK.has(dmResult.status)) await recordChatEvent(ctx, "social.dm_blocked", { automationId: id, kind, reason: dmResult.reason || dmResult.status });
  }

  const addTags = actions.tags || [];
  if (addTags.length || (actions.removeTags || []).length || (actions.fields || []).length) {
    await applyContactChanges(ctx.db, ctx.contact, { addTags, removeTags: actions.removeTags || [], fields: actions.fields || [] });
    for (const tag of addTags) await enrollByTrigger(ctx, { type: "tag_added", tag });
  }
  if (actions.sequenceId) await enrollInSequence(ctx, actions.sequenceId, { source: { type: "automation", automationId: id } });
  await enrollByTrigger(ctx, { type: "automation", automationId: id });

  return done(id, { kind, status: dmResult?.status || null, reason: dmResult?.reason || null });
}
