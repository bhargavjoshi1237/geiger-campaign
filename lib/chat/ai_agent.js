import { callChatCompletion, extractJson, getCampaignLlmConfig } from "@/lib/llm/chat_completions";
import { isHandoverRequest } from "./rules";
import { evaluateHandoverRules, performHandover } from "./handover";
import { bumpStats, conversationHistory, loadRow, personOf, recordChatEvent } from "./store";
import { sendBotMessage } from "./send";

// AI agent (server-only): an LLM answering DMs from the agent's persona, instructions and knowledge plus the
// conversation so far, returning a reply with a confidence score. Low confidence, a handover intent or a
// matching handover rule hands the conversation to a person instead of guessing.

export const AGENT_DEFAULTS = Object.freeze({ minConfidence: 0.6, maxReplyChars: 600, temperature: 0.3, maxTurns: 8 });
export const DEFAULT_AGENT_HANDOVER_MESSAGE = "I'll get a teammate to help with this — they'll reply here shortly.";

const KNOWLEDGE_BUDGET = 12_000;
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// Raw row or camelCase draft -> one shape.
export function toAgent(input = {}) {
  return {
    id: input.id || null,
    name: input.name || "Assistant",
    persona: input.persona || "",
    instructions: input.instructions || "",
    knowledge: Array.isArray(input.knowledge) ? input.knowledge : [],
    channels: input.channels || [],
    handoverTriggers: bag(input.handoverTriggers ?? input.handover_triggers),
    modelSettings: bag(input.modelSettings ?? input.model_settings),
  };
}

function knowledgeBlock(knowledge) {
  let budget = KNOWLEDGE_BUDGET;
  const parts = [];
  knowledge.forEach((item, i) => {
    const content = String(item?.content || "").trim();
    if (!content || budget <= 0) return;
    const slice = content.slice(0, budget);
    budget -= slice.length;
    parts.push(`[${i + 1}] ${item.title || item.url || "Note"}${item.url ? ` (${item.url})` : ""}\n${slice}`);
  });
  return parts.length ? parts.join("\n\n") : "(No knowledge added yet.)";
}

export function buildAgentMessages(agentInput, { channel = "instagram", history = [], text = "", contactName = "" } = {}) {
  const agent = toAgent(agentInput);
  const maxChars = Number(agent.modelSettings.maxReplyChars) || AGENT_DEFAULTS.maxReplyChars;
  const system = [
    `You are ${agent.name}, replying to customers in ${channel} direct messages on behalf of the business.`,
    agent.persona ? `Persona and tone:\n${agent.persona}` : "",
    agent.instructions ? `Instructions:\n${agent.instructions}` : "",
    `Knowledge — the only facts you may state:\n${knowledgeBlock(agent.knowledge)}`,
    [
      "Rules:",
      "- Answer only from the knowledge and the conversation. If the answer isn't there, say a teammate will follow up and set handover to true.",
      `- Plain text, no markdown, under ${maxChars} characters. Reply in the customer's language.`,
      "- Never invent prices, discounts, refunds, stock or delivery dates.",
      "- If the person asks for a human, is upset, or needs account or payment changes, set handover to true.",
      contactName ? `- The customer's name is ${contactName}.` : "",
      'Respond with JSON only: {"reply": string, "confidence": number between 0 and 1, "handover": boolean, "intent": short_snake_case, "sentiment": "positive" | "neutral" | "negative"}',
    ]
      .filter(Boolean)
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const turns = history.slice(-12).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) }));
  const last = turns[turns.length - 1];
  if (text && !(last?.role === "user" && last.content === text)) turns.push({ role: "user", content: String(text).slice(0, 2000) });
  return [{ role: "system", content: system }, ...turns];
}

// { ok, reply, confidence, handover, intent, sentiment } or { ok: false, status, error }.
export async function askAgent(agentInput, { channel, history = [], text = "", contactName = "" } = {}) {
  const config = getCampaignLlmConfig();
  if (!config) return { ok: false, status: 503, error: "AI isn't configured. Set CAMPAIGN_LLM_BASE_URL, CAMPAIGN_LLM_API_KEY and CAMPAIGN_LLM_MODEL." };
  const agent = toAgent(agentInput);
  const messages = buildAgentMessages(agent, { channel, history, text, contactName });
  try {
    const raw = await callChatCompletion(config, messages, {
      json: true,
      temperature: Number(agent.modelSettings.temperature ?? AGENT_DEFAULTS.temperature),
      timeoutMs: 30_000,
      title: "Geiger Campaign AI agent",
    });
    const parsed = extractJson(raw) || {};
    const maxChars = Number(agent.modelSettings.maxReplyChars) || AGENT_DEFAULTS.maxReplyChars;
    const reply = String(parsed.reply || "").trim().slice(0, maxChars);
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence)));
    return {
      ok: true,
      reply,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      handover: Boolean(parsed.handover),
      intent: String(parsed.intent || "").slice(0, 60),
      sentiment: ["positive", "neutral", "negative"].includes(parsed.sentiment) ? parsed.sentiment : "neutral",
    };
  } catch (error) {
    console.error("[chat.ai.ask]", error?.message);
    return { ok: false, status: 502, error: "The AI provider didn't answer. Try again in a moment." };
  }
}

