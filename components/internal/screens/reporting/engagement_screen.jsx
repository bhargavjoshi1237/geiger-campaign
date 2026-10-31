"use client";

import React, { useMemo, useState } from "react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  StatsBar,
  Toolbar,
} from "@geiger/ui";
import { Link2, Users } from "lucide-react";
import {
  byProvider,
  deliveriesInWindow,
  deliverySeries,
  engagementMix,
  hourWeekdayMatrix,
  summarize,
  topLinks,
} from "@/lib/reporting/aggregate";
import { formatNumber, formatPercent, hourLabel } from "@/lib/reporting/format";
import { DEFAULT_RANGE, WEEKDAYS, rangeDays, resolveRange } from "@/lib/reporting/ranges";
import { exportCsv } from "./report_export";
import { ExportButton, RangeSelect, ReportFailed, ReportLoading, ShareBar, TrendChart, TruncatedNote, deltaStat } from "./report_ui";
import { useReportSources } from "./use_report_sources";

const MIX = [
  { key: "engaged", label: "Engaged", hint: "Opened or clicked in the last 30 days", tone: "bg-foreground" },
  { key: "lapsing", label: "Lapsing", hint: "Last engaged 31–90 days ago", tone: "bg-foreground/60" },
  { key: "unengaged", label: "Unengaged", hint: "Received messages in 90 days, never engaged", tone: "bg-foreground/30" },
  { key: "unreached", label: "Not reached", hint: "No messages in the last 90 days", tone: "bg-foreground/10" },
];

