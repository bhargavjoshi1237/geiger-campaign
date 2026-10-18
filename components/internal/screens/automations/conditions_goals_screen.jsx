"use client";

import React, { useState } from "react";
import { Plus, GitFork, Target, Pencil, Copy, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SegmentedTabs,
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
} from "@geiger/ui";

const COND_FIELDS = ["Email engagement", "Tag", "List membership", "Lead score", "Country", "Last purchase"];
const COND_OPS = ["is", "is not", "is greater than", "is less than", "contains"];

const INITIAL_CONDITIONS = [
  { id: 1, name: "Has clicked recently", logic: "Email engagement is clicked in 30 days", usedIn: 5 },
  { id: 2, name: "High lead score", logic: "Lead score is greater than 75", usedIn: 3 },
  { id: 3, name: "EU contact", logic: "Country is in EU", usedIn: 2 },
  { id: 4, name: "Not a customer", logic: "Last purchase is empty", usedIn: 4 },
];

const GOAL_METRICS = ["Purchase", "Form submission", "Page visit", "Email click", "Custom event"];
const METRIC_TONE = { Purchase: "success", "Form submission": "info", "Page visit": "purple", "Email click": "warning", "Custom event": "neutral" };

const INITIAL_GOALS = [
  { id: 1, name: "Completed checkout", metric: "Purchase", target: "Order value > $0", conversions: 1840 },
  { id: 2, name: "Booked a demo", metric: "Form submission", target: "Demo form submitted", conversions: 420 },
  { id: 3, name: "Upgraded plan", metric: "Custom event", target: "plan_upgraded fired", conversions: 230 },
];

function CreateConditionDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", field: COND_FIELDS[0], op: COND_OPS[0], value: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), logic: `${form.field} ${form.op} ${form.value || "…"}`, usedIn: 0 });
    setForm({ name: "", field: COND_FIELDS[0], op: COND_OPS[0], value: "" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create condition</DialogTitle>
          <DialogDescription>Reusable rules that branch a contact's path inside automations.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Condition name" htmlFor="cd-name">
            <Input id="cd-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. High lead score" />
          </Field>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-card p-3 sm:flex-row">
            <Select value={form.field} onValueChange={set("field")}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{COND_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.op} onValueChange={set("op")}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{COND_OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={form.value} onChange={(e) => set("value")(e.target.value)} placeholder="value" className="flex-1" />
          </div>
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
  const [form, setForm] = useState({ name: "", metric: GOAL_METRICS[0], target: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), metric: form.metric, target: form.target.trim() || "—", conversions: 0 });
    setForm({ name: "", metric: GOAL_METRICS[0], target: "" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create goal</DialogTitle>
          <DialogDescription>Goals measure the outcome an automation is driving toward.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Goal name" htmlFor="gl-name">
            <Input id="gl-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Completed checkout" />
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

export function ConditionsGoalsScreen() {
  const [tab, setTab] = useState("conditions");
  const [conditions, setConditions] = useState(INITIAL_CONDITIONS);
  const [goals, setGoals] = useState(INITIAL_GOALS);
  const [query, setQuery] = useState("");
  const [condOpen, setCondOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const fConditions = conditions.filter((c) => c.name.toLowerCase().includes(q));
  const fGoals = goals.filter((g) => g.name.toLowerCase().includes(q));

  const conditionColumns = [
    { key: "name", header: "Condition", className: "font-medium text-foreground", render: (c) => c.name },
    { key: "logic", header: "Logic", className: "font-mono text-xs text-muted-foreground", render: (c) => c.logic },
    { key: "usedIn", header: "Used in", className: "tabular-nums text-muted-foreground", render: (c) => `${c.usedIn} automations` },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Duplicate", icon: Copy },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConditions((p) => p.filter((x) => x.id !== c.id)) },
          ]}
        />
      ),
    },
  ];

  const goalColumns = [
    { key: "name", header: "Goal", className: "font-medium text-foreground", render: (g) => g.name },
    { key: "metric", header: "Metric", render: (g) => <Badge variant={METRIC_TONE[g.metric]}>{g.metric}</Badge> },
    { key: "target", header: "Target", className: "font-mono text-xs text-muted-foreground", render: (g) => g.target },
    { key: "conversions", header: "Conversions", className: "tabular-nums font-medium text-foreground", render: (g) => g.conversions.toLocaleString() },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (g) => (
        <ActionMenu
          label={`Actions for ${g.name}`}
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Duplicate", icon: Copy },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setGoals((p) => p.filter((x) => x.id !== g.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Conditions & Goals"
        description="Reusable branching rules and the outcomes your automations optimize for."
        actions={
          tab === "conditions" ? (
            <Button onClick={() => setCondOpen(true)}><Plus className="h-4 w-4" /> New condition</Button>
          ) : (
            <Button onClick={() => setGoalOpen(true)}><Plus className="h-4 w-4" /> New goal</Button>
          )
        }
      />

      <Toolbar>
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { label: "Conditions", value: "conditions", icon: GitFork },
            { label: "Goals", value: "goals", icon: Target },
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder={tab === "conditions" ? "Search conditions…" : "Search goals…"} />
      </Toolbar>

      {tab === "conditions" ? (
        <DataTable
          columns={conditionColumns}
          data={fConditions}
          getRowKey={(c) => c.id}
          empty={
            <EmptyState
              icon={GitFork}
              title="No conditions found"
              description="Try a different search, or create a new condition."
              className="rounded-xl border border-border bg-surface-subtle"
              action={<Button onClick={() => setCondOpen(true)}><Plus className="h-4 w-4" /> New condition</Button>}
            />
          }
        />
      ) : (
        <DataTable
          columns={goalColumns}
          data={fGoals}
          getRowKey={(g) => g.id}
          empty={
            <EmptyState
              icon={Target}
              title="No goals found"
              description="Try a different search, or create a new goal."
              className="rounded-xl border border-border bg-surface-subtle"
              action={<Button onClick={() => setGoalOpen(true)}><Plus className="h-4 w-4" /> New goal</Button>}
            />
          }
        />
      )}

      <CreateConditionDialog open={condOpen} onOpenChange={setCondOpen} onCreate={(c) => setConditions((p) => [{ id: Date.now(), ...c }, ...p])} />
      <CreateGoalDialog open={goalOpen} onOpenChange={setGoalOpen} onCreate={(g) => setGoals((p) => [{ id: Date.now(), ...g }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ConditionsGoalsScreen;
