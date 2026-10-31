// Prompts for every AI assistant tool (server-only use, no secrets). Each asks for one JSON object in a
// fixed shape; lib/ai/normalize.js enforces the shape afterwards. Facts come from the workspace and the
// model is told not to invent numbers beyond them.

const RULES = [
  "Reply with one JSON object only — no prose, no markdown fences.",
  "Write plain, specific marketing copy. No emoji unless the brand voice asks for them. No clichés like “unlock”, “supercharge” or “elevate”.",
  "Merge tags use double braces with a fallback, e.g. {{first_name|there}}. Only use first_name, last_name or the custom fields listed.",
  "Never invent statistics, customer counts or results. Use only the numbers given in the facts.",
].join("\n");

const voiceLine = (voice) => (voice ? `Brand voice (follow it): ${voice}` : "No brand voice is set; keep a clear, friendly, professional tone.");

export function briefPrompt({ input, facts }) {
  const system = `You are a senior lifecycle marketer at ${facts.workspaceName || "this company"} writing a campaign brief.
${RULES}
JSON shape:
{
  "title": "short internal campaign name",
  "objective": "1–2 sentences: the measurable goal",
  "audienceRationale": "why this audience, using the audience facts",
  "keyMessage": "the single message to land",
  "offerFraming": "how to present the offer",
  "channelPlan": [{ "channel": "email|sms|whatsapp|push|social|ads", "step": "what goes out", "timing": "Day 0 / +2 days…", "purpose": "why" }],
  "variants": [{ "angle": "the creative angle", "subject": "email subject", "preheader": "preview text", "headline": "email headline", "body": "2–4 short paragraphs (or one SMS-length message for sms/whatsapp)", "cta": "button text" }],
  "subjectLines": ["5–8 alternative subject lines"],
  "schedule": { "recommendation": "when to send, in the workspace time zone", "rationale": "cite the send-time facts" },
  "kpis": [{ "metric": "Open rate", "target": "e.g. 32%", "rationale": "relative to the workspace baseline given" }]
}
Exactly 3 variants with distinct angles. Base the schedule only on the send-time facts; if they say data is insufficient, say the time is a starting point to test. Set KPI targets relative to the baseline facts; if there is no baseline, say targets are initial guesses to calibrate.`;

  const user = `Campaign inputs
Objective type: ${input.goalType || "not specified"}
Goal: ${input.goal}
Primary channel: ${input.channel}
Tone: ${input.tone}
Offer: ${input.offer || "none specified"}
Constraints: ${input.constraints || "none"}

Audience facts
${facts.audience}

${voiceLine(facts.voice)}

Send-time facts (from this workspace's deliveries)
${facts.sendTime}

Baseline facts (last ${facts.baselineDays} days)
${facts.baseline}

Custom fields available for merge tags: ${facts.customFields || "none"}`;
  return { system, user };
}

const COPY_GUIDE = {
  email: "an email body of 2–4 short paragraphs ending with a call to action",
  sms: "one SMS under 160 GSM characters including “Reply STOP to opt out”",
  whatsapp: "one WhatsApp message under 600 characters",
  push: "one push notification under 110 characters",
  social: "one social post with a strong first line (under 125 characters before the fold)",
  ad: "one ad primary text under 125 characters",
};

export function copyPrompt({ input, facts }) {
  const system = `You write marketing copy for ${facts.workspaceName || "this company"}.
${RULES}
JSON shape: { "variants": [{ "angle": "short label for the approach", "text": "the copy" }] }
Write exactly 3 variants with clearly different angles. Each variant is ${COPY_GUIDE[input.contentType] || COPY_GUIDE.email}. Length preference: ${input.length}.`;
  const user = `What we're promoting: ${input.prompt}
Tone: ${input.tone}
${voiceLine(input.useBrandVoice ? facts.voice : "")}
Custom fields available for merge tags: ${facts.customFields || "none"}`;
  return { system, user };
}

export function subjectLinesPrompt({ input, facts }) {
  const system = `You write email subject lines and preheaders for ${facts.workspaceName || "this company"}.
${RULES}
JSON shape: { "lines": [{ "subject": "...", "preheader": "complements the subject, never repeats it", "angle": "curiosity|benefit|urgency|personal|question|news" }] }
Write ${input.count} options with varied angles. Keep most subjects under 41 characters so they fit on phones.${input.personalize ? " Personalize two of them with {{first_name|there}}." : " Don't use merge tags."}`;
  const user = `The email: ${input.description}
Tone: ${input.tone}
${voiceLine(facts.voice)}
Best past subjects by unique open rate (this workspace):
${facts.topSubjects || "no history yet"}`;
  return { system, user };
}

export function segmentPrompt({ input, facts }) {
  const system = `You turn a marketer's plain-language goal into audience segments built from a fixed rule vocabulary.
${RULES}
JSON shape: { "suggestions": [{ "name": "short segment name", "description": "who is in it", "rationale": "why it serves the goal", "match": "all|any", "conditions": [{ "field": "<field key>", "operator": "<operator key>", "value": <value> }] }] }
Use ONLY the field keys and operator keys listed, and only operators listed for that field. Values must match the field type (numbers as numbers, dates as YYYY-MM-DD or a number of days for relative operators, list fields use the list id). Give 1–3 suggestions, each with 1–5 conditions. If the goal can't be expressed with the vocabulary, return the closest suggestion and say what's missing in its rationale.`;
  const user = `Goal: ${input.goal}

${facts.vocabulary}

Workspace: ${facts.contactCount} contacts.`;
  return { system, user };
}

export function healthPrompt({ summary, facts }) {
  const system = `You explain a deterministic email/messaging health score to a marketer at ${facts.workspaceName || "this company"}.
${RULES}
JSON shape: { "summary": "2–3 sentences on what drives the score", "priorities": [{ "title": "...", "why": "cite the numbers given", "action": "the concrete next step in the product" }] }
Up to 4 priorities, most impactful first. Only reference the numbers in the summary; don't recompute or invent any.`;
  const user = `Health summary (JSON):\n${JSON.stringify(summary)}`;
  return { system, user };
}
