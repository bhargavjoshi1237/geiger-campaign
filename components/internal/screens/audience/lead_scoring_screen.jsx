"use client";

import React, { useState } from "react";
import { Plus, Pencil, Trash2, Gauge, Flame, ThermometerSun, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import {
  TableShell,
  Pill,
  RowActions,
  Field,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BANDS = [
  { key: "hot", label: "Hot", range: "75–100", count: 1240, icon: Flame, tone: "text-red-400", bg: "bg-red-500/10 border-red-500/25" },
  { key: "warm", label: "Warm", range: "40–74", count: 6820, icon: ThermometerSun, tone: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/25" },
  { key: "cold", label: "Cold", range: "0–39", count: 14160, icon: Snowflake, tone: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/25" },
];

const TRIGGERS = [
  "Opens an email",
  "Clicks a link",
  "Visits pricing page",
  "Submits a form",
  "Starts a free trial",
  "Email bounces",
  "Unsubscribes",
  "No activity for 30 days",
];

const INITIAL_RULES = [
  { id: 1, name: "Clicked a campaign link", trigger: "Clicks a link", points: 10, frequency: "Every time", active: true },
  { id: 2, name: "Viewed pricing", trigger: "Visits pricing page", points: 15, frequency: "Once", active: true },
  { id: 3, name: "Started a trial", trigger: "Starts a free trial", points: 30, frequency: "Once", active: true },
  { id: 4, name: "Opened an email", trigger: "Opens an email", points: 2, frequency: "Every time", active: true },
  { id: 5, name: "Went quiet", trigger: "No activity for 30 days", points: -20, frequency: "Every time", active: false },
];

function CreateRuleDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", trigger: TRIGGERS[0], direction: "add", points: "10", frequency: "Every time" });

  const submit = () => {
    if (!form.name.trim()) return;
    const magnitude = Math.abs(parseInt(form.points, 10) || 0);
    onCreate({
      name: form.name.trim(),
      trigger: form.trigger,
      points: form.direction === "subtract" ? -magnitude : magnitude,
      frequency: form.frequency,
      active: true,
    });
    setForm({ name: "", trigger: TRIGGERS[0], direction: "add", points: "10", frequency: "Every time" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New scoring rule</DialogTitle>
          <DialogDescription>Award or deduct points when contacts take an action.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Rule name" htmlFor="r-name">
            <Input id="r-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Clicked a campaign link" className="bg-background border-border" />
          </Field>
          <Field label="When a contact">
            <Select value={form.trigger} onValueChange={(v) => setForm((f) => ({ ...f, trigger: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Adjustment">
              <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add points</SelectItem>
                  <SelectItem value="subtract">Subtract points</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Points" htmlFor="r-points">
              <Input id="r-points" type="number" min="0" value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))} className="bg-background border-border" />
            </Field>
          </div>
          <Field label="Apply">
            <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Every time">Every time it happens</SelectItem>
                <SelectItem value="Once">Only the first time</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create rule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadScoringScreen() {
  const [rules, setRules] = useState(INITIAL_RULES);
  const [createOpen, setCreateOpen] = useState(false);

  const toggleActive = (id) =>
    setRules((p) => p.map((r) => (r.id === id ? { ...r, active: !r.active } : r)));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Lead Scoring"
        description="Rank contacts by engagement so sales and automations focus on the warmest leads."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New rule
          </Button>
        }
      />

      {/* Score bands */}
      <div className="grid grid-cols-1 gap-4 border-t border-surface-active pt-4 sm:grid-cols-3">
        {BANDS.map((b) => (
          <div key={b.key} className="rounded-xl border border-border bg-surface-subtle p-4">
            <div className="flex items-center justify-between">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", b.bg)}>
                <b.icon className={cn("h-4 w-4", b.tone)} />
              </span>
              <span className="font-mono text-xs text-text-secondary">{b.range}</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-white tabular-nums">{b.count.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{b.label} leads</p>
          </div>
        ))}
      </div>

      {/* Rules table */}
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-text-secondary" />
        <h2 className="text-sm font-semibold text-foreground">Scoring rules</h2>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Rule</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id} className={cn("border-border", !r.active && "opacity-55")}>
                <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.trigger}</TableCell>
                <TableCell>
                  <span className={cn("font-semibold tabular-nums", r.points >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {r.points >= 0 ? `+${r.points}` : r.points}
                  </span>
                </TableCell>
                <TableCell><Pill tone={r.frequency === "Once" ? "violet" : "zinc"}>{r.frequency}</Pill></TableCell>
                <TableCell>
                  <Switch checked={r.active} onCheckedChange={() => toggleActive(r.id)} />
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit rule", icon: Pencil },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setRules((p) => p.filter((x) => x.id !== r.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>

      <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(r) => setRules((p) => [{ id: Date.now(), ...r }, ...p])} />
    </MainScreenWrapper>
  );
}

export default LeadScoringScreen;
