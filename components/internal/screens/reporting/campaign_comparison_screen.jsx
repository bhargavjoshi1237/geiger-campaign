"use client";

import React, { useMemo, useState } from "react";
import { Columns2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { useCan } from "@/context/rbac-context";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  Toolbar,
  cn,
} from "@geiger/ui";
import { campaignRollup, deliveryFlags, groupBy, sendTime } from "@/lib/reporting/aggregate";
import { formatCurrency, formatDateTime, formatMetric, formatNumber } from "@/lib/reporting/format";
import { explainCampaign } from "@/lib/reporting/insights";
import { channelLabel, creditsByCampaign, prepareSources } from "@/lib/reporting/query";
import { toTime } from "@/lib/reporting/ranges";
import { exportCsv } from "./report_export";
import { CampaignPicker } from "./campaign_picker";
import { InsightPanel } from "./insight_panel";
import { ExportButton, GroupedBars, ReportFailed, ReportLoading, TrendChart, TruncatedNote } from "./report_ui";
import { useReportSources } from "./use_report_sources";

const STORAGE_KEY = "geiger-campaign:comparison";
const MAX = 4;

const TIMELINE_WINDOWS = [
  { value: "72", label: "First 72 hours", hours: 72, step: 3 },
  { value: "168", label: "First 7 days", hours: 168, step: 6 },
];

const ROWS = [
  { key: "sentAt", label: "Sent", format: "date" },
  { key: "channel", label: "Channel", format: "channel" },
  { key: "delivered", label: "Delivered", format: "number", better: "high" },
  { key: "openRate", label: "Open rate", format: "percent", better: "high" },
  { key: "clickRate", label: "Click rate", format: "percent", better: "high" },
  { key: "ctor", label: "Click-to-open rate", format: "percent", better: "high" },
  { key: "conversions", label: "Attributed conversions", format: "number", better: "high" },
  { key: "conversionRate", label: "Conversion rate", format: "percent", better: "high" },
  { key: "revenue", label: "Attributed revenue", format: "currency", better: "high" },
  { key: "revenuePerRecipient", label: "Revenue per recipient", format: "currency", better: "high" },
  { key: "unsubscribeRate", label: "Unsubscribe rate", format: "percent", better: "low" },
  { key: "bounceRate", label: "Bounce rate", format: "percent", better: "low" },
  { key: "complaintRate", label: "Complaint rate", format: "percent", better: "low" },
];

