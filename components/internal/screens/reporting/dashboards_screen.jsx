"use client";

import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  ScreenHeader,
  SectionCard,
  StatsBar,
  Toolbar,
} from "@geiger/ui";

const SERIES = ["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)", "var(--chart-series-5)"];
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";
const AXIS_STROKE = "var(--muted-foreground)";

const WEEKLY = [
  { week: "W1", sends: 18400, opens: 7820, revenue: 9120 },
  { week: "W2", sends: 21200, opens: 9140, revenue: 10840 },
  { week: "W3", sends: 19800, opens: 8410, revenue: 9760 },
  { week: "W4", sends: 24600, opens: 11070, revenue: 13420 },
  { week: "W5", sends: 26900, opens: 12380, revenue: 15110 },
  { week: "W6", sends: 25100, opens: 11540, revenue: 14230 },
  { week: "W7", sends: 30200, opens: 14190, revenue: 17680 },
  { week: "W8", sends: 33700, opens: 16180, revenue: 20140 },
  { week: "W9", sends: 31500, opens: 15120, revenue: 18920 },
  { week: "W10", sends: 36800, opens: 17650, revenue: 22540 },
];

const KPIS = [
  { label: "Total sends", value: "268,200", delta: 12.4, positive: true },
  { label: "Open rate", value: "47.6%", delta: 3.1, positive: true },
  { label: "Click rate", value: "6.8%", delta: -0.9, positive: false },
  { label: "Revenue", value: "$151,800", delta: 18.2, positive: true },
];

const SENDS_CONFIG = {
  sends: { label: "Sends", color: SERIES[0] },
  opens: { label: "Opens", color: SERIES[1] },
};

const REVENUE_CONFIG = {
  revenue: { label: "Revenue", color: SERIES[0] },
};

// KPI seed mapped onto the StatsBar shape (pre-formatted delta + trend).
const STATS = KPIS.map((k) => ({
  label: k.label,
  value: k.value,
  delta: `${k.positive ? "+" : ""}${k.delta}%`,
  trend: k.positive ? "up" : "down",
}));

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export function DashboardsScreen() {
  const [dashboard, setDashboard] = useState("overview");
  const [range, setRange] = useState("30");

  const rangeLabel = useMemo(
    () => RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "Last 30 days",
    [range],
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Dashboards"
        description="Your at-a-glance view of campaign performance."
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <Select value={dashboard} onValueChange={setDashboard}>
            <SelectTrigger size="sm" className="bg-background sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview">Overview</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-44">
                {rangeLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44 bg-surface-card">
              <DropdownMenuLabel className="text-text-secondary">Date range</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-surface-hover" />
              {RANGE_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  onSelect={() => setRange(o.value)}
                  className={cn("cursor-pointer focus:bg-surface-hover", range === o.value && "font-medium")}
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Toolbar>

      <StatsBar stats={STATS} columns={4} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Sends & opens" description="Weekly volume over the period." bodyPadding={false}>
          <div className="px-3 pb-3 pt-4">
            <ChartContainer config={SENDS_CONFIG} className="aspect-auto h-[260px] w-full">
              <LineChart data={WEEKLY} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  stroke={AXIS_STROKE}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                />
                <ChartTooltip cursor={{ stroke: "var(--chart-cursor)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
                <Line dataKey="sends" type="natural" stroke="var(--color-sends)" strokeWidth={2} dot={{ fill: "var(--color-sends)", r: 3 }} activeDot={{ r: 5 }} />
                <Line dataKey="opens" type="natural" stroke="var(--color-opens)" strokeWidth={2} dot={{ fill: "var(--color-opens)", r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ChartContainer>
          </div>
        </SectionCard>

        <SectionCard title="Revenue by week" description="Attributed revenue per week ($)." bodyPadding={false}>
          <div className="px-3 pb-3 pt-4">
            <ChartContainer config={REVENUE_CONFIG} className="aspect-auto h-[260px] w-full">
              <BarChart data={WEEKLY} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  stroke={AXIS_STROKE}
                  tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
                />
                <ChartTooltip cursor={{ fill: "var(--chart-cursor-fill)" }} content={<ChartTooltipContent hideLabel className={TOOLTIP_CLASS} />} />
                <Bar dataKey="revenue" fill={SERIES[0]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default DashboardsScreen;
