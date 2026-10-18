"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  ScreenHeader,
  SectionCard,
  Toolbar,
  DataTable,
} from "@geiger/ui";

const SERIES = ["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)", "var(--chart-series-5)"];
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";
const AXIS_STROKE = "var(--muted-foreground)";

const CAMPAIGNS = [
  { key: "summer", name: "Summer Sale" },
  { key: "digest", name: "Weekly Digest #42" },
  { key: "winback", name: "Win-back Series" },
  { key: "launch", name: "Autumn Launch" },
];

const CHART_DATA = [
  { name: "Summer Sale", openRate: 58.2, clickRate: 9.2 },
  { name: "Weekly Digest #42", openRate: 44.1, clickRate: 5.1 },
  { name: "Win-back Series", openRate: 31.6, clickRate: 7.4 },
  { name: "Autumn Launch", openRate: 52.7, clickRate: 11.3 },
];

const CHART_CONFIG = {
  openRate: { label: "Open rate", color: SERIES[0] },
  clickRate: { label: "Click rate", color: SERIES[1] },
};

const METRICS = [
  { metric: "Recipients", summer: "12,400", digest: "18,900", winback: "8,650", launch: "9,800" },
  { metric: "Open rate", summer: "58.2%", digest: "44.1%", winback: "31.6%", launch: "52.7%" },
  { metric: "Click rate", summer: "9.2%", digest: "5.1%", winback: "7.4%", launch: "11.3%" },
  { metric: "Conversion", summer: "3.4%", digest: "1.8%", winback: "2.9%", launch: "4.6%" },
  { metric: "Revenue", summer: "$8,240", digest: "$3,110", winback: "$5,980", launch: "$12,470" },
];

// One metric column, then one right-aligned column per compared campaign.
const COLUMNS = [
  { key: "metric", header: "Metric", className: "font-medium text-foreground" },
  ...CAMPAIGNS.map((c) => ({
    key: c.key,
    header: c.name,
    align: "right",
    className: "tabular-nums text-muted-foreground",
  })),
];

export function CampaignComparisonScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Campaign Comparison"
        description="Put campaigns side by side to see what worked."
      />

      <Toolbar>
        <p className="text-sm text-muted-foreground">
          Comparing <span className="font-medium text-foreground">{CAMPAIGNS.length}</span> campaigns
        </p>
      </Toolbar>

      <SectionCard
        title="Open rate vs click rate"
        description="Grouped comparison across selected campaigns (%)."
        bodyPadding={false}
      >
        <div className="px-3 pb-3 pt-4">
          <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[280px] w-full">
            <BarChart data={CHART_DATA} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
              <YAxis tickLine={false} axisLine={false} width={40} stroke={AXIS_STROKE} tickFormatter={(v) => `${v}%`} />
              <ChartTooltip cursor={{ fill: "var(--chart-cursor-fill)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
              <ChartLegend content={<ChartLegendContent className="text-muted-foreground" />} />
              <Bar dataKey="openRate" fill={SERIES[0]} radius={[6, 6, 0, 0]} />
              <Bar dataKey="clickRate" fill={SERIES[1]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </SectionCard>

      <DataTable columns={COLUMNS} data={METRICS} getRowKey={(row) => row.metric} />
    </MainScreenWrapper>
  );
}

export default CampaignComparisonScreen;
