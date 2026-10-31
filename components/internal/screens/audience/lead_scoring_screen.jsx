"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Plus, Pencil, Copy, Power, PowerOff, Trash2, Flame, ThermometerSun, Snowflake, Gauge, Zap, RefreshCw, Loader2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { apiPost } from "@/lib/api/client";
import { scanContactFacets } from "@/lib/supabase/contacts";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { createScoringRule, listScoringRules, softDeleteScoringRule, updateScoringRule } from "@/lib/supabase/lead_scoring";
import { SCORE_BANDS, SCORING_TRIGGERS, bandFor, scoreBuckets } from "@/lib/audience/scoring";
import { buildSegmentFields, describeCondition, isConditionComplete, newCondition } from "@/lib/audience/segment_rules";
import {
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  LoadingArea,
  StatGrid,
  SectionCard,
  SettingsList,
  SettingRow,
  InlineTitleInput,
} from "@geiger/ui";
import { ConditionRow } from "./condition_builder";
import { useAudienceCatalog } from "./use_audience_catalog";
import { DESTRUCTIVE_BUTTON, DESTRUCTIVE_GHOST, DIALOG_BODY, DIALOG_SCROLL, OUTLINE_BUTTON, TRIGGER_LABELS, number, plural } from "./constants";

const BAND_ICONS = { hot: Flame, warm: ThermometerSun, cold: Snowflake };

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All rules" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const ADJUSTMENT_FILTER_OPTIONS = [
  { value: "all", label: "All adjustments" },
  { value: "add", label: "Adds points" },
  { value: "subtract", label: "Subtracts points" },
];

const RULE_NAV = [
  { key: "trigger", label: "Trigger", icon: Zap, desc: "What a contact does (or is) to earn the points." },
  { key: "scoring", label: "Scoring", icon: Gauge, desc: "How many points, how often, and how fast they fade." },
];

const CHART_CONFIG = { count: { label: "Contacts", color: "var(--chart-series-1)" } };
const AXIS_STROKE = "var(--muted-foreground)";

const signedPoints = (direction, points) => {
  const magnitude = Math.abs(parseInt(points, 10) || 0);
  return direction === "subtract" ? -magnitude : magnitude;
};

