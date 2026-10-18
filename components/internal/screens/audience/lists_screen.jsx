"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  List as ListIcon,
  Pencil,
  Copy,
  Download,
  Trash2,
  TrendingUp,
  TrendingDown,
  FileText,
  Settings2,
  BarChart3,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  SettingsList,
  SettingRow,
  StatsBar,
  SectionCard,
  InlineTitleInput,
} from "@geiger/ui";

const INITIAL_LISTS = [
  { id: 1, name: "Newsletter", description: "Weekly digest for all opted-in contacts", type: "Standard", subscribers: 18420, growth: 4.2 },
  { id: 2, name: "Product Updates", description: "Release notes and feature announcements", type: "Standard", subscribers: 12180, growth: 2.1 },
  { id: 3, name: "Active in 30 days", description: "Auto-updates from engagement activity", type: "Dynamic", subscribers: 8740, growth: -1.4 },
  { id: 4, name: "Webinar Attendees", description: "Registered for any live session", type: "Standard", subscribers: 3120, growth: 11.7 },
  { id: 5, name: "VIP Customers", description: "Lifetime value over $1,000", type: "Dynamic", subscribers: 940, growth: 6.5 },
];

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "Standard", label: "Standard" },
  { value: "Dynamic", label: "Dynamic" },
];

const GROWTH_FILTER_OPTIONS = [
  { value: "all", label: "All growth" },
  { value: "growing", label: "Growing" },
  { value: "shrinking", label: "Shrinking" },
];

const LIST_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name the list and describe what it's for." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "How the list is managed and how people join it." },
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Subscriber count and recent growth." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

function GrowthValue({ growth }) {
  const up = growth >= 0;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium tabular-nums", up ? "text-emerald-400" : "text-red-400")}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {up ? "+" : ""}{growth}%
    </span>
  );
}

function CreateListDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", description: "", type: "Standard", doubleOptIn: true });

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      description: form.description.trim() || "—",
      type: form.type,
      doubleOptIn: form.doubleOptIn,
      subscribers: 0,
      growth: 0,
    });
    setForm({ name: "", description: "", type: "Standard", doubleOptIn: true });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create list</DialogTitle>
          <DialogDescription>Lists group contacts for sending. Dynamic lists update automatically from rules.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="List name" htmlFor="l-name">
            <Input id="l-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring Promo" />
          </Field>
          <Field label="Description" htmlFor="l-desc">
            <Textarea id="l-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this list for?" />
          </Field>
          <Field label="List type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Standard">Standard — manually managed</SelectItem>
                <SelectItem value="Dynamic">Dynamic — rule-based, auto-updating</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3">
            <SettingRow
              title="Require double opt-in"
              description="New subscribers confirm via email before joining."
              checked={form.doubleOptIn}
              onCheckedChange={(v) => setForm((f) => ({ ...f, doubleOptIn: v }))}
            />
          </SettingsList>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create list</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a list row; compared against the row to derive dirty state.
const toDraft = (l) => ({
  name: l.name,
  description: l.description === "—" ? "" : l.description,
  type: l.type,
  doubleOptIn: l.doubleOptIn ?? true,
});

