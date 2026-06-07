"use client";

import React, { useState } from "react";
import { Plus, GitFork, Target, Pencil, Copy, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const COND_FIELDS = ["Email engagement", "Tag", "List membership", "Lead score", "Country", "Last purchase"];
const COND_OPS = ["is", "is not", "is greater than", "is less than", "contains"];

const INITIAL_CONDITIONS = [
  { id: 1, name: "Has clicked recently", logic: "Email engagement is clicked in 30 days", usedIn: 5 },
  { id: 2, name: "High lead score", logic: "Lead score is greater than 75", usedIn: 3 },
  { id: 3, name: "EU contact", logic: "Country is in EU", usedIn: 2 },
  { id: 4, name: "Not a customer", logic: "Last purchase is empty", usedIn: 4 },
];

const GOAL_METRICS = ["Purchase", "Form submission", "Page visit", "Email click", "Custom event"];
const METRIC_TONE = { Purchase: "green", "Form submission": "blue", "Page visit": "violet", "Email click": "amber", "Custom event": "zinc" };

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
        <DialogBody className="space-y-4 py-4">
          <Field label="Condition name" htmlFor="cd-name">
            <Input id="cd-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. High lead score" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="flex flex-col gap-2 rounded-lg border border-[#2a2a2a] bg-[#202020] p-3 sm:flex-row">
            <Select value={form.field} onValueChange={set("field")}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{COND_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.op} onValueChange={set("op")}>
              <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{COND_OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={form.value} onChange={(e) => set("value")(e.target.value)} placeholder="value" className="flex-1 bg-[#161616] border-[#2a2a2a]" />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create condition</Button>
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Goal name" htmlFor="gl-name">
            <Input id="gl-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Completed checkout" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Conversion metric">
            <Select value={form.metric} onValueChange={set("metric")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GOAL_METRICS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Target definition" htmlFor="gl-target" hint="What exactly counts as a conversion?">
            <Input id="gl-target" value={form.target} onChange={(e) => set("target")(e.target.value)} placeholder="e.g. Order value > $0" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create goal</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Conditions & Goals"
        description="Reusable branching rules and the outcomes your automations optimize for."
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { label: "Conditions", value: "conditions", icon: GitFork },
            { label: "Goals", value: "goals", icon: Target },
          ]}
        />
        <div className="flex items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder={tab === "conditions" ? "Search conditions…" : "Search goals…"} />
          {tab === "conditions" ? (
            <Button onClick={() => setCondOpen(true)} className="h-9 shrink-0 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> New condition</Button>
          ) : (
            <Button onClick={() => setGoalOpen(true)} className="h-9 shrink-0 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> New goal</Button>
          )}
        </div>
      </div>

      {tab === "conditions" ? (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead>Condition</TableHead>
                <TableHead>Logic</TableHead>
                <TableHead>Used in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fConditions.map((c) => (
                <TableRow key={c.id} className="border-[#2a2a2a]">
                  <TableCell className="font-medium text-[#ededed]">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs text-[#a3a3a3]">{c.logic}</TableCell>
                  <TableCell className="tabular-nums text-[#a3a3a3]">{c.usedIn} automations</TableCell>
                  <TableCell className="text-right">
                    <RowActions items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Duplicate", icon: Copy },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setConditions((p) => p.filter((x) => x.id !== c.id)) },
                    ]} />
                  </TableCell>
                </TableRow>
              ))}
              {fConditions.length === 0 && (
                <TableRow className="border-[#2a2a2a] hover:bg-transparent"><TableCell colSpan={4} className="py-14 text-center text-sm text-[#737373]">No conditions found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead>Goal</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Conversions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fGoals.map((g) => (
                <TableRow key={g.id} className="border-[#2a2a2a]">
                  <TableCell className="font-medium text-[#ededed]">{g.name}</TableCell>
                  <TableCell><Pill tone={METRIC_TONE[g.metric]}>{g.metric}</Pill></TableCell>
                  <TableCell className="font-mono text-xs text-[#a3a3a3]">{g.target}</TableCell>
                  <TableCell className="tabular-nums font-medium text-[#ededed]">{g.conversions.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <RowActions items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Duplicate", icon: Copy },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setGoals((p) => p.filter((x) => x.id !== g.id)) },
                    ]} />
                  </TableCell>
                </TableRow>
              ))}
              {fGoals.length === 0 && (
                <TableRow className="border-[#2a2a2a] hover:bg-transparent"><TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No goals found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      )}

      <CreateConditionDialog open={condOpen} onOpenChange={setCondOpen} onCreate={(c) => setConditions((p) => [{ id: Date.now(), ...c }, ...p])} />
      <CreateGoalDialog open={goalOpen} onOpenChange={setGoalOpen} onCreate={(g) => setGoals((p) => [{ id: Date.now(), ...g }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ConditionsGoalsScreen;
