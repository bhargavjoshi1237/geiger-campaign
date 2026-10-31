"use client";

import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { CircleAlert, TriangleAlert, Zap } from "lucide-react";
import { cn } from "@geiger/ui";

import { NODE_TYPES, nodeDefinition, nodeHandles, summarizeNode } from "@/lib/automations/steps";
import { triggerCatalogEntry } from "@/lib/automations/triggers";
import { ACCENT_CLASS, NODE_META, TRIGGER_ICONS, formatNumber } from "../constants";

// Title shown on a node card: the trigger's catalog label, otherwise the node type's label.
export function nodeTitle(node) {
  if (node?.type === "trigger") {
    const entry = triggerCatalogEntry(node.data?.config);
    if (entry?.key === "custom_event") return node.data?.config?.event || "Custom event";
    return entry?.label || "Choose a trigger";
  }
  return nodeDefinition(node?.type)?.label || "Step";
}

// Icon for a node: the trigger's catalog icon, otherwise the node type's.
export function NodeIcon({ node, className }) {
  const triggerKey = node?.type === "trigger" ? triggerCatalogEntry(node.data?.config)?.key : null;
  const Icon = (triggerKey ? TRIGGER_ICONS[triggerKey] : NODE_META[node?.type]?.icon) || Zap;
  return <Icon className={className} />;
}

// One card for every node type (mirrors Geiger Events' NodeCard): accent chip, kind label, title, a
// two-line summary, inline validation, live counts and one source handle per branch.
function NodeCard({ id, type, data, selected }) {
  const node = { id, type, data };
  const def = nodeDefinition(type);
  const accent = ACCENT_CLASS[NODE_META[type]?.accent] || ACCENT_CLASS.neutral;
  const handles = nodeHandles(node);
  const issues = data?.issues || [];
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  const counts = data?.counts;

  return (
    <div
      className={cn(
        "group w-[280px] rounded-xl border bg-surface-subtle p-3 shadow-md transition-colors",
        selected ? "border-foreground" : errors ? "border-red-500/40 hover:border-red-500/60" : "border-border hover:border-border-strong",
      )}
    >
      {type !== "trigger" ? <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-text-tertiary" /> : null}

      <div className="flex items-start gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", accent)}>
          <NodeIcon node={node} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{def?.kindLabel || "Step"}</p>
          <p className="truncate text-sm font-medium text-foreground">{nodeTitle(node)}</p>
          <p className="mt-0.5 line-clamp-2 min-h-8 text-xs text-text-secondary">
            {type === "trigger" ? data?.triggerSummary || "" : summarizeNode(node, data?.refs)}
          </p>
        </div>
        {errors ? (
          <CircleAlert className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-label={`${errors} ${errors === 1 ? "issue" : "issues"}`} />
        ) : warnings ? (
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label={`${warnings} ${warnings === 1 ? "warning" : "warnings"}`} />
        ) : null}
      </div>

      {counts ? (
        <div className="mt-2.5 flex items-center gap-3 border-t border-border pt-2 text-[11px] tabular-nums text-text-tertiary">
          {type === "trigger" ? (
            <span>
              <span className="font-medium text-text-secondary">{formatNumber(counts.ok)}</span> enrolled
            </span>
          ) : (
            <>
              <span>
                <span className="font-medium text-text-secondary">{formatNumber(counts.current)}</span> here
              </span>
              <span>
                <span className="font-medium text-text-secondary">{formatNumber(counts.ok)}</span> passed
              </span>
              {counts.failed ? <span className="text-red-600 dark:text-red-400">{formatNumber(counts.failed)} failed</span> : null}
            </>
          )}
        </div>
      ) : null}

      {handles.length > 1 ? (
        <div className="relative mt-2 h-3.5" aria-hidden="true">
          {handles.map((h, i) => (
            <span
              key={h.id}
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-text-tertiary"
              style={{ left: `${((i + 1) / (handles.length + 1)) * 100}%` }}
            >
              {h.label}
            </span>
          ))}
        </div>
      ) : null}

      {handles.map((h, i) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={Position.Bottom}
          className="!h-2 !w-2 !border-0 !bg-foreground"
          style={handles.length > 1 ? { left: `${((i + 1) / (handles.length + 1)) * 100}%` } : undefined}
        />
      ))}
    </div>
  );
}

const AutomationNode = memo(NodeCard);

// ReactFlow nodeTypes: every automation node type renders through the same card.
export const nodeTypes = Object.fromEntries(NODE_TYPES.map((t) => [t.key, AutomationNode]));
