"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarClock,
  Copy,
  Download,
  FileBarChart,
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { createReport, listReports, recordReportRun, softDeleteReport, updateReport } from "@/lib/supabase/reports";
import { formatDateTime, formatMetric, formatNumber, formatRelative } from "@/lib/reporting/format";
import {
  CHANNEL_LABELS,
  DIMENSION_MAP,
  METRIC_MAP,
  chartsFor,
  dimensionsFor,
  normalizeDefinition,
  prepareSources,
  runQuery,
} from "@/lib/reporting/query";
import { RANGE_OPTIONS, WEEKDAYS, rangeLabel } from "@/lib/reporting/ranges";
import { FREQUENCIES, describeSchedule, isValidEmail, normalizeSchedule } from "@/lib/reporting/schedule";
import {
  ActionMenu,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  InlineTitleInput,
  Input,
  LoadingArea,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import { exportReportResult } from "./report_export";
import { CampaignPicker, OptionPicker } from "./campaign_picker";
import { CategoryBars, OUTLINE_BUTTON, ReportFailed, TrendChart, TruncatedNote, deltaStat } from "./report_ui";
import { useReportSources } from "./use_report_sources";
import { MetricSelect } from "./widgets";

const FREQUENCY_TONE = { daily: "success", weekly: "info", monthly: "purple", manual: "neutral" };

// Starting points for a new report (definition configuration, not data).
const TEMPLATES = {
  campaigns: { label: "Campaign performance", description: "Open rate by campaign.", definition: { metric: "open_rate", dimension: "campaign", chart: "table", range: "30d" } },
  revenue: { label: "Revenue by channel", description: "Attributed revenue per channel.", definition: { metric: "revenue", dimension: "channel", chart: "bar", range: "30d" } },
  deliverability: { label: "Bounces by domain", description: "Bounce rate by recipient domain.", definition: { metric: "bounce_rate", dimension: "domain", chart: "table", range: "30d" } },
  sends: { label: "Weekly sends", description: "Messages sent per week.", definition: { metric: "sends", dimension: "week", chart: "bar", range: "90d" } },
  growth: { label: "Audience growth", description: "New contacts per day.", definition: { metric: "new_contacts", dimension: "time", chart: "line", range: "30d" } },
  blank: { label: "Blank report", description: "", definition: {} },
};

const FREQUENCY_FILTER_OPTIONS = [{ value: "all", label: "All schedules" }, ...FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))];

const REPORT_NAV = [
  { key: "builder", label: "Builder", icon: BarChart3, desc: "Pick the metric, how to break it down, filters, range and chart." },
  { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "Email the results to your team on a schedule." },
  { key: "activity", label: "Activity", icon: History, desc: "Recent manual and scheduled runs." },
];

const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }));
const HORIZONTAL = new Set(["campaign", "domain", "list", "segment", "source", "event", "provider"]);
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const definitionLabel = (d) => {
  const metric = METRIC_MAP[d.metric]?.label || d.metric;
  if (d.dimension === "none") return metric;
  if (DIMENSION_MAP[d.dimension]?.kind === "time") return `${metric} over time`;
  return `${metric} by ${(DIMENSION_MAP[d.dimension]?.label || d.dimension).toLowerCase()}`;
};

const pickEditable = (r) => ({ name: r.name, description: r.description, definition: r.definition, schedule: r.schedule });

function CreateReportDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("campaigns");
  const submit = () => {
    if (!name.trim()) {
      toast.error("Give the report a name first.");
      return;
    }
    const t = TEMPLATES[template];
    onCreate({ name: name.trim(), description: t.description, definition: normalizeDefinition(t.definition), schedule: normalizeSchedule({ timezone: browserZone() }) });
    setName("");
    setTemplate("campaigns");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create report</DialogTitle>
          <DialogDescription>Start from a template, then shape the metric, breakdown and filters in the builder.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Report name" htmlFor="r-name">
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Monthly revenue review"
              autoFocus
            />
          </Field>
          <Field label="Start from" htmlFor="r-template" hint={TEMPLATES[template].description || "An empty report: sends over time."}>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger id="r-template" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATES).map(([key, t]) => <SelectItem key={key} value={key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Create report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultPreview({ result, chart }) {
  if (!result) return null;
  const { metric, dimension, rows } = result;
  if (chart === "kpi" || dimension.kind === "total") {
    const stat = deltaStat({ label: metric.label, value: result.value, previous: result.previous, format: metric.format, rate: metric.rate, inverse: metric.inverse, currency: result.currency, range: result.range.key });
    return (
      <div className="px-5 py-6">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{metric.label} · {result.range.label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{stat.value}</p>
        <p className="mt-1 text-xs text-text-secondary">{stat.delta ? `${stat.delta} ${stat.footer}` : stat.footer}</p>
      </div>
    );
  }
  if (chart === "line") {
    return (
      <div className="px-3 pb-3 pt-4">
        <TrendChart data={rows} series={[{ key: "value", label: metric.label }]} format={metric.format} currency={result.currency} height={280} />
      </div>
    );
  }
  if (chart === "bar") {
    const horizontal = HORIZONTAL.has(dimension.key);
    return (
      <div className="px-3 pb-3 pt-4">
        <CategoryBars data={rows} format={metric.format} currency={result.currency} label={metric.label} horizontal={horizontal} height={horizontal ? Math.max(220, rows.length * 30 + 40) : 280} />
      </div>
    );
  }
  return null;
}

function ResultTable({ result }) {
  if (!result) return null;
  const { metric, dimension, rows } = result;
  const columns = [
    { key: "label", header: dimension.kind === "total" ? "Period" : dimension.label, className: "font-medium text-foreground", render: (r) => (dimension.kind === "total" ? result.range.label : r.label) },
    { key: "value", header: metric.label, align: "right", className: "tabular-nums text-foreground", render: (r) => formatMetric(r.value, metric.format, result.currency) },
    ...(metric.rate && metric.family !== "conversion"
      ? [{ key: "delivered", header: "Delivered", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => formatNumber(r.delivered) }]
      : []),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => String(r.key)}
      empty={<div className="rounded-xl border border-border bg-surface-subtle"><EmptyState title="No rows for this period" description="Widen the date range or loosen the filters." /></div>}
    />
  );
}

function Builder({ draft, setDefinition, editable, sources, result, loading }) {
  const def = draft.definition;
  const dims = dimensionsFor(def.metric);
  const charts = chartsFor(def.dimension);
  const listOptions = (sources?.lists || []).map((l) => ({ value: l.id, label: l.name }));
  const campaigns = (sources?.campaigns || []).filter((c) => c.status !== "draft");
  const setFilters = (patch) => setDefinition({ filters: { ...def.filters, ...patch } });

  return (
    <div className="space-y-6">
      <SectionCard bare title="Report query" description="The metric, breakdown, date range, chart and filters this report runs." contentClassName="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Metric" htmlFor="rb-metric">
            <MetricSelect id="rb-metric" value={def.metric} onChange={(v) => setDefinition({ metric: v })} disabled={!editable} />
          </Field>
          <Field label="Broken down by" htmlFor="rb-dim">
            <Select value={def.dimension} onValueChange={(v) => setDefinition({ dimension: v })} disabled={!editable}>
              <SelectTrigger id="rb-dim" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {dims.map((x) => <SelectItem key={x.key} value={x.key}>{x.key === "time" ? "Over time (automatic)" : x.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date range" htmlFor="rb-range">
            <Select value={def.range} onValueChange={(v) => setDefinition({ range: v })} disabled={!editable}>
              <SelectTrigger id="rb-range" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Chart" htmlFor="rb-chart">
            <Select value={def.chart} onValueChange={(v) => setDefinition({ chart: v })} disabled={!editable}>
              <SelectTrigger id="rb-chart" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {charts.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Channels" htmlFor="rb-channels">
            <OptionPicker id="rb-channels" label="Channels" allLabel="All channels" options={CHANNEL_OPTIONS} value={def.filters.channels} onChange={(v) => setFilters({ channels: v })} disabled={!editable} />
          </Field>
          <Field label="Lists" htmlFor="rb-lists" hint="Only recipients in these lists.">
            <OptionPicker id="rb-lists" label="Lists" allLabel="All contacts" options={listOptions} value={def.filters.listIds} onChange={(v) => setFilters({ listIds: v })} disabled={!editable} />
          </Field>
          {DIMENSION_MAP[def.dimension]?.kind === "category" ? (
            <Field label="Rows" htmlFor="rb-limit" hint="Top rows to keep.">
              <Select value={String(def.limit)} onValueChange={(v) => setDefinition({ limit: Number(v) })} disabled={!editable}>
                <SelectTrigger id="rb-limit" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5, 10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
        <Field label="Campaigns" hint="Leave empty to include every message.">
          <CampaignPicker campaigns={campaigns} value={def.filters.campaignIds} onChange={(v) => setFilters({ campaignIds: v })} max={10} placeholder="All campaigns" disabled={!editable} />
        </Field>
      </SectionCard>

      <SectionCard
        bodyPadding={false}
        title={definitionLabel(def)}
        description={`${rangeLabel(def.range)}${result?.metric.family === "attributed" || result?.metric.family === "mixed" ? " · last-click attribution, 7-day window" : ""}`}
        action={loading ? <Loader2 className="h-4 w-4 animate-spin text-text-secondary" aria-label="Updating" /> : null}
      >
        {result ? (
          <>
            <ResultPreview result={result} chart={def.chart} />
            {def.chart !== "kpi" ? <div className="border-t border-border p-4"><ResultTable result={result} /></div> : null}
          </>
        ) : (
          <LoadingArea size={40} label="Running report" />
        )}
      </SectionCard>
    </div>
  );
}

function ScheduleEditor({ schedule, onChange, editable }) {
  const [email, setEmail] = useState("");
  const s = schedule;
  const set = (patch) => onChange(normalizeSchedule({ ...s, ...patch }));
  const addEmail = () => {
    const value = email.trim().toLowerCase();
    if (!value) return;
    if (!isValidEmail(value)) {
      toast.error("That doesn't look like an email address.");
      return;
    }
    set({ recipients: [...s.recipients, value] });
    setEmail("");
  };
  return (
    <SectionCard bare title="Delivery schedule" description="How often the report runs and who gets the results by email." contentClassName="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Frequency" htmlFor="rs-frequency">
          <Select value={s.frequency} onValueChange={(v) => set({ frequency: v, timezone: s.timezone === "UTC" ? browserZone() : s.timezone })} disabled={!editable}>
            <SelectTrigger id="rs-frequency" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {s.frequency === "weekly" ? (
          <Field label="Day" htmlFor="rs-weekday">
            <Select value={String(s.weekday)} onValueChange={(v) => set({ weekday: Number(v) })} disabled={!editable}>
              <SelectTrigger id="rs-weekday" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        ) : null}
        {s.frequency === "monthly" ? (
          <Field label="Day of month" htmlFor="rs-day">
            <Select value={String(s.day)} onValueChange={(v) => set({ day: Number(v) })} disabled={!editable}>
              <SelectTrigger id="rs-day" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 28 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        ) : null}
        {s.frequency !== "manual" ? (
          <>
            <Field label="Time" htmlFor="rs-hour">
              <Select value={String(s.hour)} onValueChange={(v) => set({ hour: Number(v) })} disabled={!editable}>
                <SelectTrigger id="rs-hour" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Time zone" htmlFor="rs-zone">
              <Input id="rs-zone" value={s.timezone} readOnly className="text-muted-foreground" />
            </Field>
          </>
        ) : null}
      </div>
      <p className="text-sm text-text-secondary">{describeSchedule(s)}.</p>

      {s.frequency !== "manual" ? (
        <Field label="Recipients" htmlFor="rs-email" hint="Each recipient gets the results table by email on the first scheduler run after the send time.">
          <div className="flex gap-2">
            <Input
              id="rs-email"
              type="email"
              value={email}
              disabled={!editable}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmail();
                }
              }}
              placeholder="name@company.com"
            />
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={addEmail} disabled={!editable || !email.trim()}>
              Add
            </Button>
          </div>
          {s.recipients.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.recipients.map((r) => (
                <Badge key={r} variant="neutral" className="gap-1 py-1 pl-2 pr-1 text-xs">
                  {r}
                  {editable ? (
                    <button type="button" aria-label={`Remove ${r}`} className="rounded p-0.5 text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => set({ recipients: s.recipients.filter((x) => x !== r) })}>
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Add at least one recipient — scheduled reports without recipients don&apos;t run.</p>
          )}
        </Field>
      ) : null}
    </SectionCard>
  );
}

function ActivityPanel({ record }) {
  const runs = record.runs || [];
  return (
    <SectionCard bodyPadding={false} title="Recent runs" description={record.lastRunAt ? `Last run ${formatRelative(record.lastRunAt)}.` : "This report hasn't run yet."}>
      {runs.length ? (
        <div className="divide-y divide-border">
          {runs.map((run, i) => (
            <div key={`${run.at}-${i}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0">
                <span className="block text-foreground">{formatDateTime(run.at)}</span>
                <span className="block truncate text-xs text-text-secondary">
                  {run.trigger === "schedule" ? `Scheduled · emailed ${run.sentTo?.length ? run.sentTo.join(", ") : "no one (send failed)"}` : "Run manually"}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-text-secondary">{formatNumber(run.rows || 0)} rows</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={History} title="No runs yet" description="Run the report, or schedule it, to build a history here." className="py-10" />
      )}
    </SectionCard>
  );
}

function CustomReportEditor({ record, editable, busy, onBack, onSave, onRun, onDuplicate, onDelete }) {
  const [draft, setDraft] = useState(() => pickEditable(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setDefinition = (patch) => setDraft((d) => ({ ...d, definition: normalizeDefinition({ ...d.definition, ...patch }) }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(pickEditable(record));
  const def = draft.definition;
  const needs = DIMENSION_MAP[def.dimension]?.key === "segment" ? ["segments"] : [];
  const { loading, failed, truncated, sources, loadedAt, reload } = useReportSources({
    range: def.range,
    lookbackDays: 7,
    include: ["campaigns", "deliveries", "events", "contacts", "lists", ...needs],
  });
  const prepared = useMemo(() => (sources ? prepareSources(sources) : null), [sources]);
  const result = useMemo(() => (prepared && loadedAt ? runQuery(def, prepared, { now: loadedAt }) : null), [def, prepared, loadedAt]);
  const patch = () => ({ ...draft, name: draft.name.trim() || "Untitled report", description: draft.description.trim() });

  const download = () => {
    if (!result) return;
    exportReportResult(draft.name, result);
    toast.success(`Downloaded "${draft.name || "report"}".`);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Report name"
          placeholder="Untitled report"
          readOnly={!editable}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={FREQUENCY_TONE[draft.schedule.frequency]}>{FREQUENCIES.find((f) => f.value === draft.schedule.frequency)?.label}</Badge>
          <span className="text-xs text-text-tertiary">{record.lastRunAt ? `Last run ${formatRelative(record.lastRunAt)}` : "Never run"}</span>
        </>
      }
      actions={
        <>
          {editable ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || busy} onClick={() => onSave(record, patch())}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
          {editable ? (
            <Button onClick={() => result && onRun(record, patch(), result)} disabled={!result || Boolean(busy)}>
              {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
            </Button>
          ) : null}
          <ActionMenu
            label="Report actions"
            items={[
              { icon: Download, label: "Download CSV", disabled: !result, onSelect: download },
              editable && { icon: Copy, label: "Duplicate", onSelect: () => onDuplicate(record) },
              editable && { separator: true },
              editable && { icon: Trash2, label: "Delete", destructive: true, onSelect: () => onDelete(record) },
            ]}
          />
        </>
      }
      nav={REPORT_NAV}
      defaultSection="builder"
    >
      {({ active }) => (
        <>
          {active === "builder" ? (
            <div className="space-y-4">
              {failed && !loading ? <ReportFailed onRetry={reload} /> : null}
              <Builder draft={draft} setDefinition={setDefinition} editable={editable} sources={sources} result={result} loading={loading && Boolean(result)} />
              <Field label="Description" htmlFor="re-desc">
                <Textarea id="re-desc" rows={2} value={draft.description} disabled={!editable} onChange={(e) => set("description")(e.target.value)} placeholder="What does this report cover?" />
              </Field>
              <TruncatedNote show={truncated} />
            </div>
          ) : null}
          {active === "schedule" ? <ScheduleEditor schedule={draft.schedule} onChange={set("schedule")} editable={editable} /> : null}
          {active === "activity" ? (
            <div className="space-y-6">
              <ActivityPanel record={record} />
              <SectionCard bare title="Report summary" description="What this report measures, over which period and when it runs.">
                <SettingsList>
                  <SettingRow title="Report" control={<span className="text-sm text-foreground">{definitionLabel(def)}</span>} />
                  <SettingRow title="Date range" control={<span className="text-sm text-foreground">{rangeLabel(def.range)}</span>} />
                  <SettingRow title="Schedule" control={<span className="text-sm text-foreground">{describeSchedule(draft.schedule)}</span>} />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function CustomReportsScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.report.edit");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [state, setState] = useState({ for: null, rows: [], failed: false });
  const [search, setSearch] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState({ id: null, kind: null });
  const reports = state.rows;
  const loading = state.for !== projectId;
  const setReports = (fn) => setState((s) => ({ ...s, rows: fn(s.rows) }));

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listReports(projectId).then((rows) => alive && setState({ for: projectId, rows: rows ?? [], failed: rows === null }));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (q && !`${r.name} ${r.description} ${definitionLabel(r.definition)}`.toLowerCase().includes(q)) return false;
      if (frequencyFilter !== "all" && r.schedule.frequency !== frequencyFilter) return false;
      return true;
    });
  }, [reports, search, frequencyFilter]);

  const stats = useMemo(() => {
    const scheduled = reports.filter((r) => r.schedule.frequency !== "manual").length;
    const recipients = new Set(reports.flatMap((r) => (r.schedule.frequency !== "manual" ? r.schedule.recipients : []))).size;
    const latest = reports.map((r) => Date.parse(r.lastRunAt || "")).filter(Number.isFinite);
    const newest = latest.length ? Math.max(...latest) : null;
    const runs = reports.reduce((s, r) => s + (r.runs?.length || 0), 0);
    return [
      { label: "Reports", value: reports.length.toLocaleString("en-US") },
      { label: "Scheduled", value: scheduled.toLocaleString("en-US"), footer: `${recipients} ${recipients === 1 ? "recipient" : "recipients"}` },
      { label: "Recent runs", value: runs.toLocaleString("en-US"), footer: "Last 10 kept per report" },
      { label: "Last run", value: newest ? formatRelative(new Date(newest).toISOString()) : "—" },
    ];
  }, [reports]);

  const pager = usePagination(filtered, { resetKey: `${search}|${frequencyFilter}` });

  const persistCreate = async (input, message) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    setReports((p) => [{ id, projectId, lastRunAt: null, runs: [], createdAt: now, updatedAt: now, ...input }, ...p]);
    const user = await getUser();
    const created = await createReport(projectId, { ...input, id, createdBy: user?.id ?? null });
    if (created) {
      setReports((p) => p.map((r) => (r.id === id ? created : r)));
      toast.success(message);
      return created;
    }
    setReports((p) => p.filter((r) => r.id !== id));
    toast.error("Couldn't save the report. Try again.");
    return null;
  };

  const handleCreate = async (input) => {
    const created = await persistCreate(input, `Created "${input.name}".`);
    if (created) openRecord(created.id);
  };

  const handleDuplicate = (r) =>
    persistCreate({ name: `${r.name} (copy)`, description: r.description, definition: r.definition, schedule: { ...r.schedule, frequency: "manual" } }, "Report duplicated.");

  const handleSave = async (record, patch) => {
    setBusy({ id: record.id, kind: "save" });
    setReports((p) => p.map((r) => (r.id === record.id ? { ...r, ...patch } : r)));
    const saved = await updateReport(record.id, patch);
    setBusy({ id: null, kind: null });
    if (saved) {
      setReports((p) => p.map((r) => (r.id === record.id ? saved : r)));
      toast.success("Report saved.");
      return saved;
    }
    setReports((p) => p.map((r) => (r.id === record.id ? record : r)));
    toast.error("Couldn't save the report. Your changes are still in the editor.");
    return null;
  };

  const handleRun = async (record, patch, result) => {
    const dirty = JSON.stringify(pickEditable(record)) !== JSON.stringify(patch);
    const base = dirty ? await handleSave(record, patch) : record;
    if (!base) return;
    setBusy({ id: record.id, kind: "run" });
    const updated = await recordReportRun(base, { trigger: "manual", rows: result.rows.length, value: result.value });
    setBusy({ id: null, kind: null });
    if (updated) {
      setReports((p) => p.map((r) => (r.id === record.id ? updated : r)));
      toast.success(`Report ran: ${formatMetric(result.value, result.metric.format, result.currency)} across ${formatNumber(result.rows.length)} rows.`);
    } else {
      toast.error("The report ran, but its run history couldn't be saved.");
    }
  };

  const handleDelete = async (r) => {
    setDeleteTarget(null);
    setReports((p) => p.filter((x) => x.id !== r.id));
    if (String(r.id) === recordId) closeRecord();
    const ok = await softDeleteReport(r.id);
    if (ok) toast.success(`Deleted "${r.name}".`);
    else {
      setReports((p) => [r, ...p]);
      toast.error("Couldn't delete the report.");
    }
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete report</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Scheduled emails for it stop.
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
          editable={canEdit}
          busy={busy.id === open.id ? busy.kind : null}
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

  const filtersActive = search || frequencyFilter !== "all";

  const columns = [
    {
      key: "report",
      header: "Report",
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{r.name}</span>
          <span className="max-w-[360px] truncate text-xs text-text-secondary">{r.description || definitionLabel(r.definition)}</span>
        </div>
      ),
    },
    { key: "what", header: "Measures", render: (r) => <Badge variant="neutral">{definitionLabel(r.definition)}</Badge> },
    { key: "range", header: "Range", className: "whitespace-nowrap text-muted-foreground", render: (r) => rangeLabel(r.definition.range) },
    {
      key: "schedule",
      header: "Schedule",
      render: (r) => <Badge variant={FREQUENCY_TONE[r.schedule.frequency]}>{FREQUENCIES.find((f) => f.value === r.schedule.frequency)?.label}</Badge>,
    },
    { key: "lastRun", header: "Last run", className: "whitespace-nowrap text-muted-foreground", render: (r) => (r.lastRunAt ? formatRelative(r.lastRunAt) : "Never") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <ActionMenu
          label={`Actions for ${r.name}`}
          items={[
            { icon: Pencil, label: canEdit ? "Edit" : "Open", onSelect: () => openRecord(String(r.id)) },
            canEdit && { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(r) },
            canEdit && { separator: true },
            canEdit && { icon: Trash2, label: "Delete", destructive: true, onSelect: () => setDeleteTarget(r) },
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
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New report
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={frequencyFilter} onValueChange={setFrequencyFilter} options={FREQUENCY_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search reports…" />
      </Toolbar>

      {state.failed && !loading ? (
        <ReportFailed onRetry={() => listReports(projectId).then((rows) => setState({ for: projectId, rows: rows ?? [], failed: rows === null }))} />
      ) : null}

      {loading ? (
        <LoadingArea panel size={48} label="Loading reports" />
      ) : (
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
                  description={filtersActive ? "Try a different search or filter." : "Create a report — pick a metric, how to break it down, and who gets it."}
                  action={
                    filtersActive ? (
                      <Button
                        variant="outline"
                        className={OUTLINE_BUTTON}
                        onClick={() => {
                          setSearch("");
                          setFrequencyFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New report
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="reports" />
        </div>
      )}

      <CreateReportDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CustomReportsScreen;
