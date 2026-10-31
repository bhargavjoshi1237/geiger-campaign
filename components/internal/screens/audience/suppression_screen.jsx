"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldOff, Plus, Pencil, RotateCcw, Download, Upload, AtSign, StickyNote, Mail, Phone, Globe, Loader2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import {
  SUPPRESSION_REASONS,
  createSuppression,
  createSuppressions,
  listSuppressions,
  parseSuppressionAddress,
  restoreSuppression,
  softDeleteSuppression,
  updateSuppression,
} from "@/lib/supabase/suppressions";
import { downloadCsv, parseCsv, toCsv } from "@/lib/audience/csv";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileInput,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  LoadingArea,
  StatsBar,
  StatusPill,
  SectionCard,
} from "@geiger/ui";
import { OUTLINE_BUTTON, SUPPRESSION_KIND_LABELS, SUPPRESSION_REASON_MAP, formatDate, number, plural } from "./constants";

const KIND_ICONS = { email: Mail, phone: Phone, domain: Globe };

const REASON_FILTER_OPTIONS = [
  { value: "all", label: "All reasons" },
  ...SUPPRESSION_REASONS.map((r) => ({ value: r, label: SUPPRESSION_REASON_MAP[r].label })),
];

const KIND_FILTER_OPTIONS = [
  { value: "all", label: "All kinds" },
  { value: "email", label: "Email addresses" },
  { value: "phone", label: "Phone numbers" },
  { value: "domain", label: "Domains" },
];

const ENTRY_NAV = [
  { key: "address", label: "Address", icon: AtSign, desc: "The blocked address and why it's blocked." },
  { key: "notes", label: "Details", icon: StickyNote, desc: "Where it came from and how long it lasts." },
];

const KIND_HINT = {
  email: "Blocks email to this address.",
  phone: "Blocks SMS, WhatsApp and RCS to this number.",
  domain: "Blocks email to every address at this domain.",
};

const isExpired = (s, now) => Boolean(s.expiresAt && now && Date.parse(s.expiresAt) <= now);
const toDateInput = (iso) => (iso ? String(iso).slice(0, 10) : "");
const fromDateInput = (v) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);

