// Pipeline maths over normalized deals and pipelines: stage lookup, probability and weighted value.

export function stageIndex(pipeline, stageId) {
  return (pipeline?.stages || []).findIndex((s) => s.id === stageId);
}

// The deal's stage, falling back to the first stage when its stage was removed.
export function resolveStage(pipeline, stageId) {
  const stages = pipeline?.stages || [];
  return stages.find((s) => s.id === stageId) || stages[0] || null;
}

// Win probability 0-100: the stage's for open deals, 100 won, 0 lost.
export function dealProbability(deal, pipeline) {
  if (deal.status === "won") return 100;
  if (deal.status === "lost") return 0;
  const stage = (pipeline?.stages || []).find((s) => s.id === deal.stageId);
  return stage ? stage.probability : 0;
}

export function weightedValue(deal, pipeline) {
  return ((Number(deal.value) || 0) * dealProbability(deal, pipeline)) / 100;
}

// Open deals grouped into the pipeline's stage columns, in board order.
export function boardColumns(pipeline, deals) {
  const stages = pipeline?.stages || [];
  const columns = stages.map((stage) => ({ stage, deals: [] }));
  if (!columns.length) return columns;
  for (const deal of deals) {
    if (deal.status !== "open" || deal.pipelineId !== pipeline.id) continue;
    const i = stageIndex(pipeline, deal.stageId);
    columns[i === -1 ? 0 : i].deals.push(deal);
  }
  return columns;
}

export function pipelineById(pipelines, id) {
  return pipelines.find((p) => p.id === id) || null;
}

// The project's default pipeline, else the oldest.
export function defaultPipeline(pipelines) {
  return pipelines.find((p) => p.isDefault) || pipelines[0] || null;
}
