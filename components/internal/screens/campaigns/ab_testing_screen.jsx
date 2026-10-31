"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, FlaskConical, Trophy, Pencil, Copy, BarChart3, Play, StopCircle, Trash2, Settings2, Split, Target, TrendingUp } from "lucide-react";
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
  Toolbar,
  DataTable,
  EmptyState,
  ActionMenu,
  Field,
  StatsBar,
  StatusPill,
  SectionCard,
  SettingsList,
  SettingRow,
  StatGrid,
  InlineTitleInput,
} from "@geiger/ui";

const STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral" },
  Running: { label: "Running", variant: "warning" },
  Completed: { label: "Completed", variant: "success" },
  Stopped: { label: "Stopped", variant: "outline" },
};
const TEST_WHAT = ["Subject line", "Email content", "Send time", "From name"];
const METRICS = ["Open rate", "Click-through rate", "Revenue", "Conversions"];
const VARIANT_COUNTS = ["2", "3", "4"];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.keys(STATUS_MAP).map((s) => ({ value: s, label: s })),
];

const TESTING_FILTER_OPTIONS = [
  { value: "all", label: "All test types" },
  ...TEST_WHAT.map((t) => ({ value: t, label: t })),
];

const INITIAL = [
  { id: 1, name: "Subject — emoji vs none", testing: "Subject line", variants: 2, metric: "Open rate", status: "Completed", winner: "Variant B", uplift: 12.4 },
  { id: 2, name: "Hero image A/B/C", testing: "Email content", variants: 3, metric: "Click-through rate", status: "Running", winner: "—", uplift: 0 },
  { id: 3, name: "Morning vs evening send", testing: "Send time", variants: 2, metric: "Open rate", status: "Running", winner: "—", uplift: 0 },
  { id: 4, name: "CTA copy test", testing: "Email content", variants: 2, metric: "Conversions", status: "Draft", winner: "—", uplift: 0 },
];

