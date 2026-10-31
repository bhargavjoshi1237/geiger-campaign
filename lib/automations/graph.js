// Automation graph helpers (isomorphic, pure). A graph is { nodes, edges }: nodes are
// { id, type, position, data: { config } } and edges { id, source, sourceHandle, target } where
// sourceHandle names the branch ("out", "yes"/"no", split keys, "event"/"timeout").

import { MESSAGE_CHANNELS, defaultNodeConfig, nodeHandles } from "./steps.js";
import { defaultTrigger } from "./triggers.js";

export const NODE_WIDTH = 280;
export const ROW_HEIGHT = 170;
export const LANE_WIDTH = 330;

export function newNodeId() {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}${Math.floor(performance.now() * 1000).toString(16)}`;
  return `n_${raw.replace(/-/g, "").slice(0, 10)}`;
}

export function edgeId(source, handle, target) {
  return `e_${source}_${handle || "out"}_${target}`;
}

export const handleOf = (edge) => edge?.sourceHandle || "out";

export function graphNodes(graph) {
  return Array.isArray(graph?.nodes) ? graph.nodes : [];
}

export function graphEdges(graph) {
  return Array.isArray(graph?.edges) ? graph.edges : [];
}

export function getNode(graph, id) {
  return graphNodes(graph).find((n) => n.id === id) || null;
}

export function triggerNodeOf(graph) {
  return graphNodes(graph).find((n) => n.type === "trigger") || null;
}

export function outgoingEdges(graph, nodeId) {
  return graphEdges(graph).filter((e) => e.source === nodeId);
}

export function incomingEdges(graph, nodeId) {
  return graphEdges(graph).filter((e) => e.target === nodeId);
}

// The node a contact moves to after leaving nodeId through `handle` (null = end of the path).
export function nextNodeId(graph, nodeId, handle = "out") {
  const edge = outgoingEdges(graph, nodeId).find((e) => handleOf(e) === (handle || "out"));
  return edge && getNode(graph, edge.target) ? edge.target : null;
}

// A graph with only a trigger node.
export function emptyGraph(trigger = defaultTrigger()) {
  return {
    nodes: [{ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { config: trigger } }],
    edges: [],
  };
}

// Strips canvas-only state (selection, measurements, decorations) so the stored graph stays minimal.
export function sanitizeGraph(graph) {
  const nodes = graphNodes(graph).map((n) => ({
    id: String(n.id),
    type: n.type,
    position: { x: Math.round(Number(n.position?.x) || 0), y: Math.round(Number(n.position?.y) || 0) },
    data: { config: n.data?.config && typeof n.data.config === "object" ? n.data.config : defaultNodeConfig(n.type) },
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graphEdges(graph)
    .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
    .map((e) => ({ id: e.id || edgeId(e.source, handleOf(e), e.target), source: e.source, sourceHandle: handleOf(e), target: e.target }));
  return { nodes, edges };
}

// The trigger config stored on the automation row, mirrored from the trigger node.
export function triggerFromGraph(graph) {
  return triggerNodeOf(graph)?.data?.config || null;
}

export function withTrigger(graph, trigger) {
  const nodes = graphNodes(graph);
  if (!nodes.some((n) => n.type === "trigger")) return { ...graph, nodes: [emptyGraph(trigger).nodes[0], ...nodes], edges: graphEdges(graph) };
  return { ...graph, nodes: nodes.map((n) => (n.type === "trigger" ? { ...n, data: { ...n.data, config: trigger } } : n)) };
}

export function reachableFrom(graph, startId) {
  const seen = new Set();
  const stack = startId ? [startId] : [];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of outgoingEdges(graph, id)) stack.push(e.target);
  }
  return seen;
}

// Node ids that sit on a cycle (a path that loops back to an earlier step).
export function nodesOnCycles(graph) {
  const onCycle = new Set();
  const state = new Map();
  const path = [];
  const visit = (id) => {
    state.set(id, 1);
    path.push(id);
    for (const e of outgoingEdges(graph, id)) {
      const s = state.get(e.target);
      if (s === 1) {
        for (let i = path.indexOf(e.target); i < path.length; i += 1) onCycle.add(path[i]);
      } else if (!s) {
        visit(e.target);
      }
    }
    path.pop();
    state.set(id, 2);
  };
  for (const n of graphNodes(graph)) if (!state.get(n.id)) visit(n.id);
  return onCycle;
}

// Steps in reading order: depth-first from the trigger, branches in handle order, then strays.
export function outlineGraph(graph) {
  const out = [];
  const seen = new Set();
  const walk = (id, depth, branch) => {
    if (!id || seen.has(id)) return;
    const node = getNode(graph, id);
    if (!node) return;
    seen.add(id);
    out.push({ node, depth, branch });
    const handles = nodeHandles(node);
    const multi = handles.length > 1;
    for (const h of handles) walk(nextNodeId(graph, id, h.id), multi ? depth + 1 : depth, multi ? h.label : branch);
  };
  walk(triggerNodeOf(graph)?.id, 0, null);
  for (const n of graphNodes(graph)) if (!seen.has(n.id)) out.push({ node: n, depth: 0, branch: null, stray: true });
  return out;
}

export function stepCount(graph) {
  return graphNodes(graph).filter((n) => n.type !== "trigger").length;
}

// Channels the graph sends on, in a stable order.
export function channelsUsed(graph) {
  const order = ["email", "sms", "whatsapp", "push"];
  const used = new Set(graphNodes(graph).map((n) => MESSAGE_CHANNELS[n.type]).filter(Boolean));
  return order.filter((c) => used.has(c));
}

// Earlier message nodes (ancestors of nodeId), for "engaged with an earlier message" conditions.
export function ancestorMessageNodes(graph, nodeId) {
  const seen = new Set();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop();
    for (const e of incomingEdges(graph, id)) {
      if (seen.has(e.source)) continue;
      seen.add(e.source);
      stack.push(e.source);
    }
  }
  return graphNodes(graph).filter((n) => seen.has(n.id) && n.type in MESSAGE_CHANNELS);
}

// Lays a recipe out top-down from a nested spec, with sequential ids n1, n2… (deterministic).
//   buildGraph(trigger, [ { type, config }, { type: "condition", config, branches: { yes: [...], no: [...] } } ])
export function buildGraph(trigger, sequence = []) {
  const nodes = [];
  const edges = [];
  let counter = 0;
  const nextId = () => `n${(counter += 1)}`;

  const lanes = (seq) =>
    Math.max(
      1,
      ...(seq || []).map((step) => (step.branches ? Object.values(step.branches).reduce((sum, child) => sum + lanes(child), 0) : 1)),
    );

  const place = (seq, laneStart, laneSpan, depth, from) => {
    let prev = from;
    let row = depth;
    for (const step of seq || []) {
      const id = nextId();
      const centre = laneStart + laneSpan / 2 - 0.5;
      const config = { ...defaultNodeConfig(step.type), ...(step.config || {}) };
      nodes.push({ id, type: step.type, position: { x: Math.round(centre * LANE_WIDTH), y: row * ROW_HEIGHT }, data: { config } });
      if (prev) edges.push({ id: edgeId(prev.id, prev.handle, id), source: prev.id, sourceHandle: prev.handle, target: id });
      row += 1;
      if (step.branches) {
        const node = nodes[nodes.length - 1];
        let cursor = laneStart;
        for (const h of nodeHandles(node)) {
          const child = step.branches[h.id] || [];
          const span = lanes(child);
          place(child, cursor, span, row, { id, handle: h.id });
          cursor += span;
        }
        return;
      }
      prev = { id, handle: "out" };
    }
  };

  const total = lanes(sequence);
  const root = { id: "trigger", type: "trigger", position: { x: Math.round((total / 2 - 0.5) * LANE_WIDTH), y: 0 }, data: { config: trigger } };
  nodes.push(root);
  place(sequence, 0, total, 1, { id: root.id, handle: "out" });
  return { nodes, edges };
}
