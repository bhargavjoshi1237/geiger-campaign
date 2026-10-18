"use client";

import React, { useState } from "react";
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
import {
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DataTable,
  Progress,
  RollingNumber,
  ScreenHeader,
  SectionCard,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import FilterDropdown from "./filter_dropdown";

// --- Palette (suite dark theme — monochrome series) --------------------------

const SERIES = ["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)", "var(--chart-series-5)"];

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

const STATUS_MAP = {
  Sent: { label: "Sent", variant: "success" },
  Live: { label: "Live", variant: "info" },
  Draft: { label: "Draft", variant: "neutral" },
};

const HEADER_STATS = [
  { label: "Campaigns", value: "12" },
  { label: "Subscribers", value: "48.2k" },
  { label: "Avg. Open", value: "42%" },
];

const AXIS_STROKE = "var(--muted-foreground)";

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

// --- Performance hero (multi-series line) ------------------------------------

function PerformanceCard() {
  const [activeChart, setActiveChart] = useState("sends");

  const totals = {
    sends: SENDS.reduce((a, b) => a + b, 0),
    opens: OPENS.reduce((a, b) => a + b, 0),
    clicks: CLICKS.reduce((a, b) => a + b, 0),
  };

  return (
    <SectionCard bodyPadding={false}>
      {/* Header with interactive stat tiles (shadcn line-chart-interactive) */}
      <div className="flex flex-col items-stretch border-b border-border sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">Campaign Performance</h3>
          <p className="text-xs text-text-secondary">Totals over the last 12 weeks.</p>
        </div>
        <div className="flex">
          {["sends", "opens", "clicks"].map((key) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              data-active={activeChart === key}
              onClick={() => setActiveChart(key)}
              className="h-auto flex-1 flex-col items-start justify-center gap-1 rounded-none border-t border-border px-5 py-4 hover:bg-surface-card data-[active=true]:bg-surface-card sm:border-t-0 sm:border-l sm:px-7"
            >
              <span className="text-[11px] uppercase tracking-wider text-text-secondary">
                {PERFORMANCE_CONFIG[key].label}
              </span>
              <RollingNumber
                value={totals[key].toLocaleString()}
                className="text-2xl font-bold leading-none text-foreground sm:text-3xl"
              />
            </Button>
          ))}
        </div>
      </div>
      <div className="px-3 pb-3 pt-4">
        <ChartContainer config={PERFORMANCE_CONFIG} className="aspect-auto h-[260px] w-full">
          <LineChart data={PERFORMANCE_DATA} margin={{ top: 24, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              padding={{ left: 12, right: 12 }}
              stroke={AXIS_STROKE}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={36}
              stroke={AXIS_STROKE}
              domain={[(min) => Math.max(0, Math.floor(min * 0.85)), (max) => Math.ceil(max * 1.08)]}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--chart-cursor)" }}
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
    </SectionCard>
  );
}

// --- Channel performance (bar) -----------------------------------------------

function ChannelCard() {
  return (
    <SectionCard title="Channel Performance" description="Messages sent by channel." bodyPadding={false}>
      <div className="px-3 pb-3 pt-4">
        <ChartContainer config={CHANNEL_CONFIG} className="aspect-auto h-[240px] w-full">
          <BarChart data={CHANNEL_DATA} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="channel" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={36}
              stroke={AXIS_STROKE}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
            />
            <ChartTooltip
              cursor={{ fill: "var(--chart-cursor-fill)" }}
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
    </SectionCard>
  );
}

// --- Deliverability (radial) -------------------------------------------------

function DeliverabilityCard() {
  return (
    <SectionCard title="Deliverability" description="Rates across the funnel." bodyPadding={false}>
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
              <span className="flex items-center gap-2 text-text-secondary">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} />
                {d.metric}
              </span>
              <span className="tabular-nums font-medium text-foreground">{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

// --- Audience growth (area) --------------------------------------------------

function AudienceCard() {
  return (
    <SectionCard title="Audience Growth" description="Net new subscribers per week." bodyPadding={false}>
      <div className="px-3 pb-3 pt-4">
        <ChartContainer config={AUDIENCE_CONFIG} className="aspect-auto h-[240px] w-full">
          <AreaChart data={AUDIENCE_DATA} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="audience-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-subscribers)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-subscribers)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
            <YAxis tickLine={false} axisLine={false} width={32} stroke={AXIS_STROKE} />
            <ChartTooltip
              cursor={{ stroke: "var(--chart-cursor)" }}
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
    </SectionCard>
  );
}

// --- Top campaigns (geiger-flow task-screen table form) ----------------------

const TOP_CAMPAIGN_COLUMNS = [
  {
    key: "name",
    header: "Campaign",
    render: (c) => (
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground">{c.name}</span>
        <p className="line-clamp-1 text-xs text-text-secondary">{c.description}</p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "whitespace-nowrap",
    render: (c) => <StatusPill status={c.status} map={STATUS_MAP} />,
  },
  {
    key: "recipients",
    header: "Recipients",
    className: "tabular-nums text-muted-foreground",
    render: (c) => c.recipients.toLocaleString(),
  },
  {
    key: "openRate",
    header: "Open rate",
    render: (c) => (
      <div className="w-[130px] space-y-1.5">
        <Progress value={c.openRate} className="h-1.5" />
        <p className="text-xs text-text-secondary">{c.openRate}%</p>
      </div>
    ),
  },
  {
    key: "ctr",
    header: "CTR",
    className: "tabular-nums text-muted-foreground",
    render: (c) => `${c.ctr}%`,
  },
  {
    key: "revenue",
    header: "Revenue",
    className: "tabular-nums font-medium text-foreground",
  },
  {
    key: "open",
    header: "",
    align: "right",
    render: (c) => (
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Open ${c.name}`} className="text-muted-foreground">
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    ),
  },
];

function TopCampaignsTable() {
  return (
    <SectionCard
      bare
      title="Top Campaigns"
      description="Performance by campaign this period."
      action={
        <Button variant="ghost" size="sm" className="text-xs text-text-secondary">
          View all
        </Button>
      }
    >
      <DataTable columns={TOP_CAMPAIGN_COLUMNS} data={TOP_CAMPAIGNS} getRowKey={(c) => c.name} />
    </SectionCard>
  );
}

// --- Screen ------------------------------------------------------------------

export function CampaignOverviewScreen() {
  const [filterValue, setFilterValue] = useState("1w");

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Campaign Overview"
        description="Track sends, deliverability, engagement, and revenue across all your campaigns."
      />

      <StatsBar stats={HEADER_STATS} columns={3} />

      <Toolbar>
        <FilterDropdown value={filterValue} onValueChange={setFilterValue} />
      </Toolbar>

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
