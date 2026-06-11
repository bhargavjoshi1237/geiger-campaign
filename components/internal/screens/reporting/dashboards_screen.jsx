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
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const SERIES = ["#ffffff", "#a3a3a3", "#525252", "#737373", "#d4d4d4"];
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";

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

function Panel({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-text-secondary">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, delta, positive }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{label}</p>
      <p className="mt-2 text-3xl font-bold leading-none text-white">{value}</p>
      <p
        className={cn(
          "mt-3 inline-flex items-center gap-1 text-xs font-medium tabular-nums",
          positive ? "text-emerald-400" : "text-red-400",
        )}
      >
        {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {positive ? "+" : ""}{delta}%
      </p>
    </div>
  );
}

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
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Dashboards"
        description="Your at-a-glance view of campaign performance."
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <Select value={dashboard} onValueChange={setDashboard}>
          <SelectTrigger size="sm" className="bg-background border-border sm:w-44">
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
            <Button variant="outline" className="h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle sm:w-44">
              {rangeLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
            <DropdownMenuLabel className="text-text-secondary">Date range</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {RANGE_OPTIONS.map((o) => (
              <DropdownMenuItem
                key={o.value}
                onSelect={() => setRange(o.value)}
                className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", range === o.value && "text-white")}
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Sends & opens" subtitle="Weekly volume over the period.">
          <ChartContainer config={SENDS_CONFIG} className="aspect-auto h-[260px] w-full">
            <LineChart data={WEEKLY} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#2a2a2a" />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} stroke="#737373" />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={40}
                stroke="#737373"
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              />
              <ChartTooltip cursor={{ stroke: "#333333" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
              <Line dataKey="sends" type="natural" stroke="var(--color-sends)" strokeWidth={2} dot={{ fill: "var(--color-sends)", r: 3 }} activeDot={{ r: 5 }} />
              <Line dataKey="opens" type="natural" stroke="var(--color-opens)" strokeWidth={2} dot={{ fill: "var(--color-opens)", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ChartContainer>
        </Panel>

        <Panel title="Revenue by week" subtitle="Attributed revenue per week ($).">
          <ChartContainer config={REVENUE_CONFIG} className="aspect-auto h-[260px] w-full">
            <BarChart data={WEEKLY} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#2a2a2a" />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} stroke="#737373" />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                stroke="#737373"
                tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
              />
              <ChartTooltip cursor={{ fill: "#ffffff10" }} content={<ChartTooltipContent hideLabel className={TOOLTIP_CLASS} />} />
              <Bar dataKey="revenue" fill={SERIES[0]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </Panel>
      </div>
    </MainScreenWrapper>
  );
}

export default DashboardsScreen;
