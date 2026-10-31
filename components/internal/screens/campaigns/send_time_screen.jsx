"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Clock, RotateCw } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiGet } from "@/lib/api/client";
import { WEEKDAYS, hourLabel } from "@/lib/campaigns/send_time";
import { SEND_TIME_DEFAULTS, getSendTimeSettings, saveSendTimeSettings } from "@/lib/supabase/send_time_settings";
import {
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DataTable,
  EmptyState,
  Field,
  LoadingArea,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  Switch,
  Toolbar,
  cn,
} from "@geiger/ui";

// Send-Time Optimization: when this workspace's contacts actually open email (from campaign.deliveries),
// how many have enough history for a per-recipient send time, and the defaults the delivery engine
// applies to campaigns that don't choose a strategy themselves.

const PERIOD_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
];
const STRATEGY_OPTIONS = [
  { value: "optimized", label: "Per-recipient best time" },
  { value: "timezone", label: "Recipient time zone" },
];
const WINDOW_OPTIONS = [12, 24, 48];
const MIN_OPEN_OPTIONS = [1, 2, 3, 5];
const LOCAL_TIMES = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const HEAT = ["bg-surface-card", "bg-primary/15", "bg-primary/30", "bg-primary/55", "bg-primary/85"];
const CHART_TABS = [
  { value: "timeToOpen", label: "Time to open" },
  { value: "learned", label: "Learned hours" },
];
const CHART_CONFIG = {
  count: { label: "Opens", color: "var(--chart-series-1)" },
  contacts: { label: "Contacts", color: "var(--chart-series-1)" },
};
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";
const AXIS_STROKE = "var(--muted-foreground)";

const fmt = (n) => (Number(n) || 0).toLocaleString("en-US");
const pct = (r) => `${Math.round((Number(r) || 0) * 100)}%`;
const shortHour = (h) => hourLabel(h).replace(" AM", "a").replace(" PM", "p");

function formatDuration(minutes) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function windowLabel(w) {
  return `${WEEKDAYS[w.weekday]} · ${hourLabel(w.hour)}–${hourLabel((w.hour + 2) % 24)}`;
}

