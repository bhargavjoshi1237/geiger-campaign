import { callChatCompletion, extractJson, getCampaignLlmConfig } from "@/lib/llm/chat_completions";
import { ApiError, notConfigured } from "@/lib/server/http";

// Server-only LLM plumbing for the AI assistant: a clear 503 when no provider is configured, JSON-mode
// calls with a plain fallback for providers that reject response_format, and a 502 when the reply isn't
// usable JSON. Mirrors geiger-dash's changelog generator.

export const AI_NOT_CONFIGURED =
  "AI isn't configured. Set CAMPAIGN_LLM_BASE_URL, CAMPAIGN_LLM_API_KEY and CAMPAIGN_LLM_MODEL on the server.";

export function requireLlm() {
  const config = getCampaignLlmConfig();
  if (!config) throw notConfigured(AI_NOT_CONFIGURED);
  return config;
}

export async function askJson(config, { system, user, title = "Geiger Campaign AI", temperature = 0.6 }) {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  let text;
  try {
    text = await callChatCompletion(config, messages, { title, temperature, json: true });
  } catch (error) {
    if (!/response_format|json_object|json mode/i.test(error?.message || "")) {
      console.error("[ai.llm]", error);
      throw new ApiError(502, `The AI provider returned an error: ${error?.message || "unknown error"}`, "llm_failed");
    }
    try {
      text = await callChatCompletion(config, messages, { title, temperature });
    } catch (retryError) {
      console.error("[ai.llm]", retryError);
      throw new ApiError(502, `The AI provider returned an error: ${retryError?.message || "unknown error"}`, "llm_failed");
    }
  }
  // Some reasoning models inline their thinking ahead of the JSON answer.
  const parsed = extractJson(String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, ""));
  if (!parsed || typeof parsed !== "object") {
    throw new ApiError(502, "The AI provider's answer wasn't valid JSON — try again.", "llm_invalid");
  }
  return parsed;
}

// Normalizer returned null: the reply parsed but had none of the required content.
export function unusableReply() {
  return new ApiError(502, "The AI reply was missing required fields — try again or adjust the inputs.", "llm_incomplete");
}
