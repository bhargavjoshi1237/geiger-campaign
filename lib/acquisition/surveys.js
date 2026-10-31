// Survey model and analytics shared by the builder, the hosted /s/<id> page, server validation and the
// results view. Pure: no React, no database. A question is { id, type, label, required, options, scale, long }.

export const QUESTION_TYPES = [
  { type: "nps", label: "Net Promoter (0–10)" },
  { type: "rating", label: "Rating" },
  { type: "single", label: "Single choice" },
  { type: "multiple", label: "Multiple choice" },
  { type: "text", label: "Text answer" },
];

export const QUESTION_LABEL = Object.fromEntries(QUESTION_TYPES.map((q) => [q.type, q.label]));

export const SURVEY_KINDS = [
  { value: "nps", label: "NPS" },
  { value: "csat", label: "CSAT" },
  { value: "poll", label: "Poll" },
  { value: "feedback", label: "Feedback" },
];

export const SURVEY_KIND_LABEL = Object.fromEntries(SURVEY_KINDS.map((k) => [k.value, k.label]));

function shortId() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newQuestion(type, overrides = {}) {
  const base = {
    id: shortId(),
    type,
    label: "",
    required: type === "nps" || type === "rating",
    options: type === "single" || type === "multiple" ? ["Option 1", "Option 2", "Option 3"] : [],
    scale: type === "rating" ? 5 : null,
    long: type === "text",
  };
  const label = {
    nps: "How likely are you to recommend us to a friend or colleague?",
    rating: "How satisfied are you overall?",
    single: "Which option fits best?",
    multiple: "Which of these apply?",
    text: "Anything else you'd like to tell us?",
  }[type];
  return { ...base, label, ...overrides };
}

export function templateQuestions(kind) {
  switch (kind) {
    case "nps":
      return [newQuestion("nps"), newQuestion("text", { label: "What's the main reason for your score?", required: false })];
    case "csat":
      return [newQuestion("rating", { label: "How satisfied were you with your experience?" }), newQuestion("text", { label: "What could we do better?", required: false })];
    case "poll":
      return [newQuestion("single", { label: "Which should we build next?", required: true })];
    default:
      return [newQuestion("rating", { label: "How useful did you find it?" }), newQuestion("text", { label: "Tell us more", required: false })];
  }
}

// Validates answers against the questions. Returns { answers, errors } (errors keyed by question id).
export function validateAnswers(questions = [], input = {}) {
  const answers = {};
  const errors = {};
  for (const q of questions) {
    const raw = input?.[q.id];
    const empty = raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      if (q.required) errors[q.id] = "This question needs an answer.";
      continue;
    }
    if (q.type === "nps" || q.type === "rating") {
      const n = Number(raw);
      const max = q.type === "nps" ? 10 : Number(q.scale) || 5;
      const min = q.type === "nps" ? 0 : 1;
      if (!Number.isInteger(n) || n < min || n > max) errors[q.id] = `Pick a number from ${min} to ${max}.`;
      else answers[q.id] = n;
    } else if (q.type === "single") {
      const v = String(raw);
      if (!(q.options || []).includes(v)) errors[q.id] = "Pick one of the listed options.";
      else answers[q.id] = v;
    } else if (q.type === "multiple") {
      const list = (Array.isArray(raw) ? raw : [raw]).map(String).filter((v) => (q.options || []).includes(v));
      if (!list.length && q.required) errors[q.id] = "Pick at least one option.";
      else if (list.length) answers[q.id] = [...new Set(list)];
    } else {
      const v = String(raw).trim().slice(0, 5000);
      if (v) answers[q.id] = v;
      else if (q.required) errors[q.id] = "This question needs an answer.";
    }
  }
  return { answers, errors };
}

// NPS from 0–10 scores: % promoters (9–10) minus % detractors (0–6).
export function npsFrom(scores = []) {
  const valid = scores.filter((s) => Number.isFinite(s));
  if (!valid.length) return null;
  const promoters = valid.filter((s) => s >= 9).length;
  const detractors = valid.filter((s) => s <= 6).length;
  return {
    score: Math.round(((promoters - detractors) / valid.length) * 100),
    promoters,
    passives: valid.length - promoters - detractors,
    detractors,
    total: valid.length,
  };
}

// Per-question summary over raw response answers ({ [questionId]: value }).
export function summarizeQuestion(question, responses = []) {
  const values = responses.map((r) => r.answers?.[question.id]).filter((v) => v != null && v !== "");
  const answered = values.length;
  if (question.type === "nps") {
    const scores = values.map(Number);
    const counts = Array.from({ length: 11 }, (_, i) => ({ label: String(i), count: scores.filter((s) => s === i).length }));
    return { type: "nps", answered, nps: npsFrom(scores), counts };
  }
  if (question.type === "rating") {
    const max = Number(question.scale) || 5;
    const scores = values.map(Number);
    const avg = answered ? scores.reduce((s, v) => s + v, 0) / answered : null;
    const counts = Array.from({ length: max }, (_, i) => ({ label: String(i + 1), count: scores.filter((s) => s === i + 1).length }));
    const satisfied = answered ? scores.filter((s) => s >= Math.ceil(max * 0.8)).length / answered : null;
    return { type: "rating", answered, average: avg, max, counts, satisfied };
  }
  if (question.type === "single" || question.type === "multiple") {
    const flat = values.flatMap((v) => (Array.isArray(v) ? v : [v]));
    const counts = (question.options || []).map((o) => ({ label: o, count: flat.filter((v) => v === o).length }));
    return { type: question.type, answered, counts };
  }
  return { type: "text", answered, answers: values.slice(0, 50) };
}

// The survey's headline score for lists: NPS when it has an NPS question, else the first rating's average.
export function surveyHeadline(survey, responses = []) {
  const questions = survey?.questions || [];
  const nps = questions.find((q) => q.type === "nps");
  if (nps) {
    const s = summarizeQuestion(nps, responses).nps;
    return s ? { label: "NPS", value: s.score, display: `${s.score > 0 ? "+" : ""}${s.score} NPS` } : null;
  }
  const rating = questions.find((q) => q.type === "rating");
  if (rating) {
    const s = summarizeQuestion(rating, responses);
    return s.average != null ? { label: "Average", value: s.average, display: `${s.average.toFixed(1)} / ${s.max}` } : null;
  }
  return null;
}

export function publicQuestions(questions = []) {
  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label || "",
    required: Boolean(q.required),
    options: Array.isArray(q.options) ? q.options.filter(Boolean) : [],
    scale: q.type === "rating" ? Number(q.scale) || 5 : null,
    long: Boolean(q.long),
  }));
}
