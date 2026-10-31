"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Copy, Loader2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  ActionMenu,
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
  Input,
  LogoLoading,
  ScreenHeader,
  SearchInput,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  StatsBar,
  StatusPill,
  Switch,
  Toolbar,
} from "@geiger/ui";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { listLists } from "@/lib/supabase/lists";
import { createAutomation, getAutomation, listAutomations, softDeleteAutomation } from "@/lib/supabase/automations";
import { pauseAutomation, publishAutomation } from "@/lib/automations/client";
import { channelsUsed, emptyGraph, stepCount } from "@/lib/automations/graph";
import { DEFAULT_SETTINGS, normalizeAutomation } from "@/lib/automations/model";
import { RECIPES } from "@/lib/automations/recipes";
import { TRIGGER_CATALOG, TRIGGER_CATEGORIES, defaultTrigger, describeTrigger, triggerCatalogEntry } from "@/lib/automations/triggers";
import { validateAutomation } from "@/lib/automations/validation";
import { AutomationEditor } from "./automation_editor";
import {
  AUTOMATION_STATUS_MAP,
  CHANNEL_META,
  KIND_COPY,
  OUTLINE_BUTTON,
  STATUS_FILTER_OPTIONS,
  TRIGGER_ICONS,
  formatNumber,
  formatPercent,
} from "./constants";

const CATEGORY_FILTER_OPTIONS = [{ value: "all", label: "All triggers" }, ...TRIGGER_CATEGORIES.map((c) => ({ value: c, label: c }))];

