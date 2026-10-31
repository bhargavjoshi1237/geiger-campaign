// Per-stage conversion and velocity for one pipeline, replayed from the deal history the deals trigger
// writes into crm_activities (created / stage / status events). Pure.

import { daysBetween, percent } from "./format.js";
import { stageIndex } from "./forecast.js";

const time = (iso) => new Date(iso).getTime();

// One deal's stays: [{ stageId, from, to, outcome: advanced | back | won | lost | moved_out | null }].
function replayDeal(deal, events, pipeline) {
  const stays = [];
  let current = null;

  const enter = (stageId, at) => {
    current = { stageId, from: at, to: null, outcome: null };
    stays.push(current);
  };
  const leave = (at, outcome) => {
    if (!current) return;
    current.to = at;
    current.outcome = outcome;
    current = null;
  };

  const first = events[0];
  if (!first || first.event !== "created") {
    // History predates the trigger (or was trimmed): start from the earliest known stage.
    const startStage = first?.event === "stage" ? first.fromStageId : first?.stageId || deal.stageId;
    const startPipeline = first?.event === "stage" ? first.fromPipelineId : deal.pipelineId;
    if (startPipeline === pipeline.id && startStage) enter(startStage, deal.createdAt);
  }

  for (const e of events) {
    const at = e.occurredAt;
    if (e.event === "created") {
      if (e.pipelineId === pipeline.id && e.toStageId) enter(e.toStageId, at);
    } else if (e.event === "stage") {
      if (current) {
        const sameBoard = e.pipelineId === pipeline.id;
        const forward = sameBoard && stageIndex(pipeline, e.toStageId) > stageIndex(pipeline, current.stageId);
        leave(at, sameBoard ? (forward ? "advanced" : "back") : "moved_out");
      }
      if (e.pipelineId === pipeline.id && e.toStageId) enter(e.toStageId, at);
    } else if (e.event === "status") {
      if (e.toStatus === "won" || e.toStatus === "lost") leave(at, e.toStatus);
      else if (e.toStatus === "open" && e.pipelineId === pipeline.id && e.stageId) enter(e.stageId, at);
    }
  }

  // Closed deals with no status event on record still close their last stay.
  if (current && deal.status !== "open" && deal.pipelineId === pipeline.id) {
    leave(deal.status === "won" ? deal.wonAt || deal.updatedAt : deal.lostAt || deal.updatedAt, deal.status);
  }
  return stays;
}

export function stageMetrics(pipeline, deals, activities) {
  const stages = pipeline?.stages || [];
  const byDeal = new Map();
  for (const a of activities) {
    if (a.relatedType !== "deal" || !a.relatedId || !a.event) continue;
    if (!byDeal.has(a.relatedId)) byDeal.set(a.relatedId, []);
    byDeal.get(a.relatedId).push(a);
  }

  const perStage = new Map(stages.map((s) => [s.id, { entered: new Set(), left: new Set(), advanced: new Set(), lost: new Set(), durations: [] }]));

  for (const deal of deals) {
    const events = (byDeal.get(deal.id) || []).slice().sort((a, b) => time(a.occurredAt) - time(b.occurredAt));
    const touchesPipeline = deal.pipelineId === pipeline.id || events.some((e) => e.pipelineId === pipeline.id);
    if (!touchesPipeline) continue;
    for (const stay of replayDeal(deal, events, pipeline)) {
      const bucket = perStage.get(stay.stageId);
      if (!bucket) continue;
      bucket.entered.add(deal.id);
      if (!stay.to) continue;
      bucket.left.add(deal.id);
      if (stay.outcome === "advanced" || stay.outcome === "won") bucket.advanced.add(deal.id);
      if (stay.outcome === "lost") bucket.lost.add(deal.id);
      const days = daysBetween(stay.from, stay.to);
      if (days != null && days >= 0) bucket.durations.push(days);
    }
  }

  const pipelineDeals = deals.filter((d) => d.pipelineId === pipeline.id);
  const open = pipelineDeals.filter((d) => d.status === "open");

  const rows = stages.map((stage, index) => {
    const b = perStage.get(stage.id);
    const inStage = open.filter((d) => d.stageId === stage.id || (index === 0 && stageIndex(pipeline, d.stageId) === -1));
    return {
      stage,
      index,
      inStage,
      entered: b.entered.size,
      left: b.left.size,
      advanced: b.advanced.size,
      lostHere: b.lost.size,
      conversion: percent(b.advanced.size, b.left.size),
      avgDays: b.durations.length ? b.durations.reduce((s, d) => s + d, 0) / b.durations.length : null,
    };
  });

  const won = pipelineDeals.filter((d) => d.status === "won");
  const lost = pipelineDeals.filter((d) => d.status === "lost");
  const cycles = won.map((d) => daysBetween(d.createdAt, d.wonAt)).filter((d) => d != null && d >= 0);

  return {
    stages: rows,
    open,
    won,
    lost,
    winRate: percent(won.length, won.length + lost.length),
    avgCycleDays: cycles.length ? cycles.reduce((s, d) => s + d, 0) / cycles.length : null,
  };
}