const TEST_NAV = [
  { key: "results", label: "Results", icon: BarChart3, desc: "Status and the winning variant once the test completes." },
  { key: "setup", label: "Setup", icon: Settings2, desc: "What you're testing, how many variants, and how the winner is picked." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const EMPTY_FORM = { name: "", testing: TEST_WHAT[0], variants: "2", metric: METRICS[0] };

function CreateTestDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Give the test a name first.");
      return;
    }
    onCreate({ name: form.name.trim(), testing: form.testing, variants: parseInt(form.variants, 10), metric: form.metric, status: "Draft", winner: "—", uplift: 0 });
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create A/B test</DialogTitle>
          <DialogDescription>Split your audience across variants and let the winner send automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Test name" htmlFor="ab-name">
            <Input
              id="ab-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Subject line test"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="What to test">
              <Select value={form.testing} onValueChange={set("testing")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TEST_WHAT.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Variants">
              <Select value={form.variants} onValueChange={set("variants")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{VARIANT_COUNTS.map((v) => <SelectItem key={v} value={v}>{v} variants</SelectItem>)}</SelectContent>
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

// Editable slice of a test row; compared against the row to derive dirty state.
const toDraft = (t) => ({ name: t.name, testing: t.testing, variants: String(t.variants), metric: t.metric });

function TestEditor({ record, defaultSection, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  // Changing the setup mid-test would invalidate the results.
  const locked = record.status !== "Draft";

  const save = () => {
    const patch = { ...draft, name: draft.name.trim() || "Untitled test", variants: parseInt(draft.variants, 10) };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

  // Results tiles; uplift reads "—" until the test completes.
  const completed = record.status === "Completed";
  const results = [
    { label: "Variants", value: record.variants.toLocaleString("en-US"), icon: Split, hint: `Testing ${record.testing.toLowerCase()}` },
    { label: "Winning metric", value: record.metric, icon: Target, hint: "Decides the winner" },
    { label: "Uplift", value: completed ? `+${record.uplift}%` : "—", icon: TrendingUp, hint: completed ? "Winner over the control" : "Once the test completes" },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Test name"
          placeholder="Untitled test"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={STATUS_MAP}
      badges={<span className="text-xs text-text-tertiary">{record.variants} variants · {record.testing}</span>}
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete test" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={TEST_NAV}
      defaultSection={defaultSection}
    >
      {({ active }) => (
        <>
          {active === "results" ? (
            <div className="space-y-6">
              <StatGrid stats={results} columns={3} />
              <SectionCard bare title="Outcome" description="Where the test is in its run and which variant won.">
                <SettingsList>
                  <SettingRow title="Status" description="Where the test is in its run." control={<StatusPill status={record.status} map={STATUS_MAP} />} />
                  <SettingRow
                    title="Winner"
                    description={`Picked on ${record.metric.toLowerCase()} when the test completes.`}
                    control={<span className="text-sm font-medium text-foreground">{completed ? record.winner : "—"}</span>}
                  />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}

          {active === "setup" ? (
            <SectionCard bare title="Test design" description="What the variants differ on and the metric that decides the winner.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Test name" htmlFor="abe-name" className="sm:col-span-2">
                  <Input id="abe-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Subject line test" />
                </Field>
                <Field label="What to test" hint={locked ? "Setup is locked once a test has started." : undefined}>
                  <Select value={draft.testing} onValueChange={set("testing")} disabled={locked}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TEST_WHAT.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Variants">
                  <Select value={draft.variants} onValueChange={set("variants")} disabled={locked}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{VARIANT_COUNTS.map((v) => <SelectItem key={v} value={v}>{v} variants</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Winning metric" hint="The variant that performs best on this metric is sent to the remaining audience." className="sm:col-span-2">
                  <Select value={draft.metric} onValueChange={set("metric")} disabled={locked}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{METRICS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function ABTestingScreen() {
  const [tests, setTests] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [testingFilter, setTestingFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Section the editor lands on; results by default, like Events' Overview.
  const [entrySection, setEntrySection] = useState("results");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (testingFilter !== "all" && t.testing !== testingFilter) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tests, query, statusFilter, testingFilter]);

  const stats = useMemo(() => {
    const completed = tests.filter((t) => t.status === "Completed");
    const avgUplift = completed.length ? completed.reduce((s, t) => s + t.uplift, 0) / completed.length : null;
    return [
      { label: "Tests", value: tests.length.toLocaleString("en-US") },
      { label: "Running", value: tests.filter((t) => t.status === "Running").length.toLocaleString("en-US") },
      { label: "Completed", value: completed.length.toLocaleString("en-US") },
      { label: "Avg. uplift", value: avgUplift === null ? "—" : `+${avgUplift.toFixed(1)}%` },
    ];
  }, [tests]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${testingFilter}` });

  const openTest = (id, section = "results") => {
    setEntrySection(section);
    openRecord(String(id));
  };

  const handleCreate = (t) => {
    const id = crypto.randomUUID();
    setTests((p) => [{ id, ...t }, ...p]);
    openTest(id);
  };

  const handleSave = (id, patch) => {
    setTests((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    toast.success("Test saved.");
  };

  const handleDuplicate = (t) => {
    setTests((p) => [{ ...t, id: crypto.randomUUID(), name: `${t.name} (copy)`, status: "Draft", winner: "—", uplift: 0 }, ...p]);
    toast.success("Test duplicated as a draft.");
  };

  const setStatus = (t, status) => {
    setTests((p) => p.map((x) => (x.id === t.id ? { ...x, status } : x)));
    toast.success(status === "Running" ? `Started "${t.name}".` : `Stopped "${t.name}".`);
  };

  const handleDelete = (t) => {
    setDeleteTarget(null);
    setTests((p) => p.filter((x) => x.id !== t.id));
    if (String(t.id) === recordId) closeRecord();
    toast.success(`Deleted "${t.name}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete test</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Its variants and results are removed. This can&apos;t be undone.
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

  const open = tests.find((t) => String(t.id) === recordId);
  if (open) {
    return (
      <>
        <TestEditor key={open.id} record={open} defaultSection={entrySection} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || testingFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setTestingFilter("all");
  };

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
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (t) => <StatusPill status={t.status} map={STATUS_MAP} /> },
    {
      key: "result",
      header: "Result",
      render: (t) =>
        t.status === "Completed" ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="font-medium text-foreground">{t.winner}</span>
            <span className="tabular-nums text-emerald-600 dark:text-emerald-400">+{t.uplift}%</span>
          </span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.name}`}
          items={[
            { label: "Edit test", icon: Pencil, onSelect: () => openTest(t.id) },
            { label: "View results", icon: BarChart3, onSelect: () => openTest(t.id, "results") },
            { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(t) },
            t.status === "Draft" && { label: "Start test", icon: Play, onSelect: () => setStatus(t, "Running") },
            t.status === "Running" && { label: "Stop test", icon: StopCircle, onSelect: () => setStatus(t, "Stopped") },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(t) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="A/B Testing"
        description="Experiment with subject lines, content, and send times — and ship the winner."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create test
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={testingFilter} onValueChange={setTestingFilter} options={TESTING_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search tests…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(t) => t.id}
          onRowClick={(t) => openTest(t.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={FlaskConical}
                title={filtersActive ? "No matches" : "No tests yet"}
                description={filtersActive ? "Try a different search or filter." : "Create a test to compare subject lines, content, or send times."}
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> Create test
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="tests" />
      </div>

      <CreateTestDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ABTestingScreen;
