"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, GitFork, Target, Pencil, Copy, Trash2, Workflow, BarChart3, CircleCheck, Activity, Crosshair } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  Button,
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
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  StatsBar,
  SectionCard,
  SettingsList,
  SettingRow,
  StatGrid,
  InlineTitleInput,
} from "@geiger/ui";

const COND_FIELDS = ["Email engagement", "Tag", "List membership", "Lead score", "Country", "Last purchase"];
const COND_OPS = ["is", "is not", "is in", "is greater than", "is less than", "contains", "is empty"];
// Operators that compare against nothing.
const VALUELESS_OPS = ["is empty"];

// Ids are prefixed so both entities can share the single `?record=` param.
const INITIAL_CONDITIONS = [
  { id: "cond-1", name: "Has clicked recently", field: "Email engagement", op: "is", value: "clicked in 30 days", usedIn: 5 },
  { id: "cond-2", name: "High lead score", field: "Lead score", op: "is greater than", value: "75", usedIn: 3 },
  { id: "cond-3", name: "EU contact", field: "Country", op: "is in", value: "EU", usedIn: 2 },
  { id: "cond-4", name: "Not a customer", field: "Last purchase", op: "is empty", value: "", usedIn: 4 },
];

const GOAL_METRICS = ["Purchase", "Form submission", "Page visit", "Email click", "Custom event"];
const METRIC_TONE = { Purchase: "success", "Form submission": "info", "Page visit": "purple", "Email click": "warning", "Custom event": "neutral" };

const INITIAL_GOALS = [
  { id: "goal-1", name: "Completed checkout", metric: "Purchase", target: "Order value > $0", conversions: 1840 },
  { id: "goal-2", name: "Booked a demo", metric: "Form submission", target: "Demo form submitted", conversions: 420 },
  { id: "goal-3", name: "Upgraded plan", metric: "Custom event", target: "plan_upgraded fired", conversions: 230 },
];

const VIEW_OPTIONS = [
  { value: "conditions", label: "Conditions" },
  { value: "goals", label: "Goals" },
];

const FIELD_FILTER_OPTIONS = [
  { value: "all", label: "All fields" },
  ...COND_FIELDS.map((f) => ({ value: f, label: f })),
];

const METRIC_FILTER_OPTIONS = [
  { value: "all", label: "All metrics" },
  ...GOAL_METRICS.map((m) => ({ value: m, label: m })),
];

const CONDITION_NAV = [
  { key: "rule", label: "Rule", icon: GitFork, desc: "Name the condition and define the rule contacts are checked against." },
  { key: "usage", label: "Usage", icon: Workflow, desc: "Automations that branch on this condition." },
];

