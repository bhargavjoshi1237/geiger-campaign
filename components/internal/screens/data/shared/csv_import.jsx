"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  FileInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { parseCsv } from "@/lib/data/csv";
import { validateData } from "@/lib/data/fields";
import { formatNumber } from "./format";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IGNORE = "__ignore";
const ID = "__id";
const EMAIL = "__email";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMap(headers, fields, { idLabel, withContact }) {
  const map = {};
  const used = new Set();
  for (const header of headers) {
    const h = norm(header);
    let target = IGNORE;
    if (["id", "externalid", "sku", norm(idLabel)].includes(h) && !used.has(ID)) target = ID;
    else if (withContact && ["email", "contactemail", "emailaddress"].includes(h) && !used.has(EMAIL)) target = EMAIL;
    else {
      const field = fields.find((f) => !used.has(f.key) && (norm(f.key) === h || norm(f.label) === h));
      if (field) target = field.key;
    }
    if (target !== IGNORE) used.add(target);
    map[header] = target;
  }
  return map;
}

// CSV import with column mapping and validation; only valid rows are sent to onImport(rows).
// rows: [{ externalId, contactEmail, data }] -> Promise<{ imported, failed, unmatched? } | null>
export function CsvImport({ fields, idLabel = "External ID", idRequired = false, withContact = false, onImport, disabled = false }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const pick = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    setResult(null);
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) {
      toast.error("That file is larger than 10 MB. Split it and import the parts.");
      return;
    }
    const csv = parseCsv(await chosen.text());
    if (!csv.headers.length || !csv.rows.length) {
      toast.error("That file has no rows to import.");
      return;
    }
    setFile(chosen.name);
    setParsed(csv);
    setMapping(autoMap(csv.headers, fields, { idLabel, withContact }));
  };

  const checked = useMemo(() => {
    if (!parsed) return { rows: [], invalid: [], preview: [] };
    const targets = Object.entries(mapping).filter(([, t]) => t !== IGNORE);
    const rows = [];
    const invalid = [];
    parsed.rows.forEach((raw, i) => {
      const values = {};
      let externalId = "";
      let contactEmail = "";
      for (const [header, target] of targets) {
        if (target === ID) externalId = raw[header];
        else if (target === EMAIL) contactEmail = raw[header];
        else values[target] = raw[header];
      }
      const { data, errors } = validateData(fields, values);
      if (idRequired && !externalId) errors.unshift(`${idLabel} is empty.`);
      if (errors.length) invalid.push({ line: i + 2, error: errors[0] });
      else rows.push({ externalId, contactEmail, data });
    });
    return { rows, invalid, preview: parsed.rows.slice(0, 5) };
  }, [parsed, mapping, fields, idLabel, idRequired]);

  const mappedHeaders = parsed ? parsed.headers.filter((h) => mapping[h] !== IGNORE) : [];
  const hasId = Object.values(mapping).includes(ID);

  const run = async () => {
    if (!checked.rows.length) return;
    setImporting(true);
    const out = await onImport(checked.rows);
    setImporting(false);
    if (!out) {
      toast.error("Couldn't import the file.");
      return;
    }
    setResult(out);
    if (out.imported) toast.success(`Imported ${formatNumber(out.imported)} rows.`);
    if (out.failed) toast.error(`${formatNumber(out.failed)} rows couldn't be saved.`);
  };

  const targetOptions = [
    { value: IGNORE, label: "Don't import" },
    { value: ID, label: idLabel },
    ...(withContact ? [{ value: EMAIL, label: "Contact email" }] : []),
    ...fields.map((f) => ({ value: f.key, label: f.label })),
  ];

  return (
    <div className="space-y-5">
      <Field label="CSV file" hint={`First row is the header. Rows with a matching ${idLabel.toLowerCase()} are updated, the rest are added.`}>
        <FileInput accept=".csv,text/csv" onChange={pick} disabled={disabled || importing} aria-label="Choose a CSV file" />
      </Field>

      {parsed ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <FileUp className="h-4 w-4" />
            <span className="font-medium text-foreground">{file}</span>
            <span>· {formatNumber(parsed.rows.length)} rows</span>
            {parsed.truncated ? <Badge variant="warning">Only the first 50,000 rows are read</Badge> : null}
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-2 gap-3 border-b border-border bg-surface-card px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              <span>Column in file</span>
              <span>Import as</span>
            </div>
            <div className="divide-y divide-border">
              {parsed.headers.map((header) => (
                <div key={header} className="grid grid-cols-2 items-center gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{header}</p>
                    <p className="truncate text-xs text-text-tertiary">{parsed.rows[0]?.[header] || "—"}</p>
                  </div>
                  <Select value={mapping[header]} onValueChange={(v) => setMapping((m) => ({ ...m, [header]: v }))}>
                    <SelectTrigger className="w-full" aria-label={`Import ${header} as`}><SelectValue /></SelectTrigger>
                    <SelectContent>{targetOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {mappedHeaders.length ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-card text-text-tertiary">
                  <tr>{mappedHeaders.map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{targetOptions.find((o) => o.value === mapping[h])?.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {checked.preview.map((row, i) => (
                    <tr key={i}>{mappedHeaders.map((h) => <td key={h} className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">{row[h] || "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="text-foreground">
                <span className="font-semibold tabular-nums">{formatNumber(checked.rows.length)}</span> ready to import
                {checked.invalid.length ? (
                  <span className="text-red-600 dark:text-red-400"> · {formatNumber(checked.invalid.length)} with errors</span>
                ) : null}
              </p>
              {checked.invalid.length ? (
                <p className="text-xs text-text-secondary">Line {checked.invalid[0].line}: {checked.invalid[0].error}</p>
              ) : !hasId ? (
                <p className="text-xs text-text-secondary">No {idLabel.toLowerCase()} column mapped — every row is added as new.</p>
              ) : null}
            </div>
            <Button onClick={run} disabled={disabled || importing || !checked.rows.length}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Import {formatNumber(checked.rows.length)} rows
            </Button>
          </div>

          {result ? (
            <p className="text-sm text-text-secondary">
              Last import: {formatNumber(result.imported)} saved
              {result.failed ? `, ${formatNumber(result.failed)} failed` : ""}
              {result.unmatched ? `, ${formatNumber(result.unmatched)} without a matching contact` : ""}.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default CsvImport;
