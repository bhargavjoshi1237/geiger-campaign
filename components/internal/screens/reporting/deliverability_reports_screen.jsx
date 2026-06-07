"use client";

import React from "react";
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill } from "@/components/internal/shared/screen_kit";
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

const TRENDS = [
  { week: "W1", delivered: 96.4, bounced: 2.4, complaint: 0.08 },
  { week: "W2", delivered: 96.9, bounced: 2.1, complaint: 0.06 },
  { week: "W3", delivered: 95.8, bounced: 2.9, complaint: 0.11 },
  { week: "W4", delivered: 97.2, bounced: 1.8, complaint: 0.05 },
  { week: "W5", delivered: 96.1, bounced: 2.6, complaint: 0.09 },
  { week: "W6", delivered: 97.5, bounced: 1.6, complaint: 0.04 },
  { week: "W7", delivered: 96.7, bounced: 2.2, complaint: 0.07 },
  { week: "W8", delivered: 97.8, bounced: 1.4, complaint: 0.03 },
];

const CHART_CONFIG = {
  delivered: { label: "Delivered %", color: SERIES[0] },
  bounced: { label: "Bounced %", color: SERIES[1] },
  complaint: { label: "Complaint %", color: SERIES[2] },
};

const DOMAINS = [
  { domain: "mail.acme.com", sent: 142800, delivered: 97.8, bounce: 1.9, complaint: 0.03, status: "Healthy", tone: "green" },
  { domain: "send.acme.com", sent: 86400, delivered: 96.2, bounce: 3.1, complaint: 0.08, status: "Healthy", tone: "green" },
  { domain: "news.acme.io", sent: 41200, delivered: 93.4, bounce: 5.8, complaint: 0.14, status: "At risk", tone: "amber" },
  { domain: "promo.acme.net", sent: 19600, delivered: 89.1, bounce: 9.2, complaint: 0.31, status: "Throttled", tone: "red" },
];

export function DeliverabilityReportsScreen() {
  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Deliverability Reports"
        description="Delivery, bounce, and complaint trends across your sends."
      />

      <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[#ededed]">Deliverability trends</h3>
          <p className="text-xs text-[#737373]">Delivered, bounce, and complaint rates per week (%).</p>
        </div>
        <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[280px] w-full">
          <LineChart data={TRENDS} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} stroke="#737373" />
            <YAxis tickLine={false} axisLine={false} width={40} stroke="#737373" tickFormatter={(v) => `${v}%`} />
            <ChartTooltip cursor={{ stroke: "#333333" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#a3a3a3" }} />
            <Line dataKey="delivered" type="natural" stroke="var(--color-delivered)" strokeWidth={2} dot={{ fill: "var(--color-delivered)", r: 3 }} activeDot={{ r: 5 }} />
            <Line dataKey="bounced" type="natural" stroke="var(--color-bounced)" strokeWidth={2} dot={{ fill: "var(--color-bounced)", r: 3 }} activeDot={{ r: 5 }} />
            <Line dataKey="complaint" type="natural" stroke="var(--color-complaint)" strokeWidth={2} dot={{ fill: "var(--color-complaint)", r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ChartContainer>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Domain</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Bounce</TableHead>
              <TableHead className="text-right">Complaint</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DOMAINS.map((d) => (
              <TableRow key={d.domain} className="border-[#2a2a2a]">
                <TableCell className="font-mono text-xs text-[#a3a3a3]">{d.domain}</TableCell>
                <TableCell className="text-right tabular-nums text-[#a3a3a3]">{d.sent.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums font-medium text-emerald-400">{d.delivered}%</TableCell>
                <TableCell className={`text-right tabular-nums ${d.bounce >= 5 ? "text-red-400" : "text-amber-400"}`}>{d.bounce}%</TableCell>
                <TableCell className="text-right tabular-nums text-[#a3a3a3]">{d.complaint}%</TableCell>
                <TableCell><Pill tone={d.tone}>{d.status}</Pill></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
    </MainScreenWrapper>
  );
}

export default DeliverabilityReportsScreen;
