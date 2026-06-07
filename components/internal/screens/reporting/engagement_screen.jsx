"use client";

import React from "react";
import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell } from "@/components/internal/shared/screen_kit";
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

const SERIES = ["#ffffff", "#a3a3a3", "#525252", "#737373", "#d4d4d4"];
const TOOLTIP_CLASS = "bg-[#1a1a1a] border-[#2a2a2a] text-[#e7e7e7]";

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

export function EngagementScreen() {
  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Engagement"
        description="How recipients interact with your messages over time."
      />

      <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[#ededed]">Opens & clicks over time</h3>
          <p className="text-xs text-[#737373]">Daily interaction counts for the last week.</p>
        </div>
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
            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} stroke="#737373" />
            <YAxis tickLine={false} axisLine={false} width={40} stroke="#737373" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
            <ChartTooltip cursor={{ stroke: "#333333" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#a3a3a3" }} />
            <Area dataKey="opens" type="monotone" stroke="var(--color-opens)" strokeWidth={2} fill="url(#eng-opens)" />
            <Area dataKey="clicks" type="monotone" stroke="var(--color-clicks)" strokeWidth={2} fill="url(#eng-clicks)" />
          </AreaChart>
        </ChartContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-[#ededed]">Top links</h3>
            <p className="text-xs text-[#737373]">Most-clicked destinations across recent sends.</p>
          </div>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <TableHead>Link</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Unique</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TOP_LINKS.map((l) => (
                  <TableRow key={l.url} className="border-[#2a2a2a]">
                    <TableCell className="max-w-[280px] truncate font-mono text-xs text-[#a3a3a3]">{l.url}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#a3a3a3]">{l.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#a3a3a3]">{l.unique.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#ededed]">{l.ctr}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </div>

        <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[#ededed]">Engagement by device</h3>
            <p className="text-xs text-[#737373]">Share of opens by device type.</p>
          </div>
          <div className="space-y-4">
            {DEVICES.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-[#c4c4c4]">
                      <Icon className="h-4 w-4 text-[#737373]" />
                      {d.label}
                    </span>
                    <span className="tabular-nums font-medium text-[#ededed]">{d.share}%</span>
                  </div>
                  <Progress value={d.share} className="h-1.5 bg-[#2a2a2a] [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default EngagementScreen;
