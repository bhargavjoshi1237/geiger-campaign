"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import {
  ActionMenu,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  RollingNumber,
  SectionCard,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  cn,
} from "@geiger/ui";
import { formatMetric, formatPercent } from "@/lib/reporting/format";
import {
  DIMENSION_MAP,
  METRICS,
  WIDGET_SIZES,
  WIDGET_TYPES,
  normalizeWidget,
  runQuery,
  widgetDimensions,
  widgetTitle,
} from "@/lib/reporting/query";
import { RANGE_OPTIONS, rangeLabel } from "@/lib/reporting/ranges";
import { CategoryBars, ShareBar, TrendChart, deltaStat } from "./report_ui";

// Dashboard widgets: the four widget renderers over runQuery() and the add/edit widget dialog.

const SPAN = {
  sm: "",
  md: "md:col-span-2",
  lg: "md:col-span-2 xl:col-span-3",
  full: "md:col-span-2 xl:col-span-4",
};

export const WIDGET_GRID = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4";

const METRIC_GROUPS = [
  { label: "Delivery & engagement", families: ["delivery"] },
  { label: "Conversions & revenue", families: ["attributed", "mixed", "conversion"] },
  { label: "Audience", families: ["contact"] },
];

export function MetricSelect({ value, onChange, id, disabled = false }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {METRIC_GROUPS.map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel>{g.label}</SelectLabel>
            {METRICS.filter((m) => g.families.includes(m.family)).map((m) => (
              <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

const HORIZONTAL = new Set(["campaign", "domain", "list", "segment", "source", "event", "provider"]);

function WidgetMenu({ widget, index, count, onEdit, onMove, onRemove }) {
  return (
    <ActionMenu
      label={`Actions for ${widgetTitle(widget)}`}
      items={[
        { icon: Pencil, label: "Edit widget", onSelect: () => onEdit(widget) },
        index > 0 && { icon: ArrowUp, label: "Move earlier", onSelect: () => onMove(index, -1) },
        index < count - 1 && { icon: ArrowDown, label: "Move later", onSelect: () => onMove(index, 1) },
        { separator: true },
        { icon: Trash2, label: "Remove", destructive: true, onSelect: () => onRemove(widget) },
      ]}
    />
  );
}

function KpiWidget({ widget, result, rangeKey, menu }) {
  const stat = deltaStat({
    label: widgetTitle(widget),
    value: result.value,
    previous: result.previous,
    format: result.metric.format,
    rate: result.metric.rate,
    inverse: result.metric.inverse,
    currency: result.currency,
    range: rangeKey,
  });
  const up = stat.trend === "up";
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface-subtle p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{stat.label}</span>
        {menu}
      </div>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <RollingNumber value={stat.value} className="text-2xl font-bold leading-none text-foreground" />
        {stat.delta ? (
          <span className={cn("text-xs font-medium", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{stat.delta}</span>
        ) : null}
      </div>
      <span className="mt-1.5 block text-[11px] text-text-tertiary">{stat.footer}</span>
    </div>
  );
}

function TableWidget({ result }) {
  const { metric, rows } = result;
  const max = Math.max(0, ...rows.map((r) => Number(r.value) || 0));
  if (!rows.length) return <p className="py-10 text-center text-sm text-text-secondary">Nothing to show for this period yet.</p>;
  return (
    <div className="divide-y divide-border">
      {rows.map((r) => (
        <div key={String(r.key)} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
          <span className="min-w-0 truncate text-foreground">{r.label}</span>
          <span className="flex shrink-0 items-center gap-3 tabular-nums">
            {metric.rate ? (
              <span className="text-xs text-text-tertiary">{(r.delivered || 0).toLocaleString("en-US")} delivered</span>
            ) : (
              <ShareBar value={max ? (Number(r.value) || 0) / max : 0} className="hidden w-16 sm:block" />
            )}
            <span className="w-20 text-right font-medium text-foreground">{formatMetric(r.value, metric.format, result.currency)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// One widget, computed from the shared prepared sources.
export function DashboardWidget({ widget, index, count, prepared, dashboardRange, now, editable, onEdit, onMove, onRemove }) {
  const rangeKey = widget.range === "dashboard" ? dashboardRange : widget.range;
  const result = useMemo(
    () => runQuery({ metric: widget.metric, dimension: widget.dimension, range: rangeKey, limit: widget.widget === "table" ? 12 : 10 }, prepared, { now }),
    [widget.metric, widget.dimension, widget.widget, rangeKey, prepared, now],
  );
  const menu = editable ? <WidgetMenu widget={widget} index={index} count={count} onEdit={onEdit} onMove={onMove} onRemove={onRemove} /> : null;
  const span = SPAN[widget.size] || "";

  if (widget.widget === "kpi") {
    return (
      <div className={span}>
        <KpiWidget widget={widget} result={result} rangeKey={rangeKey} menu={menu} />
      </div>
    );
  }

  const subtitle = [
    widget.range === "dashboard" ? null : rangeLabel(widget.range),
    result.metric.rate && result.value != null ? `Overall ${formatPercent(result.value)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SectionCard
      className={span}
      title={widgetTitle(widget)}
      description={subtitle || null}
      action={menu}
      bodyPadding={widget.widget !== "table"}
      contentClassName={widget.widget === "table" ? "py-1" : "px-3 pb-3 pt-4"}
    >
      {widget.widget === "timeseries" ? (
        <TrendChart data={result.rows} series={[{ key: "value", label: result.metric.label }]} format={result.metric.format} currency={result.currency} height={240} />
      ) : widget.widget === "bar" ? (
        <CategoryBars
          data={result.rows}
          format={result.metric.format}
          currency={result.currency}
          label={result.metric.label}
          horizontal={HORIZONTAL.has(widget.dimension)}
          height={HORIZONTAL.has(widget.dimension) ? Math.max(200, result.rows.length * 30 + 40) : 240}
        />
      ) : (
        <TableWidget result={result} />
      )}
    </SectionCard>
  );
}

const EMPTY_WIDGET = { widget: "kpi", metric: "sends", dimension: "none", range: "dashboard", size: "sm", title: "" };

// Add or edit one widget. `initial` null means a new widget.
export function WidgetDialog({ open, onOpenChange, initial, onSubmit }) {
  const [draft, setDraft] = useState(() => normalizeWidget(initial || EMPTY_WIDGET));
  const [lastInitial, setLastInitial] = useState(initial);
  const [lastOpen, setLastOpen] = useState(open);
  if (initial !== lastInitial || open !== lastOpen) {
    setLastInitial(initial);
    setLastOpen(open);
    if (open) setDraft(normalizeWidget(initial || EMPTY_WIDGET));
  }

  const update = (patch) =>
    setDraft((d) => {
      const typeChanged = patch.widget && patch.widget !== d.widget;
      const next = { ...d, ...patch };
      if (typeChanged) next.size = WIDGET_TYPES.find((t) => t.value === patch.widget)?.size || d.size;
      return normalizeWidget(next);
    });
  const dims = widgetDimensions(draft.widget, draft.metric);
  const type = WIDGET_TYPES.find((t) => t.value === draft.widget);

  const submit = () => {
    if (!dims.length) {
      toast.error("That metric can't be shown in this widget type.");
      return;
    }
    onSubmit({ ...draft, id: initial?.id || crypto.randomUUID() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit widget" : "Add widget"}</DialogTitle>
          <DialogDescription>{type?.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Widget type" htmlFor="w-type">
              <Select value={draft.widget} onValueChange={(v) => update({ widget: v })}>
                <SelectTrigger id="w-type" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WIDGET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Metric" htmlFor="w-metric">
              <MetricSelect id="w-metric" value={draft.metric} onChange={(v) => update({ metric: v })} />
            </Field>
          </div>
          {draft.widget !== "kpi" ? (
            <Field label={draft.widget === "timeseries" ? "Interval" : "Broken down by"} htmlFor="w-dim">
              <Select value={draft.dimension} onValueChange={(v) => update({ dimension: v })}>
                <SelectTrigger id="w-dim" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {dims.map((x) => (
                    <SelectItem key={x.key} value={x.key}>{x.key === "time" ? "Automatic" : DIMENSION_MAP[x.key].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date range" htmlFor="w-range">
              <Select value={draft.range} onValueChange={(v) => update({ range: v })}>
                <SelectTrigger id="w-range" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashboard">Same as dashboard</SelectItem>
                  {RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Width" htmlFor="w-size">
              <Select value={draft.size} onValueChange={(v) => update({ size: v })}>
                <SelectTrigger id="w-size" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WIDGET_SIZES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Title" htmlFor="w-title" hint={`Leave empty to use "${widgetTitle({ ...draft, title: "" })}".`}>
            <Input id="w-title" value={draft.title} maxLength={80} onChange={(e) => update({ title: e.target.value })} placeholder={widgetTitle({ ...draft, title: "" })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{initial ? "Save widget" : "Add widget"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
