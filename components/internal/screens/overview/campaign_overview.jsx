"use client";

import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Label,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CirclePause,
  ClipboardCheck,
  Clock,
  FileText,
  Flame,
  MailWarning,
  Megaphone,
  Send,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  RollingNumber,
  StatsBar,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { CAMPAIGN_STATUS_MAP } from "@/components/internal/screens/campaigns/constants";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useReportSources } from "@/components/internal/screens/reporting/use_report_sources";
import {
  ReportFailed,
  ReportLoading,
  SERIES,
  TOOLTIP_CLASS,
  TruncatedNote,
  deltaStat,
} from "@/components/internal/screens/reporting/report_ui";
import FilterDropdown from "./filter_dropdown";
import {
  audienceTotals,
  campaignRollup,
  deliveriesInWindow,
  deliverySeries,
  groupBy,
  sendTime,
  summarize,
} from "@/lib/reporting/aggregate";
import { attributionTotals, creditsBy } from "@/lib/reporting/attribution";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/reporting/format";
import { channelLabel, prepareSources } from "@/lib/reporting/query";
import { DAY, DEFAULT_RANGE, bucketKey, buildBuckets, inWindow, rangeLabel, resolveRange, toTime } from "@/lib/reporting/ranges";

// Monochrome chart inks from the suite's chart tokens; the donut/radar outline matches the card surface.
const INK = SERIES[0];
const CARD_SURFACE = "var(--surface-subtle)";
const TICK = { fill: "var(--muted-foreground)", fontSize: 11 };

const TREND_METRICS = [
  { value: "sends", label: "Sends" },
  { value: "opens", label: "Opens" },
  { value: "clicks", label: "Clicks" },
  { value: "revenue", label: "Revenue" },
];

const TOP_SORT_OPTIONS = [
  { value: "revenue", label: "Revenue" },
  { value: "openRate", label: "Open rate" },
  { value: "clickRate", label: "Click rate" },
];

const PERFORMANCE_META = {
  outperforming: { label: "Outperforming", icon: Flame, className: "text-emerald-600 dark:text-emerald-400" },
  par: { label: "On par", icon: TrendingUp, className: "text-sky-600 dark:text-sky-400" },
  under: { label: "Underperforming", icon: TrendingDown, className: "text-amber-600 dark:text-amber-400" },
  early: { label: "Too early", icon: Clock, className: "text-text-secondary" },
};

const URGENCY_ORDER = ["urgent", "soon", "routine"];
const URGENCY_LABELS = { urgent: "Urgent", soon: "Soon", routine: "Routine" };

// Bounce rate above which a campaign's list or sender setup needs a look.
const HIGH_BOUNCE_RATE = 0.02;

const scopeRows = (rows, scope, key = "campaignId") => (scope.length ? rows.filter((r) => scope.includes(r[key])) : rows);
const compactLabel = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v);
const toPct = (rate) => Math.round(Math.max(0, Math.min(1, rate || 0)) * 100);

// Attributed revenue per bucket, counting only the credit share that went to the scoped campaigns.
function revenueSeries(rows, range, scope) {
  const buckets = buildBuckets(range);
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  const totals = buckets.map(() => 0);
  for (const row of rows) {
    if (!inWindow(row.at, range.start, range.end)) continue;
    const weight = row.credits.reduce((s, c) => s + (!scope.length || scope.includes(c.campaignId) ? c.weight : 0), 0);
    const i = index.get(bucketKey(row.at, range.bucket));
    if (weight && i != null) totals[i] += row.revenue * weight;
  }
  return totals;
}

// Click rate against the period's overall click rate; sending or undelivered campaigns are too early to judge.
function performanceFor(campaign, rollup, baseline) {
  if (campaign.status === "sending" || rollup.clickRate == null) return "early";
  if (!baseline) return "par";
  const ratio = rollup.clickRate / baseline;
  if (ratio >= 1.2) return "outperforming";
  if (ratio >= 0.8) return "par";
  return "under";
}

// --- Widget frame (geiger-events overview rhythm) -----------------------------------------------------

