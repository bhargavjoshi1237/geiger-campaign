import * as segmentRules from "@/lib/audience/segment_rules";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { ApiError, badRequest, notFound } from "@/lib/server/http";
import { CONTENT_TYPES } from "./checks";
import {
  countRows,
  describeAudience,
  loadAudience,
  loadCampaigns,
  loadCustomFields,
  loadDeliveries,
  loadEvents,
  loadEventNames,
  loadLists,
  loadTags,
} from "./context";
import { recordGeneration } from "./generations";
import { computeHealth, pct, summarizeHealth } from "./health";
import { askJson, requireLlm, unusableReply } from "./llm";
import { BRIEF_CHANNELS, BRIEF_GOALS, LENGTHS, TONES } from "./options";
import {
  normalizeBrief,
  normalizeCopy,
  normalizeHealthExplanation,
  normalizeSegmentSuggestions,
  normalizeSubjectLines,
} from "./normalize";
import { briefPrompt, copyPrompt, healthPrompt, segmentPrompt, subjectLinesPrompt } from "./prompts";
import { buildVocabulary, describeVocabulary, validateConditions } from "./segment";
import { describeSendTime, nextSlotAt, sendTimeStats } from "./send_time";
import { buildSubjectHistory } from "./subject_insights";

// The AI assistant tools (server-only). Each validates its input, gathers grounding facts from the
// workspace, calls the configured LLM for JSON, normalizes/validates the reply, records it in
// campaign.ai_generations and returns { generation, ...output }. Routes stay thin around these.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASELINE_DAYS = 90;

const CHANNEL_KEYS = BRIEF_CHANNELS.map((c) => c.value);

function text(value, max, label, { required = false } = {}) {
  const s = typeof value === "string" ? value.trim() : "";
  if (required && !s) throw badRequest(`Add the ${label} first.`);
  if (s.length > max) throw badRequest(`Keep the ${label} under ${max} characters.`);
  return s;
}

const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);

function describeBaseline(totals) {
  if (!totals?.sent) return "No sends in the window — there is no baseline yet.";
  const lines = [
    `${totals.sent} marketing sends`,
    `unique open rate ${pct(totals.openRate)}`,
    `click rate ${pct(totals.clickRate, 2)}`,
    `unsubscribe rate ${pct(totals.unsubscribeRate, 2)}`,
  ];
  if (totals.conversionRate != null) lines.push(`conversion rate ${pct(totals.conversionRate, 2)} (${totals.conversions} conversions)`);
  return lines.join(", ") + ".";
}

const customFieldTokens = (fields) => fields.map((f) => `{{contact.${f.key}}} (${f.label})`).join(", ");

async function save(db, ctx, tool, title, input, output) {
  const generation = await recordGeneration(db, { projectId: ctx.projectId, tool, title, input, output, model: ctx.model, userId: ctx.userId });
  return { generation, ...output };
}

