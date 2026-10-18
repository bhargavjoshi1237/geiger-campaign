"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Handshake, Pencil, Copy, MoveRight, Trash2, Trophy, FileText, KanbanSquare } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  StatsBar,
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
  InlineTitleInput,
  SectionCard,
} from "@geiger/ui";

const STAGE_TONE = {
  Lead: "neutral",
  Qualified: "info",
  Proposal: "purple",
  Negotiation: "warning",
  Won: "success",
  Lost: "danger",
};

const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const OWNERS = ["Alex Rivera", "Priya Nair", "Noor Haddad", "Maya Chen"];

const STAGE_FILTER_OPTIONS = [{ value: "all", label: "All stages" }, ...STAGES.map((s) => ({ value: s, label: s }))];
const OWNER_FILTER_OPTIONS = [{ value: "all", label: "All owners" }, ...OWNERS.map((o) => ({ value: o, label: o }))];

const DEAL_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "The opportunity, the account behind it, and its value." },
  { key: "pipeline", label: "Pipeline", icon: KanbanSquare, desc: "Where the deal sits in your pipeline and who owns it." },
];

const PRIMARY_BTN = "bg-primary text-primary-foreground hover:bg-primary/90";
const OUTLINE_BTN = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const INITIAL_DEALS = [
  { id: 1, name: "Annual platform license", company: "Northwind Logistics", value: 48000, stage: "Negotiation", owner: "Alex Rivera", close: "Jun 30, 2026" },
  { id: 2, name: "Onboarding services package", company: "Brightmail Co.", value: 12400, stage: "Proposal", owner: "Priya Nair", close: "Jun 24, 2026" },
  { id: 3, name: "Team seats expansion", company: "Lumen Analytics", value: 8600, stage: "Qualified", owner: "Noor Haddad", close: "Jul 12, 2026" },
  { id: 4, name: "Enterprise rollout", company: "Kaisho Industries", value: 96000, stage: "Lead", owner: "Maya Chen", close: "Aug 5, 2026" },
  { id: 5, name: "Migration & integration", company: "Vela Studios", value: 21500, stage: "Won", owner: "Alex Rivera", close: "Jun 2, 2026" },
  { id: 6, name: "Pilot program", company: "Plinth Robotics", value: 5400, stage: "Lost", owner: "Priya Nair", close: "May 28, 2026" },
  { id: 7, name: "Premium support contract", company: "Hverk GmbH", value: 33200, stage: "Qualified", owner: "Noor Haddad", close: "Jul 1, 2026" },
];

const fmt = (n) => `$${Number(n || 0).toLocaleString("en-US")}`;

// Editable slice of a deal, kept as strings so the dirty check compares like with like.
const toForm = (d) => ({
  name: d.name || "",
  company: d.company || "",
  value: String(d.value ?? ""),
  stage: d.stage || STAGES[0],
  owner: d.owner || OWNERS[0],
  close: d.close || "",
});

function CreateDealDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", company: "", value: "", stage: "Lead", owner: OWNERS[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.company.trim();

  const submit = () => {
    if (!valid) {
      toast.error("Give the deal a name and company.");
      return;
    }
    onCreate({
      name: form.name.trim(),
      company: form.company.trim(),
      value: Number(form.value) || 0,
      stage: form.stage,
      owner: form.owner,
      close: "—",
    });
    setForm({ name: "", company: "", value: "", stage: "Lead", owner: OWNERS[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>New deal</DialogTitle>
          <DialogDescription>Add a new opportunity to your pipeline.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Deal name" htmlFor="d-name">
            <Input id="d-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Annual platform license" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company" htmlFor="d-company">
              <Input id="d-company" value={form.company} onChange={(e) => set("company")(e.target.value)} placeholder="Northwind Logistics" />
            </Field>
            <Field label="Value (USD)" htmlFor="d-value">
              <Input id="d-value" type="number" min="0" value={form.value} onChange={(e) => set("value")(e.target.value)} placeholder="12400" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Stage">
              <Select value={form.stage} onValueChange={set("stage")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Owner">
              <Select value={form.owner} onValueChange={set("owner")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className={OUTLINE_BTN} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BTN} onClick={submit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DealEditor({ record, onBack, onSave, onDelete }) {
  const [form, setForm] = useState(() => toForm(record));
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(record));

  const persist = (extra = {}) => {
    const patch = { ...form, ...extra, name: form.name.trim() || "Untitled deal", value: Number(form.value) || 0 };
    onSave(record.id, patch);
    setForm(toForm({ ...record, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={form.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Deal name"
          placeholder="Untitled deal"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={STAGE_TONE[record.stage]}>{record.stage}</Badge>
          <span className="text-xs text-text-tertiary">{record.company} · {fmt(record.value)}</span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete deal" className="text-muted-foreground hover:bg-surface-active hover:text-red-400" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BTN} disabled={!dirty} onClick={() => persist()}>Save</Button>
          {record.stage !== "Won" ? (
            <Button className={PRIMARY_BTN} onClick={() => persist({ stage: "Won" })}>
              <Trophy className="h-4 w-4" /> Mark won
            </Button>
          ) : null}
        </>
      }
      nav={DEAL_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company" htmlFor="de-company">
                  <Input id="de-company" value={form.company} onChange={(e) => set("company")(e.target.value)} placeholder="Northwind Logistics" />
                </Field>
                <Field label="Value (USD)" htmlFor="de-value">
                  <Input id="de-value" type="number" min="0" value={form.value} onChange={(e) => set("value")(e.target.value)} className="tabular-nums" />
                </Field>
                <Field label="Expected close" htmlFor="de-close" hint="e.g. Jun 30, 2026">
                  <Input id="de-close" value={form.close} onChange={(e) => set("close")(e.target.value)} placeholder="Jun 30, 2026" />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "pipeline" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Stage">
                  <Select value={form.stage} onValueChange={set("stage")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Owner">
                  <Select value={form.owner} onValueChange={set("owner")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function DealsScreen() {
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [deals, setDeals] = useState(INITIAL_DEALS);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (q && !`${d.name} ${d.company}`.toLowerCase().includes(q)) return false;
      if (stageFilter !== "all" && d.stage !== stageFilter) return false;
      if (ownerFilter !== "all" && d.owner !== ownerFilter) return false;
      return true;
    });
  }, [deals, search, stageFilter, ownerFilter]);

  const stats = useMemo(() => {
    const open = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
    const won = deals.filter((d) => d.stage === "Won");
    const lost = deals.filter((d) => d.stage === "Lost").length;
    const closed = won.length + lost;
    return [
      { label: "Open deals", value: open.length.toLocaleString("en-US") },
      { label: "Pipeline value", value: fmt(open.reduce((s, d) => s + (d.value || 0), 0)) },
      { label: "Won value", value: fmt(won.reduce((s, d) => s + (d.value || 0), 0)) },
      { label: "Win rate", value: `${closed ? Math.round((won.length / closed) * 100) : 0}%` },
    ];
  }, [deals]);

  const pager = usePagination(filtered, { resetKey: `${search}|${stageFilter}|${ownerFilter}` });

  const handleCreate = (d) => {
    const deal = { id: crypto.randomUUID(), ...d };
    setDeals((prev) => [deal, ...prev]);
    toast.success("Deal created.");
    openRecord(deal.id);
  };

  const handleSave = (id, patch) => {
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    toast.success("Deal saved.");
  };

  const handleDuplicate = (d) => {
    setDeals((prev) => [{ ...d, id: crypto.randomUUID(), name: `${d.name} (copy)` }, ...prev]);
    toast.success("Deal duplicated.");
  };

  const handleDelete = (d) => {
    setDeleteTarget(null);
    setDeals((prev) => prev.filter((x) => x.id !== d.id));
    toast.success(`Deleted "${d.name}".`);
  };

  const moveStage = (id) =>
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const i = STAGES.indexOf(d.stage);
        return { ...d, stage: STAGES[Math.min(i + 1, STAGES.length - 1)] };
      }),
    );

  const open = deals.find((d) => String(d.id) === recordId);
  if (open) {
    return (
      <DealEditor
        key={open.id}
        record={open}
        onBack={closeRecord}
        onSave={handleSave}
        onDelete={() => {
          setDeleteTarget(open);
          closeRecord();
        }}
      />
    );
  }

  const filtersActive = search || stageFilter !== "all" || ownerFilter !== "all";

  const columns = [
    {
      key: "deal",
      header: "Deal",
      render: (d) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
            <Handshake className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{d.name}</span>
            <span className="truncate text-xs text-text-secondary">{d.company}</span>
          </div>
        </div>
      ),
    },
    { key: "value", header: "Value", className: "tabular-nums text-foreground", render: (d) => fmt(d.value) },
    { key: "stage", header: "Stage", render: (d) => <Badge variant={STAGE_TONE[d.stage]}>{d.stage}</Badge> },
    { key: "owner", header: "Owner", className: "text-muted-foreground" },
    { key: "close", header: "Close date", className: "whitespace-nowrap text-muted-foreground" },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (d) => (
        <ActionMenu
          label="Deal actions"
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openRecord(String(d.id)) },
            { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(d) },
            { label: "Move stage", icon: MoveRight, onSelect: () => moveStage(d.id) },
            { separator: true },
            { label: "Delete", icon: Trash2, variant: "destructive", onSelect: () => setDeleteTarget(d) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Deals"
        description="Track every opportunity from first touch to close."
        actions={
          <Button className={PRIMARY_BTN} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New deal
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={stageFilter} onValueChange={setStageFilter} options={STAGE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={ownerFilter} onValueChange={setOwnerFilter} options={OWNER_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search deals…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(d) => d.id}
          onRowClick={(d) => openRecord(String(d.id))}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Handshake}
                title={filtersActive ? "No matches" : "No deals yet"}
                description={filtersActive ? "Try a different search or filter." : "Create your first deal to start tracking your pipeline."}
                action={
                  filtersActive ? (
                    <Button
                      variant="outline"
                      className={OUTLINE_BTN}
                      onClick={() => {
                        setSearch("");
                        setStageFilter("all");
                        setOwnerFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button className={PRIMARY_BTN} onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> New deal
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="deals" />
      </div>

      <CreateDealDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete deal</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => handleDelete(deleteTarget)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default DealsScreen;
