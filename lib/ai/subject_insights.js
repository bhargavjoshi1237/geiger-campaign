// Predicted-performance hints for subject lines (isomorphic, pure), computed only from this workspace's
// own sends: each past subject's unique open rate (from deliveries) grouped by simple features. With too
// little history it says so instead of inventing a number. Rows are normalized camelCase deliveries.

export const MIN_DELIVERED = 20;
export const MIN_SUBJECTS = 3;

const NOT_SENT = new Set(["queued", "failed", "not_sent"]);
const OPENED = new Set(["opened", "clicked", "read", "replied"]);
const URGENCY = /\b(today|tonight|now|last chance|ends|ending|hours? left|final|deadline|only \d+)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

const pct = (n) => `${(n * 100).toFixed(1)}%`;

// Subjects actually sent, with delivered/opened counts. campaigns supply a subject when a delivery has none.
export function buildSubjectHistory(deliveries = [], campaigns = []) {
  const campaignSubject = new Map(campaigns.map((c) => [c.id, c.subject]));
  const bySubject = new Map();
  for (const d of deliveries) {
    if (d.channel !== "email" || d.sourceType === "test" || NOT_SENT.has(d.status)) continue;
    const subject = String(d.subject || campaignSubject.get(d.campaignId) || "").trim();
    if (!subject) continue;
    const entry = bySubject.get(subject) ?? { subject, delivered: 0, opened: 0, campaignIds: new Set() };
    const bounced = d.bouncedAt || d.status === "bounced";
    if (!bounced) entry.delivered += 1;
    if (!bounced && (d.openedAt || d.openCount > 0 || OPENED.has(d.status))) entry.opened += 1;
    if (d.campaignId) entry.campaignIds.add(d.campaignId);
    bySubject.set(subject, entry);
  }
  return [...bySubject.values()]
    .map((e) => ({ ...e, campaignIds: [...e.campaignIds], openRate: e.delivered ? e.opened / e.delivered : 0 }))
    .filter((e) => e.delivered >= MIN_DELIVERED)
    .sort((a, b) => b.delivered - a.delivered);
}

export function subjectFeatures(subject) {
  const s = String(subject || "");
  const length = s.length;
  return {
    length: length <= 30 ? "short" : length <= 50 ? "medium" : "long",
    personalized: /\{\{\s*[\w.]+/.test(s),
    emoji: EMOJI.test(s),
    number: /\d/.test(s),
    question: s.includes("?"),
    urgency: URGENCY.test(s),
  };
}

const FEATURE_LABELS = {
  length: { short: "Short subjects (30 characters or fewer)", medium: "Mid-length subjects (31–50 characters)", long: "Long subjects (over 50 characters)" },
  personalized: { true: "Personalized subjects", false: "Subjects without personalization" },
  emoji: { true: "Subjects with emoji", false: "Subjects without emoji" },
  number: { true: "Subjects with a number", false: "Subjects without a number" },
  question: { true: "Questions", false: "Statements (no question mark)" },
  urgency: { true: "Urgency wording", false: "No urgency wording" },
};

function words(s) {
  return new Set(String(s || "").toLowerCase().replace(/\{\{[^}]*\}\}/g, " ").match(/[a-z0-9']{3,}/g) || []);
}

function similarity(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / (x.size + y.size - shared);
}

// { status: "insufficient" | "ok", baseline, signals, similar, verdict, explanation }
export function predictSubject(subject, history = []) {
  const totalDelivered = history.reduce((s, h) => s + h.delivered, 0);
  if (history.length < MIN_SUBJECTS) {
    return {
      status: "insufficient",
      explanation: `Not enough send history to predict — this needs at least ${MIN_SUBJECTS} past subjects with ${MIN_DELIVERED}+ deliveries (you have ${history.length}).`,
    };
  }
  const baselineRate = history.reduce((s, h) => s + h.opened, 0) / totalDelivered;
  const features = subjectFeatures(subject);
  const tagged = history.map((h) => ({ ...h, features: subjectFeatures(h.subject) }));

  const signals = [];
  for (const [feature, value] of Object.entries(features)) {
    const group = tagged.filter((h) => h.features[feature] === value);
    const rest = tagged.length - group.length;
    if (group.length < 2 || rest < 1) continue;
    const delivered = group.reduce((s, h) => s + h.delivered, 0);
    const rate = group.reduce((s, h) => s + h.opened, 0) / delivered;
    signals.push({
      feature,
      label: FEATURE_LABELS[feature][String(value)],
      subjects: group.length,
      delivered,
      rate,
      diff: rate - baselineRate,
    });
  }
  signals.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const top = signals.slice(0, 2);

  const similar = tagged
    .map((h) => ({ subject: h.subject, openRate: h.openRate, delivered: h.delivered, score: similarity(subject, h.subject) }))
    .filter((h) => h.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const weighted = top.length ? top.reduce((s, x) => s + x.diff * x.delivered, 0) / top.reduce((s, x) => s + x.delivered, 0) : 0;
  const verdict = !top.length ? "in_line" : weighted > 0.02 ? "above" : weighted < -0.02 ? "below" : "in_line";
  const verdictText = { above: "Likely above your average", below: "Likely below your average", in_line: "Likely in line with your average" }[verdict];
  const basis = top.length
    ? top.map((s) => `${s.label.toLowerCase()} averaged ${pct(s.rate)} across ${s.subjects} sends`).join("; ")
    : "no feature of this subject separates your past results";

  return {
    status: "ok",
    baseline: { rate: baselineRate, subjects: history.length, delivered: totalDelivered },
    signals: top,
    similar,
    verdict,
    explanation: `${verdictText} (${pct(baselineRate)} unique opens over ${history.length} subjects): ${basis}.`,
  };
}