function WidgetShell({ children, className, contentClassName }) {
  return (
    <Card className={cn("h-full gap-0 overflow-hidden rounded-xl border-border bg-surface-subtle py-0 text-foreground", className)}>
      <CardContent className={cn("h-full p-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

function WidgetHeader({ title, subtitle, action }) {
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

// Same header as the events overview: no divider, compact title, workspace summary on the right.
function OverviewHeader({ summary }) {
  return (
    <div className="mt-2">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-center text-2xl font-bold tracking-tight text-foreground md:text-left">Campaign Overview</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground md:text-left">
            Track sends, engagement, revenue, and audience growth across all your campaigns.
          </p>
        </div>
        <div className="flex w-full md:w-auto">
          {summary.map((stat, i) => {
            const last = i === summary.length - 1;
            return (
              <div
                key={stat.label}
                className={cn(
                  "flex flex-1 flex-col items-center md:flex-none",
                  i === 0 && "md:pr-8",
                  i > 0 && "border-l border-border",
                  i > 0 && !last && "md:px-8",
                  last && i > 0 && "md:pl-8",
                )}
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{stat.label}</span>
                <RollingNumber value={stat.value} className="mt-0.5 text-2xl font-bold text-foreground" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const EMPTY_SUMMARY = [
  { label: "Campaigns", value: "0" },
  { label: "Scheduled", value: "0" },
  { label: "Subscribers", value: "0" },
];

function CampaignScopeSelect({ campaigns, selected, onChange }) {
  const all = selected.length === 0;
  const clip = (s) => (s.length > 5 ? `${s.slice(0, 5)}…` : s);
  const label = all
    ? "All"
    : selected.length === 1
      ? clip(campaigns.find((c) => c.id === selected[0])?.name || "1 campaign")
      : `${selected.length} campaigns`;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={!campaigns.length}
          className="h-9 gap-2 border-border bg-surface-card text-foreground hover:bg-surface-active"
        >
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle">
        <DropdownMenuCheckboxItem checked={all} onCheckedChange={() => onChange([])} onSelect={(e) => e.preventDefault()}>
          All Campaigns
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator className="bg-border" />
        {campaigns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={selected.includes(c.id)}
            onCheckedChange={() => toggle(c.id)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="truncate">{c.name || "Untitled campaign"}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// --- Performance over time (line) -------------------------------------------------------------------

function PerformanceTrendWidget({ deliveries, attributed, range, campaigns, currency }) {
  const [metric, setMetric] = useState("sends");
  const [scope, setScope] = useState([]);
  const selected = TREND_METRICS.find((m) => m.value === metric) || TREND_METRICS[0];

  const series = useMemo(() => {
    const rows = deliverySeries(scopeRows(deliveries, scope), range);
    const revenue = revenueSeries(attributed, range, scope);
    return rows.map((r, i) => ({ label: r.label, sends: r.sends, opens: r.opens, clicks: r.clicks, revenue: revenue[i] }));
  }, [deliveries, attributed, range, scope]);

  const data = series.map((r) => ({ label: r.label, value: r[metric] }));
  const hasData = data.some((r) => r.value > 0);
  const isRevenue = metric === "revenue";
  const formatValue = (v) => (isRevenue ? formatCurrency(v, currency) : formatNumber(v));
  const showLabels = data.length <= 14;

  const header = (
    <WidgetHeader
      title="Performance Over Time"
      subtitle={`${selected.label} across your campaigns, ${rangeLabel(range.key).toLowerCase()}.`}
      action={
        <div className="flex items-center gap-2">
          <CampaignScopeSelect campaigns={campaigns} selected={scope} onChange={setScope} />
          <FilterDropdown value={metric} onValueChange={setMetric} options={TREND_METRICS} height="h-9" />
        </div>
      }
    />
  );

  return (
    <WidgetShell contentClassName="flex flex-col">
      {header}
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
        {hasData ? (
          <ChartContainer config={{ value: { label: selected.label, color: INK } }} className="mx-auto h-full w-full">
            <LineChart data={data} margin={{ top: 24, right: 16, left: 12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={TICK} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    className={TOOLTIP_CLASS}
                    formatter={(value) => <span className="font-medium tabular-nums text-foreground">{formatValue(value)}</span>}
                  />
                }
              />
              <Line
                dataKey="value"
                type="monotone"
                stroke={INK}
                strokeWidth={2}
                dot={data.length <= 31 ? { fill: INK, r: 3 } : false}
                activeDot={{ r: 5 }}
                isAnimationActive={true}
              >
                {showLabels ? (
                  <LabelList
                    dataKey="value"
                    position="top"
                    offset={10}
                    className="fill-foreground"
                    fontSize={11}
                    formatter={(v) => (isRevenue ? formatCurrency(v, currency) : compactLabel(v))}
                  />
                ) : null}
              </Line>
            </LineChart>
          </ChartContainer>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="No activity in this period"
            description="Sends, opens, clicks and revenue show up here once campaigns go out."
          />
        )}
      </div>
    </WidgetShell>
  );
}

// --- Channel mix (donut) ----------------------------------------------------------------------------

function ChannelMixWidget({ deliveries }) {
  const mix = useMemo(() => {
    const sorted = [...groupBy(deliveries, (d) => d.channel).entries()]
      .map(([channel, rows]) => ({ key: channel, label: channelLabel(channel), value: summarize(rows).sends }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, c) => s + c.value, 0);
    if (rest > 0) top.push({ key: "__other", label: "Other", value: rest });
    return top;
  }, [deliveries]);

  const [selectedKey, setSelectedKey] = useState(null);
  const activeKey = mix.some((c) => c.key === selectedKey) ? selectedKey : mix[0]?.key ?? null;
  const total = mix.reduce((s, c) => s + c.value, 0);
  const chartData = mix.map((c, i) => ({ ...c, fill: SERIES[i % SERIES.length] }));
  const selectedIndex = Math.max(chartData.findIndex((c) => c.key === activeKey), 0);
  const selectedItem = chartData[selectedIndex];
  const chartConfig = Object.fromEntries(mix.map((c, i) => [c.key, { label: c.label, color: SERIES[i % SERIES.length] }]));

  if (!mix.length) {
    return (
      <WidgetShell contentClassName="flex flex-col">
        <WidgetHeader title="Channel Mix" subtitle="Messages sent by channel." />
        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
          <EmptyState icon={Send} title="No messages sent" description="Send a campaign to see the split by channel." />
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Channel Mix"
        subtitle="Messages sent by channel."
        action={
          <FilterDropdown
            value={activeKey}
            onValueChange={setSelectedKey}
            options={mix.map((c) => ({ value: c.key, label: c.label }))}
            height="h-9"
          />
        }
      />
      <div className="relative mt-4 flex min-h-0 w-full flex-1 items-center justify-center">
        <ChartContainer config={chartConfig} className="mx-auto h-[220px] w-[220px]">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" className={TOOLTIP_CLASS} />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="key"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={78}
              activeIndex={selectedIndex}
              activeShape={{ outerRadius: 88 }}
              stroke={CARD_SURFACE}
              strokeWidth={2}
              isAnimationActive={true}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="text-3xl font-bold leading-none text-foreground">{compactLabel(selectedItem.value)}</span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            {total > 0 ? Math.round((selectedItem.value / total) * 100) : 0}% share
          </span>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-text-secondary">
        {formatNumber(selectedItem.value)} of {formatNumber(total)} messages via {selectedItem.label}
      </p>
    </WidgetShell>
  );
}

// --- Engagement funnel (radar) ----------------------------------------------------------------------

function EngagementFunnelWidget({ summary }) {
  const stages = [
    { key: "sent", label: "Messages sent", short: "Sent", value: summary.sends },
    { key: "delivered", label: "Delivered", short: "Delivered", value: summary.delivered },
    { key: "opened", label: "Opened", short: "Opened", value: summary.opens },
    { key: "clicked", label: "Clicked", short: "Clicked", value: summary.clicks },
  ];
  const top = summary.sends || 0;
  const overall = top > 0 ? Math.round((summary.clicks / top) * 100) : 0;
  const chartData = stages.map((s) => ({ ...s, share: top > 0 ? Math.round((s.value / top) * 100) : 0 }));

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Engagement Funnel"
        subtitle="Share of sent messages reaching each step."
        action={
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-3xl font-bold leading-none text-foreground">{overall}%</span>
            <span className="mt-1 text-[11px] text-text-secondary">sent → clicked</span>
          </div>
        }
      />
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
        {top > 0 ? (
          <ChartContainer config={{ share: { label: "Share of sends", color: INK } }} className="mx-auto aspect-square h-full max-h-[210px]">
            <RadarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    nameKey="key"
                    className={TOOLTIP_CLASS}
                    formatter={(value, name, item) => (
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">{item.payload.label}</span>
                        <span className="font-medium tabular-nums text-foreground">
                          {formatNumber(item.payload.value)} · {item.payload.share}%
                        </span>
                      </span>
                    )}
                  />
                }
              />
              <PolarGrid stroke="var(--chart-grid)" />
              <PolarAngleAxis dataKey="short" tick={TICK} />
              <Radar
                dataKey="share"
                stroke={INK}
                strokeWidth={2}
                fill={INK}
                fillOpacity={0.5}
                dot={{ r: 4, fill: INK, fillOpacity: 1, stroke: CARD_SURFACE, strokeWidth: 1.5 }}
                isAnimationActive={true}
              />
            </RadarChart>
          </ChartContainer>
        ) : (
          <EmptyState icon={Send} title="No sends in this period" description="The funnel fills in once messages go out." />
        )}
      </div>
    </WidgetShell>
  );
}

// --- Rate gauge (radial) ----------------------------------------------------------------------------

function GaugeWidget({ title, subtitle, caption, noun, part, whole, deliveries, campaigns }) {
  const [scope, setScope] = useState([]);
  const totals = useMemo(() => summarize(scopeRows(deliveries, scope)), [deliveries, scope]);
  const pct = toPct(totals[whole] > 0 ? totals[part] / totals[whole] : 0);
  const endAngle = 90 - (pct / 100) * 360;
  const footnote = totals[whole] > 0 ? `${formatNumber(totals[part])} of ${formatNumber(totals[whole])} ${noun}` : "No sends in this period";

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader title={title} subtitle={subtitle} action={<CampaignScopeSelect campaigns={campaigns} selected={scope} onChange={setScope} />} />
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer config={{ value: { label: caption, color: INK } }} className="mx-auto aspect-square h-full max-h-[190px]">
          <RadialBarChart data={[{ name: caption, value: pct, fill: INK }]} startAngle={90} endAngle={endAngle} innerRadius={72} outerRadius={104}>
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              polarRadius={[78, 66]}
              className="first:fill-surface-hover last:fill-surface-subtle dark:first:fill-surface-card"
            />
            <RadialBar dataKey="value" cornerRadius={8} isAnimationActive={true} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                        {pct}%
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 22} className="fill-muted-foreground text-xs font-medium">
                        {caption}
                      </tspan>
                    </text>
                  );
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </div>
      <p className="mt-1 text-center text-xs text-text-secondary">{footnote}</p>
    </WidgetShell>
  );
}

// --- Top performing campaigns -----------------------------------------------------------------------

function TopCampaignsTable({ rows, campaigns, baseline, currency, onOpen }) {
  const [sortBy, setSortBy] = useState("revenue");
  const [scope, setScope] = useState([]);

  const sorted = useMemo(
    () =>
      (scope.length ? rows.filter((r) => scope.includes(r.campaign.id)) : rows)
        .slice()
        .sort((a, b) =>
          sortBy === "revenue"
            ? (b.rollup.revenue || 0) - (a.rollup.revenue || 0) || (b.rollup.clickRate ?? -1) - (a.rollup.clickRate ?? -1)
            : (b.rollup[sortBy] ?? -1) - (a.rollup[sortBy] ?? -1),
        )
        .slice(0, 5),
    [rows, scope, sortBy],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <WidgetHeader title="Top Performing Campaigns" subtitle="Campaigns sent in this period, ranked by revenue or engagement." />
        <div className="flex items-center gap-2">
          <CampaignScopeSelect campaigns={campaigns} selected={scope} onChange={setScope} />
          <FilterDropdown value={sortBy} onValueChange={setSortBy} options={TOP_SORT_OPTIONS} height="h-9" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        {sorted.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaigns sent in this period" description="Send a campaign, or widen the date range." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px]">Open rate</TableHead>
                <TableHead>Click rate</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Performance</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(({ campaign, rollup }) => {
                const meta = PERFORMANCE_META[performanceFor(campaign, rollup, baseline)];
                const PerformanceIcon = meta.icon;
                return (
                  <TableRow key={campaign.id} className="cursor-pointer border-border hover:bg-surface-hover" onClick={() => onOpen(campaign)}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">{campaign.name || "Untitled campaign"}</span>
                        <p className="text-xs text-text-secondary">
                          {channelLabel(campaign.channel)} · {formatNumber(rollup.delivered)} delivered
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusPill status={campaign.status} map={CAMPAIGN_STATUS_MAP} />
                    </TableCell>
                    <TableCell>
                      <div className="w-[140px] space-y-1.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                          <div className="h-full rounded-full bg-foreground" style={{ width: `${toPct(rollup.openRate)}%` }} />
                        </div>
                        <p className="text-xs text-text-secondary">{formatPercent(rollup.openRate)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatPercent(rollup.clickRate)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-foreground">
                      {rollup.revenue ? formatCurrency(rollup.revenue, currency) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-medium", meta.className)}>
                        <PerformanceIcon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Open ${campaign.name}`}
                        className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(campaign);
                        }}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// --- Needs attention --------------------------------------------------------------------------------

function AttentionCard({ items, onOpen }) {
  const sorted = [...items].sort((a, b) => URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency));
  const open = items.reduce((s, i) => s + i.count, 0);

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Needs Attention"
        subtitle="Campaigns and sends waiting on you."
        action={
          <span className="shrink-0 rounded-md border border-border bg-surface-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {formatNumber(open)} open
          </span>
        }
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onOpen(item.tab)}
              className="group flex items-center gap-3.5 rounded-xl p-3.5 text-left transition-colors hover:bg-surface-card"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{item.label}</span>
                  <span className="shrink-0 rounded-md border border-border bg-surface-card px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                    {URGENCY_LABELS[item.urgency]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-text-secondary">{item.hint}</p>
              </div>
              <span className="shrink-0 text-xl font-bold tabular-nums text-foreground">{formatNumber(item.count)}</span>
              <ChevronRight className="h-3 w-3 shrink-0 text-text-secondary transition-colors group-hover:text-foreground" />
            </button>
          );
        })}
      </div>
    </WidgetShell>
  );
}

// --- Screen -----------------------------------------------------------------------------------------

// The overview always covers the default window (last 30 days vs. the 30 before).
const range = DEFAULT_RANGE;

export function CampaignOverviewScreen() {
  const { setTab, openRecordInTab } = useWorkspaceUrl();
  const { loading, failed, truncated, sources, loadedAt, reload } = useReportSources({
    range,
    include: ["campaigns", "deliveries", "events", "contacts"],
  });

  const model = useMemo(() => {
    if (!sources || !loadedAt) return null;
    const p = prepareSources(sources);
    const r = resolveRange(range, loadedAt);
    const now = loadedAt.getTime();
    const windowDeliveries = deliveriesInWindow(p.deliveries, r.start, r.end);
    const current = summarize(windowDeliveries);
    const previous = summarize(deliveriesInWindow(p.deliveries, r.prevStart, r.prevEnd));
    const aud = audienceTotals(p.contacts, r.start, r.end);
    const audPrev = audienceTotals(p.contacts, r.prevStart, r.prevEnd);
    const convNow = attributionTotals(p.attributedRows.filter((x) => inWindow(x.at, r.start, r.end)));
    const convPrev = attributionTotals(p.attributedRows.filter((x) => inWindow(x.at, r.prevStart, r.prevEnd)));
    const currency = p.currency.currency;

    const stats = [
      deltaStat({ label: "Messages sent", value: current.sends, previous: previous.sends, range }),
      deltaStat({ label: "Click rate", value: current.clickRate, previous: previous.clickRate, format: "percent", rate: true, range }),
      deltaStat({ label: "Attributed revenue", value: convNow.attributedRevenue, previous: convPrev.attributedRevenue, format: "currency", currency, range }),
      deltaStat({ label: "Audience growth", value: aud.net, previous: audPrev.net, range, display: `${aud.net > 0 ? "+" : ""}${formatNumber(aud.net)}` }),
    ];

    const byCampaign = groupBy(p.deliveries, (d) => d.campaignId);
    const credits = creditsBy(p.attributedRows, (c) => c.campaignId);
    const sent = p.campaigns
      .filter((c) => inWindow(c.sentAt, r.start, r.end) || (byCampaign.get(c.id) || []).some((d) => inWindow(sendTime(d), r.start, r.end)))
      .map((campaign) => ({
        campaign,
        rollup: campaignRollup(campaign, byCampaign.get(campaign.id) || [], credits.get(campaign.id) || { conversions: 0, revenue: 0 }),
      }))
      .filter((x) => x.rollup.sends > 0)
      .sort((a, b) => (toTime(sendTime(b.campaign)) || 0) - (toTime(sendTime(a.campaign)) || 0));

    const withStatus = (status) => p.campaigns.filter((c) => c.status === status).length;
    const scheduled = p.campaigns.filter((c) => c.status === "scheduled" && toTime(c.scheduledAt) >= now);
    const dueSoon = scheduled.filter((c) => toTime(c.scheduledAt) - now <= DAY).length;
    const bouncing = sent.filter((x) => (x.rollup.bounceRate ?? 0) > HIGH_BOUNCE_RATE).length;

    return {
      currency,
      stats,
      summary: current,
      range: r,
      deliveries: windowDeliveries,
      allDeliveries: p.deliveries,
      attributed: p.attributedRows,
      sent,
      scopeCampaigns: sent.map((x) => x.campaign),
      attention: [
        { key: "review", label: "Awaiting approval", hint: "In review before they can send", count: withStatus("in_review"), icon: ClipboardCheck, urgency: "urgent", tab: "All Campaigns" },
        { key: "failed", label: "Failed campaigns", hint: "Sends that didn't go out", count: withStatus("failed"), icon: AlertTriangle, urgency: "urgent", tab: "All Campaigns" },
        { key: "due", label: "Sending in 24 hours", hint: "Last chance to check content", count: dueSoon, icon: CalendarClock, urgency: "soon", tab: "Calendar" },
        { key: "bounce", label: "High bounce rate", hint: `Over ${HIGH_BOUNCE_RATE * 100}% bounced this period`, count: bouncing, icon: MailWarning, urgency: "soon", tab: "Deliverability Reports" },
        { key: "paused", label: "Paused campaigns", hint: "Resume or cancel them", count: withStatus("paused"), icon: CirclePause, urgency: "routine", tab: "All Campaigns" },
        { key: "drafts", label: "Unsent drafts", hint: "Finish and schedule them", count: withStatus("draft"), icon: FileText, urgency: "routine", tab: "All Campaigns" },
      ],
      header: [
        { label: "Campaigns", value: formatNumber(p.campaigns.length) },
        { label: "Scheduled", value: formatNumber(scheduled.length) },
        { label: "Subscribers", value: formatNumber(p.contacts.filter((c) => c.status === "subscribed").length) },
      ],
    };
  }, [sources, loadedAt]);

  const openCampaign = (c) => openRecordInTab(String(c.id), "All Campaigns");

  return (
    <MainScreenWrapper>
      <OverviewHeader summary={model?.header ?? EMPTY_SUMMARY} />

      {failed && !loading ? <ReportFailed onRetry={reload} /> : null}

      {!model ? (
        <ReportLoading size={72} label="Loading overview" />
      ) : (
        <>
          <StatsBar stats={model.stats} columns={4} />
          <TruncatedNote show={truncated} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="h-[360px] lg:col-span-2">
              <PerformanceTrendWidget
                deliveries={model.allDeliveries}
                attributed={model.attributed}
                range={model.range}
                campaigns={model.scopeCampaigns}
                currency={model.currency}
              />
            </div>
            <div className="h-[360px]">
              <ChannelMixWidget deliveries={model.deliveries} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="h-[300px]">
              <EngagementFunnelWidget summary={model.summary} />
            </div>
            <div className="h-[300px]">
              <GaugeWidget
                title="Delivery Rate"
                subtitle="Delivered vs. sent."
                caption="Delivered"
                noun="Delivered"
                part="delivered"
                whole="sends"
                deliveries={model.deliveries}
                campaigns={model.scopeCampaigns}
              />
            </div>
            <div className="h-[300px]">
              <GaugeWidget
                title="Open Rate"
                subtitle="Opened vs. delivered."
                caption="Opened"
                noun="Opened"
                part="opens"
                whole="delivered"
                deliveries={model.deliveries}
                campaigns={model.scopeCampaigns}
              />
            </div>
          </div>

          <TopCampaignsTable
            rows={model.sent}
            campaigns={model.scopeCampaigns}
            baseline={model.summary.clickRate}
            currency={model.currency}
            onOpen={openCampaign}
          />

          <AttentionCard items={model.attention} onOpen={setTab} />
        </>
      )}
    </MainScreenWrapper>
  );
}

export default CampaignOverviewScreen;
