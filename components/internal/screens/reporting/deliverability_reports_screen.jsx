"use client";

import React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  ScreenHeader,
  SectionCard,
  DataTable,
  Badge,
  cn,
} from "@geiger/ui";

const SERIES = ["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)", "var(--chart-series-5)"];
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";
const AXIS_STROKE = "var(--muted-foreground)";

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
  { domain: "mail.halcyon.studio", sent: 142800, delivered: 97.8, bounce: 1.9, complaint: 0.03, status: "Healthy", tone: "success" },
  { domain: "send.halcyon.studio", sent: 86400, delivered: 96.2, bounce: 3.1, complaint: 0.08, status: "Healthy", tone: "success" },
  { domain: "news.halcyon.studio", sent: 41200, delivered: 93.4, bounce: 5.8, complaint: 0.14, status: "At risk", tone: "warning" },
  { domain: "promo.halcyon.studio", sent: 19600, delivered: 89.1, bounce: 9.2, complaint: 0.31, status: "Throttled", tone: "danger" },
];

const COLUMNS = [
  { key: "domain", header: "Domain", className: "font-mono text-xs text-muted-foreground" },
  {
    key: "sent",
    header: "Sent",
    align: "right",
    className: "tabular-nums text-muted-foreground",
    render: (d) => d.sent.toLocaleString(),
  },
  {
    key: "delivered",
    header: "Delivered",
    align: "right",
    className: "tabular-nums font-medium text-emerald-600 dark:text-emerald-400",
    render: (d) => `${d.delivered}%`,
  },
  {
    key: "bounce",
    header: "Bounce",
    align: "right",
    render: (d) => (
      <span className={cn("tabular-nums", d.bounce >= 5 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
        {d.bounce}%
      </span>
    ),
  },
  {
    key: "complaint",
    header: "Complaint",
    align: "right",
    className: "tabular-nums text-muted-foreground",
    render: (d) => `${d.complaint}%`,
  },
  { key: "status", header: "Status", render: (d) => <Badge variant={d.tone}>{d.status}</Badge> },
];

export function DeliverabilityReportsScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Deliverability Reports"
        description="Delivery, bounce, and complaint trends across your sends."
      />

      <SectionCard
        title="Deliverability trends"
        description="Delivered, bounce, and complaint rates per week (%)."
        bodyPadding={false}
      >
        <div className="px-3 pb-3 pt-4">
          <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[280px] w-full">
            <LineChart data={TRENDS} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
              <YAxis tickLine={false} axisLine={false} width={40} stroke={AXIS_STROKE} tickFormatter={(v) => `${v}%`} />
              <ChartTooltip cursor={{ stroke: "var(--chart-cursor)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
              <ChartLegend content={<ChartLegendContent className="text-muted-foreground" />} />
              <Line dataKey="delivered" type="natural" stroke="var(--color-delivered)" strokeWidth={2} dot={{ fill: "var(--color-delivered)", r: 3 }} activeDot={{ r: 5 }} />
              <Line dataKey="bounced" type="natural" stroke="var(--color-bounced)" strokeWidth={2} dot={{ fill: "var(--color-bounced)", r: 3 }} activeDot={{ r: 5 }} />
              <Line dataKey="complaint" type="natural" stroke="var(--color-complaint)" strokeWidth={2} dot={{ fill: "var(--color-complaint)", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ChartContainer>
        </div>
      </SectionCard>

      <DataTable columns={COLUMNS} data={DOMAINS} getRowKey={(d) => d.domain} />
    </MainScreenWrapper>
  );
}

export default DeliverabilityReportsScreen;
