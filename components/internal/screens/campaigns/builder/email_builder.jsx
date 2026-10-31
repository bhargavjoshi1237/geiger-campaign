"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, Copy, Eye, Loader2, PencilRuler, Redo2, SquareStack, Trash2, Undo2 } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";
import { blockLabel, cloneBlock, createBlock, renderEmailDocument } from "@/lib/email/blocks";
import { applyMergeTags, contactMergeData } from "@/lib/email/merge_tags";
import { listContacts } from "@/lib/supabase/contacts";
import { createContentBlock, markContentBlockUsed } from "@/lib/supabase/content_blocks";
import { getUser } from "@/lib/supabase/user";
import { BLOCK_ICONS, DND_NEW, DND_MOVE, DND_SAVED, PALETTE } from "./block_meta";
import { BlockCanvas } from "./block_canvas";
import { BlockFields, DocumentSettingsFields, VisibilityRuleEditor } from "./block_fields";
import { DEVICE_TABS, EmailPreviewFrame } from "./email_preview";
import {
  duplicateBlock,
  insertAfter,
  insertBlock,
  locate,
  moveBlock,
  moveTopLevel,
  removeBlock,
  setBlockRule,
  setColumnCount,
  updateBlockProps,
} from "./doc_ops";
import { useBuilderResources } from "./use_builder_resources";

const MODES = [
  { value: "edit", label: "Edit", icon: PencilRuler },
  { value: "preview", label: "Preview", icon: Eye },
];

const HISTORY_LIMIT = 50;
const COALESCE_MS = 900;
const NO_CONTACT = "__none";

function SaveBlockDialog({ open, onOpenChange, block, onSave }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onSave({ name: name.trim(), description: description.trim() });
    setSaving(false);
    if (ok) {
      setName("");
      setDescription("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as content block</DialogTitle>
          <DialogDescription>
            Saves this {block ? blockLabel(block.type).toLowerCase() : "block"} so it can be inserted into any email.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Block name" htmlFor="save-block-name">
            <Input id="save-block-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard sign-off" autoFocus />
          </Field>
          <Field label="Description" htmlFor="save-block-desc">
            <Textarea id="save-block-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When to use it (optional)" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Palette({ onAdd, onDragState, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PALETTE.map((b) => (
        <button
          key={b.type}
          type="button"
          draggable={!disabled}
          disabled={disabled}
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_NEW, b.type);
            e.dataTransfer.effectAllowed = "copy";
            onDragState(true);
          }}
          onDragEnd={() => onDragState(false)}
          onClick={() => onAdd(b.type)}
          title={b.description}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface-card px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"
        >
          <b.icon className="h-4 w-4" />
          {b.label}
        </button>
      ))}
    </div>
  );
}

function SavedBlocksList({ blocks, onInsert, onDragState, disabled }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blocks.filter((b) => !q || `${b.name} ${b.description}`.toLowerCase().includes(q));
  }, [blocks, query]);

  if (!blocks.length) {
    return <p className="text-xs text-text-secondary">Select a block and use “Save as block” to reuse it across emails.</p>;
  }
  return (
    <div className="space-y-2">
      {blocks.length > 6 ? (
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter…" aria-label="Filter saved blocks" className="h-8 bg-surface-card" />
      ) : null}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {filtered.map((b) => {
          const Icon = BLOCK_ICONS[b.blockType] || SquareStack;
          return (
            <button
              key={b.id}
              type="button"
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_SAVED, b.id);
                e.dataTransfer.effectAllowed = "copy";
                onDragState(true);
              }}
              onDragEnd={() => onDragState(false)}
              onClick={() => onInsert(b)}
              title={b.description || b.name}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              <span className="truncate">{b.name}</span>
            </button>
          );
        })}
        {filtered.length === 0 ? <p className="px-2 text-xs text-text-secondary">No saved blocks match.</p> : null}
      </div>
    </div>
  );
}

