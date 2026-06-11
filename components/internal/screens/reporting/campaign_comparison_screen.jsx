"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell } from "@/components/internal/shared/screen_kit";
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

const SERIES = ["#ffffff", "#a3a3a3", "#525252", "#737373", "#d4d4d4"];
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";

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

export function CampaignComparisonScreen() {
  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Campaign Comparison"
        description="Put campaigns side by side to see what worked."
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Comparing <span className="font-medium text-foreground">{CAMPAIGNS.length}</span> campaigns
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-subtle p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Open rate vs click rate</h3>
          <p className="text-xs text-text-secondary">Grouped comparison across selected campaigns (%).</p>
        </div>
        <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[280px] w-full">
          <BarChart data={CHART_DATA} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} stroke="#737373" />
            <YAxis tickLine={false} axisLine={false} width={40} stroke="#737373" tickFormatter={(v) => `${v}%`} />
            <ChartTooltip cursor={{ fill: "#ffffff10" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#a3a3a3" }} />
            <Bar dataKey="openRate" fill={SERIES[0]} radius={[6, 6, 0, 0]} />
            <Bar dataKey="clickRate" fill={SERIES[1]} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Metric</TableHead>
              {CAMPAIGNS.map((c) => (
                <TableHead key={c.key} className="text-right">{c.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {METRICS.map((row) => (
              <TableRow key={row.metric} className="border-border">
                <TableCell className="font-medium text-foreground">{row.metric}</TableCell>
                {CAMPAIGNS.map((c) => (
                  <TableCell key={c.key} className="text-right tabular-nums text-muted-foreground">
                    {row[c.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
    </MainScreenWrapper>
  );
}

export default CampaignComparisonScreen;
