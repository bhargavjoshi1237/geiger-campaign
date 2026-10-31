"use client";

import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Trash2 } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@geiger/ui";
import { blockLabel, blockRule, documentSurface, renderBlockHtml } from "@/lib/email/blocks";
import { BLOCK_ICONS, DND_MOVE, DND_NEW, DND_SAVED, PALETTE } from "./block_meta";

// The editing canvas: each block rendered with the real email renderer, selectable, draggable and
// keyboard-movable (Alt+↑/↓), with drop zones between blocks for the palette and saved blocks.

const ACCEPTS = [DND_NEW, DND_MOVE, DND_SAVED];
const accepts = (e) => ACCEPTS.some((t) => e.dataTransfer?.types?.includes(t));

// Clicking a link inside a rendered block must select it, never navigate.
const swallowLinks = (e) => {
  if (e.target.closest?.("a")) e.preventDefault();
};

function BlockHtml({ block, brand, settings, nested }) {
  const html = useMemo(
    () => renderBlockHtml(block, { brand, settings, placeholders: true, showAllBlocks: true, nested }),
    [block, brand, settings, nested],
  );
  return <div onClickCapture={swallowLinks} dangerouslySetInnerHTML={{ __html: html }} />;
}

function DropZone({ onDrop, active }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        onDrop(e.dataTransfer);
      }}
      className={cn("relative transition-all", active ? "h-4" : "h-1")}
      aria-hidden="true"
    >
      <div className={cn("absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 rounded-full", over ? "bg-sky-500" : active ? "bg-sky-500/20" : "bg-transparent")} />
    </div>
  );
}

function BlockToolbar({ label, onMoveUp, onMoveDown, onDuplicate, onRemove, canUp, canDown }) {
  const tool = (Icon, text, onClick, disabled, danger) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={text}
      title={text}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("size-7 text-muted-foreground hover:bg-surface-active hover:text-foreground", danger && "hover:text-red-600 dark:hover:text-red-400")}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
  return (
    <div className="absolute -top-3.5 right-3 z-10 flex items-center gap-0.5 rounded-md border border-border bg-surface-subtle p-0.5 shadow-sm">
      <span className="px-1.5 text-[11px] font-medium text-text-secondary">{label}</span>
      {tool(ArrowUp, "Move up", onMoveUp, !canUp)}
      {tool(ArrowDown, "Move down", onMoveDown, !canDown)}
      {tool(Copy, "Duplicate", onDuplicate)}
      {tool(Trash2, "Delete", onRemove, false, true)}
    </div>
  );
}

