"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { CalendarDays, Flame, LineChart, Loader2, Pause, Play, Plus, Settings2, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiGet } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { listConnections } from "@/lib/supabase/channel_connections";
import { listDedicatedIps } from "@/lib/supabase/dedicated_ips";
import { createWarmupPlan, listWarmupPlans, softDeleteWarmupPlan, updateWarmupPlan } from "@/lib/supabase/warmup_plans";
import {
  CHANNEL_LABELS,
  WHATSAPP_TIERS,
  addDaysIso,
  buildWarmupSchedule,
  capForDay,
  curveFor,
  curvesFor,
  planState,
  resumedStartDate,
  todayIso,
  warmupDay,
} from "@/lib/deliverability/warmup_curves";
import {
  Badge,
  Button,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
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
  SettingsList,
  SettingRow,
  DataTable,
  EmptyState,
  StatusPill,
  ActionMenu,
  Field,
  LoadingArea,
} from "@geiger/ui";
import { DANGER_ICON_BUTTON, DELIVERABILITY_MANAGE, DeleteDialog, OUTLINE_BUTTON, PRIMARY_BUTTON, formatDate, number } from "./deliverability_kit";

const PLAN_STATUS_MAP = {
  active: { label: "Active", variant: "warning", dotClass: "bg-amber-400" },
  scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  paused: { label: "Paused", variant: "neutral", dotClass: "bg-zinc-400" },
  completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
};

const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(PLAN_STATUS_MAP).map(([value, s]) => ({ value, label: s.label }))];
const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }));
const CHANNEL_FILTER_OPTIONS = [{ value: "all", label: "All channels" }, ...CHANNEL_OPTIONS];

const WARMUP_NAV = [
  { key: "progress", label: "Progress", icon: LineChart, desc: "Actual sends against the daily cap, from the delivery log." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "The ramp curve, target volume and start date." },
  { key: "schedule", label: "Schedule", icon: CalendarDays, desc: "The cap for every day of the ramp." },
];

const CHART_CONFIG = {
  sent: { label: "Sent", color: "var(--chart-series-1)" },
  cap: { label: "Daily cap", color: "var(--chart-series-3)" },
};
const AXIS_STROKE = "var(--muted-foreground)";
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";

const OTHER_IP = "__other";

function targetLabel(plan, connections) {
  if (plan.channel === "email") return plan.ip || plan.name || "Email";
  const c = connections.find((x) => x.id === plan.connectionId);
  return c ? c.name || c.handle || `${CHANNEL_LABELS[plan.channel]} number` : plan.name || `${CHANNEL_LABELS[plan.channel]} number`;
}

const dayOf = (plan) => Math.min(Math.max(warmupDay(plan), 0), plan.schedule.length);
const todayCap = (plan) => (planState(plan) === "active" ? capForDay(plan.schedule, warmupDay(plan)) : null);

function RampProgress({ plan }) {
  const total = plan.schedule.length || 1;
  const day = planState(plan) === "completed" ? total : dayOf(plan);
  return (
    <div className="flex w-44 items-center gap-3">
      <Progress value={(day / total) * 100} className="h-1.5 bg-surface-hover" />
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {day}/{total} days
      </span>
    </div>
  );
}

const schedulePreview = (schedule) => {
  if (!schedule.length) return "";
  const picks = [1, 7, 14, schedule.length].filter((d, i, a) => d <= schedule.length && a.indexOf(d) === i);
  return picks.map((d) => `Day ${d}: ${number(schedule[d - 1].cap)}`).join(" · ");
};