export async function generateBrief(db, { projectId, userId }, body = {}) {
  const input = {
    goal: text(body.goal, 300, "goal", { required: true }),
    goalType: oneOf(body.goalType, BRIEF_GOALS, ""),
    audience: {
      kind: oneOf(body.audience?.kind, ["all", "list", "segment"], "all"),
      id: UUID.test(String(body.audience?.id || "")) ? body.audience.id : null,
    },
    offer: text(body.offer, 300, "offer"),
    channel: oneOf(body.channel, CHANNEL_KEYS, "email"),
    tone: oneOf(body.tone, TONES, "Friendly"),
    constraints: text(body.constraints, 600, "constraints"),
  };
  if (input.audience.kind !== "all" && !input.audience.id) throw badRequest("Pick the list or segment to target.");
  const config = requireLlm();

  const settings = await getWorkspaceSettings(db, projectId);
  const timeZone = settings.general.timezone;
  const [audience, deliveries, events, campaigns, customFields] = await Promise.all([
    loadAudience(db, projectId, input.audience),
    loadDeliveries(db, projectId, { sinceDays: BASELINE_DAYS }),
    loadEvents(db, projectId, { sinceDays: BASELINE_DAYS }),
    loadCampaigns(db, projectId),
    loadCustomFields(db, projectId),
  ]);
  if (input.audience.kind !== "all" && !audience) throw notFound("That list or segment no longer exists.");

  const timingChannel = input.channel === "multi" ? "email" : input.channel;
  const sendTime = sendTimeStats(deliveries.filter((d) => d.channel === timingChannel), { timeZone });
  const health = computeHealth({ deliveries, events, campaigns, windowDays: BASELINE_DAYS, frequencyCap: settings.sending.weeklyFrequencyCap });
  const totals = health.workspace.totals;

  const { system, user } = briefPrompt({
    input,
    facts: {
      workspaceName: settings.general.name,
      audience: describeAudience(audience),
      voice: settings.branding.voice,
      sendTime: describeSendTime(sendTime),
      baseline: describeBaseline(totals),
      baselineDays: BASELINE_DAYS,
      customFields: customFieldTokens(customFields),
    },
  });
  const brief = normalizeBrief(await askJson(config, { system, user, title: "Geiger Campaign brief" }));
  if (!brief) throw unusableReply();

  const output = {
    brief,
    sendTime,
    suggestedSendAt: sendTime.enough && sendTime.peakOpen ? nextSlotAt(sendTime.peakOpen.weekday, sendTime.peakOpen.hour, timeZone) : null,
    baseline: {
      days: BASELINE_DAYS,
      sent: totals.sent,
      openRate: totals.openRate,
      clickRate: totals.clickRate,
      unsubscribeRate: totals.unsubscribeRate,
      conversionRate: totals.conversionRate,
    },
    audience: audience ? { kind: audience.kind, id: audience.id, name: audience.name, size: audience.size } : null,
  };
  return save(db, { projectId, userId, model: config.model }, "brief", brief.title || input.goal, input, output);
}

export async function generateCopy(db, { projectId, userId }, body = {}) {
  const input = {
    prompt: text(body.prompt, 1500, "description of what you're promoting", { required: true }),
    contentType: oneOf(body.contentType, CONTENT_TYPES.map((c) => c.value), "email"),
    tone: oneOf(body.tone, TONES, "Friendly"),
    length: oneOf(body.length, LENGTHS, "Medium"),
    useBrandVoice: body.useBrandVoice !== false,
  };
  const config = requireLlm();
  const [settings, customFields] = await Promise.all([getWorkspaceSettings(db, projectId), loadCustomFields(db, projectId)]);
  const { system, user } = copyPrompt({
    input,
    facts: { workspaceName: settings.general.name, voice: settings.branding.voice, customFields: customFieldTokens(customFields) },
  });
  const copy = normalizeCopy(await askJson(config, { system, user, title: "Geiger Campaign copy" }));
  if (!copy) throw unusableReply();
  const output = { ...copy, contentType: input.contentType, voiceUsed: Boolean(input.useBrandVoice && settings.branding.voice) };
  return save(db, { projectId, userId, model: config.model }, "copy", input.prompt, input, output);
}

export async function generateSubjectLines(db, { projectId, userId }, body = {}) {
  const input = {
    description: text(body.description, 600, "description of the email", { required: true }),
    tone: oneOf(body.tone, TONES, "Friendly"),
    count: Math.min(10, Math.max(3, Number(body.count) || 6)),
    personalize: body.personalize === true,
  };
  const config = requireLlm();
  const [settings, deliveries, campaigns] = await Promise.all([
    getWorkspaceSettings(db, projectId),
    loadDeliveries(db, projectId, { sinceDays: 365 }),
    loadCampaigns(db, projectId),
  ]);
  const history = buildSubjectHistory(deliveries, campaigns);
  const topSubjects = [...history]
    .sort((a, b) => b.openRate - a.openRate)
    .slice(0, 5)
    .map((h) => `- “${h.subject}” — ${pct(h.openRate)} unique opens over ${h.delivered} delivered`)
    .join("\n");
  const { system, user } = subjectLinesPrompt({ input, facts: { workspaceName: settings.general.name, voice: settings.branding.voice, topSubjects } });
  const result = normalizeSubjectLines(await askJson(config, { system, user, title: "Geiger Campaign subject lines" }));
  if (!result) throw unusableReply();
  return save(db, { projectId, userId, model: config.model }, "subject_lines", input.description, input, result);
}

