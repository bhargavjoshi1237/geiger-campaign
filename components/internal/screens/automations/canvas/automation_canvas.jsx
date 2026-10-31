"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Panel,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { GripVertical, Plus } from "lucide-react";

import { NODE_GROUPS, NODE_TYPES, defaultNodeConfig, nodeHandles } from "@/lib/automations/steps";
import { NODE_WIDTH, ROW_HEIGHT, edgeId, getNode, graphEdges, graphNodes, handleOf, newNodeId, outlineGraph } from "@/lib/automations/graph";
import { nodeTypes } from "./automation_nodes";
import { CANVAS_FIT_VIEW, SNAP_SIZES, ZoomControls } from "./zoom_controls";
import { NODE_META } from "../constants";

const DND_MIME = "application/geiger-automation-node";

// Marching dots on a live automation's edges; the dash pattern tiles React Flow's dashdraw keyframe.
const LIVE_EDGE_STYLE = { strokeDasharray: "2 3", strokeLinecap: "round", strokeWidth: 1.5 };

const PALETTE = NODE_GROUPS.map((g) => ({ ...g, items: NODE_TYPES.filter((t) => t.group === g.key) }));

// The first branch of a node with nothing connected to it yet.
function freeHandle(graph, node) {
  return nodeHandles(node).find((h) => !graphEdges(graph).some((e) => e.source === node.id && handleOf(e) === h.id)) || null;
}

// Where a click-added step goes: under the selected node (or the last open end of the path), wired to it.
function placeNewNode(graph, selectedId, type) {
  const id = newNodeId();
  const nodes = graphNodes(graph);
  let from = selectedId ? getNode(graph, selectedId) : null;
  if (from && !freeHandle(graph, from)) from = null;
  if (!from) {
    const open = outlineGraph(graph)
      .map((o) => o.node)
      .filter((n) => !n.stray && freeHandle(graph, n) && nodeHandles(n).length === 1);
    from = open[open.length - 1] || null;
  }
  const handle = from ? freeHandle(graph, from) : null;
  const handles = from ? nodeHandles(from) : [];
  const offset = handles.length > 1 ? (handles.findIndex((h) => h.id === handle?.id) - (handles.length - 1) / 2) * (NODE_WIDTH + 40) : 0;
  const lowest = nodes.reduce((max, n) => Math.max(max, Number(n.position?.y) || 0), 0);
  const position = from
    ? { x: Math.round((from.position?.x || 0) + offset), y: Math.round((from.position?.y || 0) + ROW_HEIGHT) }
    : { x: 0, y: lowest + ROW_HEIGHT };
  const node = { id, type, position, data: { config: defaultNodeConfig(type) } };
  const edges = from && handle ? [...graphEdges(graph), { id: edgeId(from.id, handle.id, id), source: from.id, sourceHandle: handle.id, target: id }] : graphEdges(graph);
  return { graph: { ...graph, nodes: [...nodes, node], edges }, id };
}