function CreatePlanDialog({ open, onOpenChange, connections, ips, existing, onCreate }) {
  const [channel, setChannel] = useState("email");
  const [ipChoice, setIpChoice] = useState("");
  const [ip, setIp] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [curve, setCurve] = useState("standard");
  const [target, setTarget] = useState("100000");
  const [days, setDays] = useState("30");
  const [startDate, setStartDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  const channelConnections = connections.filter((c) => c.channel === channel);
  const curves = curvesFor(channel);
  const selectedCurve = curveFor(channel, curve);
  const schedule = useMemo(
    () => buildWarmupSchedule({ channel, curve: selectedCurve.key, targetVolume: Number(target) || 0, days: Number(days) || selectedCurve.days }),
    [channel, selectedCurve.key, selectedCurve.days, target, days],
  );

  const changeChannel = (next) => {
    setChannel(next);
    const c = curveFor(next, "standard");
    setCurve(c.key);
    setDays(String(c.days));
    setTarget(next === "whatsapp" ? "10000" : next === "sms" ? "5000" : "100000");
    setConnectionId("");
  };

  const changeCurve = (key) => {
    setCurve(key);
    setDays(String(curveFor(channel, key).days));
  };

  const resolvedIp = channel === "email" ? (ipChoice && ipChoice !== OTHER_IP ? ipChoice : ip.trim()) : null;

  const submit = async () => {
    if (channel === "email" && !/^[0-9a-f:.]+$/i.test(resolvedIp || "")) {
      toast.error("Choose or enter the IP address to warm up.");
      return;
    }
    if (channel !== "email" && !connectionId) {
      toast.error(`Choose the ${CHANNEL_LABELS[channel]} number to warm up.`);
      return;
    }
    if (!(Number(target) >= 100)) {
      toast.error("Target daily volume must be at least 100.");
      return;
    }
    const duplicate = existing.find((p) => planState(p) !== "completed" && (channel === "email" ? p.ip === resolvedIp : p.connectionId === connectionId));
    if (duplicate) {
      toast.error("That IP or number already has an unfinished warm-up plan.");
      return;
    }
    const connection = connections.find((c) => c.id === connectionId);
    setBusy(true);
    const ok = await onCreate({
      name: `${channel === "email" ? resolvedIp : connection?.name || connection?.handle || CHANNEL_LABELS[channel]} ramp`,
      channel,
      ip: resolvedIp,
      connectionId: channel === "email" ? null : connectionId,
      curve: selectedCurve.key,
      targetVolume: Number(target),
      startDate,
      schedule,
      status: "active",
    });
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create warm-up plan</DialogTitle>
          <DialogDescription>Senders respect the daily cap automatically until the ramp reaches its target.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Channel">
              <Select value={channel} onValueChange={changeChannel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {channel === "email" ? (
              <Field label="IP address">
                <Select value={ipChoice || (ips.length ? "" : OTHER_IP)} onValueChange={setIpChoice}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choose an IP" /></SelectTrigger>
                  <SelectContent>
                    {ips.map((i) => <SelectItem key={i.id} value={i.ip}>{i.ip}</SelectItem>)}
                    <SelectItem value={OTHER_IP}>Another IP…</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label={`${CHANNEL_LABELS[channel]} number`}>
                <Select value={connectionId} onValueChange={setConnectionId} disabled={!channelConnections.length}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={channelConnections.length ? "Choose a number" : "None connected"} /></SelectTrigger>
                  <SelectContent>{channelConnections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || c.handle || c.externalId}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>
          {channel === "email" && (ipChoice === OTHER_IP || !ips.length) ? (
            <Field label="Other IP address" htmlFor="wp-ip" hint="Add it under Dedicated IPs too, to track its reverse DNS and blocklists.">
              <Input id="wp-ip" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.42" className="font-mono" />
            </Field>
          ) : null}
          {channel !== "email" && !channelConnections.length ? (
            <p className="text-sm text-text-secondary">Connect a {CHANNEL_LABELS[channel]} number under Channels first.</p>
          ) : null}
          <Field label="Ramp curve" hint={selectedCurve.description}>
            <Select value={selectedCurve.key} onValueChange={changeCurve}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{curves.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-4">
            {channel === "whatsapp" ? (
              <Field label="Target tier" className="col-span-2">
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WHATSAPP_TIERS.slice(1).map((t) => <SelectItem key={t} value={String(t)}>{number(t)} conversations a day</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <>
                <Field label="Target per day" htmlFor="wp-target">
                  <Input id="wp-target" type="number" min={100} value={target} onChange={(e) => setTarget(e.target.value)} />
                </Field>
                <Field label="Days" htmlFor="wp-days">
                  <Input id="wp-days" type="number" min={7} max={120} value={days} onChange={(e) => setDays(e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Start date" htmlFor="wp-start">
              <Input id="wp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          </div>
          <p className="rounded-lg border border-border bg-surface-card px-3 py-2 text-xs tabular-nums text-text-secondary">{schedulePreview(schedule)}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressChart({ days }) {
  const data = days.map((d) => ({ label: formatDate(d.date).replace(/, \d{4}$/, ""), sent: d.sent, cap: d.cap }));
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} width={48} stroke={AXIS_STROKE} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
        <ChartTooltip cursor={{ fill: "var(--chart-cursor-fill)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
        <ChartLegend content={<ChartLegendContent className="text-muted-foreground" />} />
        <Bar dataKey="sent" fill="var(--color-sent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="cap" type="stepAfter" stroke="var(--color-cap)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}

// Editable slice of a plan; compared against the plan to derive dirty state.
const toDraft = (p) => ({ curve: p.curve, target: String(p.targetVolume), days: String(p.schedule.length), startDate: p.startDate || todayIso() });

function WarmupEditor({ plan, label, projectId, canManage, onBack, onSave, onToggle, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(plan));
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ key: null, days: [], today: null, error: null });
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(plan));
  const state = planState(plan);
  const progressKey = `${plan.id}|${plan.updatedAt}`;
  const curve = curveFor(plan.channel, draft.curve);

  useEffect(() => {
    let alive = true;
    apiGet(`/api/projects/${projectId}/deliverability/warmup/${plan.id}/progress`).then((res) => {
      if (!alive) return;
      setProgress({ key: progressKey, days: res.ok ? res.data.days : [], today: res.ok ? res.data.today : null, error: res.ok ? null : res.error });
    });
    return () => {
      alive = false;
    };
  }, [projectId, plan.id, progressKey]);

  const preview = useMemo(
    () => buildWarmupSchedule({ channel: plan.channel, curve: curve.key, targetVolume: Number(draft.target) || plan.targetVolume, days: Number(draft.days) || curve.days }),
    [plan.channel, plan.targetVolume, curve.key, curve.days, draft.target, draft.days],
  );
  const sentByDay = useMemo(() => new Map(progress.days.map((d) => [d.day, d.sent])), [progress.days]);
  const currentDay = warmupDay(plan);
  const scheduleRows = preview.map((s) => ({
    ...s,
    date: addDaysIso(draft.startDate, s.day - 1),
    sent: sentByDay.get(s.day),
    phase: s.day < currentDay ? "Done" : s.day === currentDay ? "Today" : "Upcoming",
  }));
  const pager = usePagination(scheduleRows, { pageSize: 10 });

  const save = async () => {
    if (!(Number(draft.target) >= 100)) {
      toast.error("Target daily volume must be at least 100.");
      return;
    }
    setSaving(true);
    await onSave(plan, { curve: curve.key, targetVolume: Number(draft.target), startDate: draft.startDate, schedule: preview });
    setSaving(false);
  };

  const today = progress.today;
  const loadingProgress = progress.key !== progressKey;

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={<h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{label}</h1>}
      status={state}
      statusMap={PLAN_STATUS_MAP}
      badges={
        <>
          <Badge variant="neutral">{CHANNEL_LABELS[plan.channel]}</Badge>
          <span className="text-xs text-text-tertiary">
            Day {state === "completed" ? plan.schedule.length : dayOf(plan)} of {plan.schedule.length}
            {todayCap(plan) != null ? ` · ${number(todayCap(plan))} cap today` : ""}
          </span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete warm-up plan" className={DANGER_ICON_BUTTON} disabled={!canManage} onClick={() => onDelete(plan)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          {state !== "completed" ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!canManage} onClick={() => onToggle(plan)}>
              {plan.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {plan.status === "paused" ? "Resume" : "Pause"}
            </Button>
          ) : null}
          <Button className={PRIMARY_BUTTON} disabled={!canManage || !dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </Button>
        </>
      }
      nav={WARMUP_NAV}
      defaultSection="progress"
    >
      {({ active }) => (
        <>
          {active === "progress" ? (
            <div className="space-y-4">
              <SectionCard title="Sends per day" description="Counted from the delivery log on this channel; the dashed line is the scheduled cap." bodyPadding={false}>
                <div className="px-3 pb-3 pt-4">
                  {loadingProgress ? (
                    <LoadingArea size={40} label="Loading progress" />
                  ) : progress.error ? (
                    <EmptyState icon={LineChart} title="Couldn't load progress" description={progress.error} />
                  ) : progress.days.length ? (
                    <ProgressChart days={progress.days} />
                  ) : (
                    <EmptyState icon={LineChart} title="Nothing sent yet" description={state === "scheduled" ? `The ramp starts on ${formatDate(plan.startDate)}.` : "Sends on this channel will appear here day by day."} />
                  )}
                </div>
              </SectionCard>
              <SectionCard>
                <SettingsList>
                  <SettingRow title="Today's cap" description="The most this plan allows today." control={<span className="text-sm font-semibold tabular-nums text-foreground">{today?.capToday != null ? number(today.capToday) : "No cap"}</span>} />
                  <SettingRow title="Sent today" description={plan.connectionId ? "Through this number, since midnight UTC." : "On this channel, since midnight UTC."} control={<span className="text-sm tabular-nums text-muted-foreground">{today ? number(today.sentToday) : "—"}</span>} />
                  <SettingRow title="Remaining today" description="What campaigns and broadcasts can still send before they wait for tomorrow." control={<span className="text-sm tabular-nums text-muted-foreground">{today?.remaining != null ? number(today.remaining) : "—"}</span>} />
                </SettingsList>
              </SectionCard>
              {plan.channel === "whatsapp" ? (
                <p className="text-xs text-text-tertiary">
                  Meta raises a number&apos;s tier only while its quality rating stays medium or high. If the number&apos;s current limit is lower than this plan assumes, Meta&apos;s limit applies first.
                </p>
              ) : null}
            </div>
          ) : null}

          {active === "settings" ? (
            <SectionCard bare title="Ramp & target" description="How fast daily volume grows, where it ends and the day it starts." contentClassName="space-y-4">
              <Field label="Ramp curve" hint={curve.description}>
                <Select value={curve.key} onValueChange={(key) => setDraft((d) => ({ ...d, curve: key, days: String(curveFor(plan.channel, key).days) }))} disabled={!canManage}>
                  <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
                  <SelectContent>{curvesFor(plan.channel).map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                {plan.channel === "whatsapp" ? (
                  <Field label="Target tier" className="sm:col-span-2">
                    <Select value={draft.target} onValueChange={set("target")} disabled={!canManage}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{WHATSAPP_TIERS.slice(1).map((t) => <SelectItem key={t} value={String(t)}>{number(t)} conversations a day</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                ) : (
                  <>
                    <Field label="Target per day" htmlFor="we-target" hint="The cap once the ramp completes.">
                      <Input id="we-target" type="number" min={100} value={draft.target} disabled={!canManage} onChange={(e) => set("target")(e.target.value)} />
                    </Field>
                    <Field label="Days" htmlFor="we-days">
                      <Input id="we-days" type="number" min={7} max={120} value={draft.days} disabled={!canManage} onChange={(e) => set("days")(e.target.value)} />
                    </Field>
                  </>
                )}
                <Field label="Start date" htmlFor="we-start" hint="Day 1 of the ramp (UTC).">
                  <Input id="we-start" type="date" value={draft.startDate} disabled={!canManage} onChange={(e) => set("startDate")(e.target.value)} />
                </Field>
              </div>
              <p className="rounded-lg border border-border bg-surface-card px-3 py-2 text-xs tabular-nums text-text-secondary">{schedulePreview(preview)}</p>
              <p className="text-xs text-text-tertiary">Paused plans don&apos;t cap sending. Resuming shifts the start date so the ramp continues from the day it paused on.</p>
            </SectionCard>
          ) : null}

          {active === "schedule" ? (
            <div className="space-y-5">
              <DataTable
                columns={[
                  { key: "day", header: "Day", className: "font-medium text-foreground", render: (s) => `Day ${s.day}` },
                  { key: "date", header: "Date", className: "whitespace-nowrap text-muted-foreground", render: (s) => formatDate(s.date) },
                  { key: "cap", header: "Daily cap", align: "right", className: "tabular-nums text-muted-foreground", render: (s) => number(s.cap) },
                  { key: "sent", header: "Sent", align: "right", className: "tabular-nums text-muted-foreground", render: (s) => (s.sent == null ? "—" : number(s.sent)) },
                  { key: "phase", header: "", render: (s) => <Badge variant={s.phase === "Today" ? "warning" : s.phase === "Done" ? "success" : "neutral"}>{s.phase}</Badge> },
                ]}
                data={pager.pageItems}
                getRowKey={(s) => s.day}
              />
              <ListPagination {...pager} itemLabel="days" />
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function IpWarmupScreen() {
  const { projectId } = useProject();
  const canManage = useCan(DELIVERABILITY_MANAGE);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [data, setData] = useState({ key: null, plans: [], connections: [], ips: [] });
  const [usage, setUsage] = useState({ plans: {}, remaining: {} });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listWarmupPlans(projectId), listConnections(projectId), listDedicatedIps(projectId)]).then(([plans, connections, ips]) => {
      if (!alive) return;
      if (!plans) toast.error("Couldn't load warm-up plans.");
      setData({ key: projectId, plans: plans ?? [], connections: (connections ?? []).filter((c) => ["sms", "whatsapp"].includes(c.channel)), ips: ips ?? [] });
    });
    apiGet(`/api/projects/${projectId}/deliverability/warmup/usage`).then((res) => {
      if (alive && res.ok) setUsage(res.data);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = data.key !== projectId;
  const plans = data.plans;
  const labelOf = (p) => targetLabel(p, data.connections);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((p) => {
      if (statusFilter !== "all" && planState(p) !== statusFilter) return false;
      if (channelFilter !== "all" && p.channel !== channelFilter) return false;
      if (q && !`${p.name} ${p.ip}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [plans, query, statusFilter, channelFilter]);

  const stats = useMemo(() => {
    const activePlans = plans.filter((p) => planState(p) === "active");
    const sentToday = Object.values(usage.plans || {}).reduce((n, u) => (u.capToday != null ? n + u.sentToday : n), 0);
    const remaining = Object.values(usage.remaining || {}).reduce((n, r) => n + (r ?? 0), 0);
    return [
      { label: "Warm-up plans", value: loading ? "" : number(plans.length), footer: `${number(plans.filter((p) => planState(p) === "completed").length)} completed` },
      { label: "Active", value: loading ? "" : number(activePlans.length), footer: "Capping sends today" },
      { label: "Sent today", value: loading ? "" : number(sentToday), footer: "On warming IPs and numbers" },
      { label: "Remaining today", value: loading ? "" : number(remaining), footer: "Before senders wait for tomorrow" },
    ];
  }, [plans, usage, loading]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${channelFilter}` });

  const setPlans = (fn) => setData((d) => ({ ...d, plans: fn(d.plans) }));
  const replace = (next) => setPlans((rows) => rows.map((r) => (r.id === next.id ? next : r)));

  const handleCreate = async (input) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const row = { id, ...input, createdBy: user?.id ?? null };
    setPlans((rows) => [{ ...row, createdAt: new Date().toISOString() }, ...rows]);
    const created = await createWarmupPlan(projectId, row);
    if (!created) {
      setPlans((rows) => rows.filter((r) => r.id !== id));
      toast.error("Couldn't create the plan.");
      return false;
    }
    replace(created);
    toast.success(`Warm-up plan created: ${number(created.schedule[0]?.cap)} on day 1, ${number(created.targetVolume)} by day ${created.schedule.length}.`);
    openRecord(id);
    return true;
  };

  const handleSave = async (plan, patch, message = "Warm-up plan saved.") => {
    replace({ ...plan, ...patch });
    const saved = await updateWarmupPlan(plan.id, patch);
    if (!saved) {
      replace(plan);
      toast.error("Couldn't save the plan.");
      return null;
    }
    replace(saved);
    toast.success(message);
    return saved;
  };

  const toggle = (plan) =>
    plan.status === "paused"
      ? handleSave(plan, { status: "active", pausedAt: null, startDate: resumedStartDate(plan) }, `Resumed the warm-up for ${labelOf(plan)}.`)
      : handleSave(plan, { status: "paused", pausedAt: new Date().toISOString() }, `Paused the warm-up for ${labelOf(plan)}. It no longer caps sending.`);

  const handleDelete = async (plan) => {
    setDeleteTarget(null);
    setPlans((rows) => rows.filter((r) => r.id !== plan.id));
    if (plan.id === recordId) closeRecord();
    const ok = await softDeleteWarmupPlan(plan.id);
    if (!ok) {
      setPlans((rows) => [plan, ...rows]);
      toast.error("Couldn't delete the plan.");
      return;
    }
    toast.success(`Deleted the warm-up plan for ${labelOf(plan)}.`);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      label={deleteTarget ? `the warm-up plan for ${labelOf(deleteTarget)}` : ""}
      noun="warm-up plan"
      description="Sending on that IP or number is no longer capped."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = plans.find((p) => p.id === recordId);
  if (open) {
    return (
      <>
        <WarmupEditor
          key={open.id}
          plan={open}
          label={labelOf(open)}
          projectId={projectId}
          canManage={canManage}
          onBack={closeRecord}
          onSave={handleSave}
          onToggle={toggle}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || channelFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setChannelFilter("all");
  };

  const columns = [
    {
      key: "target",
      header: "IP or number",
      render: (p) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Flame className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className={`truncate text-sm font-medium text-foreground ${p.channel === "email" ? "font-mono" : ""}`}>{labelOf(p)}</span>
            <span className="truncate text-xs text-text-secondary">
              {CHANNEL_LABELS[p.channel]} · {curveFor(p.channel, p.curve).label} · started {formatDate(p.startDate)}
            </span>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (p) => <StatusPill status={planState(p)} map={PLAN_STATUS_MAP} /> },
    { key: "progress", header: "Progress", render: (p) => <RampProgress plan={p} /> },
    { key: "cap", header: "Today's cap", align: "right", className: "tabular-nums text-muted-foreground", render: (p) => (todayCap(p) != null ? number(todayCap(p)) : "—") },
    {
      key: "sent",
      header: "Sent today",
      align: "right",
      className: "tabular-nums text-muted-foreground",
      render: (p) => (usage.plans?.[p.id] && planState(p) === "active" ? number(usage.plans[p.id].sentToday) : "—"),
    },
    { key: "target_volume", header: "Target", align: "right", className: "tabular-nums text-muted-foreground", render: (p) => number(p.targetVolume) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <ActionMenu
          label={`Actions for ${labelOf(p)}`}
          items={[
            { label: "Open", icon: Settings2, onSelect: () => openRecord(p.id) },
            canManage && planState(p) !== "completed" && {
              label: p.status === "paused" ? "Resume warm-up" : "Pause warm-up",
              icon: p.status === "paused" ? Play : Pause,
              onSelect: () => toggle(p),
            },
            canManage && { separator: true },
            canManage && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(p) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="IP Warmup"
        description="Ramp new IPs and messaging numbers with daily caps that every sender respects."
        actions={
          <Button className={PRIMARY_BUTTON} disabled={!canManage} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create plan
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={channelFilter} onValueChange={setChannelFilter} options={CHANNEL_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search plans…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading warm-up plans" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(p) => p.id}
            onRowClick={(p) => openRecord(p.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Flame}
                  title={filtersActive ? "No matches" : "No warm-up plans yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a plan before a new IP or WhatsApp number starts sending at volume."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : canManage ? (
                      <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> Create plan
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="plans" />
        </div>
      )}

      <CreatePlanDialog open={createOpen} onOpenChange={setCreateOpen} connections={data.connections} ips={data.ips} existing={plans} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default IpWarmupScreen;