function Heatmap({ data, kind }) {
  const { matrix, max, total } = data;
  let peak = { d: 0, h: 0, v: 0 };
  matrix.forEach((row, d) => row.forEach((v, h) => v > peak.v && (peak = { d, h, v })));
  if (!total) {
    return <p className="py-12 text-center text-sm text-text-secondary">No {kind} recorded in this period yet.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]" role="img" aria-label={`${kind} by weekday and hour; busiest ${WEEKDAYS[peak.d]} ${hourLabel(peak.h)}`}>
          <div className="grid grid-cols-[40px_repeat(24,minmax(0,1fr))] gap-[3px]">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center text-[10px] tabular-nums text-text-tertiary">
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
            {matrix.map((row, d) => (
              <React.Fragment key={WEEKDAYS[d]}>
                <span className="pr-2 text-right text-[11px] leading-6 text-text-secondary">{WEEKDAYS[d]}</span>
                {row.map((v, h) => (
                  <span
                    key={h}
                    title={`${WEEKDAYS[d]} ${hourLabel(h)} — ${formatNumber(v)} ${kind}`}
                    className="h-6 rounded-[3px] border border-border/60"
                    style={{
                      backgroundColor: v
                        ? `color-mix(in oklab, var(--chart-series-1) ${Math.round(12 + (v / max) * 78)}%, transparent)`
                        : "var(--surface-card)",
                    }}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-text-secondary">
        Busiest hour: <span className="font-medium text-foreground">{WEEKDAYS[peak.d]} {hourLabel(peak.h)}</span> ({formatNumber(peak.v)} {kind}). Times are in your local time zone.
      </p>
    </div>
  );
}

const providerColumns = [
  { key: "provider", header: "Mailbox provider", className: "font-medium text-foreground" },
  { key: "delivered", header: "Delivered", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => formatNumber(r.delivered) },
  { key: "openRate", header: "Open rate", align: "right", className: "tabular-nums text-foreground", render: (r) => formatPercent(r.openRate) },
  { key: "clickRate", header: "Click rate", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => formatPercent(r.clickRate) },
  { key: "ctor", header: "Click-to-open", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => formatPercent(r.ctor) },
];

const linkColumns = (totalClicks) => [
  { key: "url", header: "Link", className: "max-w-[360px] truncate font-mono text-xs text-muted-foreground", render: (l) => <span title={l.url}>{l.url}</span> },
  { key: "clicks", header: "Clicks", align: "right", className: "tabular-nums text-foreground", render: (l) => formatNumber(l.clicks) },
  { key: "unique", header: "Unique", align: "right", className: "tabular-nums text-muted-foreground", render: (l) => formatNumber(l.uniqueClicks) },
  { key: "campaigns", header: "Campaigns", align: "right", className: "tabular-nums text-muted-foreground", render: (l) => formatNumber(l.campaignIds.length) },
  {
    key: "share",
    header: "Share",
    render: (l) => (
      <div className="flex items-center gap-2">
        <ShareBar value={totalClicks ? l.clicks / totalClicks : 0} />
        <span className="w-12 text-xs tabular-nums text-muted-foreground">{formatPercent(totalClicks ? l.clicks / totalClicks : 0, 0)}</span>
      </div>
    ),
  },
];

export function EngagementScreen() {
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [heatKind, setHeatKind] = useState("opens");
  const lookbackDays = Math.max(0, 90 - 2 * rangeDays(range));
  const { loading, failed, truncated, sources, loadedAt, reload } = useReportSources({
    range,
    lookbackDays,
    include: ["deliveries", "events", "contacts"],
  });

  const model = useMemo(() => {
    if (!sources || !loadedAt) return null;
    const r = resolveRange(range, loadedAt);
    const inRange = deliveriesInWindow(sources.deliveries, r.start, r.end);
    const now = summarize(inRange);
    const prev = summarize(deliveriesInWindow(sources.deliveries, r.prevStart, r.prevEnd));
    const links = topLinks(sources.events, { start: r.start, end: r.end });
    return {
      range: r,
      stats: [
        deltaStat({ label: "Unique opens", value: now.opens, previous: prev.opens, range }),
        deltaStat({ label: "Unique clicks", value: now.clicks, previous: prev.clicks, range }),
        deltaStat({ label: "Open rate", value: now.openRate, previous: prev.openRate, format: "percent", rate: true, range }),
        deltaStat({ label: "Click-to-open rate", value: now.ctor, previous: prev.ctor, format: "percent", rate: true, range }),
      ],
      series: deliverySeries(sources.deliveries, r),
      heat: { opens: hourWeekdayMatrix(sources.deliveries, "opens", r), clicks: hourWeekdayMatrix(sources.deliveries, "clicks", r) },
      providers: byProvider(inRange).filter((x) => x.sends > 0),
      mix: engagementMix(sources.contacts, sources.deliveries, loadedAt),
      links: links.slice(0, 15),
      linkClicks: links.reduce((s, l) => s + l.clicks, 0),
    };
  }, [sources, loadedAt, range]);

  const exportLinks = () =>
    exportCsv("top-links.csv", model.links.map((l) => ({ ...l, campaigns: l.campaignIds.length })), [
      { key: "url", header: "Link" },
      { key: "clicks", header: "Clicks" },
      { key: "uniqueClicks", header: "Unique clicks" },
      { key: "campaigns", header: "Campaigns" },
    ]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Engagement"
        description="How recipients interact with your messages over time."
        actions={model?.links.length ? <ExportButton onClick={exportLinks} label="Export links" /> : null}
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <RangeSelect value={range} onChange={setRange} />
        </div>
      </Toolbar>

      {failed && !loading ? <ReportFailed onRetry={reload} /> : null}

      {!model ? (
        <ReportLoading label="Loading engagement" size={72} />
      ) : (
        <>
          <StatsBar stats={model.stats} columns={4} />
          <TruncatedNote show={truncated} />

          <SectionCard title="Opens & clicks over time" description="Unique opens and clicks by the day they happened." bodyPadding={false}>
            <div className="px-3 pb-3 pt-4">
              <TrendChart
                data={model.series}
                series={[
                  { key: "opens", label: "Opens" },
                  { key: "clicks", label: "Clicks" },
                ]}
                height={280}
                emptyMessage="No opens or clicks in this period."
              />
            </div>
          </SectionCard>

          <SectionCard
            title="When people engage"
            description="By weekday and hour of the interaction."
            action={
              <SegmentedTabs
                tabs={[{ label: "Opens", value: "opens" }, { label: "Clicks", value: "clicks" }]}
                value={heatKind}
                onChange={setHeatKind}
                buttonClassName="h-7 px-2.5 text-xs"
              />
            }
          >
            <Heatmap data={model.heat[heatKind]} kind={heatKind} />
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            <SectionCard bare title="By mailbox provider" description="Email engagement grouped by where recipients' inboxes live.">
              <DataTable
                columns={providerColumns}
                data={model.providers}
                getRowKey={(r) => r.provider}
                empty={<div className="rounded-xl border border-border bg-surface-subtle"><EmptyState title="No email delivered in this period" description="Provider breakdowns cover email sends only." /></div>}
              />
            </SectionCard>

            <SectionCard title="Audience engagement" description={`${formatNumber(model.mix.total)} subscribed contacts by their latest engagement.`}>
              {model.mix.total ? (
                <div className="space-y-4">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
                    {MIX.map((m) => (
                      <div key={m.key} className={m.tone} style={{ width: `${(model.mix[m.key] / model.mix.total) * 100}%` }} />
                    ))}
                  </div>
                  <div className="space-y-2.5">
                    {MIX.map((m) => (
                      <div key={m.key} className="flex items-start justify-between gap-3 text-sm">
                        <span className="flex items-start gap-2">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.tone}`} />
                          <span>
                            <span className="block text-foreground">{m.label}</span>
                            <span className="block text-xs text-text-tertiary">{m.hint}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className="block font-medium text-foreground">{formatNumber(model.mix[m.key])}</span>
                          <span className="block text-xs text-text-tertiary">{formatPercent(model.mix[m.key] / model.mix.total, 0)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState icon={Users} title="No subscribed contacts" description="Engagement buckets appear once you have an audience." className="py-8" />
              )}
            </SectionCard>
          </div>

          <SectionCard bare title="Most clicked links" description="Tracked link clicks from messages in this period, tracking parameters removed.">
            <DataTable
              columns={linkColumns(model.linkClicks)}
              data={model.links}
              getRowKey={(l) => l.url}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState icon={Link2} title="No tracked link clicks yet" description="Clicks on tracked links in your messages show up here with their destination." />
                </div>
              }
            />
          </SectionCard>
        </>
      )}
    </MainScreenWrapper>
  );
}

export default EngagementScreen;