function AddToColumn({ onAdd }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="h-7 w-full border border-dashed border-zinc-300 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700">
          <Plus className="h-3.5 w-3.5" /> Add block
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 border-border bg-surface-subtle">
        {PALETTE.filter((b) => b.type !== "columns").map((b) => (
          <DropdownMenuItem key={b.type} onSelect={() => onAdd(b.type)} className="cursor-pointer">
            <b.icon className="h-4 w-4 text-text-secondary" /> {b.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CanvasBlock({ block, index, count, ctx, nested = false }) {
  const { selectedId, onSelect, onMove, onDuplicate, onRemove, readOnly, brand, settings, onDragState } = ctx;
  const selected = selectedId === block.id;
  const rule = blockRule(block);
  const Icon = BLOCK_ICONS[block.type];

  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(block.id);
    } else if (e.key === "Escape") {
      onSelect(null);
    } else if (readOnly) {
      return;
    } else if (e.altKey && e.key === "ArrowUp") {
      e.preventDefault();
      onMove(block.id, -1);
    } else if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      onMove(block.id, 1);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove(block.id);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      onDuplicate(block.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${blockLabel(block.type)} block${selected ? ", selected" : ""}. Alt+arrow keys move it.`}
      aria-pressed={selected}
      draggable={!readOnly && !nested}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MOVE, block.id);
        e.dataTransfer.effectAllowed = "move";
        onDragState(true);
      }}
      onDragEnd={() => onDragState(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative cursor-pointer outline-none",
        selected ? "ring-2 ring-sky-500" : "hover:ring-1 hover:ring-sky-500/40 focus-visible:ring-2 focus-visible:ring-sky-500/70",
      )}
    >
      {selected && !readOnly ? (
        <BlockToolbar
          label={blockLabel(block.type)}
          canUp={index > 0}
          canDown={index < count - 1}
          onMoveUp={() => onMove(block.id, -1)}
          onMoveDown={() => onMove(block.id, 1)}
          onDuplicate={() => onDuplicate(block.id)}
          onRemove={() => onRemove(block.id)}
        />
      ) : null}
      {rule ? (
        <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
          <Eye className="h-3 w-3" /> Rule
        </span>
      ) : null}
      {block.type === "columns" && !nested ? (
        <ColumnsCanvas block={block} ctx={ctx} />
      ) : block.type === "html" ? (
        <div className="px-6 py-3">
          <div className="flex items-center gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-[11px] text-zinc-600">
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
            <span className="line-clamp-3 break-all">{block.props?.html?.trim() || "Empty HTML block"}</span>
          </div>
        </div>
      ) : (
        <BlockHtml block={block} brand={brand} settings={settings} nested={nested} />
      )}
    </div>
  );
}

function ColumnsCanvas({ block, ctx }) {
  const count = block.props?.count === 3 ? 3 : 2;
  const cols = (block.props?.columns || []).slice(0, count);
  const pad = Number(block.props?.padding ?? 12);
  return (
    <div className={cn("grid gap-3 px-6", count === 3 ? "grid-cols-3" : "grid-cols-2")} style={{ paddingTop: pad, paddingBottom: pad }}>
      {cols.map((col, c) => (
        <div
          key={c}
          className="min-w-0 space-y-1 rounded-sm outline outline-1 outline-dashed outline-zinc-200"
          onDragOver={(e) => {
            if (e.dataTransfer?.types?.includes(DND_NEW)) e.preventDefault();
          }}
          onDrop={(e) => {
            const type = e.dataTransfer.getData(DND_NEW);
            if (!type || type === "columns") return;
            e.preventDefault();
            e.stopPropagation();
            ctx.onAddToColumn(block.id, c, type);
          }}
        >
          {(col.blocks || []).map((child, i) => (
            <CanvasBlock key={child.id} block={child} index={i} count={col.blocks.length} ctx={ctx} nested />
          ))}
          {!ctx.readOnly ? <AddToColumn onAdd={(type) => ctx.onAddToColumn(block.id, c, type)} /> : null}
        </div>
      ))}
    </div>
  );
}

export function BlockCanvas({
  doc,
  brand,
  selectedId,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onDropAt,
  onAddToColumn,
  readOnly,
  dragging,
  onDragState,
}) {
  const surface = useMemo(() => documentSurface(doc?.settings, brand), [doc?.settings, brand]);
  const blocks = doc?.blocks || [];
  const ctx = { selectedId, onSelect, onMove, onDuplicate, onRemove, onAddToColumn, readOnly, brand, settings: doc?.settings, onDragState };

  return (
    <div className="overflow-x-auto rounded-lg p-4 sm:p-6" style={{ backgroundColor: surface.background }} onClick={() => onSelect(null)}>
      <div
        className="mx-auto py-4"
        style={{ maxWidth: surface.width, backgroundColor: surface.card, borderRadius: surface.radius, fontFamily: surface.font }}
      >
        {blocks.length === 0 ? (
          <div
            onDragOver={(e) => accepts(e) && e.preventDefault()}
            onDrop={(e) => {
              if (!accepts(e)) return;
              e.preventDefault();
              onDropAt(0, e.dataTransfer);
            }}
            className="mx-6 rounded-lg border border-dashed border-zinc-300 px-6 py-16 text-center text-sm text-zinc-500"
          >
            Drag a block here or pick one from the palette.
          </div>
        ) : null}
        {blocks.map((block, i) => (
          <React.Fragment key={block.id}>
            {!readOnly ? <DropZone active={dragging} onDrop={(dt) => onDropAt(i, dt)} /> : null}
            <CanvasBlock block={block} index={i} count={blocks.length} ctx={ctx} />
          </React.Fragment>
        ))}
        {!readOnly && blocks.length ? <DropZone active={dragging} onDrop={(dt) => onDropAt(blocks.length, dt)} /> : null}
      </div>
    </div>
  );
}

export default BlockCanvas;