function Palette({ onAdd }) {
  const onDragStart = (type) => (event) => {
    event.dataTransfer.setData(DND_MIME, type);
    event.dataTransfer.effectAllowed = "move";
  };
  return (
    <Panel position="top-right">
      <div className="w-52 rounded-xl border border-border bg-surface-card p-2 shadow-md">
        <div className="max-h-[56vh] space-y-2 overflow-y-auto">
          {PALETTE.map((group) => (
            <div key={group.key}>
              <p className="px-1 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{group.label}</p>
              {group.items.map((item) => {
                const Icon = NODE_META[item.key]?.icon || Plus;
                return (
                  <button
                    key={item.key}
                    type="button"
                    draggable
                    onDragStart={onDragStart(item.key)}
                    onClick={() => onAdd(item.key)}
                    title={`${item.description} Drag onto the canvas, or click to add after the selected step.`}
                    className="group flex w-full cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-text-tertiary transition-colors group-hover:text-text-secondary" />
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function CanvasInner({ graph, onGraphChange, selectedId, onSelect, issuesByNode, counts, refs, triggerSummary, active, readOnly }) {
  const { resolvedTheme } = useTheme();
  const { screenToFlowPosition } = useReactFlow();
  const [snap, setSnap] = useState(false);
  const [snapSize, setSnapSize] = useState(SNAP_SIZES[1]);
  const [locked, setLocked] = useState(false);
  const frozen = readOnly || locked;

  const nodes = useMemo(
    () =>
      graphNodes(graph).map((n) => ({
        ...n,
        selected: n.id === selectedId,
        deletable: !frozen && n.type !== "trigger",
        data: {
          ...n.data,
          issues: issuesByNode?.[n.id],
          counts: counts?.[n.id],
          refs,
          triggerSummary: n.type === "trigger" ? triggerSummary : undefined,
        },
      })),
    [graph, selectedId, frozen, issuesByNode, counts, refs, triggerSummary],
  );

  const edges = useMemo(
    () => graphEdges(graph).map((e) => ({ ...e, type: "smoothstep", ...(active ? { animated: true, style: LIVE_EDGE_STYLE } : {}) })),
    [graph, active],
  );

  const onNodesChange = useCallback(
    (changes) => {
      const relevant = changes.filter((c) => c.type !== "select" && !(c.type === "remove" && getNode(graph, c.id)?.type === "trigger"));
      if (!relevant.length) return;
      const removed = new Set(relevant.filter((c) => c.type === "remove").map((c) => c.id));
      const next = applyNodeChanges(relevant, graphNodes(graph));
      onGraphChange({
        ...graph,
        nodes: next,
        edges: removed.size ? graphEdges(graph).filter((e) => !removed.has(e.source) && !removed.has(e.target)) : graphEdges(graph),
      });
      if (selectedId && removed.has(selectedId)) onSelect(null);
    },
    [graph, onGraphChange, selectedId, onSelect],
  );

  const onEdgesChange = useCallback(
    (changes) => {
      const relevant = frozen ? changes.filter((c) => c.type === "select") : changes;
      if (relevant.length) onGraphChange({ ...graph, edges: applyEdgeChanges(relevant, graphEdges(graph)) });
    },
    [graph, frozen, onGraphChange],
  );

  // One edge per branch: connecting a used branch replaces its old edge.
  const onConnect = useCallback(
    (conn) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const handle = conn.sourceHandle || "out";
      const kept = graphEdges(graph).filter((e) => !(e.source === conn.source && handleOf(e) === handle));
      onGraphChange({ ...graph, edges: [...kept, { id: edgeId(conn.source, handle, conn.target), source: conn.source, sourceHandle: handle, target: conn.target }] });
    },
    [graph, onGraphChange],
  );

  const isValidConnection = useCallback(
    (conn) => conn.source !== conn.target && getNode(graph, conn.target)?.type !== "trigger",
    [graph],
  );

  const addNode = useCallback(
    (type) => {
      if (frozen) return;
      const placed = placeNewNode(graph, selectedId, type);
      onGraphChange(placed.graph);
      onSelect(placed.id);
    },
    [graph, selectedId, frozen, onGraphChange, onSelect],
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(DND_MIME);
      if (!type || frozen) return;
      const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = newNodeId();
      onGraphChange({
        ...graph,
        nodes: [...graphNodes(graph), { id, type, position: { x: Math.round(p.x - NODE_WIDTH / 2), y: Math.round(p.y - 30) }, data: { config: defaultNodeConfig(type) } }],
      });
      onSelect(id);
    },
    [graph, frozen, screenToFlowPosition, onGraphChange, onSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      onDrop={onDrop}
      onDragOver={onDragOver}
      nodeTypes={nodeTypes}
      colorMode={resolvedTheme === "light" ? "light" : "dark"}
      proOptions={{ hideAttribution: true }}
      snapToGrid={snap}
      snapGrid={[snapSize, snapSize]}
      nodesDraggable={!frozen}
      nodesConnectable={!frozen}
      edgesReconnectable={false}
      minZoom={0.2}
      maxZoom={2}
      fitView
      fitViewOptions={CANVAS_FIT_VIEW}
      deleteKeyCode={frozen ? null : ["Backspace", "Delete"]}
      className="bg-background"
    >
      <Background color="var(--canvas-dots)" gap={snap ? snapSize : 12} size={1} variant="dots" />
      <ZoomControls
        snap={snap}
        onSnapChange={setSnap}
        snapSize={snapSize}
        onSnapSizeChange={setSnapSize}
        locked={locked}
        onLockedChange={setLocked}
        showLock={!readOnly}
      />
      {frozen ? null : <Palette onAdd={addNode} />}
    </ReactFlow>
  );
}

// Node canvas for an automation graph (controlled: the editor owns the graph and the selection).
export function AutomationCanvas(props) {
  return (
    <div className="h-[70vh] min-h-[480px] w-full overflow-hidden rounded-xl border border-border bg-background">
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export default AutomationCanvas;