function PointsValue({ points }) {
  return (
    <span className={cn("font-semibold tabular-nums", points >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {points >= 0 ? `+${points}` : points}
    </span>
  );
}

const triggerSummary = (r, fields) => {
  if (r.trigger === "event") return r.eventName ? `Performs "${r.eventName}"` : "Performs an event";
  if (r.trigger === "attribute") return isConditionComplete(r.condition) ? describeCondition(r.condition, fields) : "Matches a condition";
  return TRIGGER_LABELS[r.trigger] || r.trigger;
};

const decayLabel = (r) => (r.trigger === "attribute" ? "—" : r.decayDays ? `Fades over ${r.decayDays} days` : "Never fades");

// Draft shape both the create dialog and the editor edit.
const toDraft = (r, fields) => ({
  name: r.name,
  trigger: r.trigger,
  eventName: r.eventName || "",
  condition: isConditionComplete(r.condition) ? r.condition : { ...newCondition("tags", fields), id: "rule" },
  direction: r.points < 0 ? "subtract" : "add",
  points: String(Math.abs(r.points)),
  frequency: r.frequency,
  decayDays: r.decayDays ? String(r.decayDays) : "",
  active: r.active,
});

const fromDraft = (d) => ({
  name: d.name.trim() || "Untitled rule",
  trigger: d.trigger,
  eventName: d.trigger === "event" ? d.eventName.trim() : "",
  condition: d.trigger === "attribute" ? d.condition : {},
  points: signedPoints(d.direction, d.points),
  frequency: d.trigger === "attribute" ? "once" : d.frequency,
  decayDays: d.trigger === "attribute" ? null : d.decayDays,
  active: d.active,
});

const draftError = (d) => {
  if (!d.name.trim()) return "Give the rule a name first.";
  if (d.trigger === "event" && !d.eventName.trim()) return "Name the event that awards the points.";
  if (d.trigger === "attribute" && !isConditionComplete(d.condition)) return "Finish the condition first.";
  if (!(parseInt(d.points, 10) > 0)) return "Award at least 1 point.";
  return null;
};

function TriggerFields({ draft, set, fields, eventNames, disabled }) {
  return (
    <div className="grid gap-4">
      <Field label="When a contact">
        <Select value={draft.trigger} onValueChange={set("trigger")} disabled={disabled}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SCORING_TRIGGERS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      {draft.trigger === "event" ? (
        <Field label="Event name" htmlFor="rule-event" hint="The name your site, forms or API send with geiger.track() — e.g. pricing_viewed.">
          <Input id="rule-event" value={draft.eventName} disabled={disabled} onChange={(e) => set("eventName")(e.target.value)} list="scoring-event-names" className="font-mono" placeholder="pricing_viewed" />
          <datalist id="scoring-event-names">
            {eventNames.map((n) => <option key={n} value={n} />)}
          </datalist>
        </Field>
      ) : null}
      {draft.trigger === "attribute" ? (
        <Field label="Condition" hint="Points apply while the contact matches; they're removed when they stop matching.">
          <ConditionRow condition={draft.condition} fields={fields} onChange={set("condition")} />
        </Field>
      ) : null}
    </div>
  );
}

function ScoringFields({ draft, set, idPrefix, disabled }) {
  const behaviour = draft.trigger !== "attribute";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Adjustment">
        <Select value={draft.direction} onValueChange={set("direction")} disabled={disabled}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="add">Add points</SelectItem>
            <SelectItem value="subtract">Subtract points</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Points" htmlFor={`${idPrefix}-points`}>
        <Input id={`${idPrefix}-points`} type="number" min="1" max="100" disabled={disabled} value={draft.points} onChange={(e) => set("points")(e.target.value)} />
      </Field>
      {behaviour ? (
        <>
          <Field label="Apply">
            <Select value={draft.frequency} onValueChange={set("frequency")} disabled={disabled}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="every">Every time it happens</SelectItem>
                <SelectItem value="once">Only once per contact</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fade over" htmlFor={`${idPrefix}-decay`} hint="Days until an occurrence is worth nothing. Blank keeps points forever.">
            <Input id={`${idPrefix}-decay`} type="number" min="1" disabled={disabled} value={draft.decayDays} onChange={(e) => set("decayDays")(e.target.value)} placeholder="Never" />
          </Field>
        </>
      ) : null}
    </div>
  );
}

function CreateRuleDialog({ open, onOpenChange, fields, eventNames, onCreate }) {
  const blank = useCallback(
    () => toDraft({ name: "", trigger: "email_clicked", eventName: "", condition: {}, points: 10, frequency: "every", decayDays: 60, active: true }, fields),
    [fields],
  );
  const [draft, setDraft] = useState(blank);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(blank());
  }
  const submit = async () => {
    const error = draftError(draft);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    const ok = await onCreate(fromDraft(draft));
    setSaving(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-2xl", DIALOG_SCROLL)}>
        <DialogHeader>
          <DialogTitle>New scoring rule</DialogTitle>
          <DialogDescription>Award or deduct points for engagement, tracked events or contact data. Scores are capped at 0–100.</DialogDescription>
        </DialogHeader>
        <div className={DIALOG_BODY}>
          <Field label="Rule name" htmlFor="r-name">
            <Input id="r-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Clicked a campaign link" autoFocus />
          </Field>
          <TriggerFields draft={draft} set={set} fields={fields} eventNames={eventNames} />
          <ScoringFields draft={draft} set={set} idPrefix="r" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleEditor({ record, fields, eventNames, canEdit, canDelete, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record, fields));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(fromDraft(draft)) !== JSON.stringify(fromDraft(toDraft(record, fields)));

  const save = async () => {
    const error = draftError(draft);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    await onSave(record.id, fromDraft(draft));
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Lead scoring", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Rule name"
          placeholder="Untitled rule"
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={draft.active ? "success" : "neutral"}>{draft.active ? "Active" : "Inactive"}</Badge>
          <span className="text-xs"><PointsValue points={signedPoints(draft.direction, draft.points)} /></span>
          <span className="text-xs text-text-tertiary">{triggerSummary(fromDraft(draft), fields)}</span>
        </>
      }
      actions={
        <>
          {canDelete ? (
            <Button variant="ghost" size="icon" aria-label="Delete rule" className={DESTRUCTIVE_GHOST} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
        </>
      }
      nav={RULE_NAV}
      defaultSection="trigger"
    >
      {({ active }) => (
        <>
          {active === "trigger" ? (
            <SectionCard bare title="Rule & trigger" description="Name the rule and pick the behaviour or attribute that earns points.">
              <div className="grid gap-4">
                <Field label="Rule name" htmlFor="re-name">
                  <Input id="re-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} />
                </Field>
                <TriggerFields draft={draft} set={set} fields={fields} eventNames={eventNames} disabled={!canEdit} />
              </div>
            </SectionCard>
          ) : null}
          {active === "scoring" ? (
            <SectionCard bare title="Points & decay" description="What the rule is worth and whether it counts toward scores right now.">
              <ScoringFields draft={draft} set={set} idPrefix="re" disabled={!canEdit} />
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Rule active"
                  description="Inactive rules stop counting at the next recompute but keep their settings."
                  control={<Switch checked={draft.active} disabled={!canEdit} onCheckedChange={set("active")} aria-label="Rule active" />}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

function DistributionChart({ buckets }) {
  const data = buckets.map((b) => ({ ...b, band: bandFor(b.min).key }));
  const fill = { hot: "var(--chart-series-1)", warm: "var(--chart-series-2)", cold: "var(--chart-series-3)" };
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[220px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="key" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} stroke={AXIS_STROKE} />
        <ChartTooltip cursor={{ fill: "var(--chart-cursor-fill)" }} content={<ChartTooltipContent className="border-border bg-surface-subtle text-foreground" />} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((b) => <Cell key={b.key} fill={fill[b.band]} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function LeadScoringScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.contact.edit");
  const canDelete = can("campaign.contact.delete");
  const catalog = useAudienceCatalog(projectId);
  const [data, setData] = useState({ key: null, rules: [], scores: [], eventNames: [] });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adjustmentFilter, setAdjustmentFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [recomputing, setRecomputing] = useState(false);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const fields = useMemo(
    () => buildSegmentFields({ customFields: catalog.customFields, lists: catalog.lists, tags: catalog.tags }),
    [catalog.customFields, catalog.lists, catalog.tags],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([listScoringRules(projectId), scanContactFacets(projectId), listTrackedEvents(projectId, { limit: 1000 })]).then(([rules, facets, events]) => {
      if (!alive) return;
      if (!rules) toast.error("Couldn't load scoring rules.");
      setData({
        key: projectId,
        rules: rules ?? [],
        scores: facets?.scores ?? [],
        eventNames: [...new Set((events ?? []).map((e) => e.name))].sort(),
      });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = data.key !== projectId;
  const rules = data.rules;

  const bands = useMemo(
    () =>
      SCORE_BANDS.map((b) => ({
        label: `${b.label} leads`,
        value: loading ? "" : number(data.scores.filter((s) => s >= b.min && s <= b.max).length),
        hint: `Score ${b.min}–${b.max}`,
        icon: BAND_ICONS[b.key],
      })),
    [data.scores, loading],
  );
  const buckets = useMemo(() => scoreBuckets(data.scores), [data.scores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((r) => {
      if (statusFilter === "active" && !r.active) return false;
      if (statusFilter === "inactive" && r.active) return false;
      if (adjustmentFilter === "add" && r.points < 0) return false;
      if (adjustmentFilter === "subtract" && r.points >= 0) return false;
      if (q && !`${r.name} ${triggerSummary(r, fields)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rules, query, statusFilter, adjustmentFilter, fields]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${adjustmentFilter}` });

  const recompute = async () => {
    setRecomputing(true);
    const res = await apiPost(`/api/projects/${projectId}/audience/scoring/recompute`, {});
    if (!res.ok) {
      setRecomputing(false);
      toast.error(res.error || "Couldn't recompute scores.");
      return;
    }
    const facets = await scanContactFacets(projectId);
    setRecomputing(false);
    if (facets) setData((d) => ({ ...d, scores: facets.scores }));
    toast.success(`Scored ${plural(res.data.contacts, "contact")} — ${number(res.data.updated)} changed.`);
  };

  const handleCreate = async (input) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const created = await createScoringRule(projectId, { id, ...input, createdBy: user?.id ?? null });
    if (!created) {
      toast.error("Couldn't create the rule.");
      return false;
    }
    setData((d) => ({ ...d, rules: [created, ...d.rules] }));
    toast.success(`Created "${created.name}". Recompute scores to apply it.`);
    return true;
  };

  const handleSave = async (id, patch) => {
    const before = rules.find((r) => r.id === id);
    setData((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
    const saved = await updateScoringRule(id, patch);
    if (!saved) {
      setData((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? before : r)) }));
      toast.error("Couldn't save the rule.");
      return;
    }
    setData((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? saved : r)) }));
    toast.success("Rule saved.");
  };

  const handleDuplicate = async (r) => {
    const user = await getUser();
    const created = await createScoringRule(projectId, {
      id: crypto.randomUUID(),
      name: `${r.name} (copy)`,
      trigger: r.trigger,
      eventName: r.eventName,
      condition: r.condition,
      points: r.points,
      frequency: r.frequency,
      decayDays: r.decayDays,
      active: false,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't duplicate the rule.");
      return;
    }
    setData((d) => ({ ...d, rules: [created, ...d.rules] }));
    toast.success("Rule duplicated as inactive.");
  };

  const toggleActive = (r) => handleSave(r.id, { active: !r.active });

  const handleDelete = async (r) => {
    setDeleteTarget(null);
    setData((d) => ({ ...d, rules: d.rules.filter((x) => x.id !== r.id) }));
    if (r.id === recordId) closeRecord();
    const ok = await softDeleteScoringRule(r.id);
    if (!ok) {
      setData((d) => ({ ...d, rules: [r, ...d.rules] }));
      toast.error("Couldn't delete the rule.");
      return;
    }
    toast.success(`Deleted "${r.name}". Recompute scores to remove its points.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete rule</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Its points come off contacts at the next recompute.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DESTRUCTIVE_BUTTON} onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = rules.find((r) => r.id === recordId);
  if (open && !catalog.loading) {
    return (
      <>
        <RuleEditor
          key={open.id}
          record={open}
          fields={fields}
          eventNames={data.eventNames}
          canEdit={canEdit}
          canDelete={canDelete}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }
  if (recordId && (loading || catalog.loading)) return <LoadingArea size={88} label="Loading rule" className="min-h-[60vh]" />;

  const filtersActive = query || statusFilter !== "all" || adjustmentFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setAdjustmentFilter("all");
  };
  const dim = (r) => !r.active && "opacity-55";
  const activeCount = rules.filter((r) => r.active).length;

  const columns = [
    { key: "name", header: "Rule", render: (r) => <span className={cn("font-medium text-foreground", dim(r))}>{r.name}</span> },
    { key: "trigger", header: "Trigger", render: (r) => <span className={cn("text-muted-foreground", dim(r))}>{triggerSummary(r, fields)}</span> },
    { key: "points", header: "Points", align: "right", render: (r) => <span className={cn(dim(r))}><PointsValue points={r.points} /></span> },
    {
      key: "frequency",
      header: "Frequency",
      render: (r) => (
        <Badge variant={r.frequency === "once" ? "purple" : "neutral"} className={cn(dim(r))}>
          {r.trigger === "attribute" ? "While matching" : r.frequency === "once" ? "Once" : "Every time"}
        </Badge>
      ),
    },
    { key: "decay", header: "Decay", className: "whitespace-nowrap text-muted-foreground", render: (r) => <span className={cn(dim(r))}>{decayLabel(r)}</span> },
    {
      key: "active",
      header: "Active",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()} className="flex">
          <Switch checked={r.active} disabled={!canEdit} onCheckedChange={() => toggleActive(r)} aria-label={`Toggle ${r.name}`} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <ActionMenu
          label={`Actions for ${r.name}`}
          items={[
            { label: canEdit ? "Edit rule" : "View rule", icon: Pencil, onSelect: () => openRecord(r.id) },
            canEdit ? { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(r) } : null,
            canEdit ? (r.active ? { label: "Disable", icon: PowerOff, onSelect: () => toggleActive(r) } : { label: "Enable", icon: Power, onSelect: () => toggleActive(r) }) : null,
            canDelete ? { separator: true } : null,
            canDelete ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(r) } : null,
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Lead Scoring"
        description="Rank contacts 0–100 from engagement, tracked events and profile data so sales and automations focus on the warmest leads."
        actions={
          canEdit ? (
            <>
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={recompute} disabled={recomputing || !activeCount}>
                {recomputing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recompute scores
              </Button>
              <Button onClick={() => setCreateOpen(true)} disabled={catalog.loading}>
                <Plus className="h-4 w-4" /> New rule
              </Button>
            </>
          ) : null
        }
      />

      <StatGrid columns={3} stats={bands} />

      <SectionCard title="Score distribution" description={loading ? "Loading scores…" : `${plural(data.scores.length, "contact")} by current lead score.`} bodyPadding={false}>
        <div className="px-3 pb-3 pt-4">{loading ? <LoadingArea size={40} label="Loading scores" className="py-12" /> : <DistributionChart buckets={buckets} />}</div>
      </SectionCard>

      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Scoring rules</h2>
        <Toolbar>
          <div className="flex items-center gap-2">
            <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
            <FilterDropdown value={adjustmentFilter} onValueChange={setAdjustmentFilter} options={ADJUSTMENT_FILTER_OPTIONS} height="h-9" />
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Search rules or triggers…" />
        </Toolbar>

        {loading ? (
          <LoadingArea size={48} label="Loading rules" panel />
        ) : (
          <div className="space-y-5">
            <DataTable
              columns={columns}
              data={pager.pageItems}
              getRowKey={(r) => r.id}
              onRowClick={(r) => openRecord(r.id)}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState
                    icon={Gauge}
                    title={filtersActive ? "No matches" : "No scoring rules yet"}
                    description={filtersActive ? "Try a different search or filter." : "Add a rule to start awarding points when contacts engage."}
                    action={
                      filtersActive ? (
                        <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                      ) : canEdit ? (
                        <Button onClick={() => setCreateOpen(true)}>
                          <Plus className="h-4 w-4" /> New rule
                        </Button>
                      ) : null
                    }
                  />
                </div>
              }
            />
            <ListPagination {...pager} itemLabel="rules" />
          </div>
        )}
      </div>

      <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} fields={fields} eventNames={data.eventNames} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default LeadScoringScreen;
