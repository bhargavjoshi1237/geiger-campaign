"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, History, Eye, Loader2, ListChecks, LifeBuoy, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { listBlocklistChecks, normalizeBlocklistCheck, softDeleteBlocklistTarget } from "@/lib/supabase/blocklist_checks";
import { listSendingDomains } from "@/lib/supabase/sending_domains";
import { listDedicatedIps } from "@/lib/supabase/dedicated_ips";
import { blocklistFor } from "@/lib/deliverability/blocklists";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScreenHeader,
  StatsBar,
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
  StatusPill,
  ActionMenu,
  Field,
  LoadingArea,
  SectionCard,
} from "@geiger/ui";
import { DANGER_ICON_BUTTON, DELIVERABILITY_MANAGE, DeleteDialog, OUTLINE_BUTTON, PRIMARY_BUTTON, formatDateTime, number, plural } from "./deliverability_kit";

const HISTORY_DAYS = 90;

const TARGET_STATUS_MAP = {
  listed: { label: "Listed", variant: "danger", dotClass: "bg-red-400" },
  clear: { label: "Clear", variant: "success", dotClass: "bg-emerald-400" },
  error: { label: "Check incomplete", variant: "warning", dotClass: "bg-amber-400" },
  unchecked: { label: "Not checked", variant: "neutral", dotClass: "bg-zinc-400" },
};

const RESULT_MAP = {
  listed: { label: "Listed", variant: "danger" },
  clear: { label: "Clear", variant: "success" },
  error: { label: "No answer", variant: "warning" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(TARGET_STATUS_MAP).map(([value, s]) => ({ value, label: s.label })),
];

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All targets" },
  { value: "ip", label: "IP addresses" },
  { value: "domain", label: "Domains" },
];

const KIND_LABEL = { domain: "Sending domain", ip: "Dedicated IP", adhoc: "One-off check" };

const TARGET_NAV = [
  { key: "status", label: "Current status", icon: ShieldAlert, desc: "The latest answer from every list this target was checked against." },
  { key: "delisting", label: "Delisting", icon: LifeBuoy, desc: "What to fix and where to request removal for each listing." },
  { key: "history", label: "History", icon: History, desc: `Every check from the last ${HISTORY_DAYS} days.` },
];

// Groups history rows into targets: latest run results, run history and an overall status.
function buildTargets(checks, domains, ips) {
  const byTarget = new Map();
  const ensure = (target, targetType, kind) => {
    if (!byTarget.has(target)) byTarget.set(target, { target, targetType, kind, rows: [] });
    return byTarget.get(target);
  };
  domains.forEach((d) => ensure(d.domain, "domain", "domain"));
  ips.forEach((i) => ensure(i.ip, "ip", "ip"));
  for (const c of checks) ensure(c.target, c.targetType, "adhoc").rows.push(c);

  return [...byTarget.values()].map((t) => {
    const rows = [...t.rows].sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)));
    const runs = [];
    for (const r of rows) {
      const key = r.runId || r.checkedAt;
      let run = runs.find((x) => x.key === key);
      if (!run) {
        run = { key, checkedAt: r.checkedAt, rows: [] };
        runs.push(run);
      }
      run.rows.push(r);
    }
    const latest = runs[0]?.rows || [];
    const listed = latest.filter((r) => r.status === "listed");
    const errors = latest.filter((r) => r.status === "error");
    const status = !latest.length ? "unchecked" : listed.length ? "listed" : errors.length ? "error" : "clear";
    return { ...t, runs, latest, listed, errors, status, checkedAt: runs[0]?.checkedAt || null };
  });
}

const summaryLine = (t) => {
  if (t.status === "unchecked") return "Not checked yet";
  if (t.listed.length) return `Listed on ${[...new Set(t.listed.map((r) => r.listName))].join(", ")}`;
  if (t.errors.length) return `${plural(t.errors.length, "list")} didn't answer`;
  return `Clear on ${plural(new Set(t.latest.map((r) => r.list)).size, "list")}`;
};

const RESULT_COLUMNS = [
  { key: "list", header: "List", render: (r) => <span className="font-medium text-foreground">{r.listName}</span> },
  { key: "value", header: "Checked", className: "font-mono text-xs text-muted-foreground", render: (r) => r.checkedValue },
  { key: "status", header: "Result", className: "whitespace-nowrap", render: (r) => <StatusPill status={r.status} map={RESULT_MAP} /> },
  { key: "detail", header: "Detail", render: (r) => <span className="block max-w-[340px] text-xs text-text-secondary">{r.detail}</span> },
];

