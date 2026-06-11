"use client";

import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import FilterDropdown from "./filter_dropdown";

// --- Palette (suite dark theme — monochrome series) --------------------------

const SERIES = ["#ffffff", "#a3a3a3", "#525252", "#737373", "#d4d4d4"];

// --- Sample data (placeholder until backend is connected) --------------------

const SENDS = [3200, 4100, 3800, 5200, 4900, 6100, 7300, 6800, 8200, 9100, 10400, 11800];
const OPENS = [1400, 1800, 1700, 2300, 2200, 2700, 3100, 2900, 3600, 3900, 4500, 5100];
const CLICKS = [210, 280, 240, 360, 340, 420, 510, 480, 600, 660, 740, 820];

const PERFORMANCE_DATA = SENDS.map((s, i) => ({
  week: `W${i + 1}`,
  sends: s,
  opens: OPENS[i],
  clicks: CLICKS[i],
}));

const CHANNEL_DATA = [
  { channel: "Email", messages: 31200, fill: SERIES[0] },
  { channel: "SMS", messages: 9800, fill: SERIES[4] },
  { channel: "Push", messages: 5100, fill: SERIES[1] },
  { channel: "WhatsApp", messages: 2130, fill: SERIES[3] },
];

const DELIVERABILITY_DATA = [
  { metric: "Delivered", value: 95.7, fill: SERIES[0] },
  { metric: "Opened", value: 42.3, fill: SERIES[1] },
  { metric: "Clicked", value: 6.8, fill: SERIES[3] },
  { metric: "Bounced", value: 2.6, fill: SERIES[2] },
];

const AUDIENCE_DATA = [
  { week: "W1", subscribers: 120 },
  { week: "W2", subscribers: 180 },
  { week: "W3", subscribers: 150 },
  { week: "W4", subscribers: 240 },
  { week: "W5", subscribers: 300 },
  { week: "W6", subscribers: 280 },
  { week: "W7", subscribers: 390 },
  { week: "W8", subscribers: 460 },
];

const TOP_CAMPAIGNS = [
  {
    name: "Summer Sale — Early Access",
    description: "Promotional broadcast to engaged subscribers",
    status: "Sent",
    recipients: 12400,
    openRate: 58,
    ctr: 9.2,
    revenue: "$8,240",
  },
  {
    name: "Weekly Digest #42",
    description: "Recurring newsletter to all opted-in contacts",
    status: "Sent",
    recipients: 18900,
    openRate: 44,
    ctr: 5.1,
    revenue: "$3,110",
  },
  {
    name: "Cart Reminder",
    description: "Abandoned cart automation — 1h delay",
    status: "Live",
    recipients: 6200,
    openRate: 39,
    ctr: 7.6,
    revenue: "$5,980",
  },
  {
    name: "Product Launch Teaser",
    description: "Pre-announcement for the autumn collection",
    status: "Draft",
    recipients: 9800,
    openRate: 0,
    ctr: 0,
    revenue: "—",
  },
];

