"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Flame, FolderInput, Gauge, Loader2, Network, Pause, Play, Plus, RefreshCw, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import {
  createDedicatedIp,
  listDedicatedIps,
  normalizeDedicatedIp,
  softDeleteDedicatedIp,
  updateDedicatedIp,
} from "@/lib/supabase/dedicated_ips";
import { createWarmupPlan, listWarmupPlans } from "@/lib/supabase/warmup_plans";
import { listBlocklistChecks, normalizeBlocklistCheck } from "@/lib/supabase/blocklist_checks";
import { buildWarmupSchedule, planState, todayIso, warmupDay } from "@/lib/deliverability/warmup_curves";
import { providerFor } from "@/lib/deliverability/records";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  SettingsList,
  SettingRow,
} from "@geiger/ui";
import { DANGER_ICON_BUTTON, DELIVERABILITY_MANAGE, DeleteDialog, OUTLINE_BUTTON, PRIMARY_BUTTON, formatDateTime, number, plural } from "./deliverability_kit";

const POOLS = [
  { value: "marketing", label: "Marketing" },
  { value: "transactional", label: "Transactional" },
  { value: "default", label: "Default" },
];
const POOL_LABEL = Object.fromEntries(POOLS.map((p) => [p.value, p.label]));

const STATUS_MAP = {
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  warming: { label: "Warming", variant: "warning", dotClass: "bg-amber-400" },
  paused: { label: "Paused", variant: "neutral", dotClass: "bg-zinc-400" },
};

const RDNS_MAP = {
  pass: { label: "Confirmed", variant: "success" },
  mismatch: { label: "Mismatch", variant: "danger" },
  missing: { label: "No PTR", variant: "warning" },
  error: { label: "Lookup failed", variant: "warning" },
  pending: { label: "Not checked", variant: "neutral" },
};

const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_MAP).map(([value, s]) => ({ value, label: s.label }))];
const POOL_FILTER_OPTIONS = [{ value: "all", label: "All pools" }, ...POOLS];

const IP_NAV = [
  { key: "details", label: "Details", icon: Settings2, desc: "Pool, expected reverse DNS and whether the IP is in use." },
  { key: "rdns", label: "Reverse DNS", icon: Gauge, desc: "The PTR record receivers see when this IP connects." },
  { key: "blocklists", label: "Blocklists", icon: ShieldAlert, desc: "The latest answer from every IP blocklist." },
  { key: "warmup", label: "Warm-up", icon: Flame, desc: "The plan that caps this IP's daily volume while it builds reputation." },
];

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const isIp = (v) => IPV4.test(v) || (v.includes(":") && /^[0-9a-f:.]+$/i.test(v));

const latestRun = (checks) => {
  const runId = checks[0]?.runId;
  return checks.filter((c) => c.runId === runId);
};

function BlocklistSummary({ checks }) {
  if (!checks.length) return <span className="text-xs text-text-tertiary">Not checked</span>;
  const listed = checks.filter((c) => c.status === "listed");
  if (listed.length) return <Badge variant="danger">Listed on {plural(listed.length, "list")}</Badge>;
  if (checks.some((c) => c.status === "error")) return <Badge variant="warning">Incomplete</Badge>;
  return <Badge variant="success">Clear</Badge>;
}

function WarmupSummary({ plan }) {
  if (!plan) return <span className="text-xs text-text-tertiary">No plan</span>;
  const state = planState(plan);
  const day = Math.min(Math.max(warmupDay(plan), 0), plan.schedule.length);
  return (
    <span className="whitespace-nowrap text-xs text-muted-foreground">
      {state === "completed" ? "Completed" : state === "paused" ? `Paused · day ${day}` : state === "scheduled" ? "Starts soon" : `Day ${day} of ${plan.schedule.length}`}
    </span>
  );
}

