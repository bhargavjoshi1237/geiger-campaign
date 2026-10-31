// A/B test model (isomorphic, pure) stored in campaigns.ab:
//   { enabled, testOn: "subject" | "content", variants: [{ key: "A" }, { key: "B", subject, preheader, content }],
//     testPercent, winnerMetric: "opens" | "clicks" | "conversions", durationHours, winner, decidedAt }
// Variant A is the campaign itself; other variants override subject/preheader (subject tests) or the
// builder document (content tests). testPercent of the audience is split evenly across variants; the
// rest receives the winner once durationHours have passed (100 = a straight split, no winner send).
// OWNER: Campaigns.

export const AB_METRICS = [
  { value: "opens", label: "Open rate" },
  { value: "clicks", label: "Click rate" },
  { value: "conversions", label: "Conversion rate" },
];

export const AB_TEST_ON = [
  { value: "subject", label: "Subject line" },
  { value: "content", label: "Email content" },
];

export const AB_DURATIONS = [1, 2, 4, 8, 12, 24, 48];

export function defaultAb() {
  return {
    enabled: false,
    testOn: "subject",
    variants: [{ key: "A" }, { key: "B", subject: "", preheader: "", content: null }],
    testPercent: 20,
    winnerMetric: "opens",
    durationHours: 4,
    winner: null,
    decidedAt: null,
  };
}

export function normalizeAb(ab) {
  const base = defaultAb();
  const a = ab && typeof ab === "object" ? ab : {};
  const variants = Array.isArray(a.variants) && a.variants.length >= 2 ? a.variants : base.variants;
  return {
    ...base,
    ...a,
    enabled: !!a.enabled,
    testOn: a.testOn === "content" ? "content" : "subject",
    variants: variants.map((v, i) => ({ ...v, key: v?.key || String.fromCharCode(65 + i) })),
    testPercent: Math.min(100, Math.max(10, Number(a.testPercent) || base.testPercent)),
    winnerMetric: AB_METRICS.some((m) => m.value === a.winnerMetric) ? a.winnerMetric : base.winnerMetric,
    durationHours: Number(a.durationHours) || base.durationHours,
  };
}

// The subject, preheader and document a recipient of `key` receives.
export function resolveVariant(campaign, key) {
  const ab = normalizeAb(campaign?.ab);
  const base = { key: "A", subject: campaign?.subject ?? "", preheader: campaign?.preheader ?? "", content: campaign?.content ?? {} };
  if (!ab.enabled || !key || key === "A") return base;
  const v = ab.variants.find((x) => x.key === key);
  if (!v) return base;
  if (ab.testOn === "content") return { ...base, key, content: v.content && v.content.blocks ? v.content : base.content };
  return { ...base, key, subject: v.subject || base.subject, preheader: v.preheader || base.preheader };
}

// Audience shares: each test variant's percent and the winner's remainder.
export function abSplit(ab) {
  const a = normalizeAb(ab);
  const per = Math.floor((a.testPercent / a.variants.length) * 10) / 10;
  return { perVariant: per, remainder: Math.max(0, Math.round((100 - a.testPercent) * 10) / 10) };
}

const rate = (n, d) => (d > 0 ? (Number(n) || 0) / d : 0);

// Per-variant rates from report rows: [{ key, sent, opens, clicks, conversions }].
export function variantRates(v) {
  const sent = Number(v?.sent) || 0;
  return { openRate: rate(v?.opens, sent), clickRate: rate(v?.clicks, sent), conversionRate: rate(v?.conversions, sent) };
}

const METRIC_RATE = { opens: "openRate", clicks: "clickRate", conversions: "conversionRate" };

// The leading variant on the winner metric and its relative uplift over the runner-up (null without sends).
export function pickLeader(variants, metric = "opens") {
  const rows = (variants || []).filter((v) => Number(v?.sent) > 0).map((v) => ({ ...v, rate: variantRates(v)[METRIC_RATE[metric] || "openRate"] }));
  if (rows.length < 2) return null;
  rows.sort((x, y) => y.rate - x.rate);
  const [first, second] = rows;
  const uplift = second.rate > 0 ? (first.rate - second.rate) / second.rate : null;
  return { key: first.key, rate: first.rate, runnerUp: second.key, uplift, tied: first.rate === second.rate };
}
