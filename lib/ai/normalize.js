// Normalizers for model output (isomorphic, pure): every AI tool's JSON is reshaped into a fixed, bounded
// structure here before it is stored or returned, so a sloppy or hostile reply can't break a screen.

export const BRIEF_CHANNELS = ["email", "sms", "whatsapp", "push", "social", "ads"];

const clean = (v, max = 600) =>
  typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : "";
const cleanBlock = (v, max = 4000) =>
  typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

function uniqueStrings(values, max, len = 150) {
  const seen = new Set();
  const out = [];
  for (const v of Array.isArray(values) ? values : []) {
    const s = clean(typeof v === "object" && v ? v.subject ?? v.text : v, len);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const VARIANT_LABELS = ["A", "B", "C"];

export function normalizeBrief(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const variants = list(r.variants, 3)
    .map((v, i) => ({
      label: VARIANT_LABELS[i],
      angle: clean(v?.angle, 120),
      subject: clean(v?.subject, 150),
      preheader: clean(v?.preheader, 200),
      headline: clean(v?.headline, 150),
      body: cleanBlock(v?.body, 2500),
      cta: clean(v?.cta, 60),
    }))
    .filter((v) => v.body || v.subject || v.headline);
  const channelPlan = list(r.channelPlan, 6)
    .map((s) => ({
      channel: BRIEF_CHANNELS.includes(String(s?.channel || "").toLowerCase()) ? String(s.channel).toLowerCase() : "email",
      step: clean(s?.step, 120),
      timing: clean(s?.timing, 80),
      purpose: clean(s?.purpose, 240),
    }))
    .filter((s) => s.step);
  const kpis = list(r.kpis, 6)
    .map((k) => ({ metric: clean(k?.metric, 60), target: clean(k?.target, 40), rationale: clean(k?.rationale, 240) }))
    .filter((k) => k.metric);
  const brief = {
    title: clean(r.title, 80),
    objective: clean(r.objective, 500),
    audienceRationale: clean(r.audienceRationale, 600),
    keyMessage: clean(r.keyMessage, 300),
    offerFraming: clean(r.offerFraming, 500),
    channelPlan,
    variants,
    subjectLines: uniqueStrings(r.subjectLines, 8),
    schedule: { recommendation: clean(r.schedule?.recommendation, 200), rationale: clean(r.schedule?.rationale, 500) },
    kpis,
  };
  return brief.objective && variants.length ? brief : null;
}

export function normalizeCopy(raw) {
  const variants = list(raw?.variants, 3)
    .map((v, i) => ({ label: `Variant ${VARIANT_LABELS[i]}`, angle: clean(v?.angle, 120), text: cleanBlock(v?.text ?? v?.copy, 3000) }))
    .filter((v) => v.text);
  return variants.length ? { variants } : null;
}

export function normalizeSubjectLines(raw) {
  const seen = new Set();
  const lines = [];
  for (const l of list(raw?.lines ?? raw?.subjects, 12)) {
    const subject = clean(typeof l === "string" ? l : l?.subject, 150);
    const key = subject.toLowerCase();
    if (!subject || seen.has(key)) continue;
    seen.add(key);
    lines.push({ subject, preheader: clean(l?.preheader, 200), angle: clean(l?.angle, 80) });
    if (lines.length >= 8) break;
  }
  return lines.length ? { lines } : null;
}

// Shape only; lib/ai/segment.js validates fields/operators against the vocabulary.
export function normalizeSegmentSuggestions(raw) {
  const suggestions = list(raw?.suggestions, 3)
    .map((s) => ({
      name: clean(s?.name, 80),
      description: clean(s?.description, 240),
      rationale: clean(s?.rationale, 400),
      match: s?.match === "any" ? "any" : "all",
      conditions: list(s?.conditions, 12).map((c) => ({ field: clean(c?.field, 80), operator: clean(c?.operator, 40), value: c?.value ?? null })),
    }))
    .filter((s) => s.name && s.conditions.length);
  return suggestions.length ? { suggestions } : null;
}

export function normalizeHealthExplanation(raw) {
  const summary = clean(raw?.summary, 800);
  const priorities = list(raw?.priorities, 5)
    .map((p) => ({ title: clean(p?.title, 100), why: clean(p?.why, 400), action: clean(p?.action, 400) }))
    .filter((p) => p.title);
  return summary ? { summary, priorities } : null;
}
