"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { apiPost } from "@/lib/api/client";
import { guessMapping, parseCsv } from "@/lib/audience/csv";
import { normalizeEmail } from "@/lib/audience/contact_model";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FileInput,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  cn,
} from "@geiger/ui";
import { number, plural } from "./constants";

const CHUNK = 1000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const BASE_TARGETS = [
  { value: "email", label: "Email" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "fullName", label: "Full name" },
  { value: "phone", label: "Phone" },
  { value: "tags", label: "Tags" },
  { value: "status", label: "Subscription status" },
  { value: "timezone", label: "Timezone" },
  { value: "locale", label: "Language" },
];

const CONSENT_OPTIONS = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
];

const STEPS = ["upload", "map", "options", "importing", "done"];

const INITIAL = {
  step: "upload",
  fileName: "",
  headers: [],
  rows: [],
  mapping: [],
  tags: "",
  listIds: [],
  updateExisting: true,
  status: "subscribed",
  consentChannels: [],
  consentSource: "",
  attested: false,
  progress: 0,
  result: null,
};

function coerce(field, raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (field?.type === "number") {
    const n = Number(v.replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (field?.type === "boolean") {
    const s = v.toLowerCase();
    if (["true", "yes", "y", "1"].includes(s)) return true;
    if (["false", "no", "n", "0"].includes(s)) return false;
    return null;
  }
  if (field?.type === "date") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }
  return v;
}

// Mapped CSV rows -> import records, merging duplicate emails inside the file (later rows fill gaps).
function buildRecords(rows, mapping, customFields) {
  const fieldByKey = Object.fromEntries(customFields.map((f) => [f.key, f]));
  const byEmail = new Map();
  const out = [];
  let merged = 0;
  rows.forEach((cells, i) => {
    const rec = { __row: i + 2, attributes: {} };
    mapping.forEach((target, col) => {
      if (target === "skip") return;
      const value = cells[col];
      if (target.startsWith("attributes.")) {
        const key = target.slice("attributes.".length);
        const coerced = coerce(fieldByKey[key], value);
        if (coerced !== null) rec.attributes[key] = coerced;
      } else if (String(value ?? "").trim()) {
        rec[target] = String(value).trim();
      }
    });
    const email = normalizeEmail(rec.email);
    if (email && byEmail.has(email)) {
      const prev = byEmail.get(email);
      for (const [k, v] of Object.entries(rec)) {
        if (k === "attributes") prev.attributes = { ...prev.attributes, ...v };
        else if (k === "tags") prev.tags = [prev.tags, v].filter(Boolean).join(",");
        else if (k !== "__row" && v) prev[k] = v;
      }
      merged += 1;
      return;
    }
    if (email) byEmail.set(email, rec);
    out.push(rec);
  });
  return { records: out, merged };
}

export function ContactImportDialog({ open, onOpenChange, projectId, catalog, onImported }) {
  const [s, setS] = useState(INITIAL);
  const patch = (next) => setS((prev) => ({ ...prev, ...next }));

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setS(INITIAL);
  }

  const targets = useMemo(
    () => [
      ...BASE_TARGETS,
      ...catalog.customFields.map((f) => ({ value: `attributes.${f.key}`, label: f.label, custom: true })),
    ],
    [catalog.customFields],
  );

  const mapped = new Set(s.mapping.filter((t) => t !== "skip"));
  const duplicateTargets = s.mapping.filter((t, i) => t !== "skip" && s.mapping.indexOf(t) !== i);
  const canMap = (mapped.has("email") || mapped.has("phone")) && !duplicateTargets.length;
  const busy = s.step === "importing";

  const onFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is over 20 MB — split it and import the parts.");
      return;
    }
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    if (!headers.length || !rows.length) {
      toast.error("No rows found — check the file has a header row and at least one contact.");
      return;
    }
    patch({
      step: "map",
      fileName: file.name,
      headers,
      rows,
      mapping: guessMapping(headers, catalog.customFields),
      consentSource: `Import: ${file.name}`,
    });
  };

  const runImport = async () => {
    const { records, merged } = buildRecords(s.rows, s.mapping, catalog.customFields);
    patch({ step: "importing", progress: 0 });
    const totals = { received: records.length, created: 0, updated: 0, skipped: merged, invalid: 0, memberships: 0, consents: 0, errors: [] };
    const options = {
      fileName: s.fileName,
      tags: s.tags,
      listIds: s.listIds,
      updateExisting: s.updateExisting,
      status: s.status,
      source: "import",
      consent: s.consentChannels.length
        ? { channels: s.consentChannels, source: s.consentSource.trim(), attested: s.attested }
        : null,
    };
    for (let i = 0; i < records.length; i += CHUNK) {
      const res = await apiPost(`/api/projects/${projectId}/audience/import`, { rows: records.slice(i, i + CHUNK), options });
      if (!res.ok) {
        toast.error(res.error || "The import stopped part-way.");
        patch({ step: "done", result: { ...totals, failedAt: i + 1, error: res.error } });
        if (totals.created || totals.updated) onImported?.();
        return;
      }
      for (const k of ["created", "updated", "skipped", "invalid", "memberships", "consents"]) totals[k] += Number(res.data?.[k]) || 0;
      totals.errors.push(...(res.data?.errors || []));
      patch({ progress: Math.round(((i + CHUNK) / records.length) * 100) });
    }
    patch({ step: "done", result: totals });
    toast.success(`Imported ${plural(totals.created, "new contact")}, updated ${number(totals.updated)}.`);
    onImported?.();
  };

  const stepIndex = STEPS.indexOf(s.step);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV, match its columns to contact fields, then choose lists, tags and consent. Existing contacts are matched by email.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-xs text-text-secondary">
          {["Upload", "Map columns", "Options", "Import"].map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] tabular-nums",
                  i < Math.min(stepIndex, 3) || s.step === "done" ? "border-border bg-surface-active text-foreground" : i === Math.min(stepIndex, 3) ? "border-foreground text-foreground" : "border-border",
                )}
              >
                {i + 1}
              </span>
              <span className={cn(i === Math.min(stepIndex, 3) && "text-foreground")}>{label}</span>
              {i < 3 ? <span className="text-text-tertiary">/</span> : null}
            </li>
          ))}
        </ol>

        {s.step === "upload" ? (
          <div className="grid gap-3">
            <label className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-card px-6 py-10 text-center">
              <FileUp className="h-6 w-6 text-text-secondary" />
              <span className="text-sm font-medium text-foreground">Choose a CSV file</span>
              <span className="text-xs text-text-secondary">Comma, semicolon or tab separated, with a header row. Up to 20 MB.</span>
              <FileInput accept=".csv,text/csv,text/plain" className="mt-2 max-w-xs" onChange={(e) => onFile(e.target.files?.[0])} aria-label="CSV file" />
            </label>
          </div>
        ) : null}

        {s.step === "map" ? (
          <div className="grid gap-3">
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-foreground">{s.fileName}</span> · {plural(s.rows.length, "row")}. Map at least an email or phone column.
            </p>
            <div className="max-h-[22rem] overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-subtle text-left text-xs text-text-secondary">
                  <tr>
                    <th className="px-4 py-2 font-medium">Column</th>
                    <th className="px-4 py-2 font-medium">Sample</th>
                    <th className="w-56 px-4 py-2 font-medium">Import as</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {s.headers.map((h, col) => (
                    <tr key={`${h}-${col}`}>
                      <td className="px-4 py-2 font-medium text-foreground">{h}</td>
                      <td className="max-w-56 truncate px-4 py-2 text-text-secondary">{s.rows.find((r) => r[col])?.[col] || "—"}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={s.mapping[col]}
                          onValueChange={(v) => patch({ mapping: s.mapping.map((t, i) => (i === col ? v : t)) })}
                        >
                          <SelectTrigger size="sm" className={cn("w-full", duplicateTargets.includes(s.mapping[col]) && "border-red-500/50")} aria-label={`Import ${h} as`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Don&apos;t import</SelectItem>
                            <SelectGroup>
                              <SelectLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">Contact</SelectLabel>
                              {targets.filter((t) => !t.custom).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectGroup>
                            {targets.some((t) => t.custom) ? (
                              <SelectGroup>
                                <SelectLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">Custom fields</SelectLabel>
                                {targets.filter((t) => t.custom).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                              </SelectGroup>
                            ) : null}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {duplicateTargets.length ? <p className="text-xs text-red-600 dark:text-red-400">Each field can only be mapped once.</p> : null}
          </div>
        ) : null}

        {s.step === "options" ? (
          <div className="-mx-6 -my-1 grid max-h-[26rem] gap-4 overflow-y-auto px-6 py-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Existing contacts" hint="Matched by email (or phone when there's no email).">
                <Select value={s.updateExisting ? "update" : "skip"} onValueChange={(v) => patch({ updateExisting: v === "update" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="update">Update them with the file&apos;s values</SelectItem>
                    <SelectItem value="skip">Leave them unchanged</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status for new contacts" hint="Unsubscribed contacts are never resubscribed by an import.">
                <Select value={s.status} onValueChange={(v) => patch({ status: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subscribed">Subscribed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Add tags" htmlFor="imp-tags" hint="Comma-separated; added to every imported contact.">
              <Input id="imp-tags" value={s.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="summit-2026, imported" />
            </Field>
            <Field label="Add to lists">
              {catalog.lists.length ? (
                <div className="grid gap-2 rounded-lg border border-border bg-surface-card p-3 sm:grid-cols-2">
                  {catalog.lists.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={s.listIds.includes(l.id)}
                        onCheckedChange={(on) => patch({ listIds: on ? [...s.listIds, l.id] : s.listIds.filter((x) => x !== l.id) })}
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">No lists yet — contacts are imported without one.</p>
              )}
            </Field>
            <div className="grid gap-3 rounded-lg border border-border bg-surface-card p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Consent</p>
                <p className="text-xs text-text-secondary">Record an opt-in for the channels these people agreed to. SMS and WhatsApp can&apos;t be sent without one.</p>
              </div>
              <div className="flex flex-wrap gap-4">
                {CONSENT_OPTIONS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={s.consentChannels.includes(c.key)}
                      onCheckedChange={(on) => patch({ consentChannels: on ? [...s.consentChannels, c.key] : s.consentChannels.filter((x) => x !== c.key) })}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              {s.consentChannels.length ? (
                <>
                  <Field label="Consent source" htmlFor="imp-source" hint="Stored on every ledger row as the source.">
                    <Input id="imp-source" value={s.consentSource} onChange={(e) => patch({ consentSource: e.target.value })} />
                  </Field>
                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <Checkbox checked={s.attested} onCheckedChange={(v) => patch({ attested: Boolean(v) })} className="mt-0.5" />
                    <span>I confirm everyone in this file gave consent for the selected channels and I can show proof if asked.</span>
                  </label>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {s.step === "importing" ? (
          <div className="grid gap-3 py-6">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Importing {plural(s.rows.length, "row")}…
            </div>
            <Progress value={Math.min(100, s.progress)} className="h-1.5 bg-surface-hover" />
          </div>
        ) : null}

        {s.step === "done" && s.result ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {s.result.error ? <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              {s.result.error ? `Stopped at row ${number(s.result.failedAt)}: ${s.result.error}` : "Import finished"}
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
              {[
                ["Created", s.result.created],
                ["Updated", s.result.updated],
                ["Skipped or merged", s.result.skipped],
                ["Invalid", s.result.invalid],
                ["List memberships", s.result.memberships],
                ["Consent records", s.result.consents],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface-subtle p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{number(value)}</dd>
                </div>
              ))}
            </dl>
            {s.result.errors?.length ? (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface-card p-3 text-xs text-text-secondary">
                {s.result.errors.slice(0, 50).map((e) => <p key={e}>{e}</p>)}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {s.step === "done" ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => (s.step === "map" ? patch({ step: "upload" }) : s.step === "options" ? patch({ step: "map" }) : onOpenChange(false))}
              >
                {s.step === "upload" ? "Cancel" : "Back"}
              </Button>
              {s.step === "map" ? (
                <Button onClick={() => patch({ step: "options" })} disabled={!canMap}>Continue</Button>
              ) : null}
              {s.step === "options" || s.step === "importing" ? (
                <Button onClick={runImport} disabled={busy || (s.consentChannels.length > 0 && (!s.attested || !s.consentSource.trim()))}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Import {plural(s.rows.length, "row")}
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
