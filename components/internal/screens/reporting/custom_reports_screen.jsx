"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarClock,
  Copy,
  Download,
  FileBarChart,
  FileText,
  History,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
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
  Textarea,
  ScreenHeader,
  SearchInput,
  StatsBar,
  Badge,
  ActionMenu,
  Field,
  InlineTitleInput,
  SectionCard,
  SettingsList,
  SettingRow,
  Toolbar,
  DataTable,
  EmptyState,
} from "@geiger/ui";
import { exportCsv } from "./report_export";

const SCHEDULE_TONE = {
  Daily: "success",
  Weekly: "info",
  Monthly: "purple",
  Manual: "neutral",
};

const INITIAL = [
  { id: 1, name: "Weekly performance summary", description: "Sends, opens, clicks, and revenue by campaign", metrics: ["Open rate", "Click rate", "Revenue"], schedule: "Weekly", lastRun: "Jun 5, 2026", format: "PDF" },
  { id: 2, name: "Daily deliverability digest", description: "Bounce and complaint rates by sending domain", metrics: ["Delivered %", "Bounce %"], schedule: "Daily", lastRun: "Jun 7, 2026", format: "CSV" },
  { id: 3, name: "Revenue attribution by channel", description: "Attributed revenue split across channels", metrics: ["Revenue", "Touchpoints", "Share"], schedule: "Monthly", lastRun: "Jun 1, 2026", format: "XLSX" },
  { id: 4, name: "Segment engagement breakdown", description: "Open and click behaviour per audience segment", metrics: ["Open rate", "Click rate"], schedule: "Weekly", lastRun: "Jun 4, 2026", format: "PDF" },
  { id: 5, name: "Win-back campaign export", description: "Recipient-level results for the win-back series", metrics: ["Recipients", "Conversion", "Revenue"], schedule: "Manual", lastRun: "May 28, 2026", format: "CSV" },
  { id: 6, name: "Executive overview", description: "Top-line KPIs for the leadership review", metrics: ["Revenue", "Open rate", "Subscribers"], schedule: "Monthly", lastRun: "Jun 1, 2026", format: "PDF" },
];

const GROUP_BY = ["Campaign", "Channel", "Segment", "Date"];
const SCHEDULES = ["Daily", "Weekly", "Monthly", "Manual"];
const FORMATS = ["CSV", "PDF", "XLSX"];

const GROUP_METRICS = {
  Campaign: ["Open rate", "Click rate", "Revenue"],
  Channel: ["Revenue", "Touchpoints", "Share"],
  Segment: ["Open rate", "Click rate"],
  Date: ["Sends", "Opens", "Revenue"],
};

const ALL_METRICS = [
  "Sends",
  "Opens",
  "Open rate",
  "Click rate",
  "Conversion",
  "Revenue",
  "Recipients",
  "Subscribers",
  "Touchpoints",
  "Share",
  "Delivered %",
  "Bounce %",
];

const SCHEDULE_FILTER_OPTIONS = [
  { value: "all", label: "All schedules" },
  ...SCHEDULES.map((s) => ({ value: s, label: s })),
];

const FORMAT_FILTER_OPTIONS = [
  { value: "all", label: "All formats" },
  ...FORMATS.map((f) => ({ value: f, label: f })),
];

const REPORT_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name the report, describe it, and choose how rows are grouped." },
  { key: "metrics", label: "Metrics", icon: BarChart3, desc: "Pick the measures this report includes." },
  { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "When the report runs and the file format it's delivered in." },
  { key: "activity", label: "Activity", icon: History, desc: "Run history and a summary of this report." },
];

const EXPORT_COLUMNS = [
  { key: "name", header: "Report" },
  { key: "description", header: "Description" },
  { key: "metrics", header: "Metrics" },
  { key: "schedule", header: "Schedule" },
  { key: "lastRun", header: "Last run" },
  { key: "format", header: "Format" },
];

const todayLabel = () =>
  new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const pickEditable = (r) => ({
  name: r.name,
  description: r.description,
  groupBy: r.groupBy || "Campaign",
  metrics: r.metrics,
  schedule: r.schedule,
  format: r.format,
});

