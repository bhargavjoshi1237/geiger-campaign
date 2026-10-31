// Lead scoring (isomorphic engine + a db-driven recompute): active rules award points for email opens and
// clicks (deliveries), tracked events and attribute conditions; occurrence points fade linearly over
// decay_days; the total is clamped to 0–100 and written to contacts.lead_score.

import { toContactModel } from "./contact_model.js";
import { conditionNeeds, matchesConditions } from "./segment_rules.js";
import { buildContextIndex } from "./evaluate.js";
import { chunk, fetchAll, loadDeliveries, loadEvents, loadProjectContacts, loadRuleContext } from "./server_data.js";

const DAY = 86_400_000;
export const SCORE_MAX = 100;

export const SCORE_BANDS = [
  { key: "hot", label: "Hot", min: 75, max: 100 },
  { key: "warm", label: "Warm", min: 40, max: 74 },
  { key: "cold", label: "Cold", min: 0, max: 39 },
];

export const SCORING_TRIGGERS = [
  { key: "email_opened", label: "Opens an email" },
  { key: "email_clicked", label: "Clicks an email link" },
  { key: "event", label: "Performs a tracked event" },
  { key: "attribute", label: "Matches a condition" },
];

export function bandFor(score) {
  const s = Number(score) || 0;
  return SCORE_BANDS.find((b) => s >= b.min && s <= b.max) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

// Raw scoring_rules row or view model -> the shape the engine reads.
function ruleShape(rule) {
  return {
    id: rule.id,
    trigger: rule.trigger,
    eventName: String(rule.eventName ?? rule.event_name ?? "").trim(),
    condition: rule.condition && typeof rule.condition === "object" ? rule.condition : {},
    points: Number(rule.points) || 0,
    frequency: rule.frequency === "once" ? "once" : "every",
    decayDays: Number(rule.decayDays ?? rule.decay_days) > 0 ? Number(rule.decayDays ?? rule.decay_days) : null,
  };
}

const time = (v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

function occurrences(rule, ctx) {
  if (rule.trigger === "email_opened") return ctx.deliveries.map((d) => time(d.opened_at ?? d.openedAt)).filter((t) => t !== null);
  if (rule.trigger === "email_clicked") return ctx.deliveries.map((d) => time(d.clicked_at ?? d.clickedAt)).filter((t) => t !== null);
  if (rule.trigger === "event") {
    const name = rule.eventName.toLowerCase();
    return ctx.events.filter((e) => String(e.name).toLowerCase() === name).map((e) => time(e.occurred_at ?? e.occurredAt)).filter((t) => t !== null);
  }
  return [];
}

// { score, breakdown: [{ ruleId, points }] } for one contact; ctx = { listIds, events, deliveries } for it.
export function scoreContact(contact, rules, ctx, now = Date.now()) {
  const breakdown = [];
  let total = 0;
  for (const raw of rules) {
    const rule = ruleShape(raw);
    let points = 0;
    if (rule.trigger === "attribute") {
      if (rule.condition.field && matchesConditions(contact, { match: "all", conditions: [{ id: "rule", ...rule.condition }] }, ctx)) {
        points = rule.points;
      }
    } else {
      let times = occurrences(rule, ctx).filter((t) => t <= now);
      if (rule.frequency === "once" && times.length) times = [Math.max(...times)];
      for (const t of times) {
        const factor = rule.decayDays ? Math.max(0, 1 - (now - t) / (rule.decayDays * DAY)) : 1;
        points += rule.points * factor;
      }
    }
    if (points) {
      breakdown.push({ ruleId: rule.id, points: Math.round(points * 10) / 10 });
      total += points;
    }
  }
  return { score: Math.max(0, Math.min(SCORE_MAX, Math.round(total))), breakdown };
}

// 10-point buckets for the distribution chart: [{ key: "0–9", min, max, count }].
export function scoreBuckets(scores) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ key: i === 9 ? "90–100" : `${i * 10}–${i * 10 + 9}`, min: i * 10, max: i === 9 ? 100 : i * 10 + 9, count: 0 }));
  for (const s of scores) buckets[Math.min(9, Math.floor((Number(s) || 0) / 10))].count += 1;
  return buckets;
}

// Recomputes every contact's score in the project and writes the changed ones (grouped by value, so at
// most 101 update statements). db: campaign-schema client allowed to update contacts.
export async function recomputeLeadScores(db, projectId, { now = Date.now() } = {}) {
  const ruleRows = await fetchAll(
    () => db.from("scoring_rules").select("*").eq("project_id", projectId).eq("active", true).is("deleted_at", null).order("id"),
    { label: "scoring.rules" },
  );
  const rules = ruleRows.map(ruleShape);
  if (!rules.length) return { rules: 0, contacts: 0, updated: 0, buckets: scoreBuckets([]), computedAt: new Date(now).toISOString() };

  const contacts = await loadProjectContacts(db, projectId);

  // Behaviour rules only need the window the longest decay covers; a rule without decay needs all time.
  const behaviour = rules.filter((r) => r.trigger !== "attribute");
  const allTime = behaviour.some((r) => !r.decayDays);
  const windowDays = Math.max(0, ...behaviour.map((r) => r.decayDays || 0));
  const since = allTime || !windowDays ? null : new Date(now - windowDays * DAY).toISOString();

  const eventNames = new Set(rules.filter((r) => r.trigger === "event" && r.eventName).map((r) => r.eventName));
  const needsDeliveries = rules.some((r) => r.trigger === "email_opened" || r.trigger === "email_clicked");
  const attributeNeeds = conditionNeeds(rules.filter((r) => r.trigger === "attribute").map((r) => [{ id: r.id, ...r.condition }]));

  const [events, deliveries, attributeContext] = await Promise.all([
    loadEvents(db, projectId, eventNames, { since }),
    needsDeliveries ? loadDeliveries(db, projectId, { since }) : [],
    loadRuleContext(db, projectId, attributeNeeds, now),
  ]);
  const contextFor = buildContextIndex({
    listMembers: attributeContext.listMembers,
    events: [...events, ...attributeContext.events],
    deliveries: [...deliveries, ...attributeContext.deliveries],
    now,
  });

  const changes = new Map();
  const scores = [];
  for (const row of contacts) {
    const { score } = scoreContact(toContactModel(row), rules, contextFor(row.id), now);
    scores.push(score);
    if (score !== Number(row.lead_score ?? 0)) {
      if (!changes.has(score)) changes.set(score, []);
      changes.get(score).push(row.id);
    }
  }

  let updated = 0;
  for (const [score, contactIds] of changes) {
    for (const part of chunk(contactIds, 200)) {
      const { error } = await db.from("contacts").update({ lead_score: score }).eq("project_id", projectId).in("id", part);
      if (error) throw new Error(`[scoring.write] ${error.message}`);
      updated += part.length;
    }
  }

  return { rules: rules.length, contacts: contacts.length, updated, buckets: scoreBuckets(scores), computedAt: new Date(now).toISOString() };
}
