"use client";

import React, { useState } from "react";
import { Pie, PieChart } from "recharts";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SectionCard,
  Toolbar,
  DataTable,
} from "@geiger/ui";

const SERIES = ["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)", "var(--chart-series-5)"];
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";

const CHANNELS = [
  { channel: "Email", revenue: 84200, touchpoints: 31200, share: 54.1, fill: SERIES[0] },
  { channel: "SMS", revenue: 32600, touchpoints: 9800, share: 20.9, fill: SERIES[1] },
  { channel: "Push", revenue: 18400, touchpoints: 7100, share: 11.8, fill: SERIES[4] },
  { channel: "Social", revenue: 12900, touchpoints: 5400, share: 8.3, fill: SERIES[3] },
  { channel: "Direct", revenue: 7500, touchpoints: 2300, share: 4.8, fill: SERIES[2] },
];

const CHART_CONFIG = {
  revenue: { label: "Revenue" },
  Email: { label: "Email" },
  SMS: { label: "SMS" },
  Push: { label: "Push" },
  Social: { label: "Social" },
  Direct: { label: "Direct" },
};

const COLUMNS = [
  {
    key: "channel",
    header: "Channel",
    render: (c) => (
      <span className="flex items-center gap-2 font-medium text-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.fill }} />
        {c.channel}
      </span>
    ),
  },
  {
    key: "touchpoints",
    header: "Touchpoints",
    align: "right",
    className: "tabular-nums text-muted-foreground",
    render: (c) => c.touchpoints.toLocaleString(),
  },
  {
    key: "revenue",
    header: "Attributed revenue",
    align: "right",
    className: "tabular-nums font-medium text-foreground",
    render: (c) => `$${c.revenue.toLocaleString()}`,
  },
  {
    key: "share",
    header: "Share",
    render: (c) => (
      <div className="flex items-center gap-3">
        <Progress value={c.share} className="h-1.5 w-28 bg-surface-hover" />
        <span className="tabular-nums text-xs text-muted-foreground">{c.share}%</span>
      </div>
    ),
  },
];

export function AttributionScreen() {
  const [model, setModel] = useState("last");

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Attribution"
        description="Connect revenue back to the campaigns and channels that earned it."
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger size="sm" className="bg-background sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">First touch</SelectItem>
              <SelectItem value="last">Last touch</SelectItem>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="decay">Time decay</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <SectionCard title="Revenue by channel" description="Attributed revenue split across channels.">
        <ChartContainer
          config={CHART_CONFIG}
          className="[&_.recharts-text]:fill-foreground mx-auto aspect-square max-h-[240px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="channel" className={TOOLTIP_CLASS} />}
            />
            <Pie data={CHANNELS} dataKey="revenue" nameKey="channel" innerRadius={60} strokeWidth={2} stroke="var(--surface-subtle)" />
          </PieChart>
        </ChartContainer>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-2 pb-1 sm:grid-cols-3">
          {CHANNELS.map((c) => (
            <div key={c.channel} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-text-secondary">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.fill }} />
                {c.channel}
              </span>
              <span className="tabular-nums font-medium text-foreground">{c.share}%</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <DataTable columns={COLUMNS} data={CHANNELS} getRowKey={(c) => c.channel} />
    </MainScreenWrapper>
  );
}

export default AttributionScreen;