function CreateAutomationDialog({ open, onOpenChange, kind, onCreate }) {
  const copy = KIND_COPY[kind];
  const recipes = useMemo(() => [...RECIPES].sort((a, b) => Number(b.kind === kind) - Number(a.kind === kind)), [kind]);
  const [name, setName] = useState("");
  const [start, setStart] = useState("blank");
  const [triggerKey, setTriggerKey] = useState("list_joined");
  const [recipeKey, setRecipeKey] = useState(recipes[0]?.key || "");

  const reset = () => {
    setName("");
    setStart("blank");
    setTriggerKey("list_joined");
    setRecipeKey(recipes[0]?.key || "");
  };

  const submit = () => {
    const recipe = start === "recipe" ? RECIPES.find((r) => r.key === recipeKey) : null;
    const finalName = name.trim() || recipe?.name || "";
    if (!finalName) {
      toast.error(`Give the ${copy.singular} a name first.`);
      return;
    }
    if (recipe) {
      const built = recipe.build();
      onCreate({ name: finalName, description: recipe.description, graph: built.graph, settings: built.settings, metadata: { recipe: recipe.key } });
    } else {
      onCreate({ name: finalName, description: "", graph: emptyGraph(defaultTrigger(triggerKey)), settings: DEFAULT_SETTINGS });
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.create}</DialogTitle>
          <DialogDescription>Start from a trigger or a recipe — you&apos;ll build the steps on the canvas next.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="ac-name">
            <Input
              id="ac-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={start === "recipe" ? RECIPES.find((r) => r.key === recipeKey)?.name : kind === "journey" ? "e.g. Cart recovery across channels" : "e.g. Welcome series"}
              autoFocus
            />
          </Field>
          <SegmentedTabs
            tabs={[
              { value: "blank", label: "Start blank" },
              { value: "recipe", label: "Use a recipe" },
            ]}
            value={start}
            onChange={setStart}
            fullWidth
          />
          {start === "recipe" ? (
            <Field label="Recipe" hint={RECIPES.find((r) => r.key === recipeKey)?.description}>
              <Select value={recipeKey} onValueChange={setRecipeKey}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recipes.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Entry trigger" hint={triggerCatalogEntry(triggerKey)?.description}>
              <Select value={triggerKey} onValueChange={setTriggerKey}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_CATEGORIES.map((cat) => (
                    <SelectGroup key={cat}>
                      <SelectLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">{cat}</SelectLabel>
                      {TRIGGER_CATALOG.filter((t) => t.category === cat).map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{copy.create}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelIcons({ graph }) {
  const channels = channelsUsed(graph);
  if (!channels.length) return <span className="text-text-tertiary">—</span>;
  return (
    <span className="flex items-center gap-1.5">
      {channels.map((c) => {
        const Icon = CHANNEL_META[c].icon;
        return <Icon key={c} className="h-3.5 w-3.5 text-muted-foreground" aria-label={CHANNEL_META[c].label} />;
      })}
    </span>
  );
}

// Workflows and Journeys list: same engine and editor, filtered by kind.
export function AutomationListScreen({ kind }) {
  const copy = KIND_COPY[kind];
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();
  const canEdit = useCan("campaign.automation.edit");
  const canPublish = useCan("campaign.automation.publish");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState([]);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(null);
  const lookedUp = useRef(null);

  useEffect(() => {
    let alive = true;
    listAutomations(projectId, { kind }).then((data) => {
      if (!alive) return;
      if (data === null) toast.error(`Couldn't load ${copy.title.toLowerCase()}.`);
      setRows(data ?? []);
      setLoading(false);
    });
    listLists(projectId).then((data) => alive && setLists(data ?? []));
    getUser().then((u) => alive && setUserId(u?.id ?? null));
    return () => {
      alive = false;
    };
  }, [projectId, kind, copy.title]);

  const open = rows.find((r) => r.id === recordId);

  // A record opened from elsewhere (a recipe, a trigger) may be of the other kind, or not loaded yet.
  useEffect(() => {
    if (loading || !recordId || open || lookedUp.current === recordId) return;
    lookedUp.current = recordId;
    getAutomation(projectId, recordId).then((found) => {
      if (!found) return closeRecord();
      if (found.kind !== kind) return openRecordInTab(found.id, KIND_COPY[found.kind].title);
      setRows((p) => (p.some((r) => r.id === found.id) ? p : [found, ...p]));
    });
  }, [loading, recordId, open, projectId, kind, closeRecord, openRecordInTab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (categoryFilter !== "all" && triggerCatalogEntry(a.trigger)?.category !== categoryFilter) return false;
      if (q && !`${a.name} ${a.description} ${describeTrigger(a.trigger, { lists })}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, statusFilter, categoryFilter, lists]);

  const stats = useMemo(() => {
    const live = rows.filter((a) => a.status !== "archived");
    const sum = (key) => live.reduce((s, a) => s + (a.stats?.[key] || 0), 0);
    const enrolled = sum("enrolled");
    const converted = sum("converted");
    return [
      { label: copy.title, value: formatNumber(live.length), footer: `${live.filter((a) => a.status === "active").length} active` },
      { label: "Enrolled", value: formatNumber(enrolled), footer: "All-time contacts entered" },
      { label: "In progress", value: formatNumber(sum("inProgress")), footer: `${formatNumber(sum("completed"))} completed` },
      { label: "Conversion", value: enrolled ? formatPercent(converted / enrolled) : "—", footer: `${formatNumber(converted)} reached a goal` },
    ];
  }, [rows, copy.title]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${categoryFilter}` });

  const replaceRow = (next) => setRows((p) => p.map((r) => (r.id === next.id ? next : r)));

  const handleCreate = async (input) => {
    const id = crypto.randomUUID();
    const optimistic = normalizeAutomation({
      id,
      project_id: projectId,
      kind,
      name: input.name,
      description: input.description,
      status: "draft",
      graph: input.graph,
      settings: input.settings,
      metadata: input.metadata || {},
      created_at: new Date().toISOString(),
    });
    setRows((p) => [optimistic, ...p]);
    openRecord(id);
    const saved = await createAutomation(projectId, { id, kind, ...input, createdBy: userId });
    if (!saved) {
      setRows((p) => p.filter((r) => r.id !== id));
      closeRecord();
      toast.error(`Couldn't create the ${copy.singular}.`);
      return;
    }
    replaceRow(saved);
    toast.success(`“${saved.name}” created as a draft.`);
  };

  const handleDuplicate = async (a) => {
    const id = crypto.randomUUID();
    const input = { name: `${a.name} (copy)`, description: a.description, graph: a.graph, settings: a.settings, metadata: a.recipe ? { recipe: a.recipe } : {} };
    setRows((p) => [normalizeAutomation({ id, project_id: projectId, kind, status: "draft", ...input, created_at: new Date().toISOString() }), ...p]);
    const saved = await createAutomation(projectId, { id, kind, ...input, createdBy: userId });
    if (!saved) {
      setRows((p) => p.filter((r) => r.id !== id));
      toast.error("Couldn't duplicate it.");
      return;
    }
    replaceRow(saved);
    toast.success(`Duplicated as a draft.`);
  };

  const toggle = async (a, on) => {
    if (on) {
      const v = validateAutomation(a);
      if (v.errors) {
        toast.error(`Fix ${v.errors} ${v.errors === 1 ? "issue" : "issues"} in “${a.name}” before publishing.`);
        openRecord(a.id);
        return;
      }
    }
    setToggling(a.id);
    replaceRow({ ...a, status: on ? "active" : "paused" });
    const res = on ? await publishAutomation(projectId, a.id) : await pauseAutomation(projectId, a.id);
    setToggling(null);
    if (!res.ok) {
      replaceRow(a);
      toast.error(res.error || (on ? "Couldn't publish." : "Couldn't pause."));
      return;
    }
    replaceRow({ ...a, status: res.data.status, publishedAt: res.data.publishedAt ?? a.publishedAt });
    toast.success(on ? `“${a.name}” is live.` : `Paused “${a.name}”.`);
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    const ok = await softDeleteAutomation(target.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error("Couldn't delete it.");
      return;
    }
    setRows((p) => p.filter((r) => r.id !== target.id));
    if (target.id === recordId) closeRecord();
    toast.success(`Deleted “${target.name}”.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {copy.singular}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Contacts still in it stop where they are. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (open) {
    return (
      <>
        <AutomationEditor key={open.id} record={open} onBack={closeRecord} onSaved={replaceRow} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || categoryFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: copy.title.slice(0, -1),
      render: (a) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{a.name}</span>
          {a.description ? <span className="max-w-md truncate text-xs text-text-secondary">{a.description}</span> : null}
        </div>
      ),
    },
    {
      key: "trigger",
      header: "Trigger",
      render: (a) => {
        const Icon = TRIGGER_ICONS[triggerCatalogEntry(a.trigger)?.key];
        return (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" /> : null}
            <span className="max-w-56 truncate">{describeTrigger(a.trigger, { lists })}</span>
          </span>
        );
      },
    },
    kind === "journey"
      ? { key: "channels", header: "Channels", render: (a) => <ChannelIcons graph={a.graph} /> }
      : { key: "steps", header: "Steps", className: "tabular-nums text-muted-foreground", render: (a) => stepCount(a.graph) },
    { key: "enrolled", header: "Enrolled", className: "tabular-nums text-muted-foreground", render: (a) => formatNumber(a.stats.enrolled) },
    { key: "progress", header: "In progress", className: "tabular-nums text-muted-foreground", render: (a) => formatNumber(a.stats.inProgress) },
    {
      key: "conversion",
      header: "Conversion",
      className: "tabular-nums font-medium text-foreground",
      render: (a) => formatPercent(a.stats.conversionRate),
    },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (a) => (
        <div className="flex items-center gap-2">
          {canPublish && a.status !== "archived" ? (
            <span onClick={(e) => e.stopPropagation()} className="flex">
              <Switch
                checked={a.status === "active"}
                onCheckedChange={(on) => toggle(a, on)}
                disabled={toggling === a.id}
                aria-label={a.status === "active" ? `Pause ${a.name}` : `Publish ${a.name}`}
              />
            </span>
          ) : null}
          <StatusPill status={a.status} map={AUTOMATION_STATUS_MAP} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (a) => (
        <ActionMenu
          label={`Actions for ${a.name}`}
          items={[
            { label: `Edit ${copy.singular}`, icon: Pencil, onSelect: () => openRecord(a.id) },
            canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(a) },
            { label: "View enrollments", icon: BarChart3, onSelect: () => openRecord(a.id) },
            canPublish && a.status === "active" && { label: "Pause", icon: Pause, onSelect: () => toggle(a, false) },
            canPublish && (a.status === "draft" || a.status === "paused") && { label: a.status === "paused" ? "Resume" : "Publish", icon: Play, onSelect: () => toggle(a, true) },
            { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(a) },
          ]}
        />
      ),
    },
  ];

  const createButton = canEdit ? (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" /> {copy.create}
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader title={copy.title} description={copy.description} actions={createButton} />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={categoryFilter} onValueChange={setCategoryFilter} options={CATEGORY_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${copy.title.toLowerCase()}…`} />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label={`Loading ${copy.title.toLowerCase()}`} />
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(a) => a.id}
            onRowClick={(a) => openRecord(a.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={copy.icon}
                  title={filtersActive ? "No matches" : `No ${copy.title.toLowerCase()} yet`}
                  description={filtersActive ? "Try a different search or filter." : copy.empty}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : (
                      createButton
                    )
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel={copy.title.toLowerCase()} />
        </div>
      )}

      <CreateAutomationDialog open={createOpen} onOpenChange={setCreateOpen} kind={kind} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default AutomationListScreen;
