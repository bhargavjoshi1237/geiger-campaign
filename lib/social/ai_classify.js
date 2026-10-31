import { callChatCompletion, extractJson, getCampaignLlmConfig } from "@/lib/llm/chat_completions";

// LLM classification for moderation and listening (server-only). Only runs when CAMPAIGN_LLM_* is configured;
// callers treat a null result as "not classified" and never guess.

export function aiConfigured() {
  return Boolean(getCampaignLlmConfig());
}

// -> { spam, toxicity, negative, reason } | null
export async function classifyComment(text, config = getCampaignLlmConfig()) {
  if (!config || !String(text || "").trim()) return null;
  try {
    const reply = await callChatCompletion(
      config,
      [
        {
          role: "system",
          content:
            "You moderate comments on a brand's social media posts. Classify the comment and reply with JSON only: " +
            '{"spam": boolean, "toxicity": boolean, "negative": boolean, "reason": string}. ' +
            "spam: scams, bots, unsolicited promotion, follow-for-follow, link farming, crypto/giveaway lures. " +
            "toxicity: harassment, hate speech, slurs, threats or profanity aimed at people. " +
            "negative: the commenter criticises or is dissatisfied with the brand or product (true even when polite). " +
            "reason: under 15 words.",
        },
        { role: "user", content: String(text).slice(0, 2000) },
      ],
      { json: true, temperature: 0, timeoutMs: 20_000, title: "Geiger Campaign moderation" },
    );
    const parsed = extractJson(reply);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      spam: parsed.spam === true,
      toxicity: parsed.toxicity === true,
      negative: parsed.negative === true,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "",
    };
  } catch (e) {
    console.error("[social.classifyComment]", e?.message);
    return null;
  }
}

// items: [{ id, text }] -> Map(id -> "positive" | "neutral" | "negative"); empty when not configured or on failure.
export async function classifySentiments(items, config = getCampaignLlmConfig()) {
  const out = new Map();
  const batch = (items || []).filter((i) => i?.id && String(i.text || "").trim()).slice(0, 25);
  if (!config || !batch.length) return out;
  try {
    const reply = await callChatCompletion(
      config,
      [
        {
          role: "system",
          content:
            "Classify the sentiment each social media post expresses toward the brand or topic. Reply with JSON only: " +
            '{"results": [{"id": string, "sentiment": "positive" | "neutral" | "negative"}]}.',
        },
        { role: "user", content: JSON.stringify(batch.map((i) => ({ id: i.id, text: String(i.text).slice(0, 600) }))) },
      ],
      { json: true, temperature: 0, timeoutMs: 30_000, title: "Geiger Campaign listening" },
    );
    const parsed = extractJson(reply);
    for (const r of Array.isArray(parsed?.results) ? parsed.results : []) {
      if (["positive", "neutral", "negative"].includes(r?.sentiment) && batch.some((i) => i.id === r.id)) out.set(r.id, r.sentiment);
    }
  } catch (e) {
    console.error("[social.classifySentiments]", e?.message);
  }
  return out;
}