// The three-pane email builder: palette + saved blocks, canvas / preview, properties. `doc` is controlled.
// Pass `resources` (useBuilderResources) when the host already loaded them.
export function EmailBuilder({ projectId, doc, onChange, subject = "", preheader = "", readOnly = false, resources, className }) {
  const own = useBuilderResources(resources ? null : projectId);
  const { brand, groups, savedBlocks, setSavedBlocks } = resources || own;
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("edit");
  const [device, setDevice] = useState("desktop");
  const [dragging, setDragging] = useState(false);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [contacts, setContacts] = useState(null);
  const [previewContactId, setPreviewContactId] = useState(NO_CONTACT);
  const [applyRules, setApplyRules] = useState(true);
  const lastEdit = useRef({ key: null, at: 0 });

  const commit = useCallback(
    (next, coalesceKey = null) => {
      if (readOnly || next === doc) return;
      const now = Date.now();
      const coalesce = coalesceKey && lastEdit.current.key === coalesceKey && now - lastEdit.current.at < COALESCE_MS;
      lastEdit.current = { key: coalesceKey, at: now };
      if (!coalesce) setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), doc]);
      setFuture([]);
      onChange(next);
    },
    [doc, onChange, readOnly],
  );

  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [doc, ...f]);
    lastEdit.current = { key: null, at: 0 };
    onChange(prev);
  };

  const redo = () => {
    if (!future.length) return;
    const [next, ...rest] = future;
    setFuture(rest);
    setPast((p) => [...p, doc]);
    lastEdit.current = { key: null, at: 0 };
    onChange(next);
  };

  const selected = selectedId ? locate(doc, selectedId)?.block || null : null;

  const add = (type) => {
    const block = createBlock(type);
    commit(insertAfter(doc, block, selectedId));
    setSelectedId(block.id);
  };

  const insertSaved = (saved, index) => {
    if (!saved?.block?.type) return;
    const block = cloneBlock(saved.block);
    commit(index == null ? insertAfter(doc, block, selectedId) : insertBlock(doc, block, { index }));
    setSelectedId(block.id);
    markContentBlockUsed(saved).then((updated) => {
      if (updated) setSavedBlocks((list) => list.map((b) => (b.id === updated.id ? updated : b)));
    });
  };

  const onDropAt = (index, dt) => {
    setDragging(false);
    const type = dt.getData(DND_NEW);
    const moveId = dt.getData(DND_MOVE);
    const savedId = dt.getData(DND_SAVED);
    if (type) {
      const block = createBlock(type);
      commit(insertBlock(doc, block, { index }));
      setSelectedId(block.id);
    } else if (moveId) {
      commit(moveTopLevel(doc, moveId, index));
    } else if (savedId) {
      insertSaved(savedBlocks.find((b) => b.id === savedId), index);
    }
  };

  const remove = (id) => {
    commit(removeBlock(doc, id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicate = (id) => {
    const result = duplicateBlock(doc, id);
    commit(result.doc);
    if (result.id) setSelectedId(result.id);
  };

  const setProps = (patch) => {
    if (!selected) return;
    if ("count" in patch && selected.type === "columns") commit(setColumnCount(doc, selected.id, patch.count));
    else commit(updateBlockProps(doc, selected.id, patch), `${selected.id}:${Object.keys(patch).join(",")}`);
  };

  const setSettings = (patch) => commit({ ...doc, settings: { ...(doc.settings || {}), ...patch } }, `settings:${Object.keys(patch).join(",")}`);

  const saveBlock = async ({ name, description }) => {
    if (!selected) return false;
    const user = await getUser();
    const created = await createContentBlock(projectId, {
      id: crypto.randomUUID(),
      name,
      description,
      block: cloneBlock(selected),
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't save the block.");
      return false;
    }
    setSavedBlocks((list) => [created, ...list]);
    toast.success(`Saved “${name}” to content blocks.`);
    return true;
  };

  const changeMode = (next) => {
    setMode(next);
    if (next === "preview" && contacts === null && projectId) {
      listContacts(projectId, { limit: 200 }).then((rows) => setContacts(rows ?? []));
    }
  };

  const previewContact = (contacts || []).find((c) => c.id === previewContactId) || null;
  const mergeData = useMemo(() => (previewContact ? contactMergeData(previewContact) : {}), [previewContact]);
  const preview = useMemo(
    () =>
      mode === "preview"
        ? renderEmailDocument(doc, { brand, mergeData, preheader, subject, placeholders: true, showAllBlocks: !applyRules })
        : null,
    [mode, doc, brand, mergeData, preheader, subject, applyRules],
  );

  const onKeyDown = (e) => {
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  };

  return (
    <div className={cn("grid grid-cols-1 gap-4 xl:grid-cols-[200px_minmax(0,1fr)_320px]", className)} onKeyDown={onKeyDown}>
      <div className="space-y-4">
        {!readOnly ? (
          <SectionCard title="Blocks" contentClassName="p-3">
            <Palette onAdd={add} onDragState={setDragging} disabled={mode !== "edit"} />
          </SectionCard>
        ) : null}
        <SectionCard title="Saved blocks" contentClassName="p-3">
          <SavedBlocksList blocks={savedBlocks} onInsert={(b) => insertSaved(b)} onDragState={setDragging} disabled={readOnly || mode !== "edit"} />
        </SectionCard>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedTabs tabs={MODES} value={mode} onChange={changeMode} className="w-auto" />
          {mode === "edit" ? (
            !readOnly ? (
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Undo" onClick={undo} disabled={!past.length} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Redo" onClick={redo} disabled={!future.length} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
                  <Redo2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Badge variant="outline">Read only</Badge>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={previewContactId} onValueChange={setPreviewContactId}>
                <SelectTrigger className="h-9 w-56 bg-surface-card" aria-label="Preview as contact">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CONTACT}>No contact (fallbacks)</SelectItem>
                  {(contacts || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <Switch checked={applyRules} onCheckedChange={setApplyRules} aria-label="Apply display rules" />
                Display rules
              </label>
              <SegmentedTabs tabs={DEVICE_TABS} value={device} onChange={setDevice} buttonClassName="px-2" className="w-auto" />
            </div>
          )}
        </div>

        {mode === "edit" ? (
          <BlockCanvas
            doc={doc}
            brand={brand}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, delta) => commit(moveBlock(doc, id, delta))}
            onDuplicate={duplicate}
            onRemove={remove}
            onDropAt={onDropAt}
            onAddToColumn={(parentId, columnIndex, type) => {
              const block = createBlock(type);
              commit(insertBlock(doc, block, { parentId, columnIndex }));
              setSelectedId(block.id);
            }}
            readOnly={readOnly}
            dragging={dragging}
            onDragState={setDragging}
          />
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-subtle px-4 py-3">
              <p className="truncate text-sm font-medium text-foreground">{applyMergeTags(subject, mergeData) || "No subject yet"}</p>
              <p className="truncate text-xs text-text-secondary">{applyMergeTags(preheader, mergeData) || "No preheader"}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface-card p-4">
              <EmailPreviewFrame html={preview?.html} device={device} />
            </div>
            {applyRules && preview?.hiddenBlockIds?.length ? (
              <p className="text-xs text-text-secondary">
                {preview.hiddenBlockIds.length} {preview.hiddenBlockIds.length === 1 ? "block is" : "blocks are"} hidden by display rules for {previewContact ? previewContact.name : "a contact with no data"}.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <SectionCard
        title={selected ? blockLabel(selected.type) : "Email settings"}
        description={selected ? null : "Applies to the whole email. Select a block to edit it."}
        action={
          selected && !readOnly ? (
            <div className="flex items-center gap-0.5">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Save as content block" onClick={() => setSaveOpen(true)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
                <BookmarkPlus className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Duplicate block" onClick={() => duplicate(selected.id)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete block" onClick={() => remove(selected.id)} className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null
        }
        contentClassName="max-h-[calc(100dvh-14rem)] overflow-y-auto p-4"
      >
        {selected ? (
          <div className="space-y-5">
            <BlockFields block={selected} set={setProps} groups={groups} projectId={projectId} disabled={readOnly} />
            {selected.type !== "spacer" ? (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Display rule</p>
                <VisibilityRuleEditor rule={selected.visibleIf || null} onChange={(rule) => commit(setBlockRule(doc, selected.id, rule), `${selected.id}:rule`)} groups={groups} disabled={readOnly} />
              </div>
            ) : null}
          </div>
        ) : (
          <DocumentSettingsFields settings={doc?.settings} set={setSettings} groups={groups} disabled={readOnly} />
        )}
      </SectionCard>

      <SaveBlockDialog open={saveOpen} onOpenChange={setSaveOpen} block={selected} onSave={saveBlock} />
    </div>
  );
}

export default EmailBuilder;
