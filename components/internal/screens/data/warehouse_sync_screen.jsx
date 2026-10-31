"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Database, Play, Pencil, Trash2, FileText, Send, History, Download, Pause, KeyRound, RotateCcw, Loader2, CheckCircle2, XCircle, Braces } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { listSyncRuns, listWarehouseSyncs, normalizeSyncRun, normalizeWarehouseSync, softDeleteWarehouseSync, updateWarehouseSync } from "@/lib/supabase/warehouse_syncs";
import { DEFAULT_BATCH_SIZE, EXPORT_FORMATS, MAX_BATCH_SIZE, SYNC_DESTINATIONS, SYNC_SCHEDULES, SYNC_SOURCES, syncDestination, syncSource } from "@/lib/data/sync_catalog";
import { destinationUrlError } from "@/lib/webhooks/urls";
import { SecretDialog } from "@/components/internal/screens/integrations/shared/secret_dialog";
import { SignatureDocs } from "@/components/internal/screens/integrations/shared/signature_docs";
import { CodeBlock } from "./shared/code_block";
import { DANGER_BUTTON, DANGER_ICON_BUTTON, formatDateTime, formatNumber, OUTLINE_BUTTON, relativeTime } from "./shared/format";
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
  StatusPill,
  Switch,
  Toolbar,
} from "@geiger/ui";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const MANAGE = "campaign.data.manage";

const STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  failing: { label: "Last run failed", variant: "danger" },
  paused: { label: "Paused", variant: "warning" },
};
const RUN_STATUS_MAP = {
  running: { label: "Running", variant: "warning" },
  succeeded: { label: "Succeeded", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
};
const TRIGGER_LABEL = { manual: "Run now", schedule: "Schedule", download: "Download" };

const stateOf = (s) => (s.status === "paused" ? "paused" : s.lastStatus === "failed" ? "failing" : "active");
const scheduleLabel = (v) => SYNC_SCHEDULES.find((s) => s.value === v)?.label || v;

const DESTINATION_FILTER_OPTIONS = [{ value: "all", label: "All destinations" }, ...SYNC_DESTINATIONS.filter((d) => d.supported).map((d) => ({ value: d.value, label: d.label }))];
const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_MAP).map(([value, m]) => ({ value, label: m.label }))];

const SYNC_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "What this sync sends and how often." },
  { key: "destination", label: "Destination", icon: Send, desc: "Where rows go, and how they're signed or formatted." },
  { key: "runs", label: "Runs", icon: History, desc: "Every run with rows moved and errors." },
  { key: "payload", label: "Payload", icon: Braces, desc: "What your endpoint receives and how to verify it." },
];

