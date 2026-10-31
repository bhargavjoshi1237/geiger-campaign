"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  EmptyState,
  LoadingArea,
  cn,
} from "@geiger/ui";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { formatChange, formatCompact, formatMetric, formatPts } from "@/lib/reporting/format";
import { RANGE_OPTIONS, previousLabel } from "@/lib/reporting/ranges";

// Shared building blocks for the reporting screens: range picker, load states, KPI deltas and the
// suite's monochrome Recharts wrappers (semantic chart tokens only, readable in light and dark).

export const SERIES = ["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-4)", "var(--chart-series-3)", "var(--chart-series-5)"];
export const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";
export const AXIS_STROKE = "var(--muted-foreground)";
export const OUTLINE_BUTTON = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const DASHES = ["0", "6 4", "2 3", "10 4 2 4"];

const RANGE_FILTER_OPTIONS = RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

export function RangeSelect({ value, onChange, options = RANGE_FILTER_OPTIONS }) {
  return <FilterDropdown value={value} onValueChange={onChange} options={options} height="h-9" />;
}

export function ExportButton({ onClick, disabled, label = "Export CSV" }) {
  return (
    <Button variant="outline" className={cn("h-9", OUTLINE_BUTTON)} onClick={onClick} disabled={disabled}>
      <Download className="h-4 w-4" /> {label}
    </Button>
  );
}

export function ReportLoading({ label = "Loading report data", size = 48 }) {
  return <LoadingArea panel size={size} label={label} />;
}

export function ReportFailed({ onRetry }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load report data"
        description="The campaign database didn't answer. Check your connection and try again."
        action={
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={onRetry}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        }
      />
    </div>
  );
}

export function TruncatedNote({ show }) {
  if (!show) return null;
  return (
    <p className="text-xs text-text-tertiary">
      This period has more activity than the browser loads at once — figures cover the most recent 30,000 records per source.
    </p>
  );
}

// StatsBar item with the change vs the previous period. Lower-is-better metrics keep the change as text
// in the footer, since the bar's arrow colour always reads "up = good".
export function deltaStat({ label, value, previous, format = "number", rate = false, inverse = false, currency = "USD", range = "30d", display }) {
  const shown = display ?? formatMetric(value, format, currency);
  const footer = previousLabel(range);
  if (value == null || previous == null || (!rate && !previous)) {
    return { label, value: shown, footer: previous == null || !previous ? "No data for the previous period" : footer };
  }
  const diff = rate ? value - previous : (value - previous) / Math.abs(previous);
  const text = rate ? formatPts(diff) : formatChange(value, previous);
  if (!text) return { label, value: shown, footer };
  if (inverse) return { label, value: shown, footer: `${text} ${footer}` };
  return { label, value: shown, delta: text, trend: diff >= 0 ? "up" : "down", footer };
}

export function ConfidenceBadge({ level }) {
  const variant = level === "high" ? "success" : level === "medium" ? "info" : "neutral";
  return <Badge variant={variant}>{level} confidence</Badge>;
}

const tick = (format, currency) => (v) => {
  if (format === "percent") return `${Math.round(v * 1000) / 10}%`;
  if (format === "currency") return formatMetric(v, "currency", currency).replace(/\.00$/, "");
  return formatCompact(v);
};

function tooltipFormatter(format, currency, config) {
  return function formatTooltipRow(value, name) {
    return (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-muted-foreground">{config[name]?.label || name}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{formatMetric(value, format, currency)}</span>
      </div>
    );
  };
}

export function ChartEmpty({ message = "Nothing to chart for this period yet.", height = 240 }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-text-secondary" style={{ height }}>
      {message}
    </div>
  );
}

// Multi-series line chart over ordered buckets. series: [{ key, label }].
export function TrendChart({ data, series, format = "number", currency, height = 260, xKey = "label", references = [], emptyMessage }) {
  const config = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: SERIES[i % SERIES.length] }]));
  const hasData = data?.some((row) => series.some((s) => Number(row[s.key]) > 0));
  if (!hasData) return <ChartEmpty height={height} message={emptyMessage} />;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <LineChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} stroke={AXIS_STROKE} />
        <YAxis tickLine={false} axisLine={false} width={48} stroke={AXIS_STROKE} tickFormatter={tick(format, currency)} />
        <ChartTooltip cursor={{ stroke: "var(--chart-cursor)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} formatter={tooltipFormatter(format, currency, config)} />} />
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent className="text-muted-foreground" />} /> : null}
        {references.map((r) => (
          <ReferenceLine key={r.label} y={r.value} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: r.label, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />
        ))}
        {series.map((s, i) => (
          <Line
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            strokeDasharray={DASHES[i % DASHES.length]}
            dot={data.length <= 14 ? { fill: `var(--color-${s.key})`, r: 3 } : false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

// Single-series bars; `horizontal` for long category labels (campaign names, domains).
export function CategoryBars({ data, format = "number", currency, height = 260, horizontal = false, label = "Value", emptyMessage, highlightKey }) {
  const config = { value: { label, color: SERIES[0] } };
  if (!data?.some((r) => Number(r.value) > 0)) return <ChartEmpty height={height} message={emptyMessage} />;
  const rows = data.map((r) => ({ ...r, value: r.value ?? 0 }));
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--chart-grid)" />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} stroke={AXIS_STROKE} tickFormatter={tick(format, currency)} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={140} stroke={AXIS_STROKE} tick={{ fontSize: 11 }} tickFormatter={(v) => (String(v).length > 22 ? `${String(v).slice(0, 21)}…` : v)} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} stroke={AXIS_STROKE} />
            <YAxis tickLine={false} axisLine={false} width={48} stroke={AXIS_STROKE} tickFormatter={tick(format, currency)} />
          </>
        )}
        <ChartTooltip cursor={{ fill: "var(--chart-cursor-fill)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} formatter={tooltipFormatter(format, currency, config)} />} />
        <Bar dataKey="value" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36}>
          {rows.map((r) => (
            <Cell key={String(r.key)} fill={highlightKey != null && r.key !== highlightKey ? SERIES[2] : SERIES[0]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Grouped bars: one group per row, one bar per series (comparison views).
export function GroupedBars({ data, series, format = "percent", currency, height = 280 }) {
  const config = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: SERIES[i % SERIES.length] }]));
  if (!data?.length) return <ChartEmpty height={height} />;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} stroke={AXIS_STROKE} />
        <YAxis tickLine={false} axisLine={false} width={48} stroke={AXIS_STROKE} tickFormatter={tick(format, currency)} />
        <ChartTooltip cursor={{ fill: "var(--chart-cursor-fill)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} formatter={tooltipFormatter(format, currency, config)} />} />
        <ChartLegend content={<ChartLegendContent className="text-muted-foreground" />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[4, 4, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// Inline share bar for table cells (0..1).
export function ShareBar({ value, className }) {
  const pct = Math.max(0, Math.min(100, (Number(value) || 0) * 100));
  return (
    <div className={cn("h-1.5 w-24 overflow-hidden rounded-full bg-surface-hover", className)} aria-hidden="true">
      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
    </div>
  );
}