function readStored(projectId) {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${projectId}`);
    const ids = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) ? ids : null;
  } catch {
    return null;
  }
}

function writeStored(projectId, ids) {
  try {
    window.localStorage.setItem(`${STORAGE_KEY}:${projectId}`, JSON.stringify(ids));
  } catch {
    // per-viewer convenience only
  }
}

// Cumulative share of delivered recipients who opened/clicked, by hours since the send.
function timeline(own, kind, { hours, step }) {
  const delivered = own.filter((x) => deliveryFlags(x).delivered);
  const offsets = [];
  for (const x of delivered) {
    const f = deliveryFlags(x);
    if (kind === "clicks" ? !f.clicked : !f.opened) continue;
    const at = kind === "clicks" ? x.clickedAt || x.openedAt : x.openedAt || x.clickedAt;
    const h = (toTime(at) - toTime(sendTime(x))) / 3600000;
    if (Number.isFinite(h)) offsets.push(Math.max(0, h));
  }
  offsets.sort((a, b) => a - b);
  const points = [];
  let i = 0;
  for (let h = 0; h <= hours; h += step) {
    while (i < offsets.length && offsets[i] <= h) i += 1;
    points.push({ h, share: delivered.length ? i / delivered.length : 0 });
  }
  return points;
}

const hoursLabel = (h) => (h === 0 ? "Send" : h % 24 === 0 ? `${h / 24}d` : `${h}h`);

function cell(row, rollup, campaign, currency) {
  if (row.format === "date") return campaign.sentAt ? formatDateTime(campaign.sentAt) : "—";
  if (row.format === "channel") return channelLabel(campaign.channel);
  if (row.format === "currency") return rollup[row.key] ? formatCurrency(rollup[row.key], currency, { cents: row.key === "revenuePerRecipient" }) : "—";
  return formatMetric(rollup[row.key], row.format === "percent" ? "percent" : "number");
}

export function CampaignComparisonScreen() {
  const canUseAi = useCan("campaign.ai.use");
  const [selection, setSelection] = useState(null);
  const [focus, setFocus] = useState(null);
  const [kind, setKind] = useState("opens");
  const [windowKey, setWindowKey] = useState("72");
  const { loading, failed, truncated, sources, reload, projectId } = useReportSources({
    range: "180d",
    include: ["campaigns", "deliveries", "events"],
  });

  const base = useMemo(() => {
    if (!sources) return null;
    const p = prepareSources(sources);
    const byCampaign = groupBy(p.deliveries, (x) => x.campaignId);
    const credits = creditsByCampaign(p);
    const sent = p.campaigns
      .filter((c) => c.status === "sent" || byCampaign.has(c.id))
      .sort((a, b) => (toTime(b.sentAt) || 0) - (toTime(a.sentAt) || 0));
    const rollups = new Map(sent.map((c) => [c.id, campaignRollup(c, byCampaign.get(c.id) || [], credits.get(c.id) || { conversions: 0, revenue: 0 })]));
    return { p, byCampaign, credits, sent, rollups };
  }, [sources]);

  const stored = useMemo(() => (projectId && typeof window !== "undefined" ? readStored(projectId) : null), [projectId]);
  const selected = useMemo(() => {
    if (!base) return [];
    const valid = (ids) => (ids || []).filter((id) => base.rollups.has(id)).slice(0, MAX);
    const chosen = valid(selection ?? stored);
    return chosen.length ? chosen : base.sent.slice(0, 3).map((c) => c.id);
  }, [base, selection, stored]);

  const choose = (ids) => {
    setSelection(ids);
    if (projectId) writeStored(projectId, ids);
  };

  const compared = useMemo(
    () => (base ? selected.map((id) => ({ campaign: base.p.campaignsById.get(id), rollup: base.rollups.get(id) })).filter((x) => x.campaign) : []),
    [base, selected],
  );

  const focusId = focus && selected.includes(focus)
    ? focus
    : [...compared].sort((a, b) => (b.rollup.clickRate ?? -1) - (a.rollup.clickRate ?? -1))[0]?.campaign.id || null;

  const analysis = useMemo(
    () => (base && focusId ? explainCampaign(focusId, { campaigns: base.p.campaigns, deliveries: base.p.deliveries, attributedByCampaign: base.credits }) : null),
    [base, focusId],
  );

  const currency = base?.p.currency.currency || "USD";
  const seriesKeys = compared.map((x, i) => ({ key: `c${i}`, label: x.campaign.name, id: x.campaign.id }));

  const best = useMemo(() => {
    const out = {};
    for (const row of ROWS) {
      if (!row.better) continue;
      const values = compared.map((x) => x.rollup[row.key]).filter((v) => v != null && Number.isFinite(v));
      if (values.length < 2) continue;
      out[row.key] = row.better === "high" ? Math.max(...values) : Math.min(...values);
    }
    return out;
  }, [compared]);

  const columns = [
    { key: "metric", header: "Metric", className: "font-medium text-foreground", render: (r) => r.label },
    ...compared.map(({ campaign, rollup }) => ({
      key: campaign.id,
      header: <span className="block max-w-[180px] truncate" title={campaign.name}>{campaign.name}</span>,
      align: "right",
      render: (r) => {
        const v = rollup[r.key];
        const isBest = best[r.key] != null && v === best[r.key] && compared.length > 1;
        return <span className={cn("tabular-nums", isBest ? "font-semibold text-foreground" : "text-muted-foreground")}>{cell(r, rollup, campaign, currency)}</span>;
      },
    })),
  ];

  const rateChart = useMemo(() => {
    const metrics = [
      ["openRate", "Open rate"],
      ["clickRate", "Click rate"],
      ["ctor", "Click-to-open"],
      ["conversionRate", "Conversion rate"],
    ];
    return metrics.map(([key, label]) => ({
      label,
      ...Object.fromEntries(compared.map((x, i) => [`c${i}`, x.rollup[key] ?? 0])),
    }));
  }, [compared]);

  const timelineData = useMemo(() => {
    if (!base) return [];
    const win = TIMELINE_WINDOWS.find((x) => x.value === windowKey);
    const lines = compared.map((x) => timeline(base.byCampaign.get(x.campaign.id) || [], kind, win));
    return (lines[0] || []).map((pt, j) => ({
      label: hoursLabel(pt.h),
      ...Object.fromEntries(lines.map((line, i) => [`c${i}`, line[j]?.share ?? 0])),
    }));
  }, [base, compared, kind, windowKey]);

  const exportComparison = () => {
    const rows = ROWS.map((r) => ({
      metric: r.label,
      ...Object.fromEntries(compared.map(({ campaign, rollup }) => [campaign.id, cell(r, rollup, campaign, currency)])),
    }));
    exportCsv("campaign-comparison.csv", rows, [{ key: "metric", header: "Metric" }, ...compared.map(({ campaign }) => ({ key: campaign.id, header: campaign.name }))]);
  };

  const header = (
    <ScreenHeader
      title="Campaign Comparison"
      description="Put campaigns side by side to see what worked — and why."
      actions={compared.length ? <ExportButton onClick={exportComparison} /> : null}
    />
  );

  if (!base) {
    return (
      <MainScreenWrapper>
        {header}
        {failed && !loading ? <ReportFailed onRetry={reload} /> : <ReportLoading label="Loading campaigns" size={72} />}
      </MainScreenWrapper>
    );
  }

  if (!base.sent.length) {
    return (
      <MainScreenWrapper>
        {header}
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Columns2} title="No sent campaigns yet" description="Once campaigns have gone out, compare their results here." />
        </div>
      </MainScreenWrapper>
    );
  }

  return (
    <MainScreenWrapper>
      {header}

      <Toolbar>
        <CampaignPicker campaigns={base.sent} value={selected} onChange={choose} max={MAX} />
      </Toolbar>

      {failed && !loading ? <ReportFailed onRetry={reload} /> : null}
      <TruncatedNote show={truncated} />

      {compared.length ? (
        <>
          <DataTable columns={columns} data={ROWS} getRowKey={(r) => r.key} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard title="Normalized rates" description="Rates per delivered message, so sends of different sizes compare fairly." bodyPadding={false}>
              <div className="px-3 pb-3 pt-4">
                <GroupedBars data={rateChart} series={seriesKeys} format="percent" />
              </div>
            </SectionCard>

            <SectionCard
              title="Engagement timeline"
              description={`Share of delivered recipients who had ${kind === "opens" ? "opened" : "clicked"}, by time since send.`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedTabs
                    tabs={[{ label: "Opens", value: "opens" }, { label: "Clicks", value: "clicks" }]}
                    value={kind}
                    onChange={setKind}
                    buttonClassName="h-7 px-2.5 text-xs"
                  />
                  <SegmentedTabs
                    tabs={TIMELINE_WINDOWS.map((x) => ({ label: x.value === "72" ? "72h" : "7d", value: x.value }))}
                    value={windowKey}
                    onChange={setWindowKey}
                    buttonClassName="h-7 px-2.5 text-xs"
                  />
                </div>
              }
              bodyPadding={false}
            >
              <div className="px-3 pb-3 pt-4">
                <TrendChart data={timelineData} series={seriesKeys} format="percent" emptyMessage={`No ${kind} recorded for these campaigns yet.`} />
              </div>
            </SectionCard>
          </div>

          <InsightPanel
            key={focusId || "none"}
            analysis={analysis}
            campaign={focusId ? base.p.campaignsById.get(focusId) : null}
            options={compared.map((x) => x.campaign)}
            focusId={focusId}
            onFocus={setFocus}
            projectId={projectId}
            canUseAi={canUseAi}
          />

          <p className="text-xs text-text-tertiary">
            {formatNumber(compared.reduce((s, x) => s + x.rollup.delivered, 0))} delivered messages compared. Revenue uses last-click attribution with a 7-day window; see Attribution to change the model. Best value per row is in bold.{" "}
            {compared.some((x) => x.rollup.source === "cached") ? "Some campaigns predate the loaded send log and use their cached totals." : ""}
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Columns2} title="Choose campaigns to compare" description={`Pick between two and ${MAX} sent campaigns.`} />
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default CampaignComparisonScreen;