function AddIpDialog({ open, onOpenChange, existing, onCreate }) {
  const [ip, setIp] = useState("");
  const [pool, setPool] = useState("marketing");
  const [expectedRdns, setExpectedRdns] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = ip.trim().toLowerCase();
    if (!isIp(value)) {
      toast.error("Enter a valid IPv4 or IPv6 address.");
      return;
    }
    if (existing.some((i) => i.ip === value)) {
      toast.error(`${value} is already added.`);
      return;
    }
    setBusy(true);
    const ok = await onCreate({ ip: value, pool, expectedRdns });
    setBusy(false);
    if (!ok) return;
    setIp("");
    setPool("marketing");
    setExpectedRdns("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add dedicated IP</DialogTitle>
          <DialogDescription>
            Dedicated IPs are provisioned by {providerFor("resend").label} through geiger-dash. Add the IPs it assigned to you to monitor reverse DNS,
            blocklists and warm-up; adding one here doesn&apos;t provision it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="IP address" htmlFor="di-ip">
            <Input
              id="di-ip"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submit();
              }}
              placeholder="198.51.100.24"
              className="font-mono"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Pool">
              <Select value={pool} onValueChange={setPool}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{POOLS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Expected rDNS (optional)" htmlFor="di-rdns">
              <Input id="di-rdns" value={expectedRdns} onChange={(e) => setExpectedRdns(e.target.value)} placeholder="mta1.mail.yourbrand.com" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={busy || !ip.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add IP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of an IP row; compared against the row to derive dirty state.
const toDraft = (i) => ({ pool: i.pool, expectedRdns: i.expectedRdns || "", status: i.status, warmupPlanId: i.warmupPlanId || "none" });

function IpEditor({ record, plans, checks, canManage, checking, onBack, onSave, onCheck, onCreatePlan, onOpenPlan, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const plan = plans.find((p) => p.id === record.warmupPlanId) || null;
  const planOptions = plans.filter((p) => p.channel === "email" && (!p.ip || p.ip === record.ip));
  const rdns = RDNS_MAP[record.rdnsStatus] || RDNS_MAP.pending;

  const save = async () => {
    setSaving(true);
    const warmupPlanId = draft.warmupPlanId === "none" ? null : draft.warmupPlanId;
    const linked = plans.find((p) => p.id === warmupPlanId);
    // Linking an unfinished plan puts an in-use IP into warming.
    const status = draft.status !== "paused" && linked && planState(linked) !== "completed" ? "warming" : draft.status;
    await onSave(record, { ...draft, warmupPlanId, status });
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={<h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{record.ip}</h1>}
      status={record.status}
      statusMap={STATUS_MAP}
      badges={
        <>
          <Badge variant="neutral">{POOL_LABEL[record.pool] || record.pool} pool</Badge>
          <Badge variant={rdns.variant}>rDNS: {rdns.label}</Badge>
          <BlocklistSummary checks={checks} />
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete IP" className={DANGER_ICON_BUTTON} disabled={!canManage} onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!canManage || checking} onClick={() => onCheck(record)}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
          </Button>
          <Button className={PRIMARY_BUTTON} disabled={!canManage || !dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </Button>
        </>
      }
      nav={IP_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Routing & hostname" description="Which pool this IP serves, the hostname it should resolve to and whether it's in rotation.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pool" hint="Which stream the provider routes through this IP.">
                  <Select value={draft.pool} onValueChange={set("pool")} disabled={!canManage}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{POOLS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Expected reverse DNS" htmlFor="ie-rdns" hint="The hostname the provider set for this IP. Checked against the PTR.">
                  <Input id="ie-rdns" value={draft.expectedRdns} disabled={!canManage} onChange={(e) => set("expectedRdns")(e.target.value)} placeholder="mta1.mail.yourbrand.com" />
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="In use"
                  description="Paused IPs stay monitored but are marked as out of rotation; ask the provider to pull them from your pool."
                  checked={draft.status !== "paused"}
                  onCheckedChange={(on) => set("status")(on ? (plan && planState(plan) !== "completed" ? "warming" : "active") : "paused")}
                />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "rdns" ? (
            <SectionCard bare title="PTR check" description="What the last reverse DNS lookup found for this IP.">
              <SettingsList>
                <SettingRow title="Result" description="Forward-confirmed reverse DNS: the PTR exists and resolves back to this IP." control={<Badge variant={rdns.variant}>{rdns.label}</Badge>} />
                <SettingRow title="PTR found" description="What receivers see when this IP connects." control={<span className="font-mono text-xs text-muted-foreground">{record.reverseDns || "—"}</span>} />
                <SettingRow title="Expected" description="Set under Details." control={<span className="font-mono text-xs text-muted-foreground">{record.expectedRdns || "Any hostname"}</span>} />
                <SettingRow title="Last checked" description="IPs are re-checked every day." control={<span className="text-sm text-muted-foreground">{formatDateTime(record.rdnsCheckedAt)}</span>} />
              </SettingsList>
              {record.rdnsStatus === "missing" || record.rdnsStatus === "mismatch" ? (
                <p className="mt-4 border-t border-border pt-4 text-sm text-text-secondary">
                  Reverse DNS for a provider IP is set by the provider. Ask them to point the PTR at a hostname on your sending domain
                  {record.expectedRdns ? ` (${record.expectedRdns})` : ""} with a matching A record. Gmail and Microsoft reject or throttle mail from IPs without it.
                </p>
              ) : null}
            </SectionCard>
          ) : null}

          {active === "blocklists" ? (
            checks.length ? (
              <DataTable
                columns={[
                  { key: "list", header: "List", render: (c) => <span className="font-medium text-foreground">{c.listName}</span> },
                  { key: "status", header: "Result", render: (c) => <Badge variant={c.status === "listed" ? "danger" : c.status === "error" ? "warning" : "success"}>{c.status === "listed" ? "Listed" : c.status === "error" ? "No answer" : "Clear"}</Badge> },
                  { key: "detail", header: "Detail", render: (c) => <span className="block max-w-[360px] text-xs text-text-secondary">{c.detail}</span> },
                  { key: "checked", header: "Checked", className: "whitespace-nowrap text-muted-foreground", render: (c) => formatDateTime(c.checkedAt) },
                ]}
                data={checks}
                getRowKey={(c) => c.id}
              />
            ) : (
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState icon={ShieldAlert} title="Not checked yet" description="Run a check to query every IP blocklist for this address." />
              </div>
            )
          ) : null}

          {active === "warmup" ? (
            <SectionCard bare title="Linked plan" description="The warm-up plan that caps this IP's daily volume." contentClassName="space-y-4">
              <Field label="Warm-up plan" hint="Linking a plan caps this IP's daily email volume to its schedule.">
                <Select value={draft.warmupPlanId} onValueChange={set("warmupPlanId")} disabled={!canManage}>
                  <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No plan</SelectItem>
                    {planOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name || p.ip || "Email plan"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {plan ? (
                <SettingsList>
                  <SettingRow title="Progress" description="Days follow the plan's start date." control={<WarmupSummary plan={plan} />} />
                  <SettingRow title="Target volume" description="The daily cap once the ramp completes." control={<span className="text-sm tabular-nums text-muted-foreground">{number(plan.targetVolume)}</span>} />
                </SettingsList>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                {plan ? (
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onOpenPlan(plan)}>
                    <ArrowUpRight className="h-4 w-4" /> Open in IP Warmup
                  </Button>
                ) : canManage ? (
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onCreatePlan(record)}>
                    <Flame className="h-4 w-4" /> Create a standard plan
                  </Button>
                ) : null}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function DedicatedIpsScreen() {
  const { projectId } = useProject();
  const canManage = useCan(DELIVERABILITY_MANAGE);
  const { recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();
  const [data, setData] = useState({ key: null, ips: [], plans: [], checks: [] });
  const [checking, setChecking] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [poolFilter, setPoolFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([listDedicatedIps(projectId), listWarmupPlans(projectId, { channel: "email" }), listBlocklistChecks(projectId, { since })]).then(([ips, plans, checks]) => {
      if (!alive) return;
      if (!ips) toast.error("Couldn't load dedicated IPs.");
      setData({ key: projectId, ips: ips ?? [], plans: plans ?? [], checks: (checks ?? []).filter((c) => c.targetType === "ip") });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = data.key !== projectId;
  const ips = data.ips;
  const checksByIp = useMemo(() => {
    const map = {};
    for (const ip of ips) map[ip.id] = latestRun(data.checks.filter((c) => c.target === ip.ip));
    return map;
  }, [ips, data.checks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ips.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (poolFilter !== "all" && i.pool !== poolFilter) return false;
      if (q && !`${i.ip} ${i.pool} ${i.reverseDns}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ips, query, statusFilter, poolFilter]);

  const stats = useMemo(() => {
    const listed = ips.filter((i) => (checksByIp[i.id] || []).some((c) => c.status === "listed")).length;
    return [
      { label: "IPs", value: loading ? "" : number(ips.length), footer: "Assigned by the provider" },
      { label: "rDNS confirmed", value: loading ? "" : number(ips.filter((i) => i.rdnsStatus === "pass").length), footer: "PTR resolves back" },
      { label: "Listed", value: loading ? "" : number(listed), footer: "On at least one blocklist" },
      { label: "Warming", value: loading ? "" : number(ips.filter((i) => i.status === "warming").length), footer: "Capped by a plan" },
    ];
  }, [ips, checksByIp, loading]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${poolFilter}` });

  const setIps = (fn) => setData((d) => ({ ...d, ips: fn(d.ips) }));
  const replace = (next) => setIps((rows) => rows.map((r) => (r.id === next.id ? next : r)));

  const runCheck = async (ip, { quiet = false } = {}) => {
    setChecking((c) => [...c, ip.id]);
    const res = await apiPost(`/api/projects/${projectId}/deliverability/ips/${ip.id}/check`);
    setChecking((c) => c.filter((id) => id !== ip.id));
    if (!res.ok) {
      toast.error(res.error || "Couldn't check the IP.");
      return;
    }
    if (res.data.ip) replace(normalizeDedicatedIp(res.data.ip));
    const rows = (res.data.checks || []).map(normalizeBlocklistCheck);
    setData((d) => ({ ...d, checks: [...rows, ...d.checks] }));
    if (quiet) return;
    const listed = rows.filter((r) => r.status === "listed");
    if (listed.length) toast.error(`${ip.ip} is listed on ${listed.map((r) => r.listName).join(", ")}.`);
    else {
      const lists = new Set(rows.map((r) => r.list)).size;
      toast.success(`Checked ${ip.ip}: reverse DNS ${(RDNS_MAP[res.data.rdns?.status] || RDNS_MAP.pending).label.toLowerCase()}, clear on ${plural(lists, "list")}.`, { description: res.data.note || undefined });
    }
  };

  const handleCreate = async ({ ip, pool, expectedRdns }) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const input = { id, ip, pool, expectedRdns, status: "warming", provider: "resend", createdBy: user?.id ?? null };
    setIps((rows) => [{ ...input, rdnsStatus: "pending", reverseDns: "", createdAt: new Date().toISOString() }, ...rows]);
    const created = await createDedicatedIp(projectId, input);
    if (!created) {
      setIps((rows) => rows.filter((r) => r.id !== id));
      toast.error("Couldn't add the IP.");
      return false;
    }
    replace(created);
    toast.success(`Added ${ip}. Checking reverse DNS and blocklists…`);
    openRecord(id);
    runCheck(created, { quiet: true });
    return true;
  };

  const handleSave = async (ip, patch) => {
    replace({ ...ip, ...patch });
    const saved = await updateDedicatedIp(ip.id, patch);
    if (!saved) {
      replace(ip);
      toast.error("Couldn't save the IP.");
      return null;
    }
    replace(saved);
    toast.success("IP saved.");
    return saved;
  };

  const handleCreatePlan = async (ip) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const plan = await createWarmupPlan(projectId, {
      id,
      name: `${ip.ip} ramp`,
      channel: "email",
      ip: ip.ip,
      curve: "standard",
      targetVolume: 100000,
      startDate: todayIso(),
      schedule: buildWarmupSchedule({ channel: "email", curve: "standard", targetVolume: 100000 }),
      status: "active",
      createdBy: user?.id ?? null,
    });
    if (!plan) {
      toast.error("Couldn't create the warm-up plan.");
      return;
    }
    setData((d) => ({ ...d, plans: [plan, ...d.plans] }));
    const saved = await handleSave(ip, { warmupPlanId: plan.id, status: "warming" });
    if (saved) toast.success(`Created a 30-day ramp for ${ip.ip}. Tune it under IP Warmup.`);
  };

  const handleDelete = async (ip) => {
    setDeleteTarget(null);
    setIps((rows) => rows.filter((r) => r.id !== ip.id));
    if (ip.id === recordId) closeRecord();
    const ok = await softDeleteDedicatedIp(ip.id);
    if (!ok) {
      setIps((rows) => [ip, ...rows]);
      toast.error("Couldn't delete the IP.");
      return;
    }
    toast.success(`Deleted ${ip.ip}.`);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      label={deleteTarget?.ip}
      noun="IP"
      description="Monitoring stops; the provider keeps the IP until you release it there."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = ips.find((i) => i.id === recordId);
  if (open) {
    return (
      <>
        <IpEditor
          key={open.id}
          record={open}
          plans={data.plans}
          checks={checksByIp[open.id] || []}
          canManage={canManage}
          checking={checking.includes(open.id)}
          onBack={closeRecord}
          onSave={handleSave}
          onCheck={runCheck}
          onCreatePlan={handleCreatePlan}
          onOpenPlan={(plan) => openRecordInTab(plan.id, "IP Warmup")}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || poolFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setPoolFilter("all");
  };

  const columns = [
    {
      key: "ip",
      header: "IP",
      render: (i) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Network className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-mono font-medium text-foreground">{i.ip}</span>
            <span className="truncate text-xs text-text-secondary">{POOL_LABEL[i.pool] || i.pool} pool</span>
          </div>
        </div>
      ),
    },
    {
      key: "rdns",
      header: "Reverse DNS",
      render: (i) => (
        <div className="flex min-w-0 flex-col gap-1">
          <Badge variant={(RDNS_MAP[i.rdnsStatus] || RDNS_MAP.pending).variant} className="w-fit">{(RDNS_MAP[i.rdnsStatus] || RDNS_MAP.pending).label}</Badge>
          {i.reverseDns ? <span className="max-w-[220px] truncate font-mono text-xs text-text-secondary">{i.reverseDns}</span> : null}
        </div>
      ),
    },
    { key: "blocklists", header: "Blocklists", className: "whitespace-nowrap", render: (i) => <BlocklistSummary checks={checksByIp[i.id] || []} /> },
    { key: "warmup", header: "Warm-up", render: (i) => <WarmupSummary plan={data.plans.find((p) => p.id === i.warmupPlanId)} /> },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (i) => <StatusPill status={i.status} map={STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (i) => (
        <ActionMenu
          label={`Actions for ${i.ip}`}
          contentClassName="w-52"
          items={[
            { label: "Open", icon: Settings2, onSelect: () => openRecord(i.id) },
            canManage && { label: "Check now", icon: RefreshCw, onSelect: () => runCheck(i) },
            ...(canManage ? POOLS.filter((p) => p.value !== i.pool).map((p) => ({ label: `Move to ${p.label}`, icon: FolderInput, onSelect: () => handleSave(i, { pool: p.value }) })) : []),
            canManage &&
              (i.status === "paused"
                ? { label: "Resume", icon: Play, onSelect: () => handleSave(i, { status: i.warmupPlanId ? "warming" : "active" }) }
                : { label: "Pause", icon: Pause, onSelect: () => handleSave(i, { status: "paused" }) }),
            canManage && { separator: true },
            canManage && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(i) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Dedicated IPs"
        description="Track reverse DNS, blocklists and warm-up for the IPs your provider assigned you."
        actions={
          <Button className={PRIMARY_BUTTON} disabled={!canManage} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add IP
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={poolFilter} onValueChange={setPoolFilter} options={POOL_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search IPs or pools…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading dedicated IPs" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(i) => i.id}
            onRowClick={(i) => openRecord(i.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Network}
                  title={filtersActive ? "No matches" : "No dedicated IPs yet"}
                  description={
                    filtersActive
                      ? "Try a different search or filter."
                      : "Shared provider IPs need nothing here. If the provider assigned you dedicated IPs, add them to monitor rDNS, blocklists and warm-up."
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : canManage ? (
                      <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> Add IP
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="IPs" />
        </div>
      )}

      <AddIpDialog open={createOpen} onOpenChange={setCreateOpen} existing={ips} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default DedicatedIpsScreen;