const downloadReport = (r) => {
  exportCsv(
    `${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
    [{ ...r, metrics: r.metrics.join("; ") }],
    EXPORT_COLUMNS,
  );
  toast.success(`Downloaded "${r.name}".`);
};

function CreateReportDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", description: "", groupBy: "Campaign", schedule: "Weekly", format: "PDF" });
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      description: form.description.trim() || "—",
      groupBy: form.groupBy,
      metrics: GROUP_METRICS[form.groupBy] || ["Revenue"],
      schedule: form.schedule,
      lastRun: "Never",
      format: form.format,
    });
    setForm({ name: "", description: "", groupBy: "Campaign", schedule: "Weekly", format: "PDF" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create report</DialogTitle>
          <DialogDescription>Define what to measure, how to group it, and when it runs.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Report name" htmlFor="r-name">
            <Input id="r-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly revenue review" autoFocus />
          </Field>
          <Field label="Description" htmlFor="r-desc">
            <Textarea id="r-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this report cover?" />
          </Field>
          <Field label="Group by">
            <Select value={form.groupBy} onValueChange={(v) => setForm((f) => ({ ...f, groupBy: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GROUP_BY.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Schedule">
              <Select value={form.schedule} onValueChange={(v) => setForm((f) => ({ ...f, schedule: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SCHEDULES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Format">
              <Select value={form.format} onValueChange={(v) => setForm((f) => ({ ...f, format: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMATS.map((fmt) => <SelectItem key={fmt} value={fmt}>{fmt}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={submit} disabled={!form.name.trim()}>
            Create report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomReportEditor({ record, onBack, onSave, onRun, onDuplicate, onDelete }) {
  const [draft, setDraft] = useState(() => pickEditable(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(pickEditable(record));

  const buildPatch = () => ({ ...draft, name: draft.name.trim() || "Untitled report" });

  const toggleMetric = (metric, on) =>
    setDraft((d) => ({
      ...d,
      metrics: on ? [...d.metrics, metric] : d.metrics.filter((m) => m !== metric),
    }));

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Report name"
          placeholder="Untitled report"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={SCHEDULE_TONE[record.schedule]}>{record.schedule}</Badge>
          <Badge variant="neutral">{record.format}</Badge>
          <span className="text-xs text-text-tertiary">Last run {record.lastRun}</span>
        </>
      }
      actions={
        <>
          <Button
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            disabled={!dirty}
            onClick={() => onSave(record.id, buildPatch())}
          >
            Save
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => onRun(record.id, buildPatch())}
          >
            <Play className="h-4 w-4" /> Run now
          </Button>
          <ActionMenu
            label="Report actions"
            items={[
              { icon: Download, label: "Download", onSelect: () => downloadReport(record) },
              { icon: Copy, label: "Duplicate", onSelect: () => onDuplicate(record) },
              { separator: true },
              { icon: Trash2, label: "Delete", variant: "destructive", onSelect: () => onDelete(record) },
            ]}
          />
        </>
      }
      nav={REPORT_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Report name" htmlFor="re-name">
                  <Input id="re-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="Untitled report" />
                </Field>
                <Field label="Group by" hint="How rows are broken down in the output.">
                  <Select value={draft.groupBy} onValueChange={set("groupBy")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GROUP_BY.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Description" htmlFor="re-desc" className="sm:col-span-2">
                  <Textarea id="re-desc" rows={3} value={draft.description} onChange={(e) => set("description")(e.target.value)} placeholder="What does this report cover?" />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "metrics" ? (
            <SectionCard>
              <SettingsList>
                {ALL_METRICS.map((m) => (
                  <SettingRow
                    key={m}
                    title={m}
                    checked={draft.metrics.includes(m)}
                    onCheckedChange={(v) => toggleMetric(m, v)}
                  />
                ))}
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "schedule" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Schedule" hint="Manual reports only run when you press Run now.">
                  <Select value={draft.schedule} onValueChange={set("schedule")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SCHEDULES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Format">
                  <Select value={draft.format} onValueChange={set("format")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FORMATS.map((fmt) => <SelectItem key={fmt} value={fmt}>{fmt}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "activity" ? (
            <SectionCard>
              <SettingsList>
                <SettingRow title="Last run" control={<span className="text-sm text-foreground">{record.lastRun}</span>} />
                <SettingRow title="Schedule" control={<span className="text-sm text-foreground">{record.schedule}</span>} />
                <SettingRow title="Format" control={<span className="font-mono text-xs text-foreground">{record.format}</span>} />
                <SettingRow
                  title="Metrics"
                  control={<span className="tabular-nums text-sm text-foreground">{record.metrics.length.toLocaleString("en-US")}</span>}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function CustomReportsScreen() {
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [reports, setReports] = useState(INITIAL);
  const [search, setSearch] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (q && !(r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))) return false;
      if (scheduleFilter !== "all" && r.schedule !== scheduleFilter) return false;
      if (formatFilter !== "all" && r.format !== formatFilter) return false;
      return true;
    });
  }, [reports, search, scheduleFilter, formatFilter]);

  const stats = useMemo(() => {
    const scheduled = reports.filter((r) => r.schedule !== "Manual").length;
    const metrics = new Set(reports.flatMap((r) => r.metrics)).size;
    return [
      { label: "Reports", value: reports.length.toLocaleString("en-US") },
      { label: "Scheduled", value: scheduled.toLocaleString("en-US") },
      { label: "Manual", value: (reports.length - scheduled).toLocaleString("en-US") },
      { label: "Metrics tracked", value: metrics.toLocaleString("en-US") },
    ];
  }, [reports]);

  const pager = usePagination(filtered, { resetKey: `${search}|${scheduleFilter}|${formatFilter}` });

  const handleCreate = (input) => {
    const report = { id: crypto.randomUUID(), ...input };
    setReports((p) => [report, ...p]);
    openRecord(String(report.id));
  };

  const handleSave = (id, patch) => {
    setReports((p) => p.map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r)));
    toast.success("Report saved.");
  };

  const handleRun = (id, patch = {}) => {
    setReports((p) => p.map((r) => (String(r.id) === String(id) ? { ...r, ...patch, lastRun: todayLabel() } : r)));
    toast.success("Report run started.");
  };

  const handleDuplicate = (r) => {
    const copy = { ...r, id: crypto.randomUUID(), name: `${r.name} (copy)`, lastRun: "Never" };
    setReports((p) => [copy, ...p]);
    toast.success("Report duplicated.");
  };

  const handleDelete = (r) => {
    setDeleteTarget(null);
    setReports((p) => p.filter((x) => x.id !== r.id));
    if (String(r.id) === recordId) closeRecord();
    toast.success(`Deleted "${r.name}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete report</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = reports.find((r) => String(r.id) === recordId);
  if (open) {
    return (
      <>
        <CustomReportEditor
          key={open.id}
          record={open}
          onBack={closeRecord}
          onSave={handleSave}
          onRun={handleRun}
          onDuplicate={handleDuplicate}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = search || scheduleFilter !== "all" || formatFilter !== "all";

  const columns = [
    {
      key: "report",
      header: "Report",
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
            <FileBarChart className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{r.name}</span>
            <span className="truncate text-xs text-text-secondary">{r.description}</span>
          </div>
        </div>
      ),
    },
    {
      key: "metrics",
      header: "Metrics",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.metrics.map((m) => (
            <Badge key={m} variant="neutral">{m}</Badge>
          ))}
        </div>
      ),
    },
    { key: "schedule", header: "Schedule", render: (r) => <Badge variant={SCHEDULE_TONE[r.schedule]}>{r.schedule}</Badge> },
    { key: "lastRun", header: "Last run", className: "whitespace-nowrap text-muted-foreground" },
    { key: "format", header: "Format", className: "font-mono text-xs text-muted-foreground" },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (r) => (
        <ActionMenu
          label="Report actions"
          items={[
            { icon: Pencil, label: "Edit", onSelect: () => openRecord(String(r.id)) },
            { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(r) },
            { icon: Play, label: "Run now", onSelect: () => handleRun(r.id) },
            { icon: Download, label: "Download", onSelect: () => downloadReport(r) },
            { separator: true },
            { icon: Trash2, label: "Delete", variant: "destructive", onSelect: () => setDeleteTarget(r) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Custom Reports"
        description="Build, schedule, and export the reports your team needs."
        actions={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New report
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={scheduleFilter} onValueChange={setScheduleFilter} options={SCHEDULE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={formatFilter} onValueChange={setFormatFilter} options={FORMAT_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search reports…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(r) => r.id}
          onRowClick={(r) => openRecord(String(r.id))}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={FileBarChart}
                title={filtersActive ? "No matches" : "No reports yet"}
                description={
                  filtersActive
                    ? "Try a different search or filter."
                    : "Create your first report — pick the metrics, how to group them, and when it runs."
                }
                action={
                  filtersActive ? (
                    <Button
                      variant="outline"
                      className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                      onClick={() => {
                        setSearch("");
                        setScheduleFilter("all");
                        setFormatFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> New report
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="reports" />
      </div>

      <CreateReportDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CustomReportsScreen;
