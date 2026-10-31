"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Link2, Trophy } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Badge,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DataTable,
  EmptyState,
  LoadingArea,
  SectionCard,
  StatGrid,
} from "@geiger/ui";
import { pickLeader, variantRates } from "@/lib/campaigns/ab";
import { getCampaignReport } from "@/lib/campaigns/api";
import { formatNumber, formatRate, rate } from "../constants";

const money = (n) => (Number(n) ? `$${Math.round(Number(n)).toLocaleString("en-US")}` : "—");

export function useCampaignReport(projectId, campaignId, version) {
  const [state, setState] = useState({ key: null, report: null, error: null });
  const key = `${projectId}:${campaignId}:${version}`;
  useEffect(() => {
    if (!projectId || !campaignId) return undefined;
    let alive = true;
    getCampaignReport(projectId, campaignId).then((res) => {
      if (alive) setState({ key, report: res.ok ? res.data : null, error: res.ok ? null : res.error });
    });
    return () => {
      alive = false;
    };
  }, [projectId, campaignId, key]);
  return { loading: state.key !== key, report: state.report, error: state.error };
}

export function reportStats(metrics = {}) {
  const delivered = Number(metrics.delivered) || 0;
  const base = delivered || Number(metrics.recipients) || 0;
  const uniqueOpens = metrics.uniqueOpens ?? metrics.opens;
  const uniqueClicks = metrics.uniqueClicks ?? metrics.clicks;
  return [
    { label: "Recipients", value: formatNumber(metrics.recipients) },
    { label: "Delivered", value: formatNumber(delivered), hint: base ? `${formatRate(rate(delivered, metrics.recipients))} of recipients` : undefined },
    { label: "Open rate", value: formatRate(rate(uniqueOpens, base)), hint: `${formatNumber(uniqueOpens)} opened` },
    { label: "Click rate", value: formatRate(rate(uniqueClicks, base)), hint: `${formatNumber(uniqueClicks)} clicked` },
    { label: "Bounces", value: formatNumber(metrics.bounces), hint: formatRate(rate(metrics.bounces, metrics.recipients)) },
    { label: "Unsubscribes", value: formatNumber(metrics.unsubscribes), hint: formatRate(rate(metrics.unsubscribes, base)) },
    { label: "Conversions", value: formatNumber(metrics.conversions), hint: formatRate(rate(metrics.conversions, base)) },
    { label: "Revenue", value: money(metrics.revenue), hint: "Attributed to this campaign" },
  ];
}

function TimelineChart({ timeline }) {
  const data = useMemo(
    () =>
      (timeline || []).map((t) => ({
        label: new Date(t.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" }),
        opens: Number(t.opens) || 0,
        clicks: Number(t.clicks) || 0,
      })),
    [timeline],
  );
  if (!data.length) return <p className="text-sm text-text-secondary">No opens or clicks recorded yet.</p>;
  return (
    <ChartContainer
      config={{ opens: { label: "Opens", color: "var(--foreground)" }, clicks: { label: "Clicks", color: "var(--text-tertiary)" } }}
      className="h-56 w-full"
    >
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Area dataKey="opens" type="monotone" stroke="var(--foreground)" fill="var(--foreground)" fillOpacity={0.08} strokeWidth={2} />
        <Area dataKey="clicks" type="monotone" stroke="var(--text-tertiary)" fill="var(--text-tertiary)" fillOpacity={0.08} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}

// Per-variant performance with the leader on the winner metric.
export function VariantTable({ variants, metric = "opens", winner, className }) {
  const leader = pickLeader(variants, metric);
  const columns = [
    {
      key: "key",
      header: "Variant",
      render: (v) => (
        <span className="inline-flex items-center gap-2 font-medium text-foreground">
          {v.key}
          {winner === v.key ? (
            <Badge variant="success"><Trophy className="h-3 w-3" /> Winner</Badge>
          ) : !winner && leader?.key === v.key && !leader.tied ? (
            <Badge variant="warning">Leading</Badge>
          ) : null}
        </span>
      ),
    },
    { key: "sent", header: "Sent", align: "right", className: "tabular-nums text-muted-foreground", render: (v) => formatNumber(v.sent) },
    { key: "opens", header: "Open rate", align: "right", className: "tabular-nums text-muted-foreground", render: (v) => formatRate(variantRates(v).openRate) },
    { key: "clicks", header: "Click rate", align: "right", className: "tabular-nums text-muted-foreground", render: (v) => formatRate(variantRates(v).clickRate) },
    { key: "conversions", header: "Conversion rate", align: "right", className: "tabular-nums text-muted-foreground", render: (v) => formatRate(variantRates(v).conversionRate) },
  ];
  return <DataTable className={className} columns={columns} data={variants || []} getRowKey={(v) => v.key} />;
}

export function ResultsSection({ projectId, campaign }) {
  const { loading, report, error } = useCampaignReport(projectId, campaign.id, campaign.updatedAt);

  if (loading) return <LoadingArea size={48} label="Loading the report" panel />;
  if (!report) {
    return (
      <div className="space-y-4">
        <StatGrid stats={reportStats(campaign.metrics)} columns={4} />
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={BarChart3} title="Detailed report unavailable" description={`Showing the cached totals. ${error || ""}`.trim()} />
        </div>
      </div>
    );
  }

  const links = [...(report.links || [])].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  return (
    <div className="space-y-4">
      <StatGrid stats={reportStats(report.metrics || campaign.metrics)} columns={4} />
      <SectionCard title="Opens and clicks over time">
        <TimelineChart timeline={report.timeline} />
      </SectionCard>
      {report.variants?.length ? (
        <SectionCard title="Variants" description="Rates are per recipient sent that variant." bodyPadding={false}>
          <VariantTable className="rounded-none border-0" variants={report.variants} metric={campaign.ab?.winnerMetric} winner={campaign.ab?.winner} />
        </SectionCard>
      ) : null}
      <SectionCard title="Links" bodyPadding={false}>
        {links.length ? (
          <DataTable
            className="rounded-none border-0"
            columns={[
              { key: "url", header: "URL", render: (l) => <span className="line-clamp-1 break-all text-sm text-foreground">{l.url}</span> },
              { key: "clicks", header: "Clicks", align: "right", className: "tabular-nums text-muted-foreground", render: (l) => formatNumber(l.clicks) },
              { key: "unique", header: "Unique", align: "right", className: "tabular-nums text-muted-foreground", render: (l) => formatNumber(l.uniqueClicks) },
            ]}
            data={links}
            getRowKey={(l) => l.url}
          />
        ) : (
          <EmptyState icon={Link2} title="No link clicks yet" description="Clicks on tracked links appear here." />
        )}
      </SectionCard>
    </div>
  );
}

export default ResultsSection;
