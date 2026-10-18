"use client";

import React, { useState } from "react";
import { Plus, FlaskConical, Trophy, Pencil, BarChart3, StopCircle, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const STATUS_TONE = { Running: "warning", Completed: "success", Draft: "neutral" };
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
        <div className="space-y-4 py-4">
          <Field label="Test name" htmlFor="ab-name">
            <Input id="ab-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Subject line test" className="border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="What to test">
              <Select value={form.testing} onValueChange={set("testing")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TEST_WHAT.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Variants">
              <Select value={form.variants} onValueChange={set("variants")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{["2", "3", "4"].map((v) => <SelectItem key={v} value={v}>{v} variants</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Winning metric" hint="The variant that performs best on this metric is sent to the remaining audience.">
            <Select value={form.metric} onValueChange={set("metric")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{METRICS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create test</Button>
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

  const columns = [
    {
      key: "test",
      header: "Test",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <FlaskConical className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{t.name}</span>
        </div>
      ),
    },
    { key: "testing", header: "Testing", className: "text-muted-foreground", render: (t) => t.testing },
    { key: "variants", header: "Variants", className: "tabular-nums text-muted-foreground", render: (t) => t.variants },
    { key: "metric", header: "Metric", className: "text-muted-foreground", render: (t) => t.metric },
    { key: "status", header: "Status", render: (t) => <Badge variant={STATUS_TONE[t.status]}>{t.status}</Badge> },
    {
      key: "result",
      header: "Result",
      render: (t) =>
        t.status === "Completed" ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="font-medium text-foreground">{t.winner}</span>
            <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">+{t.uplift}%</span>
          </span>
        ) : <span className="text-text-secondary">—</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (t) => (
        <ActionMenu items={[
          { label: "Edit test", icon: Pencil },
          { label: "View results", icon: BarChart3 },
          { label: "Stop test", icon: StopCircle },
          { separator: true },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setTests((p) => p.filter((x) => x.id !== t.id)) },
        ]} />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="A/B Testing"
        description="Experiment with subject lines, content, and send times — and ship the winner."
        actions={
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create test</Button>
        }
      />

      <Toolbar>
        <div />
        <SearchInput value={query} onChange={setQuery} placeholder="Search tests…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(t) => t.id}
        empty={
          <EmptyState
            icon={FlaskConical}
            title="No tests found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create test</Button>}
          />
        }
      />

      <CreateTestDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTests((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ABTestingScreen;