const GOAL_NAV = [
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Conversions recorded against this goal." },
  { key: "details", label: "Details", icon: Target, desc: "Name the goal and define what counts as a conversion." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const EMPTY_CONDITION = { name: "", field: COND_FIELDS[0], op: COND_OPS[0], value: "" };
const EMPTY_GOAL = { name: "", metric: GOAL_METRICS[0], target: "" };

// "Lead score is greater than 75" — the rule as one readable line.
const ruleText = (c) => [c.field, c.op, VALUELESS_OPS.includes(c.op) ? "" : c.value || "…"].filter(Boolean).join(" ");
const automationsLabel = (n) => `${n} ${n === 1 ? "automation" : "automations"}`;

const submitOnEnter = (submit) => (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submit();
  }
};

function CreateConditionDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_CONDITION);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Give the condition a name first.");
      return;
    }
    onCreate({ name: form.name.trim(), field: form.field, op: form.op, value: form.value.trim(), usedIn: 0 });
    setForm(EMPTY_CONDITION);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create condition</DialogTitle>
          <DialogDescription>Reusable rules that branch a contact&apos;s path inside automations.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Condition name" htmlFor="cd-name">
            <Input id="cd-name" value={form.name} onChange={(e) => set("name")(e.target.value)} onKeyDown={submitOnEnter(submit)} placeholder="e.g. High lead score" autoFocus />
          </Field>
          <Field label="Rule">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-card p-3 sm:flex-row">
              <Select value={form.field} onValueChange={set("field")}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Field"><SelectValue /></SelectTrigger>
                <SelectContent>{COND_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.op} onValueChange={set("op")}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Operator"><SelectValue /></SelectTrigger>
                <SelectContent>{COND_OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input
                value={form.value}
                onChange={(e) => set("value")(e.target.value)}
                placeholder="value"
                aria-label="Value"
                disabled={VALUELESS_OPS.includes(form.op)}
                className="flex-1"
              />
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create condition</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateGoalDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_GOAL);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Give the goal a name first.");
      return;
    }
    onCreate({ name: form.name.trim(), metric: form.metric, target: form.target.trim() || "—", conversions: 0 });
    setForm(EMPTY_GOAL);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create goal</DialogTitle>
          <DialogDescription>Goals measure the outcome an automation is driving toward.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Goal name" htmlFor="gl-name">
            <Input id="gl-name" value={form.name} onChange={(e) => set("name")(e.target.value)} onKeyDown={submitOnEnter(submit)} placeholder="e.g. Completed checkout" autoFocus />
          </Field>
          <Field label="Conversion metric">
            <Select value={form.metric} onValueChange={set("metric")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{GOAL_METRICS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Target definition" htmlFor="gl-target" hint="What exactly counts as a conversion?">
            <Input id="gl-target" value={form.target} onChange={(e) => set("target")(e.target.value)} placeholder="e.g. Order value > $0" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create goal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Delete + Save, shared by both editors.
function EditorActions({ label, dirty, onDelete, onSave }) {
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={label} className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
      <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={onSave}>
        Save
      </Button>
    </>
  );
}

// Editable slice of a condition row; compared against the row to derive dirty state.
const toConditionDraft = (c) => ({ name: c.name, field: c.field, op: c.op, value: c.value });

function ConditionEditor({ record, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toConditionDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toConditionDraft(record));
  const valueless = VALUELESS_OPS.includes(draft.op);

  const save = () => {
    const patch = { ...draft, name: draft.name.trim() || "Untitled condition", value: valueless ? "" : draft.value.trim() };
    onSave(record.id, patch);
    setDraft(toConditionDraft({ ...record, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Condition name"
          placeholder="Untitled condition"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={<span className="text-xs text-text-tertiary">Used in {automationsLabel(record.usedIn)}</span>}
      actions={<EditorActions label="Delete condition" dirty={dirty} onDelete={() => onDelete(record)} onSave={save} />}
      nav={CONDITION_NAV}
      defaultSection="rule"
    >
      {({ active }) => (
        <>
          {active === "rule" ? (
            <SectionCard bare title="Condition rule" description="The field, operator and value contacts are checked against.">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Condition name" htmlFor="ce-name" className="sm:col-span-3">
                  <Input id="ce-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. High lead score" />
                </Field>
                <Field label="Field">
                  <Select value={draft.field} onValueChange={set("field")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{COND_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Operator">
                  <Select value={draft.op} onValueChange={set("op")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{COND_OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Value" htmlFor="ce-value">
                  <Input id="ce-value" value={valueless ? "" : draft.value} onChange={(e) => set("value")(e.target.value)} placeholder={valueless ? "No value needed" : "value"} disabled={valueless} />
                </Field>
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium text-text-secondary">Contacts match when</p>
                <p className="mt-1.5 rounded-lg border border-border bg-surface-card px-3 py-2 font-mono text-xs text-foreground">{ruleText(draft)}</p>
              </div>
            </SectionCard>
          ) : null}

          {active === "usage" ? (
            <SectionCard bare title="Where it's used" description="How many workflows and journeys currently branch on this condition.">
              <SettingsList>
                <SettingRow
                  title="Used in"
                  description="Workflows and journeys that branch on this condition."
                  control={<span className="text-sm font-semibold tabular-nums text-foreground">{automationsLabel(record.usedIn)}</span>}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

// Editable slice of a goal row; compared against the row to derive dirty state.
const toGoalDraft = (g) => ({ name: g.name, metric: g.metric, target: g.target === "—" ? "" : g.target });

function GoalEditor({ record, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toGoalDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toGoalDraft(record));

  const save = () => {
    const patch = { ...draft, name: draft.name.trim() || "Untitled goal", target: draft.target.trim() || "—" };
    onSave(record.id, patch);
    setDraft(toGoalDraft({ ...record, ...patch }));
  };

  // Performance tiles, read from the saved goal.
  const performance = [
    { label: "Conversions", value: record.conversions ? record.conversions.toLocaleString("en-US") : "—", icon: CircleCheck, hint: record.conversions ? "Across every automation" : "No conversions yet" },
    { label: "Metric", value: record.metric, icon: Activity, hint: "Counts as a conversion" },
    { label: "Target", value: record.target, icon: Crosshair, hint: record.target === "—" ? "No target set" : "What has to happen" },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Goal name"
          placeholder="Untitled goal"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={METRIC_TONE[draft.metric]}>{draft.metric}</Badge>
          <span className="text-xs text-text-tertiary">{record.conversions.toLocaleString("en-US")} conversions</span>
        </>
      }
      actions={<EditorActions label="Delete goal" dirty={dirty} onDelete={() => onDelete(record)} onSave={save} />}
      nav={GOAL_NAV}
      defaultSection="performance"
    >
      {({ active }) => (
        <>
          {active === "performance" ? <StatGrid stats={performance} columns={3} /> : null}

          {active === "details" ? (
            <SectionCard bare title="Goal definition" description="The goal's name and the event that counts as a conversion.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Goal name" htmlFor="ge-name">
                  <Input id="ge-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Completed checkout" />
                </Field>
                <Field label="Conversion metric">
                  <Select value={draft.metric} onValueChange={set("metric")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{GOAL_METRICS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Target definition" htmlFor="ge-target" hint="What exactly counts as a conversion?" className="sm:col-span-2">
                  <Input id="ge-target" value={draft.target} onChange={(e) => set("target")(e.target.value)} placeholder="e.g. Order value > $0" />
                </Field>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function ConditionsGoalsScreen() {
  const [tab, setTab] = useState("conditions");
  const [conditions, setConditions] = useState(INITIAL_CONDITIONS);
  const [goals, setGoals] = useState(INITIAL_GOALS);
  const [query, setQuery] = useState("");
  const [fieldFilter, setFieldFilter] = useState("all");
  const [metricFilter, setMetricFilter] = useState("all");
  const [condOpen, setCondOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  // { kind: "condition" | "goal", record }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filteredConditions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conditions.filter((c) => {
      if (fieldFilter !== "all" && c.field !== fieldFilter) return false;
      if (q && !`${c.name} ${ruleText(c)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [conditions, query, fieldFilter]);

  const filteredGoals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return goals.filter((g) => {
      if (metricFilter !== "all" && g.metric !== metricFilter) return false;
      if (q && !`${g.name} ${g.target}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [goals, query, metricFilter]);

  const stats = useMemo(() => {
    const inUse = conditions.filter((c) => c.usedIn > 0).length;
    const conversions = goals.reduce((s, g) => s + g.conversions, 0);
    return [
      { label: "Conditions", value: conditions.length.toLocaleString("en-US") },
      { label: "Conditions in use", value: inUse.toLocaleString("en-US") },
      { label: "Goals", value: goals.length.toLocaleString("en-US") },
      { label: "Conversions", value: conversions.toLocaleString("en-US") },
    ];
  }, [conditions, goals]);

  const conditionPager = usePagination(filteredConditions, { resetKey: `${query}|${fieldFilter}` });
  const goalPager = usePagination(filteredGoals, { resetKey: `${query}|${metricFilter}` });

  const handleCreateCondition = (c) => {
    const id = crypto.randomUUID();
    setConditions((p) => [{ id, ...c }, ...p]);
    openRecord(id);
  };

  const handleCreateGoal = (g) => {
    const id = crypto.randomUUID();
    setGoals((p) => [{ id, ...g }, ...p]);
    openRecord(id);
  };

  const saveCondition = (id, patch) => {
    setConditions((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    toast.success("Condition saved.");
  };

  const saveGoal = (id, patch) => {
    setGoals((p) => p.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    toast.success("Goal saved.");
  };

  const duplicateCondition = (c) => {
    setConditions((p) => [{ ...c, id: crypto.randomUUID(), name: `${c.name} (copy)`, usedIn: 0 }, ...p]);
    toast.success("Condition duplicated.");
  };

  const duplicateGoal = (g) => {
    setGoals((p) => [{ ...g, id: crypto.randomUUID(), name: `${g.name} (copy)`, conversions: 0 }, ...p]);
    toast.success("Goal duplicated.");
  };

  const handleDelete = ({ kind, record }) => {
    setDeleteTarget(null);
    if (kind === "goal") setGoals((p) => p.filter((g) => g.id !== record.id));
    else setConditions((p) => p.filter((c) => c.id !== record.id));
    if (String(record.id) === recordId) closeRecord();
    toast.success(`Deleted "${record.name}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deleteTarget?.kind === "goal" ? "Delete goal" : "Delete condition"}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.record.name}</span>?{" "}
            {deleteTarget?.kind === "goal"
              ? "Automations stop tracking conversions against it."
              : "Automations that branch on it will need a new rule."}{" "}
            This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const openCondition = conditions.find((c) => String(c.id) === recordId);
  const openGoal = goals.find((g) => String(g.id) === recordId);

  // Keep the tab in step with the open record so Back lands on its list.
  const recordTab = openCondition ? "conditions" : openGoal ? "goals" : null;
  if (recordTab && recordTab !== tab) setTab(recordTab);

  if (openCondition) {
    return (
      <>
        <ConditionEditor
          key={openCondition.id}
          record={openCondition}
          onBack={closeRecord}
          onSave={saveCondition}
          onDelete={(record) => setDeleteTarget({ kind: "condition", record })}
        />
        {deleteDialog}
      </>
    );
  }

  if (openGoal) {
    return (
      <>
        <GoalEditor key={openGoal.id} record={openGoal} onBack={closeRecord} onSave={saveGoal} onDelete={(record) => setDeleteTarget({ kind: "goal", record })} />
        {deleteDialog}
      </>
    );
  }

  const isConditions = tab === "conditions";
  const filtersActive = query || (isConditions ? fieldFilter !== "all" : metricFilter !== "all");

  const clearFilters = () => {
    setQuery("");
    setFieldFilter("all");
    setMetricFilter("all");
  };

  const conditionColumns = [
    { key: "name", header: "Condition", className: "font-medium text-foreground", render: (c) => c.name },
    { key: "logic", header: "Logic", className: "font-mono text-xs text-muted-foreground", render: (c) => ruleText(c) },
    { key: "usedIn", header: "Used in", className: "tabular-nums text-muted-foreground", render: (c) => automationsLabel(c.usedIn) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openRecord(String(c.id)) },
            { label: "Duplicate", icon: Copy, onSelect: () => duplicateCondition(c) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget({ kind: "condition", record: c }) },
          ]}
        />
      ),
    },
  ];

  const goalColumns = [
    { key: "name", header: "Goal", className: "font-medium text-foreground", render: (g) => g.name },
    { key: "metric", header: "Metric", render: (g) => <Badge variant={METRIC_TONE[g.metric]}>{g.metric}</Badge> },
    { key: "target", header: "Target", className: "font-mono text-xs text-muted-foreground", render: (g) => g.target },
    { key: "conversions", header: "Conversions", className: "tabular-nums font-medium text-foreground", render: (g) => g.conversions.toLocaleString("en-US") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (g) => (
        <ActionMenu
          label={`Actions for ${g.name}`}
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openRecord(String(g.id)) },
            { label: "Duplicate", icon: Copy, onSelect: () => duplicateGoal(g) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget({ kind: "goal", record: g }) },
          ]}
        />
      ),
    },
  ];

  const pager = isConditions ? conditionPager : goalPager;
  const createButton = isConditions ? (
    <Button onClick={() => setCondOpen(true)}>
      <Plus className="h-4 w-4" /> New condition
    </Button>
  ) : (
    <Button onClick={() => setGoalOpen(true)}>
      <Plus className="h-4 w-4" /> New goal
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Conditions & Goals"
        description="Reusable branching rules and the outcomes your automations optimize for."
        actions={createButton}
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={tab} onValueChange={setTab} options={VIEW_OPTIONS} height="h-9" />
          {isConditions ? (
            <FilterDropdown value={fieldFilter} onValueChange={setFieldFilter} options={FIELD_FILTER_OPTIONS} height="h-9" />
          ) : (
            <FilterDropdown value={metricFilter} onValueChange={setMetricFilter} options={METRIC_FILTER_OPTIONS} height="h-9" />
          )}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder={isConditions ? "Search conditions…" : "Search goals…"} />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={isConditions ? conditionColumns : goalColumns}
          data={pager.pageItems}
          getRowKey={(r) => r.id}
          onRowClick={(r) => openRecord(String(r.id))}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={isConditions ? GitFork : Target}
                title={filtersActive ? "No matches" : isConditions ? "No conditions yet" : "No goals yet"}
                description={
                  filtersActive
                    ? "Try a different search or filter."
                    : isConditions
                      ? "Create a reusable rule to branch contacts inside automations."
                      : "Create a goal to measure what your automations are driving toward."
                }
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
        <ListPagination {...pager} itemLabel={isConditions ? "conditions" : "goals"} />
      </div>

      <CreateConditionDialog open={condOpen} onOpenChange={setCondOpen} onCreate={handleCreateCondition} />
      <CreateGoalDialog open={goalOpen} onOpenChange={setGoalOpen} onCreate={handleCreateGoal} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ConditionsGoalsScreen;
