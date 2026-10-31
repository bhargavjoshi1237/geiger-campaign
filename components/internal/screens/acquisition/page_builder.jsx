"use client";

import React, { useState } from "react";
import { ArrowDown, ArrowUp, Copy, ImageIcon, Plus, Trash2, X } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@geiger/ui";
import { BLOCK_LABEL, BLOCK_TYPES, blockSummary, newBlock } from "@/lib/acquisition/blocks";
import { AssetPicker } from "@/components/internal/screens/content/asset_picker";

// Landing page block builder: an ordered outline of blocks (select one to edit it) and the selected
// block's inspector. The live preview sits next to it in the page editor.

function ImageField({ label, url, onChange, onPick, disabled, idp }) {
  return (
    <Field label={label} className="sm:col-span-2">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-card">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input id={`${idp}-url`} value={url || ""} onChange={(e) => onChange(e.target.value.trim())} placeholder="https://… or choose from the library" className="font-mono text-xs" disabled={disabled} aria-label={`${label} URL`} />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="bg-surface-card" onClick={onPick} disabled={disabled}>
              <ImageIcon className="h-3.5 w-3.5" /> Choose image
            </Button>
            {url ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")} disabled={disabled}>
                <X className="h-3.5 w-3.5" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Field>
  );
}

function BlockInspector({ block, forms, onChange, onPickImage, disabled }) {
  const p = block.props || {};
  const set = (key) => (value) => onChange({ ...block, props: { ...p, [key]: value } });
  const idp = `pb-${block.id}`;
  const text = (key, label, opts = {}) => (
    <Field label={label} htmlFor={`${idp}-${key}`} hint={opts.hint} className={opts.wide ? "sm:col-span-2" : undefined}>
      {opts.rows ? (
        <Textarea id={`${idp}-${key}`} rows={opts.rows} value={p[key] || ""} onChange={(e) => set(key)(e.target.value)} placeholder={opts.placeholder} disabled={disabled} />
      ) : (
        <Input id={`${idp}-${key}`} value={p[key] || ""} onChange={(e) => set(key)(e.target.value)} placeholder={opts.placeholder} disabled={disabled} className={opts.mono ? "font-mono" : undefined} />
      )}
    </Field>
  );

  if (block.type === "hero") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {text("eyebrow", "Eyebrow", { placeholder: "Optional short label" })}
        <Field label="Alignment">
          <Select value={p.align || "left"} onValueChange={set("align")} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Centered</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {text("heading", "Heading", { wide: true })}
        {text("subheading", "Supporting line", { wide: true, rows: 2 })}
        {text("ctaLabel", "Button label", { placeholder: "Leave blank for no button" })}
        {text("ctaHref", "Button link", { placeholder: "#form or https://…", mono: true })}
        <ImageField label="Image" url={p.imageUrl} onChange={set("imageUrl")} onPick={() => onPickImage(block, "imageUrl")} disabled={disabled} idp={idp} />
        {p.imageUrl ? text("imageAlt", "Image alt text", { wide: true, placeholder: "Describe the image for screen readers" }) : null}
      </div>
    );
  }
  if (block.type === "text") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {text("heading", "Heading", { wide: true, placeholder: "Optional" })}
        {text("body", "Body", { wide: true, rows: 7, hint: "Leave a blank line between paragraphs." })}
      </div>
    );
  }
  if (block.type === "image") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageField label="Image" url={p.url} onChange={set("url")} onPick={() => onPickImage(block, "url")} disabled={disabled} idp={idp} />
        {text("alt", "Alt text", { placeholder: "Describe the image for screen readers" })}
        {text("caption", "Caption", { placeholder: "Optional" })}
      </div>
    );
  }
  if (block.type === "form") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Form" hint="Only live forms accept submissions on the published page." className="sm:col-span-2">
          <Select value={p.formId || "page"} onValueChange={(v) => set("formId")(v === "page" ? "" : v)} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="page">Page default form</SelectItem>
              {forms.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                  {f.status !== "live" ? " (not live)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {text("heading", "Heading")}
        {text("description", "Description", { placeholder: "Optional" })}
      </div>
    );
  }
  if (block.type === "features") {
    const items = p.items || [];
    const setItem = (i, key, value) => set("items")(items.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
    return (
      <div className="space-y-4">
        {text("heading", "Heading")}
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-border bg-surface-card p-3 sm:grid-cols-[1fr_1.6fr_auto] sm:items-start">
              <Input value={item.title} onChange={(e) => setItem(i, "title", e.target.value)} placeholder="Title" aria-label={`Point ${i + 1} title`} disabled={disabled} />
              <Input value={item.body} onChange={(e) => setItem(i, "body", e.target.value)} placeholder="One sentence" aria-label={`Point ${i + 1} text`} disabled={disabled} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove point ${i + 1}`} disabled={disabled || items.length <= 1} onClick={() => set("items")(items.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" className="bg-surface-card" disabled={disabled || items.length >= 6} onClick={() => set("items")([...items, { title: "", body: "" }])}>
          <Plus className="h-3.5 w-3.5" /> Add point
        </Button>
      </div>
    );
  }
  if (block.type === "cta") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {text("heading", "Heading", { wide: true })}
        {text("body", "Supporting line", { wide: true, rows: 2, placeholder: "Optional" })}
        {text("buttonLabel", "Button label")}
        {text("buttonHref", "Button link", { placeholder: "#form or https://…", mono: true })}
      </div>
    );
  }
  return null;
}

export function PageBlockBuilder({ blocks, onChange, forms, projectId, disabled = false }) {
  const [selectedId, setSelectedId] = useState(blocks[0]?.id ?? null);
  const [picker, setPicker] = useState(null);
  const selected = blocks.find((b) => b.id === selectedId) || null;

  const update = (next) => onChange(blocks.map((b) => (b.id === next.id ? next : b)));
  const move = (index, dir) => {
    const to = index + dir;
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  const add = (type) => {
    const block = newBlock(type);
    const index = selected ? blocks.findIndex((b) => b.id === selected.id) + 1 : blocks.length;
    const next = [...blocks];
    next.splice(index, 0, block);
    onChange(next);
    setSelectedId(block.id);
  };
  const duplicate = (block) => {
    const copy = newBlock(block.type, structuredClone(block.props));
    const index = blocks.findIndex((b) => b.id === block.id);
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setSelectedId(copy.id);
  };
  const remove = (block) => {
    onChange(blocks.filter((b) => b.id !== block.id));
    if (selectedId === block.id) setSelectedId(null);
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
        {blocks.length === 0 ? <p className="px-4 py-6 text-center text-sm text-text-secondary">This page has no blocks. Add a hero to start.</p> : null}
        <ol className="divide-y divide-border">
          {blocks.map((block, index) => {
            const active = block.id === selectedId;
            return (
              <li key={block.id} className={cn("flex items-center gap-3 px-3 py-2.5", active ? "bg-surface-card" : "hover:bg-surface-hover")}>
                <button
                  type="button"
                  onClick={() => setSelectedId(block.id)}
                  aria-current={active ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-text-tertiary">{index + 1}</span>
                  <Badge variant={active ? "info" : "neutral"} className="shrink-0">
                    {BLOCK_LABEL[block.type] || block.type}
                  </Badge>
                  <span className="min-w-0 truncate text-sm text-foreground">{blockSummary(block)}</span>
                </button>
                {!disabled ? (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button variant="ghost" size="icon-sm" aria-label="Move block up" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Move block down" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Duplicate block" onClick={() => duplicate(block)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove block"
                      className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
                      onClick={() => remove(block)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        {!disabled ? (
          <div className="border-t border-border px-3 py-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <Plus className="h-4 w-4" /> Add block
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 border-border bg-surface-subtle">
                <DropdownMenuLabel className="text-text-secondary">{selected ? "Insert after the selected block" : "Add to the end"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {BLOCK_TYPES.map((t) => (
                  <DropdownMenuItem key={t.type} onSelect={() => add(t.type)} className="flex cursor-pointer flex-col items-start gap-0.5">
                    <span className="text-sm text-foreground">{t.label}</span>
                    <span className="text-xs text-text-secondary">{t.description}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="rounded-xl border border-border bg-surface-subtle p-5">
          <p className="mb-4 text-sm font-semibold text-foreground">{BLOCK_LABEL[selected.type]} block</p>
          <BlockInspector block={selected} forms={forms} onChange={update} onPickImage={(block, key) => setPicker({ blockId: block.id, key })} disabled={disabled} />
        </div>
      ) : (
        <p className="text-sm text-text-secondary">Select a block to edit it.</p>
      )}

      <AssetPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        projectId={projectId}
        onPick={(asset) => {
          const block = blocks.find((b) => b.id === picker?.blockId);
          if (block) update({ ...block, props: { ...block.props, [picker.key]: asset.url, ...(picker.key === "url" && !block.props.alt ? { alt: asset.altText } : {}) } });
          setPicker(null);
        }}
      />
    </div>
  );
}

export default PageBlockBuilder;
