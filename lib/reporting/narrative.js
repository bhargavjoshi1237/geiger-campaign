// Server-side narrative for the "Why this campaign worked" panel: the browser computes the findings
// (lib/reporting/insights.js) and this turns them into a short plain-language explanation with the
// configured LLM. The model only rephrases the numbers it is given — it never sees recipient data.

import { callChatCompletion, getCampaignLlmConfig } from "@/lib/llm/chat_completions";
import { badRequest, notConfigured } from "@/lib/server/http";

const str = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const DIRECTIONS = new Set(["positive", "negative", "neutral"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const VERDICTS = new Set(["outperformed", "underperformed", "in_line", "insufficient"]);

// Whitelists and caps the client payload so only short, numeric findings reach the model.
export function sanitizeInsightPayload(body) {
  if (!body || typeof body !== "object") throw badRequest("Send the computed findings.");
  const findings = Array.isArray(body.findings) ? body.findings.slice(0, 12) : [];
  const headline = Array.isArray(body.headline) ? body.headline.slice(0, 4) : [];
  if (!findings.length && !headline.length) throw badRequest("There are no findings to explain yet.");
  return {
    campaign: {
      name: str(body.campaign?.name, 160),
      channel: str(body.campaign?.channel, 20) || "email",
      subject: str(body.campaign?.subject, 200),
      sentAt: str(body.campaign?.sentAt, 40),
    },
    verdict: VERDICTS.has(body.verdict) ? body.verdict : "in_line",
    peers: Math.max(0, Math.round(num(body.peers) ?? 0)),
    summary: str(body.summary, 400),
    headline: headline.map((h) => ({
      label: str(h?.label, 40),
      value: num(h?.value),
      baseline: num(h?.baseline),
      delta: num(h?.delta),
      confidence: CONFIDENCE.has(h?.confidence) ? h.confidence : "low",
    })),
    findings: findings.map((f) => ({
      factor: str(f?.factor, 40),
      title: str(f?.title, 160),
      detail: str(f?.detail, 400),
      direction: DIRECTIONS.has(f?.direction) ? f.direction : "neutral",
      confidence: CONFIDENCE.has(f?.confidence) ? f.confidence : "low",
    })),
  };
}

const SYSTEM = [
  "You are a marketing analyst writing for a busy campaign manager.",
  "Explain why the campaign performed as it did, using ONLY the findings and numbers provided.",
  "Never invent numbers, causes or comparisons that are not in the input. Rates are fractions (0.054 = 5.4%).",
  "Lead with the verdict in one sentence, then the two or three strongest drivers, weighting high-confidence findings.",
  "Say plainly when a finding is low confidence. Finish with one concrete, testable suggestion for the next send.",
  "Plain prose, no headings, no bullet points, no emoji, at most 120 words.",
].join(" ");

export async function explainFindings(payload) {
  const config = getCampaignLlmConfig();
  if (!config) throw notConfigured("AI isn't configured. Set CAMPAIGN_LLM_BASE_URL, CAMPAIGN_LLM_API_KEY and CAMPAIGN_LLM_MODEL.");
  const narrative = await callChatCompletion(
    config,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(payload) },
    ],
    { title: "Geiger Campaign — campaign insights", temperature: 0.3, timeoutMs: 45_000 },
  );
  const text = String(narrative || "").trim();
  if (!text) throw new Error("The model returned an empty answer.");
  return { narrative: text, model: config.model, generatedAt: new Date().toISOString() };
}
