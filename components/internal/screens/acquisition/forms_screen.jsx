"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Code2,
  Copy,
  FileText,
  Inbox,
  Pause,
  Pencil,
  Play,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  StatsBar,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
  InlineTitleInput,
  SectionCard,
  StatGrid,
  StatusPill,
} from "@geiger/ui";

const TYPE_TONE = { Embedded: "info", Popup: "purple", Hosted: "neutral" };

const FORM_STATUS_MAP = {
  Live: { label: "Live", variant: "success", dotClass: "bg-emerald-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-400" },
  Paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
};

const FORM_TYPES = ["Embedded", "Popup", "Hosted"];
const FORM_STATUSES = Object.keys(FORM_STATUS_MAP);
const LISTS = ["Newsletter", "Product Updates", "Webinar"];

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...FORM_TYPES.map((t) => ({ value: t, label: t })),
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...FORM_STATUSES.map((s) => ({ value: s, label: s })),
];

const FORM_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "What the form is for and how visitors see it." },
  { key: "delivery", label: "Delivery", icon: Inbox, desc: "Where new leads land and whether the form is collecting." },
  { key: "embed", label: "Embed", icon: Code2, desc: "Paste this snippet wherever the form should appear." },
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Submissions and conversion since launch." },
];

const INITIAL = [
  { id: 1, name: "Footer Newsletter Signup", purpose: "Site-wide footer opt-in", type: "Embedded", submissions: 8420, conversion: 6, status: "Live" },
  { id: 2, name: "Exit-Intent Discount", purpose: "10% off in exchange for email", type: "Popup", submissions: 3190, conversion: 14, status: "Live" },
  { id: 3, name: "Webinar Registration", purpose: "Hosted page for Q3 product webinar", type: "Hosted", submissions: 1245, conversion: 38, status: "Live" },
  { id: 4, name: "Blog Sidebar Capture", purpose: "Embedded form on article pages", type: "Embedded", submissions: 2760, conversion: 4, status: "Paused" },
  { id: 5, name: "Ebook Download Gate", purpose: "Hosted gate for the SaaS playbook", type: "Hosted", submissions: 0, conversion: 0, status: "Draft" },
  { id: 6, name: "Welcome Mat Opt-in", purpose: "Full-screen popup for new visitors", type: "Popup", submissions: 4980, conversion: 9, status: "Live" },
];

const embedCode = (f) =>
  `<script src="https://forms.geiger.app/embed.js" data-form="${f.id}" async></script>`;

const copyText = (text, message) => {
  try {
    navigator.clipboard?.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Couldn't copy to the clipboard.");
  }
};

function CreateFormDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Embedded", list: LISTS[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      purpose: `New ${form.type.toLowerCase()} form → ${form.list}`,
      type: form.type, list: form.list, submissions: 0, conversion: 0, status: "Draft",
    });
    setForm({ name: "", type: "Embedded", list: LISTS[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create form</DialogTitle>
          <DialogDescription>Choose how visitors will see it and where new leads should land.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Form name" htmlFor="form-name">
            <Input id="form-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Homepage Hero Signup" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FORM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Destination list">
              <Select value={form.list} onValueChange={set("list")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{LISTS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create form</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a form row; drives the editor's dirty check.
const pickForm = (f) => ({
  name: f.name,
  purpose: f.purpose,
  type: f.type,
  list: f.list || LISTS[0],
  status: f.status,
});

// Status-changing primary action for each form status.
const PRIMARY_ACTION = {
  Draft: { label: "Publish", icon: Rocket, next: "Live", toast: "Form published." },
  Live: { label: "Pause", icon: Pause, next: "Paused", toast: "Form paused." },
  Paused: { label: "Resume", icon: Play, next: "Live", toast: "Form resumed." },
};

function FormEditor({ record, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => pickForm(record));
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(pickForm(record));
  const primary = PRIMARY_ACTION[draft.status] || PRIMARY_ACTION.Draft;

  const save = (patch = {}, message) => {
    const next = { ...draft, ...patch, name: draft.name.trim() || "Untitled form" };
    setDraft(next);
    onSave(record.id, next, message);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Form name"
          placeholder="Untitled form"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <StatusPill status={draft.status} map={FORM_STATUS_MAP} />
          <Badge variant={TYPE_TONE[draft.type]}>{draft.type}</Badge>
          <span className="text-xs text-text-tertiary">Leads → {draft.list}</span>
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete form"
            className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={() => onDelete(record)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            disabled={!dirty}
            onClick={() => save()}
          >
            Save
          </Button>
          <Button onClick={() => save({ status: primary.next }, primary.toast)}>
            <primary.icon className="h-4 w-4" /> {primary.label}
          </Button>
        </>
      }
      nav={FORM_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Purpose" htmlFor="fe-purpose" className="sm:col-span-2">
                  <Input id="fe-purpose" value={draft.purpose} onChange={(e) => set("purpose")(e.target.value)} placeholder="e.g. Site-wide footer opt-in" />
                </Field>
                <Field label="Type" hint="Embedded inline, shown as a popup, or hosted on its own page.">
                  <Select value={draft.type} onValueChange={set("type")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{FORM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "delivery" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Destination list" hint="New submissions are added to this list.">
                  <Select value={draft.list} onValueChange={set("list")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{LISTS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Status" hint="Only live forms accept submissions.">
                  <Select value={draft.status} onValueChange={set("status")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{FORM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "embed" ? (
            <SectionCard
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-surface-card hover:bg-surface-subtle"
                  onClick={() => copyText(embedCode(record), "Embed code copied.")}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              }
            >
              <Field label="Embed snippet">
                <div className="break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">
                  {embedCode(record)}
                </div>
              </Field>
            </SectionCard>
          ) : null}

          {active === "performance" ? (
            <StatGrid
              columns={2}
              stats={[
                { label: "Submissions", value: record.submissions.toLocaleString("en-US") },
                { label: "Conversion", value: `${record.conversion}%` },
              ]}
            />
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function FormsScreen() {
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [forms, setForms] = useState(INITIAL);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms.filter((f) =>
      (typeFilter === "all" || f.type === typeFilter) &&
      (statusFilter === "all" || f.status === statusFilter) &&
      (!q || f.name.toLowerCase().includes(q) || f.purpose.toLowerCase().includes(q)),
    );
  }, [forms, search, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const live = forms.filter((f) => f.status === "Live");
    const submissions = forms.reduce((s, f) => s + (Number(f.submissions) || 0), 0);
    const avg = live.length ? Math.round(live.reduce((s, f) => s + f.conversion, 0) / live.length) : 0;
    return [
      { label: "Forms", value: forms.length.toLocaleString("en-US") },
      { label: "Live", value: live.length.toLocaleString("en-US") },
      { label: "Submissions", value: submissions.toLocaleString("en-US") },
      { label: "Avg conversion", value: `${avg}%` },
    ];
  }, [forms]);

  const pager = usePagination(filtered, { resetKey: `${search}|${typeFilter}|${statusFilter}` });

  const handleCreate = (f) => {
    const row = { id: crypto.randomUUID(), ...f };
    setForms((p) => [row, ...p]);
    openRecord(row.id);
  };

  const handleSave = (id, patch, message = "Form saved.") => {
    setForms((p) => p.map((f) => (String(f.id) === String(id) ? { ...f, ...patch } : f)));
    toast.success(message);
  };

  const handleDuplicate = (f) => {
    const copy = { ...f, id: crypto.randomUUID(), name: `${f.name} (copy)`, status: "Draft", submissions: 0, conversion: 0 };
    setForms((p) => [copy, ...p]);
    toast.success("Form duplicated.");
  };

  const handleDelete = (f) => {
    setDeleteTarget(null);
    setForms((p) => p.filter((x) => x.id !== f.id));
    toast.success(`Deleted "${f.name}".`);
  };

  const open = forms.find((f) => String(f.id) === recordId);
  if (open) {
    return (
      <FormEditor
        key={open.id}
        record={open}
        onBack={closeRecord}
        onSave={handleSave}
        onDelete={(f) => {
          closeRecord();
          setDeleteTarget(f);
        }}
      />
    );
  }

  const filtersActive = search || typeFilter !== "all" || statusFilter !== "all";

  const columns = [
    {
      key: "form",
      header: "Form",
      render: (f) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground"><FileText className="h-4 w-4" /></span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{f.name}</span>
            <span className="truncate text-xs text-text-secondary">{f.purpose}</span>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (f) => <Badge variant={TYPE_TONE[f.type]}>{f.type}</Badge> },
    {
      key: "submissions",
      header: "Submissions",
      className: "tabular-nums text-muted-foreground",
      render: (f) => (f.submissions ? f.submissions.toLocaleString("en-US") : "—"),
    },
    {
      key: "conversion",
      header: "Conversion",
      render: (f) =>
        f.conversion > 0 ? (
          <div className="w-[120px] space-y-1.5">
            <Progress value={f.conversion} className="h-1.5 bg-surface-hover" />
            <p className="text-xs text-text-secondary">{f.conversion}%</p>
          </div>
        ) : <span className="text-text-secondary">—</span>,
    },
    { key: "status", header: "Status", render: (f) => <StatusPill status={f.status} map={FORM_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (f) => (
        <ActionMenu
          label="Form actions"
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openRecord(String(f.id)) },
            { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(f) },
            { label: "Get embed code", icon: Code2, onSelect: () => copyText(embedCode(f), "Embed code copied.") },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(f) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Forms"
        description="Capture leads with embedded, popup, and hosted signup forms."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New form
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search forms…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(f) => f.id}
          onRowClick={(f) => openRecord(String(f.id))}
          empty={
            <EmptyState
              icon={FileText}
              title={filtersActive ? "No matches" : "No forms yet"}
              description={
                filtersActive
                  ? "Try a different search or filter."
                  : "Create your first form to start capturing leads from your site."
              }
              action={
                filtersActive ? (
                  <Button
                    variant="outline"
                    className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                    onClick={() => {
                      setSearch("");
                      setTypeFilter("all");
                      setStatusFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> New form
                  </Button>
                )
              }
              className="rounded-xl border border-border bg-surface-subtle"
            />
          }
        />
        <ListPagination {...pager} itemLabel="forms" />
      </div>

      <CreateFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete form</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteTarget)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default FormsScreen;