// Fetches an export and saves it through a temporary link, so the session cookie and the playground both apply.
async function downloadExport(projectId, sync, format) {
  const res = await fetch(`${BASE_PATH}/api/projects/${projectId}/data/syncs/${sync.id}/export?format=${format}`, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { ok: false, error: body?.error || `Export failed (${res.status}).` };
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || `${sync.source}.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true };
}

const EMPTY_FORM = { name: "", source: "contacts", destination: "webhook", url: "", schedule: "daily", batchSize: String(DEFAULT_BATCH_SIZE), format: "csv" };

function CreateSyncDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const isWebhook = form.destination === "webhook";

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Give the sync a name.");
      return;
    }
    if (isWebhook) {
      const urlError = destinationUrlError(form.url);
      if (urlError) {
        toast.error(urlError);
        return;
      }
    }
    setSubmitting(true);
    const ok = await onCreate({
      name: form.name.trim(),
      source: form.source,
      destination: form.destination,
      schedule: isWebhook ? form.schedule : "manual",
      config: isWebhook ? { url: form.url.trim(), batchSize: Number(form.batchSize) || DEFAULT_BATCH_SIZE } : { format: form.format },
    });
    setSubmitting(false);
    if (ok) {
      setForm(EMPTY_FORM);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setForm(EMPTY_FORM); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New sync</DialogTitle>
          <DialogDescription>Send a table to your own pipeline, or export it as a file.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="s-name">
            <Input id="s-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Contacts to warehouse loader" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data" hint={syncSource(form.source).description}>
              <Select value={form.source} onValueChange={set("source")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SYNC_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Destination" hint={syncDestination(form.destination).description}>
              <Select value={form.destination} onValueChange={set("destination")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SYNC_DESTINATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value} disabled={!d.supported}>
                      {d.label}{d.supported ? "" : " · not available yet"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {isWebhook ? (
            <>
              <Field label="Endpoint URL" htmlFor="s-url" hint="Receives signed POSTs of JSON batches.">
                <Input id="s-url" value={form.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://loader.example.com/geiger" className="font-mono text-sm" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Schedule">
                  <Select value={form.schedule} onValueChange={set("schedule")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{SYNC_SCHEDULES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Rows per batch" htmlFor="s-batch" hint={`1–${MAX_BATCH_SIZE}`}>
                  <Input id="s-batch" type="number" min={1} max={MAX_BATCH_SIZE} value={form.batchSize} onChange={(e) => set("batchSize")(e.target.value)} />
                </Field>
              </div>
            </>
          ) : (
            <Field label="File format">
              <Select value={form.format} onValueChange={set("format")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPORT_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (s) => ({ name: s.name, schedule: s.schedule, url: s.config.url || "", batchSize: String(s.config.batchSize || DEFAULT_BATCH_SIZE), format: s.config.format || "csv" });

function SyncEditor({ record: sync, canEdit, runs, runsLoading, busy, onBack, onSave, onRun, onDownload, onRotate, onResetCursor, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(sync));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(sync));
  const isWebhook = sync.destination === "webhook";

  const save = async () => {
    if (isWebhook) {
      const urlError = destinationUrlError(draft.url);
      if (urlError) {
        toast.error(urlError);
        return;
      }
    }
    const patch = { name: draft.name.trim() || "Untitled sync" };
    if (isWebhook) {
      patch.config = { ...sync.config, url: draft.url.trim(), batchSize: Math.min(MAX_BATCH_SIZE, Math.max(1, Number(draft.batchSize) || DEFAULT_BATCH_SIZE)) };
      if (draft.schedule !== sync.schedule) patch.schedule = draft.schedule;
    } else {
      patch.config = { ...sync.config, format: draft.format };
    }
    setSaving(true);
    const saved = await onSave(sync.id, patch);
    setSaving(false);
    if (saved) setDraft(toDraft(saved));
  };

  const payloadExample = JSON.stringify(
    { sync_id: sync.id, run_id: "…", source: sync.source, batch: 1, cursor_from: sync.cursor, cursor_to: "2026-10-27T12:00:00.000000+00:00|…", sent_at: "2026-10-27T12:00:01.000Z", rows: [{ id: "…", updated_at: "…", "...": "every column of the row, including deleted_at" }] },
    null,
    2,
  );

  const runColumns = [
    { key: "started", header: "Started", className: "whitespace-nowrap text-muted-foreground", render: (r) => formatDateTime(r.startedAt) },
    { key: "trigger", header: "Trigger", className: "text-muted-foreground", render: (r) => TRIGGER_LABEL[r.trigger] || r.trigger },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={RUN_STATUS_MAP} /> },
    { key: "rows", header: "Rows", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => formatNumber(r.rowCount) },
    { key: "duration", header: "Duration", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => (r.finishedAt ? `${Math.max(0, Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000))}s` : "—") },
    { key: "error", header: "Error", className: "max-w-[280px] truncate text-red-600 dark:text-red-400", render: (r) => r.error || "" },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={<InlineTitleInput value={draft.name} onChange={(e) => set("name")(e.target.value)} disabled={!canEdit} aria-label="Sync name" placeholder="Untitled sync" className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl" />}
      status={stateOf(sync)}
      statusMap={STATUS_MAP}
      badges={
        <>
          <Badge variant="neutral">{syncSource(sync.source).label}</Badge>
          <Badge variant="info">{syncDestination(sync.destination).label}</Badge>
          <span className="text-xs text-text-tertiary">{formatNumber(sync.rowsSynced)} rows synced · last run {relativeTime(sync.lastRunAt)}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete sync" className={DANGER_ICON_BUTTON} onClick={() => onDelete(sync)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            {isWebhook ? (
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={busy || sync.status === "paused"} onClick={() => onRun(sync)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
              </Button>
            ) : (
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={busy} onClick={() => onDownload(sync, draft.format)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
              </Button>
            )}
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </>
        ) : null
      }
      nav={SYNC_NAV.filter((n) => isWebhook || n.key !== "payload")}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Sync basics" description="What the sync is called, the data it sends and when it runs.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="se-name">
                  <Input id="se-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} />
                </Field>
                <Field label="Data" hint="Fixed once created — make a new sync for other data.">
                  <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">{syncSource(sync.source).label}</div>
                </Field>
                {isWebhook ? (
                  <Field label="Schedule" hint="Scheduled runs push everything changed since the last run.">
                    <Select value={draft.schedule} onValueChange={set("schedule")} disabled={!canEdit}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{SYNC_SCHEDULES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                ) : null}
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Sync enabled"
                  description="Paused syncs don't run on schedule and can't be run by hand."
                  control={<Switch checked={sync.status === "active"} disabled={!canEdit} aria-label="Sync enabled" onCheckedChange={(on) => onSave(sync.id, { status: on ? "active" : "paused" })} />}
                />
                <SettingRow title="Next run" description="When the scheduler picks this sync up next." control={<span className="text-sm text-muted-foreground">{isWebhook && sync.schedule !== "manual" && sync.status === "active" ? relativeTime(sync.nextRunAt, { empty: "Within 5 minutes" }) : "Not scheduled"}</span>} />
                <SettingRow title="Last error" description="From the most recent failed run." control={<span className="max-w-[260px] truncate text-sm text-muted-foreground">{sync.lastStatus === "failed" ? sync.lastError || "Unknown error" : "None"}</span>} />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "destination" ? (
            <SectionCard
              bare
              title={isWebhook ? "Endpoint & signing" : "Export file"}
              description={isWebhook ? "Where batches are posted, how big they are and the secret that signs them." : "The file format and what each download contains."}
            >
              {isWebhook ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Endpoint URL" htmlFor="se-url" className="sm:col-span-2">
                      <Input id="se-url" value={draft.url} disabled={!canEdit} onChange={(e) => set("url")(e.target.value)} className="font-mono text-sm" />
                    </Field>
                    <Field label="Rows per batch" htmlFor="se-batch" hint={`1–${MAX_BATCH_SIZE}; up to 20 batches per run.`}>
                      <Input id="se-batch" type="number" min={1} max={MAX_BATCH_SIZE} value={draft.batchSize} disabled={!canEdit} onChange={(e) => set("batchSize")(e.target.value)} />
                    </Field>
                  </div>
                  <SettingsList className="mt-5 border-t border-border pt-4">
                    <SettingRow
                      icon={KeyRound}
                      title="Signing secret"
                      description={sync.secretHint ? `Ends in …${sync.secretHint}. Rotating stops the old secret at once.` : "No secret — rotate to create one."}
                      control={canEdit ? <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => onRotate(sync)}><RotateCcw className="h-3.5 w-3.5" /> Rotate</Button> : null}
                    />
                    <SettingRow
                      icon={History}
                      title="Resync from the start"
                      description={sync.cursor ? "Clears the cursor so the next run sends every row again." : "The next run sends every row."}
                      control={canEdit ? <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={!sync.cursor} onClick={() => onResetCursor(sync)}>Reset cursor</Button> : null}
                    />
                  </SettingsList>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="File format" hint="CSV for spreadsheets; JSON Lines keeps nested fields intact.">
                    <Select value={draft.format} onValueChange={set("format")} disabled={!canEdit}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{EXPORT_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="What's included" hint="Every live row, up to 100,000 per file.">
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">{syncSource(sync.source).description}</div>
                  </Field>
                </div>
              )}
            </SectionCard>
          ) : null}

          {active === "runs" ? (
            runsLoading ? (
              <LoadingArea size={44} panel label="Loading runs" />
            ) : (
              <DataTable
                columns={runColumns}
                data={runs}
                getRowKey={(r) => r.id}
                empty={<EmptyState icon={History} title="No runs yet" description={isWebhook ? "Run it now, or wait for the schedule." : "Download the file to record the first run."} className="rounded-xl border border-border bg-surface-subtle" />}
              />
            )
          ) : null}

          {active === "payload" ? (
            <div className="space-y-4">
              <SectionCard title="Batch body" description="Rows arrive oldest change first. Upsert on id; rows with deleted_at set were removed in Geiger.">
                <CodeBlock code={payloadExample} />
              </SectionCard>
              <SectionCard title="Verify the signature">
                <SignatureDocs headers={[["X-Geiger-Signature", "t=<unix>,v1=<hex HMAC-SHA256>"], ["X-Geiger-Sync", "This sync's id"], ["X-Geiger-Sync-Run", "The run id (same for every batch in a run)"]]} />
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function WarehouseSyncScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can(MANAGE);
  const [syncs, setSyncs] = useState([]);
  const [recentRuns, setRecentRuns] = useState([]);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [issued, setIssued] = useState(null);
  const [query, setQuery] = useState("");
  const [destinationFilter, setDestinationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const fetchAll = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [rows, recent] = await Promise.all([listWarehouseSyncs(projectId), listSyncRuns(projectId, { since })]);
    return { rows: rows ?? [], recent: recent ?? [] };
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    fetchAll().then(({ rows, recent }) => {
      if (!alive) return;
      setSyncs(rows);
      setRecentRuns(recent);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchAll]);

  useEffect(() => {
    if (!recordId) return undefined;
    let alive = true;
    listSyncRuns(projectId, { syncId: recordId, limit: 100 }).then((rows) => {
      if (!alive) return;
      setRuns(rows ?? []);
      setRunsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, recordId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return syncs.filter((s) => {
      if (destinationFilter !== "all" && s.destination !== destinationFilter) return false;
      if (statusFilter !== "all" && stateOf(s) !== statusFilter) return false;
      if (q && !`${s.name} ${s.config.url || ""} ${s.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [syncs, query, destinationFilter, statusFilter]);

  const stats = useMemo(
    () => [
      { label: "Syncs", value: formatNumber(syncs.length) },
      { label: "Active", value: formatNumber(syncs.filter((s) => s.status === "active").length) },
      { label: "Rows synced", value: formatNumber(syncs.reduce((s, x) => s + x.rowsSynced, 0)) },
      { label: "Failed runs · 7d", value: formatNumber(recentRuns.filter((r) => r.status === "failed").length), footer: `of ${formatNumber(recentRuns.length)} runs` },
    ],
    [syncs, recentRuns],
  );

  const pager = usePagination(filtered, { resetKey: `${query}|${destinationFilter}|${statusFilter}` });

  const replaceSync = (sync) => setSyncs((p) => p.map((s) => (s.id === sync.id ? sync : s)));

  const handleCreate = async (input) => {
    const res = await apiPost(`/api/projects/${projectId}/data/syncs`, input);
    if (!res.ok) {
      toast.error(res.error || "Couldn't create the sync.");
      return false;
    }
    const sync = normalizeWarehouseSync(res.data.sync);
    setSyncs((p) => [sync, ...p]);
    toast.success(`Created ${sync.name}.`);
    if (res.data.secret) setIssued({ title: "Copy the signing secret", name: sync.name, value: res.data.secret });
    setRuns([]);
    setRunsLoading(false);
    openRecord(sync.id);
    return true;
  };

  const handleSave = async (id, patch) => {
    const previous = syncs;
    setSyncs((p) => p.map((s) => (s.id === id ? { ...s, ...patch, config: patch.config || s.config } : s)));
    const saved = await updateWarehouseSync(id, patch);
    if (!saved) {
      setSyncs(previous);
      toast.error("Couldn't save the sync.");
      return null;
    }
    replaceSync(saved);
    toast.success(patch.status ? (patch.status === "paused" ? "Sync paused." : "Sync resumed.") : "Sync saved.");
    return saved;
  };

  const handleRun = async (sync) => {
    setBusyId(sync.id);
    const res = await apiPost(`/api/projects/${projectId}/data/syncs/${sync.id}/run`, {});
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't run the sync.");
      return;
    }
    const run = normalizeSyncRun(res.data.run);
    replaceSync(normalizeWarehouseSync(res.data.sync));
    setRuns((p) => [run, ...p.filter((r) => r.id !== run.id)]);
    setRecentRuns((p) => [run, ...p]);
    if (run.status === "succeeded") toast.success(run.rowCount ? `Sent ${formatNumber(run.rowCount)} rows in ${formatNumber(run.batchCount)} batches.` : "Nothing changed since the last run.");
    else toast.error(run.error || "The run failed.");
  };

  const handleDownload = async (sync, format = sync.config.format || "csv") => {
    setBusyId(sync.id);
    const out = await downloadExport(projectId, sync, format);
    setBusyId(null);
    if (!out.ok) {
      toast.error(out.error);
      return;
    }
    toast.success("Download started.");
    const [rows, latest] = await Promise.all([listWarehouseSyncs(projectId), listSyncRuns(projectId, { syncId: sync.id, limit: 100 })]);
    if (rows) setSyncs(rows);
    if (latest && sync.id === recordId) setRuns(latest);
  };

  const handleRotate = async (sync) => {
    const res = await apiPost(`/api/projects/${projectId}/data/syncs/${sync.id}/rotate`, {});
    if (!res.ok) {
      toast.error(res.error || "Couldn't rotate the secret.");
      return;
    }
    replaceSync(normalizeWarehouseSync(res.data.sync));
    setIssued({ title: "Copy the new signing secret", name: sync.name, value: res.data.secret, note: "The previous secret has stopped working. Update your receiver before the next run." });
  };

  const handleResetCursor = async (sync) => {
    const saved = await updateWarehouseSync(sync.id, { cursor: null });
    if (!saved) {
      toast.error("Couldn't reset the cursor.");
      return;
    }
    replaceSync(saved);
    toast.success("The next run sends every row.");
  };

  const handleDelete = async (sync) => {
    setDeleteTarget(null);
    setSyncs((p) => p.filter((s) => s.id !== sync.id));
    if (sync.id === recordId) closeRecord();
    if (await softDeleteWarehouseSync(sync.id)) {
      toast.success(`Deleted ${sync.name}.`);
    } else {
      toast.error("Couldn't delete the sync.");
      const out = await fetchAll();
      setSyncs(out.rows);
    }
  };

  const openSync = (id) => {
    setRunsLoading(true);
    openRecord(id);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete sync</DialogTitle>
          <DialogDescription>
            Stop <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Data already sent stays where it is.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DANGER_BUTTON} onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  const secretDialog = <SecretDialog issued={issued} onClose={() => setIssued(null)} />;

  const open = !loading ? syncs.find((s) => s.id === recordId) : null;
  if (open) {
    return (
      <>
        <SyncEditor
          key={open.id}
          record={open}
          canEdit={canEdit}
          runs={runs}
          runsLoading={runsLoading}
          busy={busyId === open.id}
          onBack={closeRecord}
          onSave={handleSave}
          onRun={handleRun}
          onDownload={handleDownload}
          onRotate={handleRotate}
          onResetCursor={handleResetCursor}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
        {secretDialog}
      </>
    );
  }

  const filtersActive = query || destinationFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setDestinationFilter("all");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Sync",
      render: (s) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            {s.destination === "download" ? <Download className="h-4 w-4" /> : <Database className="h-4 w-4" />}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{s.name}</span>
            <span className="max-w-[280px] truncate text-xs text-text-secondary">
              {syncSource(s.source).label} → {s.destination === "webhook" ? s.config.url : `${(s.config.format || "csv").toUpperCase()} file`}
            </span>
          </div>
        </div>
      ),
    },
    { key: "destination", header: "Destination", render: (s) => <Badge variant="info">{syncDestination(s.destination).label}</Badge> },
    { key: "schedule", header: "Schedule", className: "whitespace-nowrap text-muted-foreground", render: (s) => scheduleLabel(s.schedule) },
    { key: "rows", header: "Rows synced", className: "tabular-nums text-muted-foreground", render: (s) => formatNumber(s.rowsSynced) },
    {
      key: "lastRun",
      header: "Last run",
      render: (s) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          {s.lastStatus === "failed" ? <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> : s.lastStatus === "succeeded" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : null}
          {relativeTime(s.lastRunAt)}
        </span>
      ),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (s) => <StatusPill status={stateOf(s)} map={STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <ActionMenu
          label={`Actions for ${s.name}`}
          items={[
            canEdit && s.destination === "webhook" && { label: "Run now", icon: Play, spin: busyId === s.id, disabled: s.status === "paused" || busyId === s.id, onSelect: () => handleRun(s) },
            canEdit && s.destination === "download" && { label: "Download", icon: Download, disabled: busyId === s.id, onSelect: () => handleDownload(s) },
            { label: canEdit ? "Edit" : "View", icon: Pencil, onSelect: () => openSync(s.id) },
            canEdit && (s.status === "paused" ? { label: "Resume", icon: Play, onSelect: () => handleSave(s.id, { status: "active" }) } : { label: "Pause", icon: Pause, onSelect: () => handleSave(s.id, { status: "paused" }) }),
            canEdit && { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(s) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Warehouse Sync"
        description="Send contacts, events and deliveries to your own pipeline, or export them as files."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New sync
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={destinationFilter} onValueChange={setDestinationFilter} options={DESTINATION_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search syncs…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} panel label="Loading syncs" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(s) => s.id}
            onRowClick={(s) => openSync(s.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Database}
                  title={filtersActive ? "No matches" : "No syncs yet"}
                  description={filtersActive ? "Try a different search or filter." : "Push changed rows to a webhook on a schedule, or set up a one-click CSV export. Direct warehouse connectors aren't available yet."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New sync
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="syncs" />
        </div>
      )}

      <CreateSyncDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
      {secretDialog}
    </MainScreenWrapper>
  );
}

export default WarehouseSyncScreen;