function CheckTargetDialog({ open, onOpenChange, onCheck }) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target.trim()) return;
    setBusy(true);
    const ok = await onCheck(target.trim());
    setBusy(false);
    if (!ok) return;
    setTarget("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Check a target</DialogTitle>
          <DialogDescription>
            Look up an IP or domain on the major blocklists now. Sending domains and dedicated IPs are re-checked every day on their own.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="IP address or domain" htmlFor="bm-target" hint="Domains are checked on domain lists, plus the IPs behind their A and MX records.">
            <Input
              id="bm-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submit();
              }}
              placeholder="198.51.100.24 or mail.yourbrand.com"
              className="font-mono"
              autoFocus
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={busy || !target.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Check now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetEditor({ target, canManage, checking, onBack, onCheck, onDelete }) {
  const historyRows = target.runs.map((run) => {
    const listed = run.rows.filter((r) => r.status === "listed");
    return {
      key: run.key,
      checkedAt: run.checkedAt,
      lists: new Set(run.rows.map((r) => r.list)).size,
      values: new Set(run.rows.map((r) => r.checkedValue)).size,
      listed,
      errors: run.rows.filter((r) => r.status === "error").length,
    };
  });
  const pager = usePagination(historyRows, { pageSize: 10 });

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={<h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{target.target}</h1>}
      status={target.status}
      statusMap={TARGET_STATUS_MAP}
      badges={
        <>
          <Badge variant="neutral">{KIND_LABEL[target.kind]}</Badge>
          <span className="text-xs text-text-tertiary">
            {summaryLine(target)} · Checked {formatDateTime(target.checkedAt).toLowerCase()}
          </span>
        </>
      }
      actions={
        <>
          {target.kind === "adhoc" ? (
            <Button variant="ghost" size="icon" aria-label="Remove target" className={DANGER_ICON_BUTTON} disabled={!canManage} onClick={() => onDelete(target)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          <Button className={PRIMARY_BUTTON} disabled={!canManage || checking} onClick={() => onCheck(target.target)}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
          </Button>
        </>
      }
      nav={TARGET_NAV}
      defaultSection="status"
    >
      {({ active }) => (
        <>
          {active === "status" ? (
            target.latest.length ? (
              <DataTable columns={RESULT_COLUMNS} data={target.latest} getRowKey={(r) => r.id} />
            ) : (
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ShieldAlert}
                  title="Not checked yet"
                  description="Run a check to query every blocklist for this target."
                  action={
                    canManage ? (
                      <Button className={PRIMARY_BUTTON} disabled={checking} onClick={() => onCheck(target.target)}>
                        {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
                      </Button>
                    ) : null
                  }
                />
              </div>
            )
          ) : null}

          {active === "delisting" ? (
            target.listed.length ? (
              <div className="space-y-4">
                {target.listed.map((r) => {
                  const list = blocklistFor(r.list);
                  return (
                    <SectionCard
                      key={r.id}
                      title={r.listName}
                      description={`${r.checkedValue} · ${r.detail}`}
                      action={
                        list?.delistUrl ? (
                          <Button asChild variant="outline" className={OUTLINE_BUTTON}>
                            <a href={list.delistUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" /> Removal page
                            </a>
                          </Button>
                        ) : null
                      }
                    >
                      <p className="text-sm text-text-secondary">{list?.guidance || "Fix the cause of the listing, then request removal from the list operator."}</p>
                    </SectionCard>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState icon={LifeBuoy} title="Nothing to delist" description="This target isn't on any list in its latest check." />
              </div>
            )
          ) : null}

          {active === "history" ? (
            <div className="space-y-5">
              <DataTable
                columns={[
                  { key: "checkedAt", header: "Checked", className: "whitespace-nowrap text-muted-foreground", render: (h) => formatDateTime(h.checkedAt) },
                  { key: "lists", header: "Lists", className: "tabular-nums text-muted-foreground", render: (h) => `${number(h.lists)} lists · ${plural(h.values, "address", "addresses")}` },
                  {
                    key: "listed",
                    header: "Result",
                    render: (h) =>
                      h.listed.length ? (
                        <span className="text-sm text-red-600 dark:text-red-400">Listed on {[...new Set(h.listed.map((r) => r.listName))].join(", ")}</span>
                      ) : h.errors ? (
                        <span className="text-sm text-amber-600 dark:text-amber-400">{plural(h.errors, "list")} didn&apos;t answer</span>
                      ) : (
                        <span className="text-sm text-emerald-600 dark:text-emerald-400">Clear</span>
                      ),
                  },
                ]}
                data={pager.pageItems}
                getRowKey={(h) => h.key}
                empty={
                  <div className="rounded-xl border border-border bg-surface-subtle">
                    <EmptyState icon={History} title="No history yet" description={`Checks from the last ${HISTORY_DAYS} days appear here.`} />
                  </div>
                }
              />
              <ListPagination {...pager} itemLabel="checks" />
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function BlocklistMonitorScreen() {
  const { projectId } = useProject();
  const canManage = useCan(DELIVERABILITY_MANAGE);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [data, setData] = useState({ key: null, checks: [], domains: [], ips: [] });
  const [checking, setChecking] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([listBlocklistChecks(projectId, { since }), listSendingDomains(projectId), listDedicatedIps(projectId)]).then(([checks, domains, ips]) => {
      if (!alive) return;
      if (!checks) toast.error("Couldn't load blocklist history.");
      setData({ key: projectId, checks: checks ?? [], domains: domains ?? [], ips: ips ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = data.key !== projectId;
  const targets = useMemo(() => buildTargets(data.checks, data.domains, data.ips), [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (typeFilter !== "all" && t.targetType !== typeFilter) return false;
      if (q && !t.target.includes(q)) return false;
      return true;
    });
  }, [targets, query, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const count = (s) => targets.filter((t) => t.status === s).length;
    const listings = targets.reduce((n, t) => n + t.listed.length, 0);
    return [
      { label: "Targets", value: loading ? "" : number(targets.length), footer: `${number(data.domains.length)} domains · ${number(data.ips.length)} IPs` },
      { label: "Listed now", value: loading ? "" : number(count("listed")), footer: plural(listings, "active listing") },
      { label: "Clear", value: loading ? "" : number(count("clear")), footer: "On every list checked" },
      { label: "Incomplete", value: loading ? "" : number(count("error")), footer: "A list didn't answer" },
    ];
  }, [targets, data.domains.length, data.ips.length, loading]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${typeFilter}` });

  const runCheck = async (target) => {
    setChecking((c) => [...c, target]);
    const res = await apiPost(`/api/projects/${projectId}/deliverability/blocklists/check`, { target });
    setChecking((c) => c.filter((t) => t !== target));
    if (!res.ok) {
      toast.error(res.error || "Couldn't run the check.");
      return null;
    }
    const rows = (res.data.rows || []).map(normalizeBlocklistCheck);
    setData((d) => ({ ...d, checks: [...rows, ...d.checks] }));
    const listed = rows.filter((r) => r.status === "listed");
    const errors = rows.filter((r) => r.status === "error");
    if (res.data.note && !rows.length) toast.warning(res.data.note);
    else if (listed.length) toast.error(`${res.data.target} is listed on ${[...new Set(listed.map((r) => r.listName))].join(", ")}.`);
    else if (errors.length) toast.warning(`${res.data.target} is clear where lists answered; ${plural(errors.length, "list")} didn't answer.`);
    else toast.success(`${res.data.target} is clear on ${plural(new Set(rows.map((r) => r.list)).size, "list")}.`);
    return res.data.target;
  };

  const handleCheckNew = async (input) => {
    const target = await runCheck(input);
    if (target) openRecord(target);
    return Boolean(target);
  };

  const handleDelete = async (t) => {
    setDeleteTarget(null);
    const before = data.checks;
    setData((d) => ({ ...d, checks: d.checks.filter((c) => c.target !== t.target) }));
    if (t.target === recordId) closeRecord();
    const ok = await softDeleteBlocklistTarget(projectId, t.target);
    if (!ok) {
      setData((d) => ({ ...d, checks: before }));
      toast.error("Couldn't remove the target.");
      return;
    }
    toast.success(`Removed ${t.target} and its history.`);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      label={deleteTarget?.target}
      noun="target"
      description="Its check history is removed. You can check it again any time."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = targets.find((t) => t.target === recordId);
  if (open) {
    return (
      <>
        <TargetEditor
          key={open.target}
          target={open}
          canManage={canManage}
          checking={checking.includes(open.target)}
          onBack={closeRecord}
          onCheck={runCheck}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || typeFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
  };

  const columns = [
    {
      key: "target",
      header: "Target",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-mono text-sm font-medium text-foreground">{t.target}</span>
            <span className="truncate text-xs text-text-secondary">{KIND_LABEL[t.kind]}</span>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (t) => <StatusPill status={t.status} map={TARGET_STATUS_MAP} /> },
    { key: "summary", header: "Result", render: (t) => <span className="block max-w-[280px] truncate text-sm text-muted-foreground">{summaryLine(t)}</span> },
    { key: "checked", header: "Last checked", className: "whitespace-nowrap text-muted-foreground", render: (t) => formatDateTime(t.checkedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.target}`}
          contentClassName="w-52"
          items={[
            { label: "View results", icon: Eye, onSelect: () => openRecord(t.target) },
            canManage && { label: "Check now", icon: RefreshCw, onSelect: () => runCheck(t.target) },
            ...t.listed
              .map((r) => blocklistFor(r.list))
              .filter((l, i, arr) => l?.delistUrl && arr.indexOf(l) === i)
              .map((l) => ({ label: `Delist from ${l.name}`, icon: ExternalLink, href: l.delistUrl })),
            canManage && t.kind === "adhoc" && { separator: true },
            canManage && t.kind === "adhoc" && { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(t) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Blocklist Monitor"
        description="Daily DNS blocklist checks for your sending domains and dedicated IPs."
        actions={
          <Button className={PRIMARY_BUTTON} disabled={!canManage} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Check a target
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search IPs and domains…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading blocklist checks" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(t) => t.target}
            onRowClick={(t) => openRecord(t.target)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ListChecks}
                  title={filtersActive ? "No matches" : "Nothing to monitor yet"}
                  description={
                    filtersActive
                      ? "Try a different search or filter."
                      : "Add a sending domain or dedicated IP and it's checked daily, or check any IP or domain now."
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : canManage ? (
                      <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> Check a target
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="targets" />
        </div>
      )}

      <CheckTargetDialog open={createOpen} onOpenChange={setCreateOpen} onCheck={handleCheckNew} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default BlocklistMonitorScreen;
