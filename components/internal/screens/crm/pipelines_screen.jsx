"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BarChart3, Copy, KanbanSquare, Loader2, Pencil, Plus, Settings2, Star, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  InlineTitleInput,
  Input,
  LoadingArea,
  ScreenHeader,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";
import {
  createPipeline,
  listPipelines,
  newStageId,
  setDefaultPipeline,
  softDeletePipeline,
  templateStages,
  updatePipeline,
} from "@/lib/supabase/pipelines";
import { listDeals, moveDealsToPipeline } from "@/lib/supabase/deals";
import { listActivities } from "@/lib/supabase/crm_activities";
import { getUser } from "@/lib/supabase/user";
import { STAGE_COLORS, STAGE_COLOR_KEYS } from "@/lib/crm/constants";
import { weightedValue } from "@/lib/crm/forecast";
import { stageMetrics } from "@/lib/crm/stage_metrics";
import { formatDays, moneySummary, percent } from "@/lib/crm/format";
import { DeleteDialog, OUTLINE_BTN, PRIMARY_BTN, StageDot } from "./crm_shared";

const PIPELINE_NAV = [
  { key: "stages", label: "Stages", icon: KanbanSquare, desc: "Board order, win probability and colour for each stage." },
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Per-stage conversion and time in stage, replayed from deal history." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "Name, description and whether this is the default pipeline." },
];

const toDraft = (p) => ({
  name: p.name || "",
  description: p.description || "",
  stages: p.stages.map((s) => ({ ...s, probability: String(s.probability) })),
});

