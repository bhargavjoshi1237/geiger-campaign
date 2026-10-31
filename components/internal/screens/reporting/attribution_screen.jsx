"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { ChevronDown, DollarSign } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import {
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Checkbox,
  DataTable,
  EmptyState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScreenHeader,
  SectionCard,
  StatsBar,
  Toolbar,
} from "@geiger/ui";
import { listEventNames } from "@/lib/supabase/report_sources";
import { campaignRollup, deliveriesInWindow, groupBy, summarize } from "@/lib/reporting/aggregate";
import {
  ATTRIBUTION_MODELS,
  DEFAULT_ATTRIBUTION,
  TOUCH_OPTIONS,
  WINDOW_OPTIONS,
  attributionTotals,
  bySource,
  creditsBy,
  normalizeAttribution,
} from "@/lib/reporting/attribution";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/reporting/format";
import { channelLabel, prepareSources } from "@/lib/reporting/query";
import { DEFAULT_RANGE, buildBuckets, bucketKey, inWindow, loadSince, resolveRange } from "@/lib/reporting/ranges";
import { exportCsv } from "./report_export";
import { ExportButton, RangeSelect, ReportFailed, ReportLoading, SERIES, ShareBar, TOOLTIP_CLASS, TrendChart, TruncatedNote, deltaStat } from "./report_ui";
import { useReportSources } from "./use_report_sources";

const STORAGE_KEY = "geiger-campaign:attribution";
const WINDOW_FILTER_OPTIONS = WINDOW_OPTIONS.map((d) => ({ value: String(d), label: `${d}-day window` }));

