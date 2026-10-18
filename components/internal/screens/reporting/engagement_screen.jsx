"use client";

import React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  Progress,
  ScreenHeader,
  SectionCard,
  DataTable,
} from "@geiger/ui";

const SERIES = ["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)", "var(--chart-series-5)"];
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";
const AXIS_STROKE = "var(--muted-foreground)";

const ENGAGEMENT = [
  { day: "Mon", opens: 4120, clicks: 640 },
  { day: "Tue", opens: 4780, clicks: 720 },
  { day: "Wed", opens: 5210, clicks: 810 },
  { day: "Thu", opens: 4960, clicks: 760 },
  { day: "Fri", opens: 5840, clicks: 940 },
  { day: "Sat", opens: 3920, clicks: 510 },
  { day: "Sun", opens: 3480, clicks: 470 },
];

const ENGAGEMENT_CONFIG = {
  opens: { label: "Opens", color: SERIES[0] },
  clicks: { label: "Clicks", color: SERIES[1] },
};

const TOP_LINKS = [
  { url: "https://shop.example.com/summer-sale", clicks: 3210, unique: 2740, ctr: 6.8 },
  { url: "https://shop.example.com/new-arrivals", clicks: 1980, unique: 1710, ctr: 4.1 },
  { url: "https://blog.example.com/styling-guide", clicks: 1240, unique: 1120, ctr: 2.6 },
  { url: "https://example.com/account/rewards", clicks: 860, unique: 790, ctr: 1.8 },
  { url: "https://example.com/refer-a-friend", clicks: 540, unique: 510, ctr: 1.1 },
];

const DEVICES = [
  { label: "Desktop", icon: Monitor, share: 52 },
  { label: "Mobile", icon: Smartphone, share: 39 },
  { label: "Tablet", icon: Tablet, share: 9 },
];

const LINK_COLUMNS = [
  { key: "url", header: "Link", className: "max-w-[280px] truncate font-mono text-xs text-muted-foreground" },
  {
    key: "clicks",
    header: "Clicks",
    align: "right",
    className: "tabular-nums text-muted-foreground",
    render: (l) => l.clicks.toLocaleString(),
  },
  {
    key: "unique",
    header: "Unique",
    align: "right",
    className: "tabular-nums text-muted-foreground",
    render: (l) => l.unique.toLocaleString(),
  },
  {
    key: "ctr",
    header: "CTR",
    align: "right",
    className: "tabular-nums text-foreground",
    render: (l) => `${l.ctr}%`,
  },
];

export function EngagementScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Engagement"
        description="How recipients interact with your messages over time."
      />

      <SectionCard
        title="Opens & clicks over time"
        description="Daily interaction counts for the last week."
        bodyPadding={false}
      >
        <div className="px-3 pb-3 pt-4">
          <ChartContainer config={ENGAGEMENT_CONFIG} className="aspect-auto h-[280px] w-full">
            <AreaChart data={ENGAGEMENT} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="eng-opens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-opens)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-opens)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="eng-clicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-clicks)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-clicks)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
              <YAxis tickLine={false} axisLine={false} width={40} stroke={AXIS_STROKE} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <ChartTooltip cursor={{ stroke: "var(--chart-cursor)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
              <ChartLegend content={<ChartLegendContent className="text-muted-foreground" />} />
              <Area dataKey="opens" type="monotone" stroke="var(--color-opens)" strokeWidth={2} fill="url(#eng-opens)" />
              <Area dataKey="clicks" type="monotone" stroke="var(--color-clicks)" strokeWidth={2} fill="url(#eng-clicks)" />
            </AreaChart>
          </ChartContainer>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <SectionCard bare title="Top links" description="Most-clicked destinations across recent sends.">
          <DataTable columns={LINK_COLUMNS} data={TOP_LINKS} getRowKey={(l) => l.url} />
        </SectionCard>

        <SectionCard title="Engagement by device" description="Share of opens by device type.">
          <div className="space-y-4">
            {DEVICES.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-text-secondary">
                      <Icon className="h-4 w-4 text-text-secondary" />
                      {d.label}
                    </span>
                    <span className="tabular-nums font-medium text-foreground">{d.share}%</span>
                  </div>
                  <Progress value={d.share} className="h-1.5 bg-surface-hover" />
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default EngagementScreen;