function Heatmap({ analysis }) {
  const { heatmap, max } = analysis;
  const level = (v) => (!v || !max ? 0 : Math.max(1, Math.min(4, Math.ceil((v / max) * 4))));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px]" role="img" aria-label="First opens by weekday and hour">
        <div className="mb-1 grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-[3px]">
          <span />
          {HOURS.map((h) => (
            <span key={h} className="text-center text-[10px] tabular-nums text-text-tertiary">
              {h % 3 === 0 ? shortHour(h) : ""}
            </span>
          ))}
        </div>
        {WEEKDAYS.map((day, d) => (
          <div key={day} className="mb-[3px] grid grid-cols-[36px_repeat(24,minmax(0,1fr))] items-center gap-[3px]">
            <span className="text-[11px] text-text-secondary">{day}</span>
            {HOURS.map((h) => {
              const value = heatmap[d][h];
              return (
                <span
                  key={h}
                  aria-hidden="true"
                  title={`${day} ${hourLabel(h)}–${hourLabel((h + 1) % 24)} · ${fmt(value)} ${value === 1 ? "open" : "opens"}`}
                  className={cn("h-5 rounded-[3px]", HEAT[level(value)])}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-text-secondary">
        Fewer
        {HEAT.map((c) => (
          <span key={c} className={cn("h-3 w-3 rounded-[3px]", c)} />
        ))}
        More
      </div>
    </div>
  );
}

function DistributionChart({ analysis, view }) {
  const learned = view === "learned";
  const data = learned
    ? analysis.learnedHours.map((r) => ({ label: shortHour(r.hour), contacts: r.contacts }))
    : analysis.timeToOpen.map((r) => ({ label: r.label, count: r.count }));
  const key = learned ? "contacts" : "count";
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[220px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} interval={learned ? 2 : 0} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={32} stroke={AXIS_STROKE} allowDecimals={false} fontSize={11} />
        <ChartTooltip cursor={{ fill: "var(--chart-cursor-fill)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
        <Bar dataKey={key} fill={`var(--color-${key})`} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

function DefaultsCard({ settings, timeZone, canEdit, onChange, saving }) {
  const disabled = !canEdit || !settings || saving;
  const s = settings || SEND_TIME_DEFAULTS;
  const zone = timeZone || "the workspace time zone";
  return (
    <SectionCard title="Defaults" description="Used by campaigns that don't choose a send time themselves." contentClassName="space-y-4">
      <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3">
        <SettingRow
          title="Optimize by default"
          description={s.enabled ? "New sends use the strategy below." : "Campaigns send when you launch them."}
          control={
            <Switch
              checked={!!s.enabled}
              disabled={disabled}
              onCheckedChange={(enabled) => onChange({ enabled })}
              aria-label="Optimize by default"
            />
          }
        />
      </SettingsList>
      <div className={cn("space-y-4", !s.enabled && "opacity-60")}>
        <Field label="Strategy">
          <Select value={s.strategy} onValueChange={(strategy) => onChange({ strategy })} disabled={disabled}>
            <SelectTrigger className="w-full" aria-label="Strategy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {s.strategy === "timezone" ? (
          <Field label="Local send time" hint={`Each contact gets it at this time in their own zone; contacts without one use ${zone}.`}>
            <Select value={s.localTime} onValueChange={(localTime) => onChange({ localTime })} disabled={disabled}>
              <SelectTrigger className="w-full" aria-label="Local send time">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCAL_TIMES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {hourLabel(Number(t.slice(0, 2)))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Optimization window" hint="How long after launch a send may wait for a contact's best hour.">
              <Select value={String(s.windowHours)} onValueChange={(v) => onChange({ windowHours: Number(v) })} disabled={disabled}>
                <SelectTrigger className="w-full" aria-label="Optimization window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_OPTIONS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      Within {h} hours
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Minimum history" hint="Opens a contact needs before their own pattern is used.">
              <Select value={String(s.minOpens)} onValueChange={(v) => onChange({ minOpens: Number(v) })} disabled={disabled}>
                <SelectTrigger className="w-full" aria-label="Minimum history">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MIN_OPEN_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} {n === 1 ? "open" : "opens"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fallback send time" hint={`For contacts without enough history when the workspace has none either (${zone}).`}>
              <Select value={String(s.fallbackHour)} onValueChange={(v) => onChange({ fallbackHour: Number(v) })} disabled={disabled}>
                <SelectTrigger className="w-full" aria-label="Fallback send time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {hourLabel(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </div>
      {!settings ? <p className="text-xs text-text-secondary">Settings couldn&apos;t be loaded, so they can&apos;t be changed right now.</p> : null}
      {settings && !canEdit ? <p className="text-xs text-text-secondary">Your role can view these defaults but not change them.</p> : null}
    </SectionCard>
  );
}

export function SendTimeScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.campaign.edit");
  const [period, setPeriod] = useState("90");
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [loadedKey, setLoadedKey] = useState(null);
  const [chartView, setChartView] = useState("timeToOpen");
  const minOpens = settings?.minOpens ?? SEND_TIME_DEFAULTS.minOpens;
  const requestKey = `${projectId}:${period}:${minOpens}:${nonce}`;
  const loading = loadedKey !== requestKey;
  const reload = () => setNonce((n) => n + 1);

  useEffect(() => {
    let alive = true;
    getSendTimeSettings(projectId).then((row) => {
      if (!alive) return;
      setSettings(row);
      setSettingsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (settingsLoading || !projectId) return undefined;
    const controller = new AbortController();
    apiGet(`/api/projects/${projectId}/campaigns/send-time?days=${period}&minOpens=${minOpens}`, { signal: controller.signal }).then((res) => {
      if (res.error === "aborted") return;
      setResult(res.ok ? res.data : null);
      setError(res.ok ? null : res.error);
      setLoadedKey(requestKey);
    });
    return () => controller.abort();
  }, [projectId, period, minOpens, settingsLoading, requestKey]);

  const updateSettings = async (patch) => {
    if (!settings || !canEdit) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setSaving(true);
    const saved = await saveSendTimeSettings(projectId, patch);
    setSaving(false);
    if (saved) {
      setSettings(saved);
      toast.success("Send-time defaults saved");
    } else {
      setSettings(previous);
      toast.error("Couldn't save the send-time defaults.");
    }
  };

  const analysis = result?.analysis || null;
  const hasOpens = (analysis?.totals.opened || 0) > 0;
  const days = Number(result?.days || period);

  const stats = useMemo(() => {
    if (!analysis) return [];
    const t = analysis.totals;
    const best = analysis.windows[0];
    return [
      { label: "Opens analysed", value: fmt(t.opened), footer: `of ${fmt(t.delivered)} delivered · ${days} days` },
      { label: "Contact coverage", value: pct(t.coverage), footer: `${fmt(t.contactsWithHistory)} of ${fmt(t.contactsReached)} with ${minOpens}+ opens` },
      {
        label: "Best window",
        value: best ? `${WEEKDAYS[best.weekday]} ${hourLabel(best.hour)}` : "—",
        footer: best ? `${pct(best.share)} of first opens in two hours` : "Not enough opens yet",
      },
      { label: "Median time to open", value: formatDuration(analysis.medianMinutesToOpen), footer: "From send to first open" },
    ];
  }, [analysis, days, minOpens]);

  const topOpens = analysis?.windows[0]?.opens || 0;
  const windowColumns = [
    {
      key: "window",
      header: "Window",
      render: (w) => <span className="font-medium text-foreground">{windowLabel(w)}</span>,
    },
    { key: "opens", header: "First opens", align: "right", className: "tabular-nums", render: (w) => fmt(w.opens) },
    {
      key: "share",
      header: "Share of opens",
      align: "right",
      render: (w) => (
        <span className="inline-flex items-center justify-end gap-3">
          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-card sm:block" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary/70" style={{ width: `${topOpens ? (w.opens / topOpens) * 100 : 0}%` }} />
          </span>
          <span className="w-10 tabular-nums text-text-secondary">{pct(w.share)}</span>
        </span>
      ),
    },
  ];

  const zone = result?.timeZone || null;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Send-Time Optimization"
        description="Deliver each message when a contact is most likely to open it."
        actions={
          <Button
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={reload}
            disabled={loading}
          >
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={period} onValueChange={setPeriod} options={PERIOD_OPTIONS} height="h-9" />
          {zone ? <span className="text-xs text-text-secondary">Times in {zone}</span> : null}
        </div>
      </Toolbar>

      {loading && !analysis ? (
        <LoadingArea size={72} panel label="Loading send-time analysis" />
      ) : error && !analysis ? (
        <SectionCard>
          <EmptyState
            icon={Clock}
            title="Send-time analysis isn't available"
            description={error}
            action={
              <Button variant="outline" onClick={reload}>
                Try again
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <>
          {analysis ? <StatsBar stats={stats} /> : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
            <DefaultsCard settings={settings} timeZone={zone} canEdit={canEdit} onChange={updateSettings} saving={saving} />
            <SectionCard
              title="When your contacts open"
              description={`First opens by weekday and hour over the last ${days} days.`}
            >
              {hasOpens ? (
                <Heatmap analysis={analysis} />
              ) : (
                <EmptyState
                  icon={Clock}
                  title="No opens to learn from yet"
                  description="Once email campaigns are opened, this shows when your contacts read. Until then, optimized sends use the workspace fallback time."
                />
              )}
            </SectionCard>
          </div>

          {hasOpens ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard title="Recommended windows" description="The two-hour slots with the most first opens." bodyPadding={false}>
                <DataTable
                  className="rounded-none border-0"
                  columns={windowColumns}
                  data={analysis.windows}
                  getRowKey={(w) => `${w.weekday}-${w.hour}`}
                />
              </SectionCard>
              <SectionCard
                title={chartView === "learned" ? "Learned send hours" : "Time to first open"}
                description={
                  chartView === "learned"
                    ? `Each contact's best hour; ${fmt(analysis.fallbackContacts)} contacts don't have enough history yet.`
                    : "How long after delivery people open."
                }
                action={<SegmentedTabs tabs={CHART_TABS} value={chartView} onChange={setChartView} />}
              >
                <DistributionChart analysis={analysis} view={chartView} />
              </SectionCard>
            </div>
          ) : null}
          {result?.truncated ? (
            <p className="text-xs text-text-secondary">Showing the most recent 50,000 deliveries in this period.</p>
          ) : null}
        </>
      )}
    </MainScreenWrapper>
  );
}

export default SendTimeScreen;