function readSettings(projectId) {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${projectId}`);
    return raw ? normalizeAttribution(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeSettings(projectId, cfg) {
  try {
    window.localStorage.setItem(`${STORAGE_KEY}:${projectId}`, JSON.stringify(cfg));
  } catch {
    // per-viewer convenience only
  }
}

function EventPicker({ options, value, includeRevenue, onChange, onIncludeRevenue }) {
  const selected = new Set(value);
  const toggle = (name) => onChange(selected.has(name) ? value.filter((n) => n !== name) : [...value, name]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 rounded-lg border-border bg-surface-card px-3 text-xs font-medium text-foreground hover:bg-surface-subtle">
          {value.length} conversion {value.length === 1 ? "event" : "events"}
          {includeRevenue ? " + revenue" : ""}
          <ChevronDown className="ml-2 h-3.5 w-3.5 text-text-secondary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 border-border bg-surface-subtle p-0">
        <p className="border-b border-border px-3 py-2 text-xs text-text-secondary">Events that count as a conversion.</p>
        <div className="max-h-64 overflow-y-auto p-1">
          {options.map((o) => (
            <label key={o.name} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-surface-hover">
              <Checkbox checked={selected.has(o.name)} onCheckedChange={() => toggle(o.name)} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{o.name}</span>
              {o.count ? <span className="text-xs tabular-nums text-text-tertiary">{formatNumber(o.count)}</span> : null}
            </label>
          ))}
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 border-t border-border px-3 py-2.5 text-sm">
          <Checkbox checked={includeRevenue} onCheckedChange={(v) => onIncludeRevenue(Boolean(v))} className="mt-0.5" />
          <span>
            <span className="block text-foreground">Any event with revenue</span>
            <span className="block text-xs text-text-secondary">Also count events that carry a revenue amount.</span>
          </span>
        </label>
      </PopoverContent>
    </Popover>
  );
}

export function AttributionScreen() {
  const { projectId } = useProject();
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [settings, setSettings] = useState(null);
  const [eventOptions, setEventOptions] = useState([]);
  const stored = useMemo(() => (projectId && typeof window !== "undefined" ? readSettings(projectId) : null), [projectId]);
  const cfg = useMemo(() => settings ?? stored ?? normalizeAttribution(DEFAULT_ATTRIBUTION), [settings, stored]);

  const update = (patch) => {
    const next = normalizeAttribution({ ...cfg, ...patch });
    setSettings(next);
    if (projectId) writeSettings(projectId, next);
  };

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listEventNames(projectId, { since: loadSince("90d") }).then((rows) => alive && setEventOptions(rows || []));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const { loading, failed, truncated, sources, loadedAt, reload } = useReportSources({
    range,
    lookbackDays: cfg.windowDays,
    include: ["campaigns", "deliveries", "events"],
    eventNames: cfg.events,
  });

  const options = useMemo(() => {
    const map = new Map(eventOptions.map((o) => [o.name, o]));
    for (const name of [...DEFAULT_ATTRIBUTION.events, ...cfg.events]) if (!map.has(name)) map.set(name, { name, count: 0 });
    return [...map.values()];
  }, [eventOptions, cfg.events]);

  const model = useMemo(() => {
    if (!sources || !loadedAt) return null;
    const p = prepareSources(sources, { attribution: cfg });
    const r = resolveRange(range, loadedAt);
    const rows = p.attributedRows.filter((x) => inWindow(x.at, r.start, r.end));
    const prevRows = p.attributedRows.filter((x) => inWindow(x.at, r.prevStart, r.prevEnd));
    const t = attributionTotals(rows);
    const tp = attributionTotals(prevRows);
    const delivered = summarize(deliveriesInWindow(p.deliveries, r.start, r.end)).delivered;
    const deliveredPrev = summarize(deliveriesInWindow(p.deliveries, r.prevStart, r.prevEnd)).delivered;
    const currency = p.currency.currency;
    const share = t.revenue ? t.attributedRevenue / t.revenue : null;
    const sharePrev = tp.revenue ? tp.attributedRevenue / tp.revenue : null;

    const byCampaign = groupBy(p.deliveries, (d) => d.campaignId);
    const campaignCredits = creditsBy(rows, (c) => c.campaignId);
    const campaigns = [...campaignCredits.values()]
      .map((acc) => {
        const campaign = p.campaignsById.get(acc.key);
        const rollup = campaign ? campaignRollup(campaign, byCampaign.get(campaign.id) || []) : null;
        const recipients = rollup?.delivered || 0;
        return {
          id: acc.key,
          name: campaign?.name || "Deleted campaign",
          channel: campaign?.channel || "email",
          recipients,
          conversions: acc.conversions,
          revenue: acc.revenue,
          conversionRate: recipients ? acc.conversions / recipients : null,
          revenuePerRecipient: recipients ? acc.revenue / recipients : null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.conversions - a.conversions);

    const channelDelivered = groupBy(deliveriesInWindow(p.deliveries, r.start, r.end), (d) => d.channel);
    const channels = [...creditsBy(rows, (c) => c.channel).values()]
      .map((acc) => ({ channel: channelLabel(acc.key), key: acc.key, revenue: acc.revenue, conversions: acc.conversions, delivered: summarize(channelDelivered.get(acc.key) || []).delivered }))
      .sort((a, b) => b.revenue - a.revenue);
    const unattributed = Math.max(0, t.revenue - t.attributedRevenue);

    const buckets = buildBuckets(r);
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const series = buckets.map((b) => ({ label: b.label, total: 0, attributed: 0 }));
    for (const x of rows) {
      const i = idx.get(bucketKey(x.at, r.bucket));
      if (i == null) continue;
      series[i].total += x.revenue;
      series[i].attributed += x.revenue * x.credits.reduce((s, c) => s + c.weight, 0);
    }

    return {
      currency,
      mixed: p.currency.mixed ? p.currency.currencies : null,
      totals: t,
      share,
      stats: [
        deltaStat({ label: "Attributed revenue", value: t.attributedRevenue, previous: tp.attributedRevenue, format: "currency", currency, range }),
        deltaStat({ label: "Share of revenue attributed", value: share, previous: sharePrev, format: "percent", rate: true, range }),
        deltaStat({ label: "Conversion rate", value: delivered ? t.attributedConversions / delivered : null, previous: deliveredPrev ? tp.attributedConversions / deliveredPrev : null, format: "percent", rate: true, range }),
        deltaStat({ label: "Revenue per recipient", value: delivered ? t.attributedRevenue / delivered : null, previous: deliveredPrev ? tp.attributedRevenue / deliveredPrev : null, format: "currency", currency, range, display: delivered ? formatCurrency(t.attributedRevenue / delivered, currency, { cents: true }) : "—" }),
      ],
      campaigns,
      channels,
      pie: [...channels.map((c, i) => ({ name: c.channel, value: c.revenue, fill: SERIES[i % SERIES.length] })), ...(unattributed > 0 ? [{ name: "Not attributed", value: unattributed, fill: "var(--surface-hover)" }] : [])],
      sources: bySource(rows),
      series,
    };
  }, [sources, loadedAt, range, cfg]);

  const pieConfig = useMemo(() => Object.fromEntries((model?.pie || []).map((p) => [p.name, { label: p.name }])), [model]);

  const exportCampaigns = () =>
    exportCsv(
      "attribution-by-campaign.csv",
      model.campaigns.map((c) => ({
        ...c,
        channel: channelLabel(c.channel),
        conversions: c.conversions.toFixed(2),
        revenue: c.revenue.toFixed(2),
        conversionRate: c.conversionRate == null ? "" : (c.conversionRate * 100).toFixed(2),
        revenuePerRecipient: c.revenuePerRecipient == null ? "" : c.revenuePerRecipient.toFixed(4),
      })),
      [
        { key: "name", header: "Campaign" },
        { key: "channel", header: "Channel" },
        { key: "recipients", header: "Delivered" },
        { key: "conversions", header: "Attributed conversions" },
        { key: "conversionRate", header: "Conversion rate %" },
        { key: "revenue", header: `Attributed revenue (${model.currency})` },
        { key: "revenuePerRecipient", header: "Revenue per recipient" },
      ],
    );

  const columns = [
    {
      key: "name",
      header: "Campaign",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{c.name}</span>
          <span className="text-xs text-text-secondary">{channelLabel(c.channel)}</span>
        </div>
      ),
    },
    { key: "recipients", header: "Delivered", align: "right", className: "tabular-nums text-muted-foreground", render: (c) => formatNumber(c.recipients) },
    { key: "conversions", header: "Conversions", align: "right", className: "tabular-nums text-muted-foreground", render: (c) => (Math.round(c.conversions * 10) / 10).toLocaleString("en-US") },
    { key: "conversionRate", header: "Conv. rate", align: "right", className: "tabular-nums text-muted-foreground", render: (c) => formatPercent(c.conversionRate) },
    { key: "revenue", header: "Attributed revenue", align: "right", className: "tabular-nums font-medium text-foreground", render: (c) => formatCurrency(c.revenue, model.currency) },
    { key: "rpr", header: "Per recipient", align: "right", className: "tabular-nums text-muted-foreground", render: (c) => (c.revenuePerRecipient == null ? "—" : formatCurrency(c.revenuePerRecipient, model.currency, { cents: true })) },
  ];

  const sourceColumns = [
    { key: "source", header: "Source", className: "font-medium text-foreground" },
    { key: "conversions", header: "Conversions", align: "right", className: "tabular-nums text-muted-foreground", render: (s) => formatNumber(s.conversions) },
    { key: "revenue", header: "Revenue", align: "right", className: "tabular-nums text-foreground", render: (s) => formatCurrency(s.revenue, model.currency) },
    {
      key: "attributed",
      header: "Credited to messages",
      render: (s) => (
        <div className="flex items-center gap-2">
          <ShareBar value={s.revenue ? s.attributedRevenue / s.revenue : s.conversions ? s.attributedConversions / s.conversions : 0} />
          <span className="text-xs tabular-nums text-muted-foreground">{formatPercent(s.revenue ? s.attributedRevenue / s.revenue : s.conversions ? s.attributedConversions / s.conversions : null, 0)}</span>
        </div>
      ),
    },
  ];

  const modelInfo = ATTRIBUTION_MODELS.find((m) => m.value === cfg.model);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Attribution"
        description="Connect revenue back to the campaigns and channels that earned it."
        actions={model?.campaigns.length ? <ExportButton onClick={exportCampaigns} /> : null}
      />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={cfg.model} onValueChange={(v) => update({ model: v })} options={ATTRIBUTION_MODELS} height="h-9" />
          <FilterDropdown value={String(cfg.windowDays)} onValueChange={(v) => update({ windowDays: Number(v) })} options={WINDOW_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={cfg.touch} onValueChange={(v) => update({ touch: v })} options={TOUCH_OPTIONS} height="h-9" />
          <EventPicker
            options={options}
            value={cfg.events}
            includeRevenue={cfg.includeRevenueEvents}
            onChange={(events) => update({ events })}
            onIncludeRevenue={(v) => update({ includeRevenueEvents: v })}
          />
          <RangeSelect value={range} onChange={setRange} />
        </div>
      </Toolbar>

      <p className="-mt-4 text-xs text-text-secondary">
        {modelInfo?.description} Touches count within {cfg.windowDays} {cfg.windowDays === 1 ? "day" : "days"} before the conversion; links that carry a message id are credited directly.
      </p>

      {failed && !loading ? <ReportFailed onRetry={reload} /> : null}

      {!model ? (
        <ReportLoading label="Loading attribution" size={72} />
      ) : (
        <>
          <StatsBar stats={model.stats} columns={4} />
          <TruncatedNote show={truncated} />
          {model.mixed ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Revenue is recorded in {model.mixed.join(", ")}. Amounts are summed as recorded, without currency conversion.
            </p>
          ) : null}

          {model.totals.conversions === 0 ? (
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={DollarSign}
                title="No conversions in this period"
                description="Conversions come from tracked events like order_completed or deal_won. Connect a store, record events through the API, or widen the date range."
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
                <SectionCard
                  title="Revenue by channel"
                  description={`${formatCurrency(model.totals.attributedRevenue, model.currency)} of ${formatCurrency(model.totals.revenue, model.currency)} credited to messages.`}
                >
                  <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[220px]">
                    <PieChart>
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="name" className={TOOLTIP_CLASS} />} />
                      <Pie data={model.pie} dataKey="value" nameKey="name" innerRadius={58} strokeWidth={2} stroke="var(--surface-subtle)">
                        {model.pie.map((p) => <Cell key={p.name} fill={p.fill} />)}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-3 space-y-1.5">
                    {model.pie.map((p) => (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-text-secondary">
                          <span className="h-2 w-2 rounded-full border border-border" style={{ backgroundColor: p.fill }} />
                          {p.name}
                        </span>
                        <span className="tabular-nums font-medium text-foreground">
                          {formatCurrency(p.value, model.currency)} · {formatPercent(model.totals.revenue ? p.value / model.totals.revenue : 0, 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Revenue over time" description="All conversion revenue vs the part credited to messages." bodyPadding={false}>
                  <div className="px-3 pb-3 pt-4">
                    <TrendChart
                      data={model.series}
                      series={[
                        { key: "total", label: "All revenue" },
                        { key: "attributed", label: "Attributed" },
                      ]}
                      format="currency"
                      currency={model.currency}
                      height={280}
                    />
                  </div>
                </SectionCard>
              </div>

              <SectionCard bare title="By campaign" description="Credited conversions and revenue per campaign under the selected model.">
                <DataTable
                  columns={columns}
                  data={model.campaigns}
                  getRowKey={(c) => c.id}
                  empty={
                    <div className="rounded-xl border border-border bg-surface-subtle">
                      <EmptyState title="Nothing credited to campaigns" description="No conversion followed a message touch inside the window. Try a longer window or include opens." />
                    </div>
                  }
                />
              </SectionCard>

              <SectionCard bare title="By source" description="Every conversion by where it came from (UTM source, referrer or ingest source).">
                <DataTable columns={sourceColumns} data={model.sources} getRowKey={(s) => s.source} />
              </SectionCard>
            </>
          )}
        </>
      )}
    </MainScreenWrapper>
  );
}

export default AttributionScreen;
