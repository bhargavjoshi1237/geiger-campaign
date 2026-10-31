"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Building2, Globe, Mail, Pencil, Play, RotateCcw, Settings2, Target, Trash2 } from "lucide-react";
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
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  StatsBar,
  Toolbar,
  SearchInput,
  SectionCard,
  DataTable,
  EmptyState,
  StatusPill,
  ActionMenu,
  Field,
  InlineTitleInput,
} from "@geiger/ui";
import { DeleteDialog, OUTLINE_BUTTON, PRIMARY_BUTTON } from "./deliverability_kit";

const PROVIDER_META = {
  Gmail: { icon: Mail, label: "Consumer" },
  Outlook: { icon: Mail, label: "Consumer" },
  Yahoo: { icon: Globe, label: "Consumer" },
  "Apple Mail": { icon: Mail, label: "Consumer" },
  Corporate: { icon: Building2, label: "Microsoft 365 / Workspace" },
};

const SENDERS = ["news@mail.halcyon.studio", "hello@news.brightlabs.io", "team@send.northwind.co"];

// Newest first; each test holds one placement row per mailbox provider.
const INITIAL = [
  {
    id: 1,
    name: "June newsletter seed test",
    subject: "Summer Sale — early access just for you",
    from: SENDERS[0],
    tested: "2026-06-06",
    results: [
      { provider: "Gmail", inbox: 94, spam: 4, missing: 2 },
      { provider: "Outlook", inbox: 81, spam: 14, missing: 5 },
      { provider: "Yahoo", inbox: 89, spam: 8, missing: 3 },
      { provider: "Apple Mail", inbox: 97, spam: 2, missing: 1 },
      { provider: "Corporate", inbox: 73, spam: 19, missing: 8 },
    ],
  },
  {
    id: 2,
    name: "Spring sale pre-send",
    subject: "Last chance: 30% off ends tonight",
    from: SENDERS[0],
    tested: "2026-05-20",
    results: [
      { provider: "Gmail", inbox: 91, spam: 6, missing: 3 },
      { provider: "Outlook", inbox: 78, spam: 17, missing: 5 },
      { provider: "Yahoo", inbox: 86, spam: 10, missing: 4 },
      { provider: "Apple Mail", inbox: 96, spam: 3, missing: 1 },
      { provider: "Corporate", inbox: 70, spam: 22, missing: 8 },
    ],
  },
  {
    id: 3,
    name: "Product digest baseline",
    subject: "What's new at Brightlabs this month",
    from: SENDERS[1],
    tested: "2026-04-29",
    results: [
      { provider: "Gmail", inbox: 96, spam: 3, missing: 1 },
      { provider: "Outlook", inbox: 92, spam: 6, missing: 2 },
      { provider: "Yahoo", inbox: 94, spam: 4, missing: 2 },
      { provider: "Apple Mail", inbox: 98, spam: 1, missing: 1 },
      { provider: "Corporate", inbox: 88, spam: 9, missing: 3 },
    ],
  },
];

// A test averaging at least this inbox rate is healthy.
const HEALTHY_INBOX = 90;

const HEALTH_MAP = {
  Healthy: { label: "Healthy", variant: "success", dotClass: "bg-emerald-400" },
  "Needs attention": { label: "Needs attention", variant: "warning", dotClass: "bg-amber-400" },
};

const HEALTH_FILTER_OPTIONS = [
  { value: "all", label: "All results" },
  ...Object.keys(HEALTH_MAP).map((h) => ({ value: h, label: h })),
];

const TEST_NAV = [
  { key: "results", label: "Results", icon: BarChart3, desc: "Where the seed messages landed at each mailbox provider." },
  { key: "setup", label: "Setup", icon: Settings2, desc: "The test name and the message that was sent to the seed list." },
];