const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function ColorPicker({ value, onChange, disabled }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" disabled={disabled} aria-label={`Stage colour: ${STAGE_COLORS[value]?.label || "Grey"}`} className="border-border bg-surface-card hover:bg-surface-hover">
          <StageDot color={value} className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="border-border bg-surface-subtle">
        {STAGE_COLOR_KEYS.map((key) => (
          <DropdownMenuItem key={key} onSelect={() => onChange(key)} className={cn("cursor-pointer gap-2 focus:bg-surface-hover", value === key && "font-medium")}>
            <StageDot color={key} className="h-3 w-3" />
            {STAGE_COLORS[key].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StageEditor({ stages, onChange, openCounts, canEdit }) {
  const update = (i, patch) => onChange(stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const move = (i, dir) => {
    const next = [...stages];
    const [item] = next.splice(i, 1);
    next.splice(i + dir, 0, item);
    onChange(next);
  };
  const remove = (i) => onChange(stages.filter((_, idx) => idx !== i));
  const add = () => {
    const last = stages[stages.length - 1];
    const probability = last ? Math.min(90, Number(last.probability) + 10 || 10) : 10;
    onChange([...stages, { id: newStageId(), name: "", probability: String(probability), color: "neutral" }]);
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
        <div className="hidden grid-cols-[4.5rem_2.25rem_1fr_7rem_6.5rem_2.25rem] items-center gap-3 border-b border-border px-4 py-2.5 text-xs font-medium text-text-secondary sm:grid">
          <span>Order</span>
          <span className="sr-only">Colour</span>
          <span>Stage</span>
          <span>Probability</span>
          <span>Open deals</span>
          <span className="sr-only">Remove</span>
        </div>
        {stages.length === 0 ? (
          <EmptyState title="No stages" description="Add at least one stage so deals have somewhere to land." className="py-10" />
        ) : (
          <ul className="divide-y divide-border">
            {stages.map((s, i) => {
              const open = openCounts.get(s.id) || 0;
              return (
                <li key={s.id} className="grid grid-cols-[4.5rem_2.25rem_1fr] items-center gap-3 px-4 py-3 sm:grid-cols-[4.5rem_2.25rem_1fr_7rem_6.5rem_2.25rem]">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Move ${s.name || "stage"} up`} disabled={!canEdit || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Move ${s.name || "stage"} down`} disabled={!canEdit || i === stages.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <ColorPicker value={s.color} onChange={(color) => update(i, { color })} disabled={!canEdit} />
                  <Input value={s.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Stage name" aria-label={`Stage ${i + 1} name`} disabled={!canEdit} />
                  <div className="col-span-2 col-start-2 row-start-2 flex items-center gap-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={s.probability}
                      onChange={(e) => update(i, { probability: e.target.value })}
                      aria-label={`${s.name || "Stage"} win probability`}
                      className="tabular-nums"
                      disabled={!canEdit}
                    />
                    <span className="text-sm text-text-secondary">%</span>
                  </div>
                  <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">{open.toLocaleString("en-US")}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={open ? `${s.name} has ${open} open deals; move them before removing it` : `Remove ${s.name || "stage"}`}
                    title={open ? "Move this stage's open deals first" : undefined}
                    disabled={!canEdit || open > 0}
                    onClick={() => remove(i)}
                    className="col-start-1 row-start-2 text-red-600 hover:bg-red-500/10 hover:text-red-600 sm:col-start-auto sm:row-start-auto dark:text-red-400 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">Won and lost aren&apos;t stages — every pipeline closes deals with Mark won / Mark lost. Stages with open deals can&apos;t be removed.</p>
          <Button variant="outline" className={OUTLINE_BTN} onClick={add}>
            <Plus className="h-4 w-4" /> Add stage
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PipelinePerformance({ pipeline, deals, activities }) {
  const metrics = useMemo(() => stageMetrics(pipeline, deals, activities), [pipeline, deals, activities]);
  const won = moneySummary(metrics.won, (d) => d.value);
  const weighted = moneySummary(metrics.open, (d) => weightedValue(d, pipeline));

  const stats = [
    { label: "Win rate", value: metrics.winRate == null ? "—" : `${metrics.winRate}%`, footer: `${metrics.won.length} won · ${metrics.lost.length} lost` },
    { label: "Avg. sales cycle", value: formatDays(metrics.avgCycleDays), footer: "Created to won" },
    { label: "Won value", value: won.value, footer: won.footer || "All time" },
    { label: "Weighted forecast", value: weighted.value, footer: weighted.footer || `${metrics.open.length} open deals` },
  ];

  const columns = [
    {
      key: "stage",
      header: "Stage",
      render: (r) => (
        <span className="inline-flex items-center gap-2 font-medium text-foreground">
          <StageDot color={r.stage.color} />
          {r.stage.name}
        </span>
      ),
    },
    { key: "probability", header: "Probability", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => `${r.stage.probability}%` },
    {
      key: "now",
      header: "In stage now",
      align: "right",
      className: "whitespace-nowrap tabular-nums text-foreground",
      render: (r) => `${r.inStage.length} · ${moneySummary(r.inStage, (d) => d.value).value}`,
    },
    { key: "entered", header: "Entered", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => r.entered.toLocaleString("en-US") },
    {
      key: "conversion",
      header: "Moved forward",
      align: "right",
      className: "tabular-nums",
      render: (r) =>
        r.conversion == null ? (
          <span className="text-text-tertiary">—</span>
        ) : (
          <span className="inline-flex items-center justify-end gap-2">
            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-active sm:inline-block">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${r.conversion}%` }} />
            </span>
            <span className="text-foreground">{r.conversion}%</span>
            <span className="text-xs text-text-tertiary">of {r.left}</span>
          </span>
        ),
    },
    { key: "lost", header: "Lost here", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => r.lostHere.toLocaleString("en-US") },
    { key: "velocity", header: "Avg. time in stage", align: "right", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (r) => formatDays(r.avgDays) },
  ];

  return (
    <div className="space-y-5">
      <StatsBar stats={stats} />
      <DataTable columns={columns} data={metrics.stages} getRowKey={(r) => r.stage.id} />
      <p className="text-xs text-text-secondary">
        Moved forward is the share of deals that left a stage by advancing or winning. Time in stage averages completed stays only.
      </p>
    </div>
  );
}

function CreatePipelineDialog({ open, onOpenChange, onCreate }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New pipeline</DialogTitle>
          <DialogDescription>A separate board with its own stages, e.g. for renewals or partnerships.</DialogDescription>
        </DialogHeader>
        <CreatePipelineForm onClose={() => onOpenChange(false)} onCreate={onCreate} />
      </DialogContent>
    </Dialog>
  );
}

function CreatePipelineForm({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("template");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the pipeline a name.");
      return;
    }
    setPending(true);
    const stages = start === "template" ? templateStages() : [{ id: newStageId(), name: "New", probability: 10, color: "neutral" }];
    const ok = await onCreate({ name: name.trim(), stages });
    setPending(false);
    if (ok) onClose();
  };

  return (
    <>
      <div className="grid gap-4">
        <Field label="Name" htmlFor="np-name">
          <Input
            id="np-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Renewals"
            autoFocus
          />
        </Field>
        <Field label="Start with">
          <Select value={start} onValueChange={setStart}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="template">Standard sales stages (Lead → Negotiation)</SelectItem>
              <SelectItem value="blank">One empty stage</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button className={PRIMARY_BTN} disabled={pending} onClick={submit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create pipeline
        </Button>
      </DialogFooter>
    </>
  );
}

// Deleting a pipeline with deals re-homes them first.
function DeletePipelineDialog({ target, pipelines, dealCount, onCancel, onConfirm }) {
  const others = pipelines.filter((p) => p.id !== target?.id);
  const [moveTo, setMoveTo] = useState(null);
  const [pending, setPending] = useState(false);
  const destination = moveTo || others[0]?.id || null;
  const blocked = dealCount > 0 && !others.length;

  if (!target) return null;
  if (!dealCount) {
    return (
      <DeleteDialog
        open
        title="Delete pipeline"
        name={target.name}
        description="It has no deals. This can't be undone."
        pending={pending}
        onCancel={onCancel}
        onConfirm={async () => {
          setPending(true);
          await onConfirm(target, null);
          setPending(false);
        }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete pipeline</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{target.name}</span> has {dealCount.toLocaleString("en-US")} {dealCount === 1 ? "deal" : "deals"}.{" "}
            {blocked ? "Create another pipeline to move them to before deleting this one." : "They move to the first stage of the pipeline you pick, keeping their won / lost status."}
          </DialogDescription>
        </DialogHeader>
        {!blocked ? (
          <Field label="Move deals to">
            <Select value={destination || ""} onValueChange={setMoveTo}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {others.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            disabled={blocked || pending}
            onClick={async () => {
              setPending(true);
              await onConfirm(target, destination);
              setPending(false);
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Move deals and delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PipelineEditor({ pipeline, deals, activities, canEdit, onBack, onSave, onMakeDefault, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(pipeline));
  const [saving, setSaving] = useState(false);
  const dirty = !sameDraft(draft, toDraft(pipeline));

  const openCounts = useMemo(() => {
    const map = new Map();
    for (const d of deals) if (d.pipelineId === pipeline.id && d.status === "open") map.set(d.stageId, (map.get(d.stageId) || 0) + 1);
    return map;
  }, [deals, pipeline.id]);

  const save = async () => {
    if (!draft.stages.length) {
      toast.error("A pipeline needs at least one stage.");
      return;
    }
    if (draft.stages.some((s) => !s.name.trim())) {
      toast.error("Name every stage.");
      return;
    }
    const names = draft.stages.map((s) => s.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      toast.error("Stage names must be unique.");
      return;
    }
    if (draft.stages.some((s) => s.probability === "" || Number(s.probability) < 0 || Number(s.probability) > 100)) {
      toast.error("Probabilities run from 0 to 100%.");
      return;
    }
    const removed = pipeline.stages.filter((s) => !draft.stages.some((d) => d.id === s.id) && openCounts.get(s.id));
    if (removed.length) {
      toast.error(`Move the open deals out of ${removed.map((s) => s.name).join(", ")} first.`);
      return;
    }
    setSaving(true);
    const patch = {
      name: draft.name.trim() || "Untitled pipeline",
      description: draft.description.trim(),
      stages: draft.stages.map((s) => ({ ...s, name: s.name.trim(), probability: Number(s.probability) })),
    };
    const ok = await onSave(pipeline.id, patch);
    setSaving(false);
    if (ok) setDraft(toDraft({ ...pipeline, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Pipelines", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          aria-label="Pipeline name"
          placeholder="Untitled pipeline"
          readOnly={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          {pipeline.isDefault ? <Badge variant="info">Default</Badge> : null}
          <span className="text-xs text-text-secondary">
            {pipeline.stages.length} {pipeline.stages.length === 1 ? "stage" : "stages"} · {[...openCounts.values()].reduce((s, n) => s + n, 0)} open deals
          </span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete pipeline"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(pipeline)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button className={PRIMARY_BTN} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
            </Button>
          </>
        ) : null
      }
      nav={PIPELINE_NAV}
      defaultSection="stages"
    >
      {({ active }) => (
        <>
          {active === "stages" ? (
            <StageEditor stages={draft.stages} onChange={(stages) => setDraft((d) => ({ ...d, stages }))} openCounts={openCounts} canEdit={canEdit} />
          ) : null}
          {active === "performance" ? <PipelinePerformance pipeline={pipeline} deals={deals} activities={activities} /> : null}
          {active === "settings" ? (
            <div className="space-y-6">
              <SectionCard bare title="Name & description" description="How this pipeline is labelled across Deals and the pipeline list.">
                <div className="grid gap-4">
                  <Field label="Name" htmlFor="pe-name">
                    <Input id="pe-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} disabled={!canEdit} />
                  </Field>
                  <Field label="Description" htmlFor="pe-desc" hint="Shown in the pipeline list.">
                    <Textarea
                      id="pe-desc"
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="What this pipeline tracks"
                      disabled={!canEdit}
                    />
                  </Field>
                </div>
              </SectionCard>
              <SectionCard bare title="Default board" description="Choose whether this pipeline opens first and receives new deals.">
                <SettingsList>
                  <SettingRow
                    icon={Star}
                    title="Default pipeline"
                    description="Opens first on the Deals board and receives new deals by default."
                    control={<Switch checked={pipeline.isDefault} disabled={!canEdit || pipeline.isDefault} onCheckedChange={() => onMakeDefault(pipeline)} aria-label="Default pipeline" />}
                  />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function PipelinesScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.crm.edit");
  const { recordId, openRecord, closeRecord, setTab } = useWorkspaceUrl();

  const [pipelines, setPipelines] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [userId, setUserId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listPipelines(projectId),
      listDeals(projectId),
      listActivities(projectId, { relatedType: "deal", kinds: ["stage_change", "system"], limit: 5000 }),
      getUser(),
    ]).then(([pipelineRows, dealRows, activityRows, user]) => {
      if (!alive) return;
      if (pipelineRows === null) toast.error("Couldn't load pipelines.");
      setPipelines(pipelineRows ?? []);
      setDeals(dealRows ?? []);
      setActivities(activityRows ?? []);
      setUserId(user?.id ?? null);
      setLoadedFor(projectId);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = loadedFor !== projectId;

  const rows = useMemo(
    () =>
      pipelines.map((p) => {
        const own = deals.filter((d) => d.pipelineId === p.id);
        const open = own.filter((d) => d.status === "open");
        const won = own.filter((d) => d.status === "won").length;
        const lost = own.filter((d) => d.status === "lost").length;
        return {
          ...p,
          dealCount: own.length,
          openCount: open.length,
          openValue: moneySummary(open, (d) => d.value).value,
          weighted: moneySummary(open, (d) => weightedValue(d, p)).value,
          winRate: percent(won, won + lost),
        };
      }),
    [pipelines, deals],
  );
  const pager = usePagination(rows);

  const stats = useMemo(() => {
    const byId = new Map(pipelines.map((p) => [p.id, p]));
    const open = deals.filter((d) => d.status === "open" && byId.has(d.pipelineId));
    const won = deals.filter((d) => d.status === "won").length;
    const lost = deals.filter((d) => d.status === "lost").length;
    const weighted = moneySummary(open, (d) => weightedValue(d, byId.get(d.pipelineId)));
    const winRate = percent(won, won + lost);
    return [
      { label: "Pipelines", value: pipelines.length.toLocaleString("en-US"), footer: `${pipelines.reduce((s, p) => s + p.stages.length, 0)} stages in total` },
      { label: "Open deals", value: open.length.toLocaleString("en-US"), footer: "Across every pipeline" },
      { label: "Weighted forecast", value: weighted.value, footer: weighted.footer || "Value × stage probability" },
      { label: "Win rate", value: winRate == null ? "—" : `${winRate}%`, footer: `${won} won · ${lost} lost` },
    ];
  }, [pipelines, deals]);

  const handleCreate = async ({ name, stages }) => {
    const pipeline = { id: crypto.randomUUID(), name, stages, isDefault: pipelines.length === 0, createdBy: userId };
    const saved = await createPipeline(projectId, pipeline);
    if (!saved) {
      toast.error("Couldn't create the pipeline.");
      return false;
    }
    setPipelines((prev) => [...prev, saved]);
    toast.success(`Created "${saved.name}".`);
    openRecord(saved.id);
    return true;
  };

  const handleSave = async (id, patch) => {
    const before = pipelines.find((p) => p.id === id);
    setPipelines((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const saved = await updatePipeline(id, patch);
    if (!saved) {
      setPipelines((prev) => prev.map((p) => (p.id === id ? before : p)));
      toast.error("Couldn't save the pipeline.");
      return false;
    }
    setPipelines((prev) => prev.map((p) => (p.id === id ? saved : p)));
    toast.success("Pipeline saved.");
    return true;
  };

  const handleMakeDefault = async (pipeline) => {
    const before = pipelines;
    setPipelines((prev) => prev.map((p) => ({ ...p, isDefault: p.id === pipeline.id })));
    if (!(await setDefaultPipeline(projectId, pipeline.id))) {
      setPipelines(before);
      toast.error("Couldn't change the default pipeline.");
      return;
    }
    toast.success(`"${pipeline.name}" is now the default pipeline.`);
  };

  const handleDuplicate = async (pipeline) => {
    const copy = {
      id: crypto.randomUUID(),
      name: `${pipeline.name} (copy)`,
      description: pipeline.description,
      stages: pipeline.stages.map((s) => ({ ...s, id: newStageId() })),
      isDefault: false,
      createdBy: userId,
    };
    const saved = await createPipeline(projectId, copy);
    if (!saved) {
      toast.error("Couldn't duplicate the pipeline.");
      return;
    }
    setPipelines((prev) => [...prev, saved]);
    toast.success(`Created "${saved.name}".`);
  };

  const handleDelete = async (pipeline, moveTo) => {
    if (moveTo) {
      const target = pipelines.find((p) => p.id === moveTo);
      if (!(await moveDealsToPipeline(projectId, pipeline.id, moveTo, target?.stages[0]?.id || ""))) {
        toast.error("Couldn't move the deals, so the pipeline was kept.");
        return;
      }
      setDeals((prev) => prev.map((d) => (d.pipelineId === pipeline.id ? { ...d, pipelineId: moveTo, stageId: target?.stages[0]?.id || "" } : d)));
    }
    if (!(await softDeletePipeline(pipeline.id))) {
      toast.error("Couldn't delete the pipeline.");
      return;
    }
    const remaining = pipelines.filter((p) => p.id !== pipeline.id);
    setPipelines(remaining);
    setDeleteTarget(null);
    if (recordId === pipeline.id) closeRecord();
    toast.success(`Deleted "${pipeline.name}".`);
    const nextDefault = pipeline.isDefault ? remaining.find((p) => p.id === moveTo) || remaining[0] : null;
    if (nextDefault) {
      setPipelines((prev) => prev.map((p) => ({ ...p, isDefault: p.id === nextDefault.id })));
      if (!(await setDefaultPipeline(projectId, nextDefault.id))) toast.error("Couldn't set a new default pipeline.");
    }
  };

  const deleteDialog = deleteTarget ? (
    <DeletePipelineDialog
      key={deleteTarget.id}
      target={deleteTarget}
      pipelines={pipelines}
      dealCount={deals.filter((d) => d.pipelineId === deleteTarget.id).length}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  ) : null;

  const open = !loading && recordId ? pipelines.find((p) => p.id === recordId) : null;
  if (open) {
    return (
      <>
        <PipelineEditor
          key={open.id}
          pipeline={open}
          deals={deals}
          activities={activities}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onMakeDefault={handleMakeDefault}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const columns = [
    {
      key: "name",
      header: "Pipeline",
      render: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium text-foreground">
            {p.name}
            {p.isDefault ? <Badge variant="info">Default</Badge> : null}
          </span>
          {p.description ? <span className="truncate text-xs text-text-secondary">{p.description}</span> : null}
        </div>
      ),
    },
    {
      key: "stages",
      header: "Stages",
      render: (p) => (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <span className="flex items-center gap-1" aria-hidden="true">
            {p.stages.map((s) => <StageDot key={s.id} color={s.color} />)}
          </span>
          <span className="tabular-nums">{p.stages.length}</span>
        </span>
      ),
    },
    { key: "open", header: "Open deals", align: "right", className: "tabular-nums text-foreground", render: (p) => p.openCount.toLocaleString("en-US") },
    { key: "value", header: "Open value", align: "right", className: "whitespace-nowrap tabular-nums text-foreground", render: (p) => p.openValue },
    { key: "weighted", header: "Weighted", align: "right", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (p) => p.weighted },
    { key: "win", header: "Win rate", align: "right", className: "tabular-nums text-muted-foreground", render: (p) => (p.winRate == null ? "—" : `${p.winRate}%`) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <ActionMenu
          label={`Actions for ${p.name}`}
          items={[
            { label: canEdit ? "Edit stages" : "Open", icon: Pencil, onSelect: () => openRecord(p.id) },
            { label: "Open board", icon: KanbanSquare, onSelect: () => setTab("Deals") },
            canEdit && !p.isDefault ? { label: "Make default", icon: Star, onSelect: () => handleMakeDefault(p) } : null,
            canEdit ? { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(p) } : null,
            canEdit ? { separator: true } : null,
            canEdit ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(p) } : null,
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Pipelines"
        description="Stages, win probabilities and how deals move through each board."
        actions={
          canEdit ? (
            <Button className={PRIMARY_BTN} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New pipeline
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      {loading ? (
        <LoadingArea size={56} panel label="Loading pipelines" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(p) => p.id}
            onRowClick={(p) => openRecord(p.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={KanbanSquare}
                  title="No pipelines yet"
                  description="A pipeline is the set of stages a deal moves through. Create one to start tracking deals."
                  action={
                    canEdit ? (
                      <Button className={PRIMARY_BTN} onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New pipeline
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="pipelines" />
        </div>
      )}

      {canEdit ? <CreatePipelineDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} /> : null}
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default PipelinesScreen;