function ListEditor({ record, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));

  const save = () => {
    const patch = { ...draft, name: draft.name.trim() || "Untitled list", description: draft.description.trim() || "—" };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="List name"
          placeholder="Untitled list"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={draft.type === "Dynamic" ? "purple" : "info"}>{draft.type}</Badge>
          <span className="text-xs text-text-tertiary">{record.subscribers.toLocaleString("en-US")} subscribers</span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete list" className="text-red-400 hover:bg-red-500/10 hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={LIST_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="List name" htmlFor="le-name">
                  <Input id="le-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Spring Promo" />
                </Field>
                <Field label="Description" htmlFor="le-desc" className="sm:col-span-2">
                  <Textarea id="le-desc" value={draft.description} onChange={(e) => set("description")(e.target.value)} placeholder="What is this list for?" />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "settings" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="List type" hint="Dynamic lists update automatically from rules.">
                  <Select value={draft.type} onValueChange={set("type")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Standard">Standard — manually managed</SelectItem>
                      <SelectItem value="Dynamic">Dynamic — rule-based, auto-updating</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Require double opt-in"
                  description="New subscribers confirm via email before joining."
                  checked={draft.doubleOptIn}
                  onCheckedChange={set("doubleOptIn")}
                />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "performance" ? (
            <SectionCard>
              <SettingsList>
                <SettingRow
                  title="Subscribers"
                  description="Contacts currently on this list."
                  control={<span className="text-sm font-semibold tabular-nums text-foreground">{record.subscribers.toLocaleString("en-US")}</span>}
                />
                <SettingRow
                  title="30-day growth"
                  description="Net change in subscribers over the last 30 days."
                  control={<GrowthValue growth={record.growth} />}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function ListsScreen() {
  const [lists, setLists] = useState(INITIAL_LISTS);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [growthFilter, setGrowthFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lists.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && l.type !== typeFilter) return false;
      if (growthFilter === "growing" && l.growth < 0) return false;
      if (growthFilter === "shrinking" && l.growth >= 0) return false;
      return true;
    });
  }, [lists, query, typeFilter, growthFilter]);

  const stats = useMemo(() => {
    const subscribers = lists.reduce((s, l) => s + l.subscribers, 0);
    const dynamic = lists.filter((l) => l.type === "Dynamic").length;
    const avgGrowth = lists.length ? lists.reduce((s, l) => s + l.growth, 0) / lists.length : 0;
    return [
      { label: "Lists", value: lists.length.toLocaleString("en-US") },
      { label: "Subscribers", value: subscribers.toLocaleString("en-US") },
      { label: "Dynamic lists", value: dynamic.toLocaleString("en-US") },
      { label: "Avg. 30-day growth", value: `${avgGrowth >= 0 ? "+" : ""}${avgGrowth.toFixed(1)}%` },
    ];
  }, [lists]);

  const pager = usePagination(filtered, { resetKey: `${query}|${typeFilter}|${growthFilter}` });

  const handleCreate = (l) => {
    const id = crypto.randomUUID();
    setLists((p) => [{ id, ...l }, ...p]);
    openRecord(id);
  };

  const handleSave = (id, patch) => {
    setLists((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    toast.success("List saved.");
  };

  const handleDuplicate = (l) => {
    setLists((p) => [{ ...l, id: crypto.randomUUID(), name: `${l.name} (copy)` }, ...p]);
    toast.success("List duplicated.");
  };

  const handleDelete = (l) => {
    setDeleteTarget(null);
    setLists((p) => p.filter((x) => x.id !== l.id));
    if (String(l.id) === recordId) closeRecord();
    toast.success(`Deleted "${l.name}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete list</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Contacts stay in your audience. This can&apos;t be undone.
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
  );

  const open = lists.find((l) => String(l.id) === recordId);
  if (open) {
    return (
      <>
        <ListEditor key={open.id} record={open} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || typeFilter !== "all" || growthFilter !== "all";

  const columns = [
    {
      key: "list",
      header: "List",
      render: (l) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <ListIcon className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{l.name}</span>
            <span className="truncate text-xs text-text-secondary">{l.description}</span>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (l) => <Badge variant={l.type === "Dynamic" ? "purple" : "info"}>{l.type}</Badge>,
    },
    {
      key: "subscribers",
      header: "Subscribers",
      className: "tabular-nums font-medium text-foreground",
      render: (l) => l.subscribers.toLocaleString("en-US"),
    },
    {
      key: "growth",
      header: "30-day growth",
      render: (l) => <GrowthValue growth={l.growth} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (l) => (
        <ActionMenu
          label="List actions"
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openRecord(String(l.id)) },
            { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(l) },
            { label: "Export CSV", icon: Download, onSelect: () => toast.success(`Exporting "${l.name}"…`) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(l) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Lists"
        description="Group contacts into standard or dynamic lists for targeted sending."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New list
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={growthFilter} onValueChange={setGrowthFilter} options={GROWTH_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search lists…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(l) => l.id}
          onRowClick={(l) => openRecord(String(l.id))}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={ListIcon}
                title={filtersActive ? "No matches" : "No lists yet"}
                description={filtersActive ? "Try a different search or filter." : "Create your first list to start grouping contacts for sending."}
                action={
                  filtersActive ? (
                    <Button
                      variant="outline"
                      className={OUTLINE_BUTTON}
                      onClick={() => {
                        setQuery("");
                        setTypeFilter("all");
                        setGrowthFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> New list
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="lists" />
      </div>

      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ListsScreen;