// Should this answer go to a person instead? -> { handover, reason }
export function decideHandover(agentInput, result, text = "") {
  const agent = toAgent(agentInput);
  const triggers = agent.handoverTriggers;
  const min = Number(triggers.minConfidence ?? AGENT_DEFAULTS.minConfidence);
  if (isHandoverRequest(text)) return { handover: true, reason: "requested" };
  if (result.handover) return { handover: true, reason: "ai_handover_intent" };
  if (!result.reply) return { handover: true, reason: "ai_no_answer" };
  if (result.confidence < min) return { handover: true, reason: "ai_low_confidence" };
  if (triggers.onNegativeSentiment && result.sentiment === "negative") return { handover: true, reason: "negative_sentiment" };
  const intents = (triggers.intents || []).map((i) => String(i).toLowerCase());
  if (result.intent && intents.includes(result.intent.toLowerCase())) return { handover: true, reason: `intent:${result.intent}` };
  return { handover: false, reason: null };
}

// The active agent answering this channel (an agent with no channels answers all of them).
export async function agentForChannel(ctx) {
  const { data, error } = await ctx.db
    .from("ai_agents")
    .select("*")
    .eq("project_id", ctx.projectId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return null;
  return (data || []).find((a) => !(a.channels || []).length || a.channels.includes(ctx.channel)) || null;
}

// One AI turn in a live conversation: reply, or hand over. -> { handled, handedOver, reason }
export async function runAiTurn(ctx, agentOrId, text, { flowId = null, nodeId = null, sessionId = null } = {}) {
  const row = typeof agentOrId === "string" ? await loadRow(ctx.db, "ai_agents", agentOrId) : agentOrId;
  const agent = row && !row.deleted_at ? toAgent(row) : null;
  const handoverMessage = (a) => a?.handoverTriggers?.message || DEFAULT_AGENT_HANDOVER_MESSAGE;
  if (!agent) {
    await performHandover(ctx, { reason: "ai_agent_missing", message: DEFAULT_AGENT_HANDOVER_MESSAGE, action: { notify: true } });
    return { handled: true, handedOver: true, reason: "ai_agent_missing" };
  }

  const history = await conversationHistory(ctx.db, ctx.conversation?.id);
  const result = await askAgent(agent, { channel: ctx.channel, history, text, contactName: personOf(ctx.contact, ctx.channel).name });
  if (!result.ok) {
    // No AI available: a person answers rather than leaving the message unanswered.
    await performHandover(ctx, { reason: result.status === 503 ? "ai_not_configured" : "ai_unavailable", message: handoverMessage(agent), action: { notify: true } });
    return { handled: true, handedOver: true, reason: "ai_unavailable" };
  }

  const decision = decideHandover(agent, result, text);
  const ruleMatch = await evaluateHandoverRules(ctx, { text, sentiment: result.sentiment, aiConfidence: result.confidence });
  if (decision.handover || ruleMatch) {
    await performHandover(ctx, {
      reason: ruleMatch ? `rule:${ruleMatch.reason}` : decision.reason,
      rule: ruleMatch?.rule || null,
      action: ruleMatch?.rule?.action || { notify: true },
      message: ruleMatch?.rule?.action?.message || handoverMessage(agent),
    });
    if (agent.id) await bumpStats(ctx.db, "ai_agents", agent.id, { handovers: 1 });
    await recordChatEvent(ctx, "social.ai_reply", { agentId: agent.id, confidence: result.confidence, handover: true, intent: result.intent, flowId });
    return { handled: true, handedOver: true, reason: decision.reason || "rule" };
  }

  const sent = await sendBotMessage(ctx, { text: result.reply }, { kind: "ai_agent", flowId, nodeId, sessionId, source: { type: "flow", id: flowId || agent.id } });
  if (agent.id) await bumpStats(ctx.db, "ai_agents", agent.id, { replies: 1 });
  await recordChatEvent(ctx, "social.ai_reply", { agentId: agent.id, confidence: result.confidence, handover: false, intent: result.intent, flowId, status: sent.status });
  return { handled: true, handedOver: false, reason: null, status: sent.status };
}

// Knowledge URLs: fetched server-side, text extracted, cached on the knowledge item.
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

export async function fetchPageText(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    return { ok: false, error: "That isn't a valid URL." };
  }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, error: "Only http and https links can be read." };
  if (PRIVATE_HOST.test(url.hostname)) return { ok: false, error: "Private and local addresses can't be read." };
  try {
    const res = await fetch(url, { redirect: "follow", headers: { Accept: "text/html,text/plain" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ok: false, error: `The page returned ${res.status}.` };
    const type = res.headers.get("content-type") || "";
    if (!/text\/(html|plain)|application\/xhtml/i.test(type)) return { ok: false, error: "Only HTML and plain-text pages can be read." };
    const raw = (await res.text()).slice(0, 1_000_000);
    const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
    const text = raw
      .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim()
      .slice(0, 20_000);
    if (!text) return { ok: false, error: "No readable text on that page." };
    return { ok: true, title, text };
  } catch (error) {
    return { ok: false, error: error?.name === "TimeoutError" ? "The page took too long to respond." : "Couldn't reach that page." };
  }
}

export async function refreshKnowledge(knowledge = []) {
  const out = [];
  for (const item of knowledge) {
    if (item?.type !== "url" || !item.url) {
      out.push(item);
      continue;
    }
    const page = await fetchPageText(item.url);
    out.push(
      page.ok
        ? { ...item, title: item.title || page.title || item.url, content: page.text, fetchedAt: new Date().toISOString(), error: null }
        : { ...item, error: page.error, fetchedAt: new Date().toISOString() },
    );
  }
  return out;
}