function ReasonSelect({ value, onChange, disabled }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {SUPPRESSION_REASONS.map((r) => <SelectItem key={r} value={r}>{SUPPRESSION_REASON_MAP[r].label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const EMPTY_FORM = { address: "", kind: "auto", reason: "manual", source: "", note: "", expires: "" };

function AddSuppressionDialog({ open, onOpenChange, existing, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(EMPTY_FORM);
  }
  const parsed = parseSuppressionAddress(form.address, form.kind === "auto" ? null : form.kind);

  const submit = async () => {
    if (!parsed) {
      toast.error("Enter a valid email, phone number or domain.");
      return;
    }
    if (existing.has(`${parsed.kind}:${parsed.value}`)) {
      toast.error(`${parsed.value} is already suppressed.`);
      return;
    }
    setSaving(true);
    const ok = await onCreate({ ...parsed, reason: form.reason, source: form.source.trim() || "Added manually", note: form.note, expiresAt: fromDateInput(form.expires) });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suppress an address</DialogTitle>
          <DialogDescription>Suppressed addresses are skipped by every campaign, automation and broadcast.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field label="Address" htmlFor="sup-address" hint={parsed ? KIND_HINT[parsed.kind] : "Email, phone number or a whole domain."}>
              <Input id="sup-address" value={form.address} onChange={(e) => set("address")(e.target.value)} placeholder="name@company.com" autoFocus />
            </Field>
            <Field label="Kind">
              <Select value={form.kind} onValueChange={set("kind")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Detect</SelectItem>
                  {Object.entries(SUPPRESSION_KIND_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reason">
              <ReasonSelect value={form.reason} onChange={set("reason")} />
            </Field>
            <Field label="Suppress until" htmlFor="sup-expires" hint="Optional — blank blocks it permanently.">
              <Input id="sup-expires" type="date" value={form.expires} onChange={(e) => set("expires")(e.target.value)} />
            </Field>
          </div>
          <Field label="Source" htmlFor="sup-source">
            <Input id="sup-source" value={form.source} onChange={(e) => set("source")(e.target.value)} placeholder="e.g. Support request #4182" />
          </Field>
          <Field label="Internal note" htmlFor="sup-note" hint="Visible to your team only.">
            <Textarea id="sup-note" value={form.note} onChange={(e) => set("note")(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!parsed || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Suppress
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Addresses from pasted text or a CSV (first column, or a column called email/phone/address/domain).
function extractAddresses(text, isCsv) {
  if (isCsv) {
    const { headers, rows } = parseCsv(text);
    const col = Math.max(0, headers.findIndex((h) => /^(e-?mail|phone|address|domain|value)$/i.test(h.trim())));
    const values = rows.map((r) => r[col]);
    const headerIsValue = col === 0 && parseSuppressionAddress(headers[0]);
    return headerIsValue ? [headers[0], ...values] : values;
  }
  return text.split(/[\n,;]+/);
}

function ImportSuppressionsDialog({ open, onOpenChange, existing, onImport }) {
  const [text, setText] = useState("");
  const [fileValues, setFileValues] = useState(null);
  const [reason, setReason] = useState("manual");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setFileValues(null);
      setReason("manual");
      setSource("");
    }
  }

  const summary = useMemo(() => {
    const raw = fileValues ?? extractAddresses(text, false);
    const seen = new Set();
    const valid = [];
    let invalid = 0;
    let duplicate = 0;
    for (const value of raw.map((v) => String(v ?? "").trim()).filter(Boolean)) {
      const parsed = parseSuppressionAddress(value);
      if (!parsed) {
        invalid += 1;
        continue;
      }
      const key = `${parsed.kind}:${parsed.value}`;
      if (seen.has(key) || existing.has(key)) {
        duplicate += 1;
        continue;
      }
      seen.add(key);
      valid.push(parsed);
    }
    return { valid, invalid, duplicate };
  }, [text, fileValues, existing]);

  const onFile = async (file) => {
    if (!file) return;
    setFileValues(extractAddresses(await file.text(), true));
    setSource((s) => s || `Import: ${file.name}`);
  };

  const submit = async () => {
    setSaving(true);
    const ok = await onImport(summary.valid.map((p) => ({ ...p, reason, source: source.trim() || "Bulk import" })));
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import suppressions</DialogTitle>
          <DialogDescription>Paste addresses (one per line or comma-separated) or upload a CSV. Emails, phone numbers and domains are detected automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {fileValues ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3 text-sm">
              <span className="text-foreground">{plural(fileValues.length, "value")} read from the file</span>
              <Button variant="ghost" size="sm" onClick={() => setFileValues(null)}>Use pasted text</Button>
            </div>
          ) : (
            <Field label="Addresses" htmlFor="sup-paste">
              <Textarea id="sup-paste" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"old.address@legacy.co\n+1 555 010 2000\nmailinator.com"} className="font-mono text-xs" />
            </Field>
          )}
          <Field label="Or upload a CSV">
            <FileInput accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} aria-label="CSV file" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reason">
              <ReasonSelect value={reason} onChange={setReason} />
            </Field>
            <Field label="Source" htmlFor="sup-import-source">
              <Input id="sup-import-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Old ESP suppression export" />
            </Field>
          </div>
          <p className="text-sm text-text-secondary">
            <span className="font-medium tabular-nums text-foreground">{number(summary.valid.length)}</span> to add
            {summary.duplicate ? ` · ${number(summary.duplicate)} already suppressed or repeated` : ""}
            {summary.invalid ? ` · ${number(summary.invalid)} not recognised` : ""}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!summary.valid.length || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Suppress {summary.valid.length ? plural(summary.valid.length, "address", "addresses") : "addresses"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (e) => ({ value: e.value, reason: e.reason, source: e.source, note: e.note, expires: toDateInput(e.expiresAt) });

function SuppressionEditor({ record, canEdit, now, onBack, onSave, onLift }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const Icon = KIND_ICONS[record.kind];

  const save = async () => {
    const parsed = parseSuppressionAddress(draft.value, record.kind);
    if (!parsed) {
      toast.error(`Enter a valid ${SUPPRESSION_KIND_LABELS[record.kind].toLowerCase()}.`);
      return;
    }
    setSaving(true);
    await onSave(record.id, { value: parsed.value, reason: draft.reason, source: draft.source.trim(), note: draft.note, expiresAt: fromDateInput(draft.expires) });
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Suppression", onClick: onBack }}
      title={record.value}
      badges={
        <>
          <Badge variant="neutral"><Icon className="h-3 w-3" /> {SUPPRESSION_KIND_LABELS[record.kind]}</Badge>
          <StatusPill status={record.reason} map={SUPPRESSION_REASON_MAP} />
          {isExpired(record, now) ? <Badge variant="outline">Expired</Badge> : null}
          <span className="text-xs text-text-tertiary">Suppressed {formatDate(record.createdAt)}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onLift(record)}>
              <RotateCcw className="h-4 w-4" /> Lift
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={ENTRY_NAV}
      defaultSection="address"
    >
      {({ active }) => (
        <>
          {active === "address" ? (
            <SectionCard bare title="Blocked address" description="What is blocked from receiving sends, and the reason it was added.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={SUPPRESSION_KIND_LABELS[record.kind]} htmlFor="se-value" hint={KIND_HINT[record.kind]}>
                  <Input id="se-value" value={draft.value} disabled={!canEdit} onChange={(e) => set("value")(e.target.value)} />
                </Field>
                <Field label="Reason" hint="Bounces and complaints are added by the sending pipeline.">
                  <ReasonSelect value={draft.reason} onChange={set("reason")} disabled={!canEdit} />
                </Field>
              </div>
            </SectionCard>
          ) : null}
          {active === "notes" ? (
            <SectionCard bare title="Origin & expiry" description="Where the entry came from, how long it lasts and any note for your team.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Source" htmlFor="se-source" hint="The send, import or request that added it.">
                  <Input id="se-source" value={draft.source} disabled={!canEdit} onChange={(e) => set("source")(e.target.value)} />
                </Field>
                <Field label="Suppress until" htmlFor="se-expires" hint="Blank blocks it permanently.">
                  <Input id="se-expires" type="date" value={draft.expires} disabled={!canEdit} onChange={(e) => set("expires")(e.target.value)} />
                </Field>
                <Field label="Internal note" htmlFor="se-note" className="sm:col-span-2">
                  <Textarea id="se-note" value={draft.note} disabled={!canEdit} onChange={(e) => set("note")(e.target.value)} />
                </Field>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function SuppressionScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.contact.edit");
  const canImport = can("campaign.contact.import");
  const canExport = can("campaign.contact.export");
  const [data, setData] = useState({ key: null, entries: [], now: 0 });
  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  useEffect(() => {
    let alive = true;
    listSuppressions(projectId).then((rows) => {
      if (!alive) return;
      if (!rows) toast.error("Couldn't load the suppression list.");
      setData({ key: projectId, entries: rows ?? [], now: Date.now() });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = data.key !== projectId;
  const entries = data.entries;
  const existing = useMemo(() => new Set(entries.map((e) => `${e.kind}:${e.value}`)), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (reasonFilter !== "all" && e.reason !== reasonFilter) return false;
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (q && !`${e.value} ${e.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, query, reasonFilter, kindFilter]);

  const stats = useMemo(() => {
    const active = entries.filter((e) => !isExpired(e, data.now));
    const count = (reason) => active.filter((e) => e.reason === reason).length;
    return [
      { label: "Suppressed", value: loading ? "" : number(active.length), footer: `${active.filter((e) => e.kind === "domain").length} whole domains` },
      { label: "Hard bounces", value: loading ? "" : number(count("hard_bounce")), footer: "Undeliverable addresses" },
      { label: "Spam complaints", value: loading ? "" : number(count("complaint")), footer: "Reported as spam" },
      { label: "Unsubscribed", value: loading ? "" : number(count("unsubscribed")), footer: "Opted out everywhere" },
    ];
  }, [entries, data.now, loading]);

  const pager = usePagination(filtered, { resetKey: `${query}|${reasonFilter}|${kindFilter}` });

  const handleCreate = async (input) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const created = await createSuppression(projectId, { id, ...input, createdBy: user?.id ?? null });
    if (!created) {
      toast.error("Couldn't add the suppression.");
      return false;
    }
    setData((d) => ({ ...d, entries: [created, ...d.entries] }));
    toast.success(`${created.value} won't receive sends.`);
    return true;
  };

  const handleImport = async (inputs) => {
    const user = await getUser();
    const created = await createSuppressions(projectId, inputs.map((i) => ({ ...i, createdBy: user?.id ?? null })));
    if (!created) {
      toast.error("Couldn't import the suppressions.");
      return false;
    }
    setData((d) => ({ ...d, entries: [...created, ...d.entries] }));
    toast.success(`Suppressed ${plural(created.length, "address", "addresses")}.`);
    return true;
  };

  const handleSave = async (id, patch) => {
    const saved = await updateSuppression(id, patch);
    if (!saved) {
      toast.error("Couldn't save — that address may already be suppressed.");
      return;
    }
    setData((d) => ({ ...d, entries: d.entries.map((e) => (e.id === id ? saved : e)) }));
    toast.success("Suppression saved.");
  };

  // Lifting lets the address receive sends again; undo restores the same row.
  const handleLift = async (e) => {
    setData((d) => ({ ...d, entries: d.entries.filter((x) => x.id !== e.id) }));
    if (e.id === recordId) closeRecord();
    const ok = await softDeleteSuppression(e.id);
    if (!ok) {
      setData((d) => ({ ...d, entries: [e, ...d.entries] }));
      toast.error("Couldn't lift the suppression.");
      return;
    }
    toast.success(`${e.value} can receive sends again.`, {
      action: {
        label: "Undo",
        onClick: async () => {
          if (await restoreSuppression(e.id)) setData((d) => ({ ...d, entries: d.entries.some((x) => x.id === e.id) ? d.entries : [e, ...d.entries] }));
          else toast.error("Couldn't restore it.");
        },
      },
    });
  };

  const exportCsv = () => {
    const table = [
      ["Kind", "Address", "Reason", "Source", "Suppressed", "Expires"],
      ...filtered.map((e) => [e.kind, e.value, SUPPRESSION_REASON_MAP[e.reason].label, e.source, e.createdAt, e.expiresAt || ""]),
    ];
    downloadCsv("suppression-list.csv", toCsv(table));
    toast.success(`Exported ${plural(filtered.length, "address", "addresses")}.`);
  };

  const open = entries.find((e) => e.id === recordId);
  if (open) {
    return <SuppressionEditor key={open.id} record={open} canEdit={canEdit} now={data.now} onBack={closeRecord} onSave={handleSave} onLift={handleLift} />;
  }
  if (recordId && loading) return <LoadingArea size={88} label="Loading suppression" className="min-h-[60vh]" />;

  const filtersActive = query || reasonFilter !== "all" || kindFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setReasonFilter("all");
    setKindFilter("all");
  };

  const columns = [
    {
      key: "address",
      header: "Address",
      render: (e) => {
        const Icon = KIND_ICONS[e.kind];
        return (
          <div className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-label={SUPPRESSION_KIND_LABELS[e.kind]} />
            <span className="font-medium text-foreground">{e.value}</span>
            {isExpired(e, data.now) ? <Badge variant="outline">Expired</Badge> : null}
          </div>
        );
      },
    },
    { key: "reason", header: "Reason", render: (e) => <StatusPill status={e.reason} map={SUPPRESSION_REASON_MAP} /> },
    { key: "source", header: "Source", className: "max-w-64 truncate text-muted-foreground", render: (e) => e.source || "—" },
    { key: "added", header: "Suppressed", className: "whitespace-nowrap text-muted-foreground", render: (e) => formatDate(e.createdAt) },
    { key: "expires", header: "Until", className: "whitespace-nowrap text-muted-foreground", render: (e) => (e.expiresAt ? formatDate(e.expiresAt) : "Permanent") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (e) => (
        <ActionMenu
          label={`Actions for ${e.value}`}
          items={[
            { label: canEdit ? "Edit" : "View", icon: Pencil, onSelect: () => openRecord(e.id) },
            canEdit ? { label: "Lift suppression", icon: RotateCcw, onSelect: () => handleLift(e) } : null,
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Suppression"
        description="Addresses that never receive sends — bounces, complaints, unsubscribes and manual blocks, honoured on every channel."
        actions={
          <>
            {canExport ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={exportCsv} disabled={!filtered.length}>
                <Download className="h-4 w-4" /> Export
              </Button>
            ) : null}
            {canImport ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import
              </Button>
            ) : null}
            {canEdit ? (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add address
              </Button>
            ) : null}
          </>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={reasonFilter} onValueChange={setReasonFilter} options={REASON_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={kindFilter} onValueChange={setKindFilter} options={KIND_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search address or source…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading suppression list" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(e) => e.id}
            onRowClick={(e) => openRecord(e.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ShieldOff}
                  title={filtersActive ? "No matches" : "No suppressed addresses"}
                  description={filtersActive ? "Try a different search or filter." : "Hard bounces, complaints and unsubscribes land here automatically. You can also block an address by hand."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                    ) : canEdit ? (
                      <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" /> Add address
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="addresses" />
        </div>
      )}

      <AddSuppressionDialog open={addOpen} onOpenChange={setAddOpen} existing={existing} onCreate={handleCreate} />
      <ImportSuppressionsDialog open={importOpen} onOpenChange={setImportOpen} existing={existing} onImport={handleImport} />
    </MainScreenWrapper>
  );
}

export default SuppressionScreen;