const average = (t, key) => Math.round(t.results.reduce((n, r) => n + r[key], 0) / t.results.length);
const worstProvider = (t) => t.results.reduce((w, r) => (r.inbox < w.inbox ? r : w), t.results[0]);
const testHealth = (t) => (average(t, "inbox") >= HEALTHY_INBOX ? "Healthy" : "Needs attention");

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// A fresh run lands near the previous placement, within a few points per provider.
const rerunResults = (results) =>
  results.map((r) => {
    const inbox = clamp(r.inbox + Math.round((Math.random() - 0.5) * 6), 40, 99);
    const spam = clamp(r.spam + Math.round((Math.random() - 0.5) * 4), 0, 100 - inbox);
    return { provider: r.provider, inbox, spam, missing: 100 - inbox - spam };
  });

function ProviderCell({ provider }) {
  const meta = PROVIDER_META[provider];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{provider}</span>
        <span className="truncate text-xs text-text-secondary">{meta.label}</span>
      </div>
    </div>
  );
}

function InboxBar({ value }) {
  return (
    <div className="flex w-40 items-center gap-3">
      <Progress value={value} className="h-1.5 bg-surface-hover" />
      <span className="tabular-nums text-xs font-medium text-emerald-700 dark:text-emerald-300">{value}%</span>
    </div>
  );
}

const RESULT_COLUMNS = [
  { key: "provider", header: "Provider", render: (r) => <ProviderCell provider={r.provider} /> },
  { key: "inbox", header: "Inbox %", render: (r) => <InboxBar value={r.inbox} /> },
  { key: "spam", header: "Spam %", className: "tabular-nums text-muted-foreground", render: (r) => `${r.spam}%` },
  { key: "missing", header: "Missing %", className: "tabular-nums text-muted-foreground", render: (r) => `${r.missing}%` },
];

const EMPTY_FORM = { name: "", subject: "", from: SENDERS[0] };

function RunTestDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Give the test a name first.");
      return;
    }
    onCreate({ name: form.name.trim(), subject: form.subject.trim() || "(no subject)", from: form.from });
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run placement test</DialogTitle>
          <DialogDescription>We&apos;ll send this message to our seed inboxes and report where it lands at each provider.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Test name" htmlFor="ip-name">
            <Input
              id="ip-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submit();
              }}
              placeholder="e.g. July newsletter pre-send"
              autoFocus
            />
          </Field>
          <Field label="Subject line" htmlFor="ip-subject">
            <Input id="ip-subject" value={form.subject} onChange={(e) => set("subject")(e.target.value)} placeholder="The subject you plan to send" />
          </Field>
          <Field label="Send from">
            <Select value={form.from} onValueChange={set("from")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{SENDERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={!form.name.trim()}>
            <Play className="h-4 w-4" /> Run test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a test; compared against the test to derive dirty state.
const toDraft = (t) => ({ name: t.name, subject: t.subject, from: t.from });

function PlacementEditor({ record, onBack, onSave, onRerun, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));

  const save = () => {
    const patch = { ...draft, name: draft.name.trim() || "Untitled test", subject: draft.subject.trim() || "(no subject)" };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

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
      badges={
        <>
          <StatusPill status={testHealth(record)} map={HEALTH_MAP} />
          <span className="text-xs text-text-tertiary">
            {average(record, "inbox")}% average inbox · Tested {formatDate(record.tested)}
          </span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete test" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onRerun(record)}>
            <RotateCcw className="h-4 w-4" /> Run again
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={TEST_NAV}
      defaultSection="results"
    >
      {({ active }) => (
        <>
          {active === "results" ? (
            <DataTable columns={RESULT_COLUMNS} data={record.results} getRowKey={(r) => r.provider} />
          ) : null}

          {active === "setup" ? (
            <SectionCard bare title="Test message" description="What the test is called and the message sent to the seed list.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Test name" htmlFor="pe-name">
                  <Input id="pe-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. July newsletter pre-send" />
                </Field>
                <Field label="Send from">
                  <Select value={draft.from} onValueChange={set("from")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{SENDERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Subject line" htmlFor="pe-subject" hint="Used on the next run; existing results stay as they are." className="sm:col-span-2">
                  <Input id="pe-subject" value={draft.subject} onChange={(e) => set("subject")(e.target.value)} />
                </Field>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function InboxPlacementScreen() {
  const [tests, setTests] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter((t) => {
      if (healthFilter !== "all" && testHealth(t) !== healthFilter) return false;
      if (q && !`${t.name} ${t.subject}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tests, query, healthFilter]);

  const stats = useMemo(() => {
    const latest = [...tests].sort((a, b) => b.tested.localeCompare(a.tested))[0];
    const worst = latest ? worstProvider(latest) : null;
    return [
      { label: "Tests run", value: tests.length.toLocaleString("en-US") },
      { label: "Latest inbox rate", value: latest ? `${average(latest, "inbox")}%` : "—" },
      { label: "Latest spam rate", value: latest ? `${average(latest, "spam")}%` : "—" },
      { label: "Weakest provider", value: worst ? `${worst.provider} · ${worst.inbox}%` : "—" },
    ];
  }, [tests]);

  const pager = usePagination(filtered, { resetKey: `${query}|${healthFilter}` });

  // New runs start from the source test's placement, or the latest test's when there is none.
  const addRun = (details, source = tests[0] ?? INITIAL[0]) => {
    const id = crypto.randomUUID();
    const run = { id, ...details, tested: new Date().toISOString().slice(0, 10), results: rerunResults(source.results) };
    setTests((p) => [run, ...p]);
    openRecord(id);
    return run;
  };

  const handleCreate = (details) => {
    const run = addRun(details);
    toast.success(`Test complete — ${average(run, "inbox")}% average inbox placement.`);
  };

  const handleRerun = (t) => {
    const run = addRun({ name: t.name, subject: t.subject, from: t.from }, t);
    toast.success(`Re-ran "${t.name}" — ${average(run, "inbox")}% average inbox placement.`);
  };

  const handleSave = (id, patch) => {
    setTests((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    toast.success("Test saved.");
  };

  const handleDelete = (t) => {
    setDeleteTarget(null);
    setTests((p) => p.filter((x) => x.id !== t.id));
    if (String(t.id) === recordId) closeRecord();
    toast.success(`Deleted "${t.name}".`);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      label={deleteTarget?.name}
      noun="test"
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = tests.find((t) => String(t.id) === recordId);
  if (open) {
    return (
      <>
        <PlacementEditor
          key={open.id}
          record={open}
          onBack={closeRecord}
          onSave={handleSave}
          onRerun={handleRerun}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || healthFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setHealthFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Test",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Target className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{t.name}</span>
            <span className="max-w-[260px] truncate text-xs text-text-secondary">{t.subject}</span>
          </div>
        </div>
      ),
    },
    { key: "health", header: "Placement", render: (t) => <StatusPill status={testHealth(t)} map={HEALTH_MAP} /> },
    { key: "inbox", header: "Avg. inbox", render: (t) => <InboxBar value={average(t, "inbox")} /> },
    {
      key: "worst",
      header: "Weakest provider",
      className: "text-muted-foreground",
      render: (t) => {
        const w = worstProvider(t);
        return `${w.provider} · ${w.inbox}%`;
      },
    },
    { key: "tested", header: "Tested", className: "whitespace-nowrap text-muted-foreground", render: (t) => formatDate(t.tested) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.name}`}
          items={[
            { label: "View results", icon: Pencil, onSelect: () => openRecord(String(t.id)) },
            { label: "Run again", icon: RotateCcw, onSelect: () => handleRerun(t) },
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
        title="Inbox Placement"
        description="See where your mail lands across major mailbox providers."
        actions={
          <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
            <Play className="h-4 w-4" /> Run test
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={healthFilter} onValueChange={setHealthFilter} options={HEALTH_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search tests…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(t) => t.id}
          onRowClick={(t) => openRecord(String(t.id))}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Target}
                title={filtersActive ? "No matches" : "No placement tests yet"}
                description={filtersActive ? "Try a different search or filter." : "Run a test to see where your mail lands at each provider."}
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
                      <Play className="h-4 w-4" /> Run test
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="tests" />
      </div>

      <RunTestDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default InboxPlacementScreen;