const STATUS_META = {
  Sent: { label: "Sent", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  Live: { label: "Live", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  Draft: { label: "Draft", className: "bg-zinc-500/15 text-muted-foreground border-zinc-500/30" },
};

const PERFORMANCE_CONFIG = {
  sends: { label: "Sends", color: SERIES[0] },
  opens: { label: "Opens", color: SERIES[1] },
  clicks: { label: "Clicks", color: SERIES[2] },
};

const CHANNEL_CONFIG = {
  messages: { label: "Messages" },
  Email: { label: "Email" },
  SMS: { label: "SMS" },
  Push: { label: "Push" },
  WhatsApp: { label: "WhatsApp" },
};

const DELIVERABILITY_CONFIG = {
  value: { label: "Rate" },
  Delivered: { label: "Delivered" },
  Opened: { label: "Opened" },
  Clicked: { label: "Clicked" },
  Bounced: { label: "Bounced" },
};

const AUDIENCE_CONFIG = {
  subscribers: { label: "New subscribers", color: SERIES[0] },
};

const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";

// --- Rolling number (odometer) — copied from geiger-events overview ----------

const ROLL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// A single odometer digit: a vertical 0–9 strip that slides to the target.
// Starts at 0 and rolls up once `active` flips true (on mount).
function RollingDigit({ digit, active, delay }) {
  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-baseline">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[900ms] ease-out"
        style={{
          transform: `translateY(-${(active ? digit : 0) * 10}%)`,
          transitionDelay: `${delay}ms`,
        }}
      >
        {ROLL_DIGITS.map((n) => (
          <span key={n} className="flex h-[1em] items-center justify-center leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

// Renders a formatted value (e.g. "48,230") with each digit animated as a
// rolling odometer; prefixes/separators like "$" and "," stay static.
function RollingNumber({ value, className }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const chars = String(value).split("");
  let digitIndex = 0;

  return (
    <span className={cn("inline-flex items-center leading-none tabular-nums", className)}>
      {chars.map((char, i) => {
        if (/\d/.test(char)) {
          const delay = digitIndex * 70;
          digitIndex += 1;
          return (
            <RollingDigit key={i} digit={Number(char)} active={active} delay={delay} />
          );
        }
        return (
          <span key={i} className="inline-flex h-[1em] items-center leading-none">
            {char}
          </span>
        );
      })}
    </span>
  );
}

// --- Card primitive ----------------------------------------------------------

function Panel({ children, className }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-subtle text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PanelHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-text-secondary">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// --- Performance hero (multi-series line) ------------------------------------

function PerformanceCard() {
  const [activeChart, setActiveChart] = useState("sends");

  const totals = {
    sends: SENDS.reduce((a, b) => a + b, 0),
    opens: OPENS.reduce((a, b) => a + b, 0),
    clicks: CLICKS.reduce((a, b) => a + b, 0),
  };

  return (
    <Panel className="overflow-hidden">
      {/* Header with interactive stat tiles (shadcn line-chart-interactive) */}
      <div className="flex flex-col items-stretch border-b border-border sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">Campaign Performance</h3>
          <p className="text-xs text-text-secondary">Totals over the last 12 weeks.</p>
        </div>
        <div className="flex">
          {["sends", "opens", "clicks"].map((key) => (
            <button
              key={key}
              type="button"
              data-active={activeChart === key}
              onClick={() => setActiveChart(key)}
              className="flex flex-1 flex-col justify-center gap-1 border-t border-border px-5 py-4 text-left transition-colors hover:bg-surface-card data-[active=true]:bg-surface-card sm:border-t-0 sm:border-l sm:px-7"
            >
              <span className="text-[11px] uppercase tracking-wider text-text-secondary">
                {PERFORMANCE_CONFIG[key].label}
              </span>
              <RollingNumber
                value={totals[key].toLocaleString()}
                className="text-2xl font-bold leading-none text-white sm:text-3xl"
              />
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 pb-3 pt-4">
        <ChartContainer config={PERFORMANCE_CONFIG} className="aspect-auto h-[260px] w-full">
          <LineChart data={PERFORMANCE_DATA} margin={{ top: 24, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              padding={{ left: 12, right: 12 }}
              stroke="#737373"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={36}
              stroke="#737373"
              domain={[(min) => Math.max(0, Math.floor(min * 0.85)), (max) => Math.ceil(max * 1.08)]}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
            />
            <ChartTooltip
              cursor={{ stroke: "#333333" }}
              content={<ChartTooltipContent nameKey={activeChart} className={TOOLTIP_CLASS} />}
            />
            <Line
              dataKey={activeChart}
              type="natural"
              stroke={`var(--color-${activeChart})`}
              strokeWidth={2}
              dot={{ fill: `var(--color-${activeChart})`, r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={true}
              animationDuration={800}
            >
              <LabelList
                position="top"
                offset={10}
                className="fill-foreground"
                fontSize={11}
                formatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
              />
            </Line>
          </LineChart>
        </ChartContainer>
      </div>
    </Panel>
  );
}

// --- Channel performance (bar) -----------------------------------------------

function ChannelCard() {
  return (
    <Panel>
      <PanelHeader title="Channel Performance" subtitle="Messages sent by channel." />
      <div className="px-3 pb-3 pt-4">
        <ChartContainer config={CHANNEL_CONFIG} className="aspect-auto h-[240px] w-full">
          <BarChart data={CHANNEL_DATA} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis dataKey="channel" tickLine={false} axisLine={false} tickMargin={8} stroke="#737373" />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={36}
              stroke="#737373"
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
            />
            <ChartTooltip
              cursor={{ fill: "#ffffff10" }}
              content={<ChartTooltipContent hideLabel className={TOOLTIP_CLASS} />}
            />
            <Bar dataKey="messages" radius={[6, 6, 0, 0]}>
              {CHANNEL_DATA.map((entry) => (
                <Cell key={entry.channel} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </Panel>
  );
}

// --- Deliverability (radial) -------------------------------------------------

function DeliverabilityCard() {
  return (
    <Panel>
      <PanelHeader title="Deliverability" subtitle="Rates across the funnel." />
      <div className="px-3 pb-3 pt-2">
        <ChartContainer
          config={DELIVERABILITY_CONFIG}
          className="[&_.recharts-text]:fill-foreground mx-auto aspect-square max-h-[220px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="metric" className={TOOLTIP_CLASS} />}
            />
            <Pie data={DELIVERABILITY_DATA} dataKey="value" nameKey="metric" label />
          </PieChart>
        </ChartContainer>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-2 pb-2">
          {DELIVERABILITY_DATA.map((d) => (
            <div key={d.metric} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-[#c4c4c4]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} />
                {d.metric}
              </span>
              <span className="tabular-nums font-medium text-foreground">{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// --- Audience growth (area) --------------------------------------------------

function AudienceCard() {
  return (
    <Panel>
      <PanelHeader title="Audience Growth" subtitle="Net new subscribers per week." />
      <div className="px-3 pb-3 pt-4">
        <ChartContainer config={AUDIENCE_CONFIG} className="aspect-auto h-[240px] w-full">
          <AreaChart data={AUDIENCE_DATA} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="audience-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-subscribers)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-subscribers)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} stroke="#737373" />
            <YAxis tickLine={false} axisLine={false} width={32} stroke="#737373" />
            <ChartTooltip
              cursor={{ stroke: "#333333" }}
              content={<ChartTooltipContent className={TOOLTIP_CLASS} />}
            />
            <Area
              dataKey="subscribers"
              type="monotone"
              stroke="var(--color-subscribers)"
              strokeWidth={2}
              fill="url(#audience-fill)"
              isAnimationActive={true}
              animationDuration={800}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </Panel>
  );
}

// --- Top campaigns (geiger-flow task-screen table form) ----------------------

function TopCampaignsTable() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Top Campaigns</h3>
          <p className="text-xs text-text-secondary">Performance by campaign this period.</p>
        </div>
        <Button
          variant="ghost"
          className="text-xs font-medium text-text-secondary hover:text-foreground hover:bg-surface-active px-2 py-1 rounded-lg"
        >
          View all
        </Button>
      </div>

      <div className="bg-surface-card border border-border rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-subtle border-border">
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Open rate</TableHead>
              <TableHead>CTR</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TOP_CAMPAIGNS.map((c) => {
              const meta = STATUS_META[c.status] || STATUS_META.Draft;
              return (
                <TableRow key={c.name} className="border-border hover:bg-surface-active">
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <p className="line-clamp-1 text-xs text-text-secondary">{c.description}</p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      className={cn(
                        "min-w-[72px] justify-center whitespace-nowrap border px-2",
                        meta.className,
                      )}
                    >
                      {meta.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {c.recipients.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="w-[130px] space-y-1.5">
                      <Progress
                        value={c.openRate}
                        className="h-1.5 bg-surface-hover [&_[data-slot=progress-indicator]]:bg-[#ededed]"
                      />
                      <p className="text-xs text-text-secondary">{c.openRate}%</p>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{c.ctr}%</TableCell>
                  <TableCell className="tabular-nums font-medium text-foreground">
                    {c.revenue}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground hover:bg-surface-active"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- Screen ------------------------------------------------------------------

export function CampaignOverviewScreen() {
  const [filterValue, setFilterValue] = useState("1w");

  return (
    <MainScreenWrapper className="dark">
      {/* Header (geiger-flow project-overview structure) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mt-2 gap-4">
<div>
          <div className="flex items-center justify-center md:justify-start gap-3 w-full md:w-auto text-center md:text-left">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Campaign Overview
          </h1>
          <span className="bg-surface-subtle text-text-secondary text-[9px] px-1.5 py-0.5 rounded border border-border font-mono tracking-widest shrink-0">
            WORKSPACE
          </span>
        </div>
              <div className="w-full mt-2">
        <p className="text-foreground0 text-sm text-center md:text-left max-w-xl">
          Track sends, deliverability, engagement, and revenue across all your
          campaigns.
        </p>
      </div>
</div>
        <div className="w-full md:w-auto">
          <div className="flex w-full md:w-auto md:gap-0">
            <div className="flex-1 md:flex-none flex flex-col items-center md:pr-8">
              <span className="text-text-secondary text-[11px] uppercase tracking-wider font-medium">
                Campaigns
              </span>
              <RollingNumber value="12" className="text-white font-bold text-2xl mt-0.5" />
            </div>
            <div className="flex-1 md:flex-none flex flex-col items-center border-l border-border md:px-8">
              <span className="text-text-secondary text-[11px] uppercase tracking-wider font-medium">
                Subscribers
              </span>
              <RollingNumber value="48.2k" className="text-white font-bold text-2xl mt-0.5" />
            </div>
            <div className="flex-1 md:flex-none flex flex-col items-center border-l border-border md:pl-8">
              <span className="text-text-secondary text-[11px] uppercase tracking-wider font-medium">
                Avg. Open
              </span>
              <RollingNumber value="42%" className="text-white font-bold text-2xl mt-0.5" />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-surface-active">
        <FilterDropdown value={filterValue} onValueChange={setFilterValue} />
      </div>

      {/* Full-width performance line */}
      <PerformanceCard />

      {/* Three chart columns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChannelCard />
        <DeliverabilityCard />
        <AudienceCard />
      </div>

      {/* Campaigns table (geiger-flow task-screen form) */}
      <TopCampaignsTable />
    </MainScreenWrapper>
  );
}

export default CampaignOverviewScreen;
