"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, MailCheck } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Badge,
  DataTable,
  EmptyState,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  StatsBar,
  Toolbar,
  cn,
} from "@geiger/ui";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { byRecipientDomain, cohortRateSeries, deliveriesInWindow, groupBy, summarize } from "@/lib/reporting/aggregate";
import { formatNumber, formatPercent } from "@/lib/reporting/format";
import { channelLabel } from "@/lib/reporting/query";
import { DEFAULT_RANGE, rangeLabel, resolveRange } from "@/lib/reporting/ranges";
import { exportCsv } from "./report_export";
import { ExportButton, RangeSelect, ReportFailed, ReportLoading, TrendChart, TruncatedNote, deltaStat } from "./report_ui";
import { useReportSources } from "./use_report_sources";

// Industry guardrails: mailbox providers start filtering above these.
const BOUNCE_LIMIT = 0.02;
const COMPLAINT_LIMIT = 0.001;
const MIN_VOLUME = 20;

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "all", label: "All channels" },
];

const TREND_METRICS = [
  { value: "bounceRate", label: "Bounce", limit: BOUNCE_LIMIT },
  { value: "complaintRate", label: "Complaint", limit: COMPLAINT_LIMIT },
  { value: "unsubscribeRate", label: "Unsubscribe" },
  { value: "failureRate", label: "Failed" },
];

const HEALTH = {
  healthy: { label: "Healthy", variant: "success" },
  watch: { label: "Watch", variant: "warning" },
  risk: { label: "At risk", variant: "danger" },
  low: { label: "Low volume", variant: "neutral" },
};

function health(row) {
  if (row.sends < MIN_VOLUME) return "low";
  if ((row.bounceRate ?? 0) > BOUNCE_LIMIT || (row.complaintRate ?? 0) > COMPLAINT_LIMIT) return "risk";
  if ((row.bounceRate ?? 0) > BOUNCE_LIMIT / 2 || (row.complaintRate ?? 0) > COMPLAINT_LIMIT / 2) return "watch";
  return "healthy";
}

