// "Why this campaign worked": deterministic driver analysis of one sent campaign against the workspace's
// other sent campaigns on the same channel. Each factor splits the peers into "like this campaign" vs
// "not", compares their pooled rates with a two-proportion z-test and reports the effect in plain language.
// Confidence is capped by how many campaigns sit on each side, because recipients cluster by campaign.

import { campaignRollup, deliveryFlags, groupBy, median, ratio, sendTime } from "./aggregate";
import { formatNumber, formatPercent, formatPts, hourLabel } from "./format";
import { DAY, WEEKDAYS, toTime, weekdayIndex } from "./ranges";

const MIN_DELIVERED = 20;
const MIN_PEERS = 3;
const MERGE_TAG = /\{\{\s*[^}]+\}\}|\*\|[A-Z0-9_]+\|\*/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const URL_PROP = /^(url|href|link|buttonUrl|linkUrl)$/i;
const TEXT_PROP = /^(text|html|body|content|title|heading|label|caption|subtitle|description|buttonText)$/i;

export const DAYPARTS = [
  { key: "early", label: "early morning", from: 5, to: 8 },
  { key: "morning", label: "morning", from: 8, to: 11 },
  { key: "midday", label: "middle of the day", from: 11, to: 14 },
  { key: "afternoon", label: "afternoon", from: 14, to: 17 },
  { key: "evening", label: "evening", from: 17, to: 21 },
  { key: "night", label: "night", from: 21, to: 29 },
];

export function daypart(hour) {
  const h = hour < 5 ? hour + 24 : hour;
  return DAYPARTS.find((p) => h >= p.from && h < p.to) || DAYPARTS[DAYPARTS.length - 1];
}

const stripHtml = (html) =>
  String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");

// Visible words and outbound links in a campaign: the rendered HTML snapshot, else the builder blocks.
export function contentStats(campaign) {
  const html = campaign.html || "";
  if (html) {
    const links = new Set((html.match(/href\s*=\s*["']https?:[^"']+/gi) || []).map((m) => m.replace(/^href\s*=\s*["']/i, "")));
    const words = stripHtml(html).split(/\s+/).filter((w) => /\w/.test(w)).length;
    return { words, links: links.size };
  }
  const texts = [];
  const links = new Set();
  const walk = (node, depth = 0) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") {
        if (URL_PROP.test(key) && /^https?:/i.test(value)) links.add(value);
        else if (TEXT_PROP.test(key)) texts.push(stripHtml(value));
      } else walk(value, depth + 1);
    }
  };
  walk(campaign.content?.blocks || []);
  const words = texts.join(" ").split(/\s+/).filter((w) => /\w/.test(w)).length;
  return { words, links: links.size };
}

// Recipient context before the send: share who engaged in the prior 90 days and messages received in the prior 7.
function audienceContext(own, sentAt, deliveriesByContact) {
  const t0 = toTime(sentAt);
  if (!Number.isFinite(t0)) return { priorEngaged: null, fatigue: null };
  const contacts = [...new Set(own.map((x) => x.contactId).filter(Boolean))];
  if (!contacts.length) return { priorEngaged: null, fatigue: null };
  let engaged = 0;
  let recent = 0;
  for (const id of contacts) {
    let wasEngaged = false;
    for (const x of deliveriesByContact.get(id) || []) {
      const t = toTime(sendTime(x));
      if (!(t < t0)) continue;
      if (t >= t0 - 7 * DAY) recent += 1;
      if (!wasEngaged && t >= t0 - 90 * DAY) {
        const f = deliveryFlags(x);
        const engagedAt = toTime(x.clickedAt || x.openedAt);
        if ((f.opened || f.clicked) && (!Number.isFinite(engagedAt) || engagedAt < t0)) wasEngaged = true;
      }
    }
    if (wasEngaged) engaged += 1;
  }
  return { priorEngaged: engaged / contacts.length, fatigue: recent / contacts.length };
}

