"use client";

import React, { useState } from "react";
import { Pie, PieChart } from "recharts";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell } from "@/components/internal/shared/screen_kit";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function AttributionScreen() {
  const [model, setModel] = useState("last");

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Attribution"
        description="Connect revenue back to the campaigns and channels that earned it."
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger size="sm" className="bg-[#161616] border-[#2a2a2a] sm:w-52">
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

      <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-[#ededed]">Revenue by channel</h3>
          <p className="text-xs text-[#737373]">Attributed revenue split across channels.</p>
        </div>
        <ChartContainer
          config={CHART_CONFIG}
          className="[&_.recharts-text]:fill-[#e7e7e7] mx-auto aspect-square max-h-[240px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="channel" className={TOOLTIP_CLASS} />}
            />
            <Pie data={CHANNELS} dataKey="revenue" nameKey="channel" innerRadius={60} strokeWidth={2} stroke="#1a1a1a" />
          </PieChart>
        </ChartContainer>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-2 pb-1 sm:grid-cols-3">
          {CHANNELS.map((c) => (
            <div key={c.channel} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-[#c4c4c4]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.fill }} />
                {c.channel}
              </span>
              <span className="tabular-nums font-medium text-[#ededed]">{c.share}%</span>
            </div>
          ))}
        </div>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Channel</TableHead>
              <TableHead className="text-right">Touchpoints</TableHead>
              <TableHead className="text-right">Attributed revenue</TableHead>
              <TableHead>Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CHANNELS.map((c) => (
              <TableRow key={c.channel} className="border-[#2a2a2a]">
                <TableCell>
                  <span className="flex items-center gap-2 font-medium text-[#ededed]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.fill }} />
                    {c.channel}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#a3a3a3]">{c.touchpoints.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums font-medium text-[#ededed]">${c.revenue.toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Progress value={c.share} className="h-1.5 w-28 bg-[#2a2a2a] [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                    <span className="tabular-nums text-xs text-[#a3a3a3]">{c.share}%</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
    </MainScreenWrapper>
  );
}

export default AttributionScreen;