export async function suggestSegments(db, { projectId, userId }, body = {}) {
  const input = { goal: text(body.goal, 600, "goal", { required: true }) };
  const config = requireLlm();
  const [customFields, lists, tags, eventNames, contactCount] = await Promise.all([
    loadCustomFields(db, projectId),
    loadLists(db, projectId),
    loadTags(db, projectId),
    loadEventNames(db, projectId),
    countRows(db, "contacts", (q) => q.eq("project_id", projectId).is("deleted_at", null)),
  ]);
  const fields =
    typeof segmentRules.buildSegmentFields === "function"
      ? segmentRules.buildSegmentFields({ customFields, lists, tags })
      : segmentRules.SEGMENT_FIELDS || [];
  const vocab = buildVocabulary(fields, segmentRules.SEGMENT_OPERATORS || [], customFields);
  if (!vocab.fields.size || !vocab.operators.size) {
    throw new ApiError(503, "The segment rule vocabulary isn't available yet, so suggestions can't be validated.", "vocabulary_missing");
  }
  const { system, user } = segmentPrompt({
    input,
    facts: { vocabulary: describeVocabulary(vocab, { eventNames }), contactCount: contactCount ?? "an unknown number of" },
  });
  const shaped = normalizeSegmentSuggestions(await askJson(config, { system, user, title: "Geiger Campaign segments", temperature: 0.3 }));
  if (!shaped) throw unusableReply();
  const suggestions = shaped.suggestions
    .map((s) => {
      const { match, conditions, dropped } = validateConditions(s, vocab, lists);
      return { name: s.name, description: s.description, rationale: s.rationale, match, conditions, dropped };
    })
    .filter((s) => s.conditions.length);
  if (!suggestions.length) {
    throw new ApiError(422, "The AI's conditions didn't fit your segment fields — try describing the audience differently.", "no_valid_conditions");
  }
  return save(db, { projectId, userId, model: config.model }, "segment", input.goal, input, { suggestions });
}

export async function explainHealth(db, { projectId, userId }, body = {}) {
  const input = {
    campaignId: UUID.test(String(body.campaignId || "")) ? body.campaignId : null,
    windowDays: [30, 90].includes(Number(body.windowDays)) ? Number(body.windowDays) : 30,
  };
  const config = requireLlm();
  const settings = await getWorkspaceSettings(db, projectId);
  const sinceDays = Math.max(input.windowDays, 30) + 7;
  const [deliveries, events, campaigns] = await Promise.all([
    loadDeliveries(db, projectId, { sinceDays }),
    loadEvents(db, projectId, { sinceDays }),
    loadCampaigns(db, projectId),
  ]);
  const health = computeHealth({ deliveries, events, campaigns, windowDays: input.windowDays, frequencyCap: settings.sending.weeklyFrequencyCap });
  const summary = summarizeHealth(health, input.campaignId);
  if (!summary || !summary.sends) throw notFound("There are no sends in this window to explain.");
  const { system, user } = healthPrompt({ summary, facts: { workspaceName: settings.general.name } });
  const explanation = normalizeHealthExplanation(await askJson(config, { system, user, title: "Geiger Campaign health", temperature: 0.3 }));
  if (!explanation) throw unusableReply();
  const output = { explanation, score: summary.score, label: summary.label, scope: summary.scope };
  return save(db, { projectId, userId, model: config.model }, "health_explain", `Health — ${summary.scope}`, input, output);
}