function variantStats(own) {
  const groups = groupBy(own.filter((x) => x.variant), (x) => x.variant);
  return [...groups.entries()]
    .map(([key, rows]) => {
      const r = campaignRollup({ metrics: {} }, rows);
      return { key, delivered: r.delivered, opens: r.opens, clicks: r.clicks, openRate: r.openRate, clickRate: r.clickRate };
    })
    .filter((v) => v.delivered >= MIN_DELIVERED)
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

// One feature vector per campaign: timing, subject, audience, content, variants and its rollup.
export function campaignProfile(campaign, own, { deliveriesByContact, attributed } = {}) {
  const rollup = campaignRollup(campaign, own, attributed);
  const firstSend = own.map(sendTime).filter(Boolean).sort()[0] || null;
  const sentAt = campaign.sentAt || firstSend;
  const date = sentAt ? new Date(sentAt) : null;
  const subject = String(campaign.subject || "").trim();
  const hasSubject = campaign.channel === "email" && subject.length > 0;
  const content = contentStats(campaign);
  const audience = deliveriesByContact ? audienceContext(own, sentAt, deliveriesByContact) : { priorEngaged: null, fatigue: null };
  return {
    id: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    subject,
    sentAt,
    rollup,
    hour: date ? date.getHours() : null,
    weekday: date ? weekdayIndex(date) : null,
    daypart: date ? daypart(date.getHours()) : null,
    weekend: date ? weekdayIndex(date) >= 5 : null,
    subjectLength: hasSubject ? [...subject].length : null,
    personalized: hasSubject ? MERGE_TAG.test(subject) : null,
    emoji: hasSubject ? EMOJI.test(subject) : null,
    question: hasSubject ? subject.includes("?") : null,
    words: content.words || null,
    links: content.words || content.links ? content.links : null,
    audienceSize: rollup.delivered,
    priorEngaged: audience.priorEngaged,
    fatigue: audience.fatigue,
    variants: variantStats(own),
  };
}

// --- Statistics ---------------------------------------------------------------------------------

const OUTCOMES = {
  open: { label: "open rate", num: (r) => r.opens, den: (r) => r.delivered },
  click: { label: "click rate", num: (r) => r.clicks, den: (r) => r.delivered },
  ctor: { label: "click-to-open rate", num: (r) => r.clicks, den: (r) => r.opens },
  conversion: { label: "conversion rate", num: (r) => r.conversions || 0, den: (r) => r.delivered },
};

function pooled(profiles, outcome) {
  const o = OUTCOMES[outcome];
  let num = 0;
  let den = 0;
  for (const p of profiles) {
    num += o.num(p.rollup);
    den += o.den(p.rollup);
  }
  return { num, den, n: profiles.length, rate: ratio(num, den) };
}

export function twoProportionZ(x1, n1, x2, n2) {
  if (!n1 || !n2) return 0;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
}

function confidenceOf(z, minCampaigns = Infinity) {
  const a = Math.abs(z);
  const level = a >= 2.58 ? "high" : a >= 1.96 ? "medium" : "low";
  if (minCampaigns < 3 && level === "high") return "medium";
  if (minCampaigns < 2) return "low";
  return level;
}

const CONFIDENCE_WEIGHT = { high: 3, medium: 2, low: 1 };

function directionOf(effect, base) {
  if (effect == null || !Number.isFinite(effect)) return "neutral";
  const relative = base ? effect / base : effect;
  if (Math.abs(relative) < 0.05) return "neutral";
  return effect > 0 ? "positive" : "negative";
}

// Splits peers by `isLike(target)`, compares pooled outcome rates and phrases the result.
function groupFinding({ id, factor, peers, isLike, outcome, title, likeLabel, otherLabel }) {
  const like = peers.filter(isLike);
  const unlike = peers.filter((p) => !isLike(p));
  if (like.length < 2 || unlike.length < 2) return null;
  const a = pooled(like, outcome);
  const b = pooled(unlike, outcome);
  if (a.rate == null || b.rate == null) return null;
  const effect = a.rate - b.rate;
  const z = twoProportionZ(a.num, a.den, b.num, b.den);
  const confidence = confidenceOf(z, Math.min(like.length, unlike.length));
  const direction = directionOf(effect, b.rate);
  const metric = OUTCOMES[outcome].label;
  return {
    id,
    factor,
    title: title(direction),
    detail: `${likeLabel} average a ${formatPercent(a.rate)} ${metric} vs ${formatPercent(b.rate)} for ${otherLabel} (${like.length} vs ${unlike.length} campaigns).`,
    direction,
    confidence,
    metric: outcome,
    effect,
    z: Number(z.toFixed(2)),
    evidence: { like: a.rate, other: b.rate, likeCampaigns: like.length, otherCampaigns: unlike.length },
  };
}

// Median split for numeric features; the target's side decides which group it is "like".
function splitFinding({ id, factor, target, peers, key, outcome, lowTitle, highTitle, unit, lowLabel, highLabel }) {
  const value = target[key];
  const values = peers.map((p) => p[key]).filter((v) => v != null);
  if (value == null || values.length < 4) return null;
  const mid = median(values);
  const low = value <= mid;
  const eligible = peers.filter((p) => p[key] != null);
  const finding = groupFinding({
    id,
    factor,
    peers: eligible,
    isLike: (p) => (p[key] <= mid) === low,
    outcome,
    title: () => (low ? lowTitle : highTitle),
    likeLabel: low ? lowLabel(mid) : highLabel(mid),
    otherLabel: low ? highLabel(mid).toLowerCase() : lowLabel(mid).toLowerCase(),
  });
  if (!finding) return null;
  return { ...finding, title: `${finding.title} (${unit(value)})` };
}

// --- Analysis -----------------------------------------------------------------------------------

function headline(target, peers) {
  const outcomes = ["open", "click", "conversion"].filter((o) => {
    if (o === "open") return target.channel === "email" || target.rollup.opens > 0;
    if (o === "conversion") return target.rollup.conversions > 0 || peers.some((p) => p.rollup.conversions > 0);
    return true;
  });
  return outcomes.map((o) => {
    const def = OUTCOMES[o];
    const n = def.den(target.rollup);
    const value = ratio(def.num(target.rollup), n);
    const base = pooled(peers, o);
    const p0 = base.rate;
    const z = value != null && p0 != null && p0 > 0 && p0 < 1 && n ? (value - p0) / Math.sqrt((p0 * (1 - p0)) / n) : 0;
    return {
      metric: o,
      label: def.label.charAt(0).toUpperCase() + def.label.slice(1),
      value,
      baseline: p0,
      delta: value != null && p0 != null ? value - p0 : null,
      confidence: confidenceOf(z, peers.length),
    };
  });
}

function abFinding(target, campaign) {
  const variants = target.variants;
  if (variants.length < 2) return null;
  const metric = variants.every((v) => v.clicks === 0) ? "open" : "click";
  const key = metric === "open" ? "openRate" : "clickRate";
  const sorted = [...variants].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
  const [best, ...rest] = sorted;
  const restNum = rest.reduce((s, v) => s + (metric === "open" ? v.opens : v.clicks), 0);
  const restDen = rest.reduce((s, v) => s + v.delivered, 0);
  const restRate = ratio(restNum, restDen);
  const z = twoProportionZ(metric === "open" ? best.opens : best.clicks, best.delivered, restNum, restDen);
  const configured = Array.isArray(campaign.ab?.variants) ? campaign.ab.variants.find((v) => String(v.key ?? v.id) === String(best.key)) : null;
  const subject = configured?.subject ? ` ("${String(configured.subject).slice(0, 80)}")` : "";
  const others = rest.map((v) => v.key).join(", ");
  return {
    id: "ab_test",
    factor: "A/B test",
    title: `Variant ${best.key} won the A/B test`,
    detail: `Variant ${best.key}${subject} reached a ${formatPercent(best[key])} ${OUTCOMES[metric].label} vs ${formatPercent(restRate)} for ${others} (${formatPts(best[key] - restRate)}, ${formatNumber(best.delivered + restDen)} recipients).`,
    direction: "positive",
    confidence: confidenceOf(z),
    metric,
    effect: best[key] - restRate,
    z: Number(z.toFixed(2)),
    evidence: { variants },
  };
}

function scoreOf(f) {
  const base = f.evidence?.other || f.evidence?.like || 0.01;
  return (Math.abs(f.effect || 0) / Math.max(base, 0.001)) * CONFIDENCE_WEIGHT[f.confidence];
}

// Explains one campaign. `campaigns` are normalized campaigns; `deliveries` every loaded delivery;
// `attributedByCampaign` an optional Map(campaignId -> { conversions, revenue }).
export function explainCampaign(targetId, { campaigns = [], deliveries = [], attributedByCampaign = new Map() } = {}) {
  const byCampaign = groupBy(deliveries, (x) => x.campaignId);
  const deliveriesByContact = groupBy(deliveries, (x) => x.contactId);
  const campaign = campaigns.find((c) => c.id === targetId);
  if (!campaign) return null;
  const profileOf = (c) => campaignProfile(c, byCampaign.get(c.id) || [], { deliveriesByContact, attributed: attributedByCampaign.get(c.id) || null });
  const target = profileOf(campaign);
  if (target.rollup.delivered < MIN_DELIVERED) {
    return { campaignId: campaign.id, target, verdict: "insufficient", peers: 0, limited: true, headline: [], findings: [], summary: `Not enough delivered messages yet (${formatNumber(target.rollup.delivered)}) to analyse this campaign.` };
  }

  const peers = campaigns
    .filter((c) => c.id !== campaign.id && c.channel === campaign.channel && (c.status === "sent" || byCampaign.has(c.id)))
    .map(profileOf)
    .filter((p) => p.rollup.delivered >= MIN_DELIVERED);

  const ab = abFinding(target, campaign);
  if (peers.length < MIN_PEERS) {
    return {
      campaignId: campaign.id,
      target,
      verdict: "insufficient",
      peers: peers.length,
      limited: true,
      headline: [],
      findings: ab ? [ab] : [],
      summary: `Driver analysis needs at least ${MIN_PEERS} other sent ${campaign.channel} campaigns with ${MIN_DELIVERED}+ deliveries; this workspace has ${peers.length}.`,
    };
  }

  const head = headline(target, peers);
  const primary = head.find((h) => h.metric === "click" && h.value != null && (target.rollup.clicks > 0 || h.baseline > 0)) || head[0];
  const relative = primary && primary.baseline ? primary.delta / primary.baseline : 0;
  const verdict = relative >= 0.1 ? "outperformed" : relative <= -0.1 ? "underperformed" : "in_line";
  const timingOutcome = campaign.channel === "email" ? "open" : "click";
  const findings = [];
  const push = (f) => f && findings.push(f);

  if (target.daypart) {
    const part = target.daypart;
    push(
      groupFinding({
        id: "send_time",
        factor: "Send time",
        peers: peers.filter((p) => p.daypart),
        isLike: (p) => p.daypart.key === part.key,
        outcome: timingOutcome,
        title: () => `Sent in the ${part.label} (${WEEKDAYS[target.weekday]} ${hourLabel(target.hour)})`,
        likeLabel: `Campaigns sent in the ${part.label}`,
        otherLabel: "other times of day",
      }),
    );
    push(
      groupFinding({
        id: "send_day",
        factor: "Send day",
        peers: peers.filter((p) => p.weekend != null),
        isLike: (p) => p.weekend === target.weekend,
        outcome: timingOutcome,
        title: () => (target.weekend ? "Sent at the weekend" : "Sent on a weekday"),
        likeLabel: target.weekend ? "Weekend sends" : "Weekday sends",
        otherLabel: target.weekend ? "weekday sends" : "weekend sends",
      }),
    );
  }

  if (target.subjectLength != null) {
    push(
      splitFinding({
        id: "subject_length",
        factor: "Subject length",
        target,
        peers,
        key: "subjectLength",
        outcome: "open",
        lowTitle: "Short subject line",
        highTitle: "Long subject line",
        unit: (v) => `${v} characters`,
        lowLabel: (m) => `Subjects of ${Math.round(m)} characters or fewer`,
        highLabel: (m) => `Subjects over ${Math.round(m)} characters`,
      }),
    );
    for (const [key, factor, yes, no] of [
      ["personalized", "Personalization", "Personalized subject line", "No personalization in the subject"],
      ["emoji", "Emoji", "Emoji in the subject line", "No emoji in the subject line"],
      ["question", "Question", "Subject phrased as a question", "Subject not phrased as a question"],
    ]) {
      push(
        groupFinding({
          id: `subject_${key}`,
          factor,
          peers: peers.filter((p) => p[key] != null),
          isLike: (p) => p[key] === target[key],
          outcome: "open",
          title: () => (target[key] ? yes : no),
          likeLabel: `Campaigns ${target[key] ? "with" : "without"} ${factor.toLowerCase() === "question" ? "a question" : factor.toLowerCase()} in the subject`,
          otherLabel: `those ${target[key] ? "without" : "with"}`,
        }),
      );
    }
  }

  push(
    splitFinding({
      id: "audience_size",
      factor: "Audience size",
      target,
      peers,
      key: "audienceSize",
      outcome: "click",
      lowTitle: "Smaller, more targeted send",
      highTitle: "Large send",
      unit: (v) => `${formatNumber(v)} recipients`,
      lowLabel: (m) => `Sends to ${formatNumber(m)} recipients or fewer`,
      highLabel: (m) => `Sends to more than ${formatNumber(m)} recipients`,
    }),
  );

  push(
    splitFinding({
      id: "audience_engagement",
      factor: "Audience engagement",
      target,
      peers,
      key: "priorEngaged",
      outcome: "click",
      lowTitle: "Less engaged audience",
      highTitle: "Recently engaged audience",
      unit: (v) => `${formatPercent(v, 0)} engaged in the prior 90 days`,
      lowLabel: (m) => `Audiences with ${formatPercent(m, 0)} or fewer recently engaged`,
      highLabel: (m) => `Audiences with more than ${formatPercent(m, 0)} recently engaged`,
    }),
  );

  push(
    splitFinding({
      id: "list_fatigue",
      factor: "List fatigue",
      target,
      peers,
      key: "fatigue",
      outcome: timingOutcome,
      lowTitle: "Recipients weren't over-messaged",
      highTitle: "Recipients were messaged often",
      unit: (v) => `${v.toFixed(1)} messages each in the prior week`,
      lowLabel: (m) => `Sends where recipients got ${m.toFixed(1)} or fewer messages the week before`,
      highLabel: (m) => `Sends where recipients got more than ${m.toFixed(1)} messages the week before`,
    }),
  );

  if (campaign.channel === "email") {
    push(
      splitFinding({
        id: "content_length",
        factor: "Content length",
        target,
        peers,
        key: "words",
        outcome: "ctor",
        lowTitle: "Concise content",
        highTitle: "Long content",
        unit: (v) => `${formatNumber(v)} words`,
        lowLabel: (m) => `Emails of ${formatNumber(m)} words or fewer`,
        highLabel: (m) => `Emails over ${formatNumber(m)} words`,
      }),
    );
    push(
      splitFinding({
        id: "link_count",
        factor: "Links",
        target,
        peers,
        key: "links",
        outcome: "ctor",
        lowTitle: "Few links",
        highTitle: "Many links",
        unit: (v) => `${v} ${v === 1 ? "link" : "links"}`,
        lowLabel: (m) => `Emails with ${Math.round(m)} or fewer links`,
        highLabel: (m) => `Emails with more than ${Math.round(m)} links`,
      }),
    );
  }

  push(ab);

  findings.sort((a, b) => {
    const order = { positive: 0, negative: 1, neutral: 2 };
    return order[a.direction] - order[b.direction] || scoreOf(b) - scoreOf(a);
  });

  const summary = primary
    ? `${primary.label} ${formatPercent(primary.value)} vs ${formatPercent(primary.baseline)} for ${peers.length} other ${campaign.channel} campaigns (${formatPts(primary.delta)}, ${primary.confidence} confidence).`
    : "";

  return { campaignId: campaign.id, target, verdict, peers: peers.length, limited: false, headline: head, findings, summary };
}

// The compact, number-only payload sent to the narrative route (no recipient data).
export function insightPayload(analysis, campaign) {
  return {
    campaign: {
      name: String(campaign?.name || "").slice(0, 160),
      channel: campaign?.channel || "email",
      subject: String(campaign?.subject || "").slice(0, 200),
      sentAt: analysis.target?.sentAt || null,
    },
    verdict: analysis.verdict,
    peers: analysis.peers,
    summary: analysis.summary,
    headline: analysis.headline.map((h) => ({ label: h.label, value: h.value, baseline: h.baseline, delta: h.delta, confidence: h.confidence })),
    findings: analysis.findings.slice(0, 12).map((f) => ({ factor: f.factor, title: f.title, detail: f.detail, direction: f.direction, confidence: f.confidence })),
  };
}