function RateCell({ value, limit }) {
  const over = limit != null && (value ?? 0) > limit;
  const near = limit != null && !over && (value ?? 0) > limit / 2;
  return (
    <span className={cn("tabular-nums", over ? "font-medium text-red-600 dark:text-red-400" : near ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
      {formatPercent(value)}
    </span>
  );
}

const rateColumns = [
  { key: "sends", header: "Sent", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => formatNumber(r.sends) },
  { key: "deliveryRate", header: "Delivered", align: "right", className: "tabular-nums text-foreground", render: (r) => formatPercent(r.deliveryRate) },
  { key: "bounceRate", header: "Bounce", align: "right", render: (r) => <RateCell value={r.bounceRate} limit={BOUNCE_LIMIT} /> },
  { key: "complaintRate", header: "Complaint", align: "right", render: (r) => <RateCell value={r.complaintRate} limit={COMPLAINT_LIMIT} /> },
  { key: "unsubscribeRate", header: "Unsubscribe", align: "right", render: (r) => <RateCell value={r.unsubscribeRate} /> },
  { key: "status", header: "Status", render: (r) => <Badge variant={HEALTH[health(r)].variant}>{HEALTH[health(r)].label}</Badge> },
];

const domainColumns = [
  { key: "domain", header: "Recipient domain", className: "font-mono text-xs text-foreground", render: (r) => r.domain },
  { key: "provider", header: "Provider", className: "text-muted-foreground", render: (r) => r.provider },
  ...rateColumns,
];

const campaignColumns = [
  {
    key: "name",
    header: "Campaign",
    render: (r) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{r.name}</span>
        <span className="text-xs text-text-secondary">{r.meta}</span>
      </div>
    ),
  },
  ...rateColumns,
];

export function DeliverabilityReportsScreen() {
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [channel, setChannel] = useState("email");
  const [trend, setTrend] = useState("bounceRate");
  const { loading, failed, truncated, sources, loadedAt, reload } = useReportSources({ range, include: ["campaigns", "deliveries"] });

  const model = useMemo(() => {
    if (!sources || !loadedAt) return null;
    const r = resolveRange(range, loadedAt);
    const scope = channel === "all" ? {} : { channels: [channel] };
    const inRange = deliveriesInWindow(sources.deliveries, r.start, r.end, scope);
    const now = summarize(inRange);
    const prev = summarize(deliveriesInWindow(sources.deliveries, r.prevStart, r.prevEnd, scope));
    const campaignsById = new Map(sources.campaigns.map((c) => [c.id, c]));
    const campaigns = [...groupBy(inRange.filter((d) => d.campaignId), (d) => d.campaignId).entries()]
      .map(([id, rows]) => {
        const c = campaignsById.get(id);
        return { id, name: c?.name || "Deleted campaign", meta: channelLabel(c?.channel || rows[0]?.channel), ...summarize(rows) };
      })
      .filter((x) => x.sends > 0)
      .sort((a, b) => (b.bounceRate ?? 0) / BOUNCE_LIMIT + (b.complaintRate ?? 0) / COMPLAINT_LIMIT - ((a.bounceRate ?? 0) / BOUNCE_LIMIT + (a.complaintRate ?? 0) / COMPLAINT_LIMIT))
      .slice(0, 10);

    const warnings = [];
    if (now.sends >= MIN_VOLUME && (now.bounceRate ?? 0) > BOUNCE_LIMIT) {
      warnings.push(`Bounce rate is ${formatPercent(now.bounceRate)} — above the 2% limit. Clean the lists with the most hard bounces and verify new addresses before sending.`);
    }
    if (now.delivered >= MIN_VOLUME && (now.complaintRate ?? 0) > COMPLAINT_LIMIT) {
      warnings.push(`Complaint rate is ${formatPercent(now.complaintRate)} — above the 0.1% limit Gmail and Yahoo enforce. Send less often to unengaged contacts and make unsubscribing obvious.`);
    }
    return {
      now,
      warnings,
      stats: [
        deltaStat({ label: "Delivery rate", value: now.deliveryRate, previous: prev.deliveryRate, format: "percent", rate: true, range }),
        deltaStat({ label: "Bounce rate", value: now.bounceRate, previous: prev.bounceRate, format: "percent", rate: true, inverse: true, range }),
        deltaStat({ label: "Complaint rate", value: now.complaintRate, previous: prev.complaintRate, format: "percent", rate: true, inverse: true, range }),
        deltaStat({ label: "Unsubscribe rate", value: now.unsubscribeRate, previous: prev.unsubscribeRate, format: "percent", rate: true, inverse: true, range }),
      ],
      series: cohortRateSeries(deliveriesInWindow(sources.deliveries, r.start, r.end, scope), r),
      domains: byRecipientDomain(inRange).slice(0, 25),
      campaigns,
      failed: now.failed,
    };
  }, [sources, loadedAt, range, channel]);

  const trendMeta = TREND_METRICS.find((m) => m.value === trend);

  const exportDomains = () =>
    exportCsv(
      "deliverability-by-domain.csv",
      model.domains.map((d) => ({
        ...d,
        deliveryRate: formatPercent(d.deliveryRate),
        bounceRate: formatPercent(d.bounceRate),
        complaintRate: formatPercent(d.complaintRate),
        unsubscribeRate: formatPercent(d.unsubscribeRate),
        status: HEALTH[health(d)].label,
      })),
      [
        { key: "domain", header: "Domain" },
        { key: "provider", header: "Provider" },
        { key: "sends", header: "Sent" },
        { key: "deliveryRate", header: "Delivered" },
        { key: "bounceRate", header: "Bounce" },
        { key: "complaintRate", header: "Complaint" },
        { key: "unsubscribeRate", header: "Unsubscribe" },
        { key: "status", header: "Status" },
      ],
    );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Deliverability Reports"
        description="Bounce, complaint, unsubscribe and failure trends across your sends."
        actions={model?.domains.length ? <ExportButton onClick={exportDomains} label="Export domains" /> : null}
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={channel} onValueChange={setChannel} options={CHANNEL_OPTIONS} height="h-9" />
          <RangeSelect value={range} onChange={setRange} />
        </div>
      </Toolbar>

      {failed && !loading ? <ReportFailed onRetry={reload} /> : null}

      {!model ? (
        <ReportLoading label="Loading deliverability" size={72} />
      ) : (
        <>
          {model.warnings.length ? (
            <div className="space-y-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3" role="alert">
              {model.warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          ) : null}

          <StatsBar stats={model.stats} columns={4} />
          <TruncatedNote show={truncated} />

          {model.now.sends === 0 && model.failed === 0 ? (
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState icon={MailCheck} title={`No sends in the ${rangeLabel(range).toLowerCase()}`} description="Deliverability trends appear once messages go out." />
            </div>
          ) : (
            <>
              <SectionCard
                title="Rates over time"
                description={`${trendMeta.label} rate of messages sent in each period${trendMeta.limit ? `; dashed line marks the ${formatPercent(trendMeta.limit)} limit` : ""}.`}
                action={<SegmentedTabs tabs={TREND_METRICS.map((m) => ({ label: m.label, value: m.value }))} value={trend} onChange={setTrend} buttonClassName="h-7 px-2.5 text-xs" />}
                bodyPadding={false}
              >
                <div className="px-3 pb-3 pt-4">
                  <TrendChart
                    data={model.series}
                    series={[{ key: trend, label: `${trendMeta.label} rate` }]}
                    format="percent"
                    height={260}
                    references={trendMeta.limit ? [{ value: trendMeta.limit, label: `${formatPercent(trendMeta.limit)} limit` }] : []}
                    emptyMessage={`No ${trendMeta.label.toLowerCase()}s in this period.`}
                  />
                </div>
              </SectionCard>

              <SectionCard bare title="By recipient domain" description="Email outcomes by the domain of the recipient address, busiest first.">
                <DataTable
                  columns={domainColumns}
                  data={model.domains}
                  getRowKey={(d) => d.domain}
                  empty={<div className="rounded-xl border border-border bg-surface-subtle"><EmptyState title="No email in this period" description="Domain breakdowns cover email only." /></div>}
                />
              </SectionCard>

              <SectionCard bare title="Campaigns to review" description="Campaigns sent in this period with the highest bounce and complaint rates.">
                <DataTable
                  columns={campaignColumns}
                  data={model.campaigns}
                  getRowKey={(c) => c.id}
                  empty={<div className="rounded-xl border border-border bg-surface-subtle"><EmptyState title="No campaign sends in this period" description="Automation and transactional messages are included in the totals above." /></div>}
                />
              </SectionCard>
            </>
          )}
        </>
      )}
    </MainScreenWrapper>
  );
}

export default DeliverabilityReportsScreen;
