// Minimal server-side client for any OpenAI-compatible /chat/completions provider, mirroring
// geiger-dash lib/llm/chat-completions.js. Configured through CAMPAIGN_LLM_BASE_URL, CAMPAIGN_LLM_API_KEY
// and CAMPAIGN_LLM_MODEL. Carries an API key — never import client-side.

export function getCampaignLlmConfig() {
  const baseUrl = process.env.CAMPAIGN_LLM_BASE_URL;
  const apiKey = process.env.CAMPAIGN_LLM_API_KEY;
  const model = process.env.CAMPAIGN_LLM_MODEL;
  return baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null;
}

export function resolveChatEndpoint(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

export async function callChatCompletion(
  config,
  messages,
  { title = "Geiger Campaign", temperature = 0.4, timeoutMs = 60_000, json = false } = {},
) {
  const response = await fetch(resolveChatEndpoint(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "HTTP-Referer": "https://geiger.studio",
      "X-Title": title,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.error || `LLM provider returned ${response.status}`);
  }
  return body?.choices?.[0]?.message?.content || "";
}

// Pulls the first JSON object/array out of a model reply (tolerates ```json fences and prose).
export function extractJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
