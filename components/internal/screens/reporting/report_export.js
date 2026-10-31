"use client";

import { formatMetric } from "@/lib/reporting/format";
import { resultTable } from "@/lib/reporting/query";

// Client-side CSV export for the reporting screens; columns are [{ key, header }].
export function toCsv(rows, columns) {
  const escape = (v) => {
    const raw = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formulas in text cells (negative numbers stay numeric).
    const s = /^[=+@\t\r]|^-(?![\d.])/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => escape(c.header)).join(","), ...rows.map((r) => columns.map((c) => escape(r[c.key])).join(","))].join("\n");
}

export function exportCsv(filename, rows, columns) {
  const blob = new Blob([`﻿${toCsv(rows, columns)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const slugify = (name) => String(name || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";

// Downloads a runQuery() result: raw numbers for counts/money, rates as percentages with 2 decimals.
export function exportReportResult(name, result) {
  const { columns, rows } = resultTable(result);
  const value = (v) => {
    if (v == null) return "";
    if (result.metric.format === "percent") return (v * 100).toFixed(2);
    if (result.metric.format === "currency") return Number(v).toFixed(2);
    return Number.isInteger(v) ? v : Number(v).toFixed(2);
  };
  const out = rows.map((r) => ({ ...r, value: value(r.value) }));
  const cols = columns.map((c) =>
    c.key === "value" ? { ...c, header: `${c.header}${result.metric.format === "percent" ? " (%)" : result.metric.format === "currency" ? ` (${result.currency})` : ""}` } : c,
  );
  exportCsv(`${slugify(name)}.csv`, out, cols);
  return formatMetric(result.value, result.metric.format, result.currency);
}
