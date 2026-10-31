"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Blocks, Copy, Eye, FileText, Loader2, Pencil, PencilRuler, Plus, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  createContentBlock,
  listContentBlocks,
  softDeleteContentBlock,
  updateContentBlock,
} from "@/lib/supabase/content_blocks";
import { getUser } from "@/lib/supabase/user";
import { BLOCK_LIBRARY, blockLabel, blockRule, cloneBlock, createBlock, renderEmailDocument } from "@/lib/email/blocks";
import { describeCondition } from "@/lib/email/conditions";
import { BlockFields, VisibilityRuleEditor } from "./builder/block_fields";
import { BLOCK_ICONS, BLOCK_TYPE_OPTIONS } from "./builder/block_meta";
import { setBlockRule, setColumnCount, updateBlockProps } from "./builder/doc_ops";
import { EmailPreviewFrame } from "./builder/email_preview";
import { useBuilderResources } from "./builder/use_builder_resources";
import { DESTRUCTIVE_BUTTON, OUTLINE_BUTTON, formatDate, formatDateTime, formatNumber } from "./constants";
import {
  ActionMenu,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  InlineTitleInput,
  Input,
  LoadingArea,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  Textarea,
  Toolbar,
} from "@geiger/ui";

const TYPE_FILTER_OPTIONS = [{ value: "all", label: "All types" }, ...BLOCK_TYPE_OPTIONS];
const RULE_FILTER_OPTIONS = [
  { value: "all", label: "Any audience" },
  { value: "rule", label: "Display rule" },
  { value: "everyone", label: "Shown to everyone" },
];

const BLOCK_NAV = [
  { key: "design", label: "Design", icon: PencilRuler, desc: "The block's content and styling. Changes apply to emails it's inserted into from now on." },
  { key: "audience", label: "Display rule", icon: Eye, desc: "Show the block only to recipients who match a condition on their contact data." },
  { key: "details", label: "Details", icon: FileText, desc: "How the block is listed in the builder's saved blocks panel." },
  { key: "usage", label: "Usage", icon: BarChart3, desc: "How often the block has been inserted into an email." },
];

const EMPTY_FORM = { name: "", type: "heading", description: "" };
const DAY = 24 * 3600e3;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const insertedLabel = (n) => `${formatNumber(n)} ${n === 1 ? "time" : "times"}`;

// The block alone in an email shell, without the footer, for previews.
const blockPreviewHtml = (block, brand) =>
  renderEmailDocument({ blocks: [block], settings: { includeFooter: false } }, { brand, placeholders: true, showAllBlocks: true }).html;

function TypeLabel({ type }) {
  const Icon = BLOCK_ICONS[type] || FileText;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {blockLabel(type)}
    </span>
  );
}

function CreateBlockDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Give the block a name first.");
      return;
    }
    setSaving(true);
    const ok = await onCreate(form);
    setSaving(false);
    if (ok) {
      setForm(EMPTY_FORM);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New content block</DialogTitle>
          <DialogDescription>Saved blocks appear in the Email Builder&apos;s saved blocks panel, ready to drop into any email.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Block name" htmlFor="cb-name">
            <Input
              id="cb-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Summit registration button"
              autoFocus
            />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={set("type")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOCK_LIBRARY.map((b) => (
                  <SelectItem key={b.type} value={b.type}>
                    {b.label} · <span className="text-text-secondary">{b.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description" htmlFor="cb-desc" hint="Optional. Helps teammates pick the right block.">
            <Textarea id="cb-desc" value={form.description} onChange={(e) => set("description")(e.target.value)} placeholder="What the block contains and when to use it" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (b) => ({ name: b.name, description: b.description, block: b.block?.type ? b.block : createBlock(b.blockType) });

// Field forms for a block and, for columns, every block inside its columns.
function DesignFields({ block, setProps, setCount, groups, projectId, disabled }) {
  const fields = (b) => (
    <BlockFields
      block={b}
      set={(patch) => ("count" in patch && b.type === "columns" ? setCount(b.id, patch.count) : setProps(b.id, patch))}
      groups={groups}
      projectId={projectId}
      disabled={disabled}
    />
  );
  if (block.type !== "columns") return fields(block);
  return (
    <div className="grid gap-5">
      {fields(block)}
      {(block.props?.columns || []).map((col, i) => (
        <div key={i} className="grid gap-3 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Column {i + 1}</p>
          {(col.blocks || []).length ? (
            col.blocks.map((child) => (
              <div key={child.id} className="grid gap-3 rounded-lg border border-border bg-surface-card p-3">
                <TypeLabel type={child.type} />
                {fields(child)}
              </div>
            ))
          ) : (
            <p className="text-sm text-text-secondary">Empty. Add blocks to this column in the Email Builder.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function BlockEditor({ record, projectId, resources, canEdit, onBack, onSaved, onDuplicate, onDelete }) {
  const baseline = useMemo(() => toDraft(record), [record]);
  const [draft, setDraft] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const dirty = !same(draft, baseline);
  const readOnly = !canEdit;
  const { brand, groups } = resources;

  const wrap = (fn) => setDraft((d) => ({ ...d, block: fn({ blocks: [d.block] }).blocks[0] }));
  const setProps = (id, patch) => wrap((doc) => updateBlockProps(doc, id, patch));
  const setCount = (id, count) => wrap((doc) => setColumnCount(doc, id, count));
  const setRule = (rule) => wrap((doc) => setBlockRule(doc, draft.block.id, rule));

  const previewHtml = useMemo(() => blockPreviewHtml(draft.block, brand), [draft.block, brand]);
  const fieldLabel = (key) => groups.flatMap((g) => g.fields).find((f) => f.key === key)?.label || key;
  const rule = blockRule(draft.block);

  const save = async () => {
    setSaving(true);
    const updated = await updateContentBlock(record.id, {
      name: draft.name.trim() || "Untitled block",
      description: draft.description,
      block: draft.block,
      blockType: draft.block.type,
    });
    setSaving(false);
    if (!updated) {
      toast.error("Couldn't save the block.");
      return null;
    }
    onSaved(updated);
    toast.success("Block saved.");
    return updated;
  };

  return (
    <>
      <EditorShell
        back={{ label: "Back", onClick: () => (dirty ? setLeaveOpen(true) : onBack()) }}
        title={
          <InlineTitleInput
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            aria-label="Block name"
            placeholder="Untitled block"
            disabled={readOnly}
            className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          />
        }
        badges={
          <>
            <Badge variant="neutral">
              <TypeLabel type={draft.block.type} />
            </Badge>
            {rule ? <Badge variant="info">Display rule</Badge> : null}
            <span className="text-xs text-text-tertiary">Inserted {insertedLabel(record.usageCount)} · Edited {formatDateTime(record.updatedAt)}</span>
          </>
        }
        actions={
          <>
            <ActionMenu
              label="More block actions"
              triggerClassName="size-9"
              items={[
                canEdit && { label: "Duplicate", icon: Copy, onSelect: () => onDuplicate(record) },
                { separator: true },
                canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDelete(record) },
              ]}
            />
            {canEdit ? (
              <Button disabled={!dirty || saving} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </Button>
            ) : null}
          </>
        }
        nav={BLOCK_NAV}
        defaultSection="design"
      >
        {({ active }) => (
          <>
            {active === "design" ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <SectionCard bare title="Block content" description="The text, media and styling inside this block.">
                  <DesignFields block={draft.block} setProps={setProps} setCount={setCount} groups={groups} projectId={projectId} disabled={readOnly} />
                </SectionCard>
                <SectionCard title="Preview" description="Rendered with your brand kit. Merge tags show their fallback.">
                  <EmailPreviewFrame html={previewHtml} minHeight={160} title="Block preview" />
                </SectionCard>
              </div>
            ) : null}
            {active === "audience" ? (
              <SectionCard bare title="Who sees this block" description={rule ? describeCondition(rule, fieldLabel) : "Everyone who receives the email."}>
                <VisibilityRuleEditor rule={draft.block.visibleIf || null} onChange={setRule} groups={groups} disabled={readOnly} />
              </SectionCard>
            ) : null}
            {active === "details" ? (
              <SectionCard bare title="Block details" description="How your team recognises this block when inserting it.">
                <div className="grid gap-4">
                  <Field label="Block name" htmlFor="cbe-name">
                    <Input id="cbe-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} disabled={readOnly} />
                  </Field>
                  <Field label="Description" htmlFor="cbe-desc">
                    <Textarea id="cbe-desc" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="What the block contains and when to use it" disabled={readOnly} />
                  </Field>
                </div>
              </SectionCard>
            ) : null}
            {active === "usage" ? (
              <SectionCard bare title="Usage history" description="How often and how recently this block has been inserted.">
                <SettingsList>
                  <SettingRow title="Inserted into emails" description="Counted each time someone drops the block into a campaign or template." control={<span className="text-sm tabular-nums text-foreground">{insertedLabel(record.usageCount)}</span>} />
                  <SettingRow title="Last inserted" control={<span className="text-sm text-muted-foreground">{record.lastUsedAt ? formatDateTime(record.lastUsedAt) : "Never"}</span>} />
                  <SettingRow title="Created" control={<span className="text-sm text-muted-foreground">{formatDateTime(record.createdAt)}</span>} />
                  <SettingRow title="Last edited" control={<span className="text-sm text-muted-foreground">{formatDateTime(record.updatedAt)}</span>} />
                </SettingsList>
                <p className="mt-3 text-xs text-text-secondary">Inserting copies the block, so edits here don&apos;t change emails it was already added to.</p>
              </SectionCard>
            ) : null}
          </>
        )}
      </EditorShell>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>Your edits to this block haven&apos;t been saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button
              variant="outline"
              className={OUTLINE_BUTTON}
              onClick={() => {
                setLeaveOpen(false);
                onBack();
              }}
            >
              Discard
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                if (await save()) {
                  setLeaveOpen(false);
                  onBack();
                }
              }}
            >
              Save and leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ContentBlocksScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const resources = useBuilderResources(projectId);
  const [blocks, setBlocks] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ruleFilter, setRuleFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const loading = loadedFor !== projectId;
  const canEdit = can("campaign.content.edit");

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listContentBlocks(projectId).then((rows) => {
      if (!alive) return;
      if (rows === null) toast.error("Couldn't load content blocks.");
      setBlocks(rows ?? []);
      setLoadedAt(Date.now());
      setLoadedFor(projectId);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blocks.filter((b) => {
      if (typeFilter !== "all" && b.blockType !== typeFilter) return false;
      const hasRule = !!blockRule(b.block);
      if (ruleFilter === "rule" && !hasRule) return false;
      if (ruleFilter === "everyone" && hasRule) return false;
      if (q && !`${b.name} ${b.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [blocks, query, typeFilter, ruleFilter]);

  const stats = useMemo(() => {
    const since = loadedAt - 30 * DAY;
    return [
      { label: "Saved blocks", value: formatNumber(blocks.length) },
      { label: "Times inserted", value: formatNumber(blocks.reduce((s, b) => s + (b.usageCount || 0), 0)) },
      { label: "Used in the last 30 days", value: formatNumber(blocks.filter((b) => b.lastUsedAt && Date.parse(b.lastUsedAt) >= since).length) },
      { label: "With a display rule", value: formatNumber(blocks.filter((b) => blockRule(b.block)).length) },
    ];
  }, [blocks, loadedAt]);

  const pager = usePagination(filtered, { resetKey: `${query}|${typeFilter}|${ruleFilter}` });
  const fieldLabel = (key) => resources.groups.flatMap((g) => g.fields).find((f) => f.key === key)?.label || key;

  const replace = (updated) => {
    setBlocks((p) => p.map((b) => (b.id === updated.id ? updated : b)));
    resources.setSavedBlocks((p) => p.map((b) => (b.id === updated.id ? updated : b)));
  };

  const handleCreate = async (form) => {
    const user = await getUser();
    const block = createBlock(form.type);
    const created = await createContentBlock(projectId, {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      description: form.description.trim(),
      block,
      blockType: block.type,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't create the block.");
      return false;
    }
    setBlocks((p) => [created, ...p]);
    openRecord(created.id);
    return true;
  };

  const handleDuplicate = async (b) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const input = { id, name: `${b.name} (copy)`, description: b.description, block: cloneBlock(b.block), blockType: b.blockType, createdBy: user?.id ?? null };
    const now = new Date().toISOString();
    setBlocks((p) => [{ ...b, ...input, usageCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now }, ...p]);
    const created = await createContentBlock(projectId, input);
    if (!created) {
      setBlocks((p) => p.filter((x) => x.id !== id));
      toast.error("Couldn't duplicate the block.");
      return;
    }
    replace(created);
    toast.success(`Duplicated “${b.name}”.`);
    if (recordId) openRecord(created.id);
  };

  const handleDelete = async (b) => {
    setDeleting(true);
    const ok = await softDeleteContentBlock(b.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error("Couldn't delete the block.");
      return;
    }
    setBlocks((p) => p.filter((x) => x.id !== b.id));
    if (b.id === recordId) closeRecord();
    toast.success(`Deleted “${b.name}”.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete content block</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? It leaves the saved blocks panel. Emails it was already inserted into keep their copy.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DESTRUCTIVE_BUTTON} disabled={deleting} onClick={() => handleDelete(deleteTarget)}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (recordId && loading) {
    return (
      <MainScreenWrapper>
        <LoadingArea size={88} label="Loading content block" />
      </MainScreenWrapper>
    );
  }

  const open = blocks.find((b) => b.id === recordId);
  if (open) {
    return (
      <>
        <BlockEditor
          key={open.id}
          record={open}
          projectId={projectId}
          resources={resources}
          canEdit={canEdit}
          onBack={closeRecord}
          onSaved={replace}
          onDuplicate={handleDuplicate}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || typeFilter !== "all" || ruleFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setRuleFilter("all");
  };

  const columns = [
    {
      key: "block",
      header: "Block",
      render: (b) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-foreground">{b.name}</span>
          <span className="line-clamp-1 text-xs text-text-secondary">{b.description || "No description"}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", className: "whitespace-nowrap", render: (b) => <TypeLabel type={b.blockType} /> },
    {
      key: "rule",
      header: "Shown to",
      render: (b) => {
        const rule = blockRule(b.block);
        return rule ? <span className="line-clamp-1 text-sm text-foreground">{describeCondition(rule, fieldLabel)}</span> : <span className="text-sm text-text-secondary">Everyone</span>;
      },
    },
    { key: "usage", header: "Inserted", align: "right", className: "tabular-nums text-muted-foreground", render: (b) => formatNumber(b.usageCount) },
    { key: "lastUsed", header: "Last inserted", className: "whitespace-nowrap text-muted-foreground", render: (b) => (b.lastUsedAt ? formatDate(b.lastUsedAt) : "Never") },
    { key: "updated", header: "Edited", className: "whitespace-nowrap text-muted-foreground", render: (b) => formatDate(b.updatedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (b) => (
        <ActionMenu
          label={`Actions for ${b.name}`}
          items={[
            { label: canEdit ? "Edit" : "View", icon: Pencil, onSelect: () => openRecord(b.id) },
            canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(b) },
            { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(b) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Content Blocks"
        description="Reusable headers, footers, calls to action and product cards for any email."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New block
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={ruleFilter} onValueChange={setRuleFilter} options={RULE_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search blocks…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading content blocks" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(b) => b.id}
            onRowClick={(b) => openRecord(b.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Blocks}
                  title={filtersActive ? "No matches" : "No saved blocks yet"}
                  description={
                    filtersActive
                      ? "Try a different search or filter."
                      : "Create a block here, or select a block in the Email Builder and choose “Save as block”."
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New block
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="blocks" />
        </div>
      )}

      <CreateBlockDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ContentBlocksScreen;
