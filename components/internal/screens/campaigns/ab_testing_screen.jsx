"use client";

import React, { useState } from "react";
import { Plus, FlaskConical, Trophy, Pencil, BarChart3, StopCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
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

const STATUS_TONE = { Running: "amber", Completed: "green", Draft: "zinc" };
const TEST_WHAT = ["Subject line", "Email content", "Send time", "From name"];
const METRICS = ["Open rate", "Click-through rate", "Revenue", "Conversions"];

const INITIAL = [
  { id: 1, name: "Subject — emoji vs none", testing: "Subject line", variants: 2, metric: "Open rate", status: "Completed", winner: "Variant B", uplift: 12.4 },
  { id: 2, name: "Hero image A/B/C", testing: "Email content", variants: 3, metric: "Click-through rate", status: "Running", winner: "—", uplift: 0 },
  { id: 3, name: "Morning vs evening send", testing: "Send time", variants: 2, metric: "Open rate", status: "Running", winner: "—", uplift: 0 },
  { id: 4, name: "CTA copy test", testing: "Email content", variants: 2, metric: "Conversions", status: "Draft", winner: "—", uplift: 0 },
];

function CreateTestDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", testing: TEST_WHAT[0], variants: "2", metric: METRICS[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), testing: form.testing, variants: parseInt(form.variants, 10), metric: form.metric, status: "Draft", winner: "—", uplift: 0 });
    setForm({ name: "", testing: TEST_WHAT[0], variants: "2", metric: METRICS[0] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create A/B test</DialogTitle>
          <DialogDescription>Split your audience across variants and let the winner send automatically.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Test name" htmlFor="ab-name">
            <Input id="ab-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Subject line test" className="bg-background border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="What to test">
              <Select value={form.testing} onValueChange={set("testing")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TEST_WHAT.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Variants">
              <Select value={form.variants} onValueChange={set("variants")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["2", "3", "4"].map((v) => <SelectItem key={v} value={v}>{v} variants</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Winning metric" hint="The variant that performs best on this metric is sent to the remaining audience.">
            <Select value={form.metric} onValueChange={set("metric")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METRICS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ABTestingScreen() {
  const [tests, setTests] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = tests.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="A/B Testing"
        description="Experiment with subject lines, content, and send times — and ship the winner."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> Create test</Button>
        }
      />

      <div className="border-t border-surface-active pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search tests…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Test</TableHead>
              <TableHead>Testing</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                      <FlaskConical className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-foreground">{t.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{t.testing}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{t.variants}</TableCell>
                <TableCell className="text-muted-foreground">{t.metric}</TableCell>
                <TableCell><Pill tone={STATUS_TONE[t.status]}>{t.status}</Pill></TableCell>
                <TableCell>
                  {t.status === "Completed" ? (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <Trophy className="h-3.5 w-3.5 text-amber-400" />
                      <span className="font-medium text-foreground">{t.winner}</span>
                      <span className="text-emerald-400 tabular-nums">+{t.uplift}%</span>
                    </span>
                  ) : <span className="text-text-secondary">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions items={[
                    { label: "Edit test", icon: Pencil },
                    { label: "View results", icon: BarChart3 },
                    { label: "Stop test", icon: StopCircle },
                    { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setTests((p) => p.filter((x) => x.id !== t.id)) },
                  ]} />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent"><TableCell colSpan={7} className="py-14 text-center text-sm text-text-secondary">No tests found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateTestDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTests((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ABTestingScreen;
