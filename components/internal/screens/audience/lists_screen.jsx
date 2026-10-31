"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Users,
  UserPlus,
  UserMinus,
  Clock,
  Loader2,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { listContacts } from "@/lib/supabase/contacts";
import {
  addListMembers,
  createList,
  listAllMemberships,
  listListMembers,
  listLists,
  membershipStats,
  removeListMembers,
  softDeleteList,
  updateList,
  updateListMemberStatus,
} from "@/lib/supabase/lists";
import { downloadCsv, toCsv } from "@/lib/audience/csv";
import {
  Button,
  Checkbox,
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
  LoadingArea,
  SettingsList,
  SettingRow,
  StatsBar,
  StatGrid,
  StatusPill,
  SectionCard,
  InlineTitleInput,
  Switch,
} from "@geiger/ui";
import { CONTACT_STATUS_MAP, DESTRUCTIVE_BUTTON, DESTRUCTIVE_GHOST, MEMBER_STATUS_MAP, OUTLINE_BUTTON, formatDate, number, plural } from "./constants";

const OPT_IN_FILTER_OPTIONS = [
  { value: "all", label: "All opt-in types" },
  { value: "double", label: "Double opt-in" },
  { value: "single", label: "Single opt-in" },
];

const GROWTH_FILTER_OPTIONS = [
  { value: "all", label: "All growth" },
  { value: "growing", label: "Growing" },
  { value: "shrinking", label: "Shrinking" },
];

const MEMBER_FILTER_OPTIONS = [
  { value: "all", label: "All members" },
  ...Object.entries(MEMBER_STATUS_MAP).map(([value, { label }]) => ({ value, label })),
];

const LIST_NAV = [
  { key: "overview", label: "Overview", icon: BarChart3, desc: "Members and 30-day movement, from membership records." },
  { key: "members", label: "Members", icon: Users, desc: "Who is on the list and their membership status." },
  { key: "details", label: "Details", icon: FileText, desc: "Name the list and describe what it's for." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "How people join the list." },
];

const EMPTY_STATS = { subscribed: 0, pending: 0, unsubscribed: 0, joined30: 0, left30: 0 };

// Net 30-day change and growth % from membership stats.
function growthOf(stats) {
  const s = stats || EMPTY_STATS;
  const size = s.subscribed + s.pending;
  const net = s.joined30 - s.left30;
  const start = size - net;
  return { net, pct: start > 0 ? (net / start) * 100 : net > 0 ? 100 : 0, size };
}

function GrowthValue({ net, pct }) {
  if (!net) return <span className="text-sm tabular-nums text-text-tertiary">No change</span>;
  const up = net > 0;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium tabular-nums", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {up ? "+" : "−"}{number(Math.abs(net))}
      <span className="text-xs font-normal text-text-secondary">({up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%)</span>
    </span>
  );
}

const EMPTY_FORM = { name: "", description: "", doubleOptIn: false };

function CreateListDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(EMPTY_FORM);
  }

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const ok = await onCreate({ name: form.name.trim(), description: form.description.trim(), doubleOptIn: form.doubleOptIn });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create list</DialogTitle>
          <DialogDescription>Lists group contacts you target by hand. For rule-based audiences, use a segment.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="List name" htmlFor="l-name">
            <Input id="l-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Studio Notes newsletter" autoFocus />
          </Field>
          <Field label="Description" htmlFor="l-desc">
            <Textarea id="l-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this list for?" />
          </Field>
          <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3">
            <SettingRow
              title="Require double opt-in"
              description="Sign-ups from forms and the API stay pending until they confirm by email."
              checked={form.doubleOptIn}
              onCheckedChange={(v) => setForm((f) => ({ ...f, doubleOptIn: v }))}
            />
          </SettingsList>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMembersDialog({ open, onOpenChange, projectId, memberIds, onAdd }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [found, setFound] = useState({ key: null, rows: [] });
  const [picked, setPicked] = useState(() => new Set());
  const [status, setStatus] = useState("subscribed");
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setSearch("");
      setPicked(new Set());
      setStatus("subscribed");
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const key = `${open}|${search}`;
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    listContacts(projectId, { search, limit: 50 }).then((rows) => alive && setFound({ key, rows: rows ?? [] }));
    return () => {
      alive = false;
    };
  }, [open, projectId, search, key]);

  const candidates = found.rows.filter((c) => !memberIds.has(c.id));
  const allShownPicked = candidates.length > 0 && candidates.every((c) => picked.has(c.id));
  const toggleShown = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      candidates.forEach((c) => (allShownPicked ? next.delete(c.id) : next.add(c.id)));
      return next;
    });
  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setSaving(true);
    const ok = await onAdd([...picked], status);
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add contacts</DialogTitle>
          <DialogDescription>Search your audience and pick who joins this list.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <SearchInput expanded value={query} onChange={setQuery} placeholder="Search name, email or phone…" aria-label="Search contacts" />
          <div className="overflow-hidden rounded-lg border border-border bg-surface-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-text-secondary">
              <label className="flex cursor-pointer items-center gap-3">
                <Checkbox checked={allShownPicked} onCheckedChange={toggleShown} disabled={!candidates.length} aria-label="Select all shown" />
                Select all shown
              </label>
              <span className="tabular-nums">{picked.size ? `${number(picked.size)} selected` : `${number(candidates.length)} shown`}</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {found.key !== key ? (
                <LoadingArea size={36} label="Searching contacts" className="py-10" />
              ) : candidates.length ? (
                <ul className="divide-y divide-border">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-hover">
                        <Checkbox checked={picked.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                          <span className="block truncate text-xs text-text-secondary">{c.email || c.phone}</span>
                        </span>
                        <StatusPill status={c.status} map={CONTACT_STATUS_MAP} />
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-10 text-center text-sm text-text-tertiary">{search ? "No contacts match that search." : "Everyone shown is already on this list."}</p>
              )}
            </div>
          </div>
          <Field label="Membership status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(MEMBER_STATUS_MAP).map(([value, { label }]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!picked.size || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add {picked.size ? plural(picked.size, "contact") : "contacts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The "Add contacts" trigger lives in the editor's section header, so the dialog state is owned by ListEditor.
function ListMembers({ projectId, list, canEdit, onChanged, addOpen, onAddOpenChange }) {
  const [state, setState] = useState({ key: null, members: [] });
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const key = `${list.id}|${version}`;

  useEffect(() => {
    let alive = true;
    listListMembers(projectId, list.id).then((rows) => {
      if (!alive) return;
      if (!rows) toast.error("Couldn't load members.");
      setState({ key, members: rows ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [projectId, list.id, key]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.members.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (q && !`${m.contact?.name} ${m.contact?.email} ${m.contact?.phone}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [state.members, query, statusFilter]);
  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}` });

  const changeStatus = async (member, status) => {
    setState((s) => ({ ...s, members: s.members.map((m) => (m.id === member.id ? { ...m, status } : m)) }));
    const ok = await updateListMemberStatus(list.id, [member.contactId], status);
    if (!ok) {
      toast.error("Couldn't change the status.");
      setVersion((v) => v + 1);
      return;
    }
    onChanged();
  };

  const remove = async (member) => {
    setState((s) => ({ ...s, members: s.members.filter((m) => m.id !== member.id) }));
    const ok = await removeListMembers(list.id, [member.contactId]);
    if (!ok) {
      toast.error("Couldn't remove the contact.");
      setVersion((v) => v + 1);
      return;
    }
    toast.success(`Removed ${member.contact?.name} from ${list.name}.`);
    onChanged();
  };

  const add = async (contactIds, status) => {
    const user = await getUser();
    const ok = await addListMembers(projectId, list.id, contactIds, { status, createdBy: user?.id ?? null });
    if (!ok) {
      toast.error("Couldn't add those contacts.");
      return false;
    }
    toast.success(`Added ${plural(contactIds.length, "contact")} to ${list.name}.`);
    setVersion((v) => v + 1);
    onChanged();
    return true;
  };

  if (state.key !== key && !state.members.length) return <LoadingArea size={48} label="Loading members" panel />;

  return (
    <div className="space-y-4">
      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={MEMBER_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search members…" />
      </Toolbar>
      <DataTable
        columns={[
          {
            key: "contact",
            header: "Contact",
            render: (m) => (
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-foreground">{m.contact?.name}</span>
                <span className="truncate text-xs text-text-secondary">{m.contact?.email || m.contact?.phone}</span>
              </div>
            ),
          },
          { key: "contactStatus", header: "Contact status", render: (m) => <StatusPill status={m.contact?.status} map={CONTACT_STATUS_MAP} /> },
          {
            key: "status",
            header: "On this list",
            render: (m) =>
              canEdit ? (
                <Select value={m.status} onValueChange={(v) => changeStatus(m, v)}>
                  <SelectTrigger size="sm" className="w-36" aria-label={`List status for ${m.contact?.name}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEMBER_STATUS_MAP).map(([value, { label }]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <StatusPill status={m.status} map={MEMBER_STATUS_MAP} />
              ),
          },
          { key: "source", header: "Added via", className: "text-muted-foreground", render: (m) => m.source },
          { key: "joined", header: "Joined", className: "whitespace-nowrap text-muted-foreground", render: (m) => formatDate(m.createdAt) },
          {
            key: "actions",
            header: "",
            align: "right",
            render: (m) =>
              canEdit ? (
                <Button variant="ghost" size="icon-sm" className={DESTRUCTIVE_GHOST} aria-label={`Remove ${m.contact?.name}`} onClick={() => remove(m)}>
                  <UserMinus className="h-4 w-4" />
                </Button>
              ) : null,
          },
        ]}
        data={pager.pageItems}
        getRowKey={(m) => m.id}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={Users}
              title={state.members.length ? "No matches" : "No members yet"}
              description={state.members.length ? "Try a different search or filter." : "Add contacts here, from the Contacts bulk bar, or with a CSV import."}
              action={
                !state.members.length && canEdit ? (
                  <Button onClick={() => onAddOpenChange(true)}>
                    <UserPlus className="h-4 w-4" /> Add contacts
                  </Button>
                ) : null
              }
            />
          </div>
        }
      />
      <ListPagination {...pager} itemLabel="members" />
      <AddMembersDialog
        open={addOpen}
        onOpenChange={onAddOpenChange}
        projectId={projectId}
        memberIds={new Set(state.members.map((m) => m.contactId))}
        onAdd={add}
      />
    </div>
  );
}

const toDraft = (l) => ({ name: l.name, description: l.description, doubleOptIn: l.doubleOptIn });

function ListEditor({ projectId, record, stats, canEdit, canDelete, onBack, onSave, onDelete, onMembershipChange }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { section } = useWorkspaceUrl();
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const s = stats || EMPTY_STATS;
  const { net, pct } = growthOf(s);

  const performance = [
    { label: "Subscribed", value: number(s.subscribed), icon: Users, hint: "Receive sends to this list" },
    { label: "Pending", value: number(s.pending), icon: Clock, hint: record.doubleOptIn ? "Awaiting confirmation" : "Not yet confirmed" },
    { label: "Unsubscribed", value: number(s.unsubscribed), icon: UserMinus, hint: "Left this list" },
    { label: "Joined, 30 days", value: number(s.joined30), icon: UserPlus, hint: "Still on the list" },
    { label: "Left, 30 days", value: number(s.left30), icon: UserMinus, hint: "Removed or unsubscribed" },
    { label: "Net change", value: `${net >= 0 ? "+" : "−"}${number(Math.abs(net))}`, icon: net >= 0 ? TrendingUp : TrendingDown, hint: `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% over 30 days` },
  ];

  const save = async () => {
    setSaving(true);
    const ok = await onSave(record.id, { ...draft, name: draft.name.trim() || "Untitled list", description: draft.description.trim() });
    setSaving(false);
    if (ok) setDraft(toDraft(ok));
  };

  return (
    <EditorShell
      back={{ label: "Lists", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="List name"
          placeholder="Untitled list"
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={draft.doubleOptIn ? "purple" : "neutral"}>{draft.doubleOptIn ? "Double opt-in" : "Single opt-in"}</Badge>
          <span className="text-xs text-text-tertiary">{plural(s.subscribed, "subscriber")} · created {formatDate(record.createdAt)}</span>
        </>
      }
      actions={
        <>
          {canDelete ? (
            <Button variant="ghost" size="icon" aria-label="Delete list" className={DESTRUCTIVE_GHOST} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
        </>
      }
      nav={LIST_NAV}
      defaultSection="overview"
      sectionAction={
        section === "members" && canEdit ? (
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add contacts
          </Button>
        ) : null
      }
    >
      {({ active }) => (
        <>
          {active === "overview" ? <StatGrid stats={performance} columns={3} /> : null}
          {active === "members" ? <ListMembers projectId={projectId} list={record} canEdit={canEdit} onChanged={onMembershipChange} addOpen={addOpen} onAddOpenChange={setAddOpen} /> : null}
          {active === "details" ? (
            <SectionCard bare title="List details" description="The name and purpose your team sees when picking this list.">
              <div className="grid gap-4">
                <Field label="List name" htmlFor="le-name">
                  <Input id="le-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} />
                </Field>
                <Field label="Description" htmlFor="le-desc">
                  <Textarea id="le-desc" value={draft.description} disabled={!canEdit} onChange={(e) => set("description")(e.target.value)} placeholder="What is this list for?" />
                </Field>
              </div>
            </SectionCard>
          ) : null}
          {active === "settings" ? (
            <SectionCard bare title="Joining" description="Whether new sign-ups confirm by email before they count as subscribed.">
              <SettingsList>
                <SettingRow
                  title="Require double opt-in"
                  description="Sign-ups from forms and the API stay pending until they confirm by email. Contacts you add by hand or import join straight away."
                  control={<Switch checked={draft.doubleOptIn} disabled={!canEdit} onCheckedChange={set("doubleOptIn")} aria-label="Require double opt-in" />}
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
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.contact.edit");
  const canDelete = can("campaign.contact.delete");
  const canExport = can("campaign.contact.export");
  const [data, setData] = useState({ key: null, lists: [], memberships: [] });
  const [query, setQuery] = useState("");
  const [optInFilter, setOptInFilter] = useState("all");
  const [growthFilter, setGrowthFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [now, setNow] = useState(0);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const load = useCallback(
    () => Promise.all([listLists(projectId), listAllMemberships(projectId, { includeRemoved: true })]),
    [projectId],
  );

  useEffect(() => {
    let alive = true;
    load().then(([lists, memberships]) => {
      if (!alive) return;
      if (!lists) toast.error("Couldn't load lists.");
      setData({ key: projectId, lists: lists ?? [], memberships: memberships ?? [] });
      setNow(Date.now());
    });
    return () => {
      alive = false;
    };
  }, [load, projectId]);

  const reloadMemberships = () =>
    listAllMemberships(projectId, { includeRemoved: true }).then((memberships) => {
      if (memberships) setData((d) => ({ ...d, memberships }));
      setNow(Date.now());
    });

  const loading = data.key !== projectId;
  const statsByList = useMemo(() => membershipStats(data.memberships, now || undefined), [data.memberships, now]);
  const lists = data.lists;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lists.filter((l) => {
      if (q && !`${l.name} ${l.description}`.toLowerCase().includes(q)) return false;
      if (optInFilter === "double" && !l.doubleOptIn) return false;
      if (optInFilter === "single" && l.doubleOptIn) return false;
      const { net } = growthOf(statsByList[l.id]);
      if (growthFilter === "growing" && net <= 0) return false;
      if (growthFilter === "shrinking" && net >= 0) return false;
      return true;
    });
  }, [lists, query, optInFilter, growthFilter, statsByList]);

  const stats = useMemo(() => {
    const live = new Set(lists.map((l) => l.id));
    const subscribed = lists.reduce((sum, l) => sum + (statsByList[l.id]?.subscribed || 0), 0);
    const unique = new Set(data.memberships.filter((m) => !m.deletedAt && m.status === "subscribed" && live.has(m.listId)).map((m) => m.contactId)).size;
    const joined = lists.reduce((sum, l) => sum + (statsByList[l.id]?.joined30 || 0), 0);
    return [
      { label: "Lists", value: loading ? "" : number(lists.length), footer: `${lists.filter((l) => l.doubleOptIn).length} double opt-in` },
      { label: "Subscriptions", value: loading ? "" : number(subscribed), footer: "Across all lists" },
      { label: "Unique subscribers", value: loading ? "" : number(unique), footer: "On at least one list" },
      { label: "Joined, 30 days", value: loading ? "" : number(joined), footer: "Still subscribed" },
    ];
  }, [lists, statsByList, data.memberships, loading]);

  const pager = usePagination(filtered, { resetKey: `${query}|${optInFilter}|${growthFilter}` });

  const handleCreate = async (input) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const optimistic = { id, projectId, ...input, createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, lists: [optimistic, ...d.lists] }));
    const created = await createList(projectId, { id, ...input, createdBy: user?.id ?? null });
    if (!created) {
      setData((d) => ({ ...d, lists: d.lists.filter((l) => l.id !== id) }));
      toast.error("Couldn't create the list.");
      return false;
    }
    setData((d) => ({ ...d, lists: d.lists.map((l) => (l.id === id ? created : l)) }));
    toast.success(`Created "${created.name}".`);
    openRecord(id);
    return true;
  };

  const handleSave = async (id, patch) => {
    const before = lists.find((l) => l.id === id);
    setData((d) => ({ ...d, lists: d.lists.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    const saved = await updateList(id, patch);
    if (!saved) {
      setData((d) => ({ ...d, lists: d.lists.map((l) => (l.id === id ? before : l)) }));
      toast.error("Couldn't save the list.");
      return null;
    }
    setData((d) => ({ ...d, lists: d.lists.map((l) => (l.id === id ? saved : l)) }));
    toast.success("List saved.");
    return saved;
  };

  const handleDuplicate = async (l) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const created = await createList(projectId, { id, name: `${l.name} (copy)`, description: l.description, doubleOptIn: l.doubleOptIn, createdBy: user?.id ?? null });
    if (!created) {
      toast.error("Couldn't duplicate the list.");
      return;
    }
    const memberIds = data.memberships.filter((m) => m.listId === l.id && !m.deletedAt && m.status === "subscribed").map((m) => m.contactId);
    if (memberIds.length) await addListMembers(projectId, id, memberIds, { source: "duplicate", createdBy: user?.id ?? null });
    setData((d) => ({ ...d, lists: [created, ...d.lists] }));
    reloadMemberships();
    toast.success(`Duplicated with ${plural(memberIds.length, "subscriber")}.`);
  };

  const handleExport = async (l) => {
    const members = await listListMembers(projectId, l.id);
    if (!members) {
      toast.error("Couldn't export the list.");
      return;
    }
    const table = [
      ["Email", "First name", "Last name", "Phone", "List status", "Contact status", "Joined"],
      ...members.map((m) => [m.contact?.email, m.contact?.firstName, m.contact?.lastName, m.contact?.phone, m.status, m.contact?.status, m.createdAt]),
    ];
    downloadCsv(`${l.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "list"}.csv`, toCsv(table));
    toast.success(`Exported ${plural(members.length, "member")}.`);
  };

  const handleDelete = async (l) => {
    setDeleteTarget(null);
    setData((d) => ({ ...d, lists: d.lists.filter((x) => x.id !== l.id) }));
    if (l.id === recordId) closeRecord();
    const ok = await softDeleteList(l.id);
    if (!ok) {
      setData((d) => ({ ...d, lists: [l, ...d.lists] }));
      toast.error("Couldn't delete the list.");
      return;
    }
    toast.success(`Deleted "${l.name}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete list</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Contacts stay in your audience; campaigns that target this list stop including its members.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DESTRUCTIVE_BUTTON} onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = lists.find((l) => l.id === recordId);
  if (open) {
    return (
      <>
        <ListEditor
          key={open.id}
          projectId={projectId}
          record={open}
          stats={statsByList[open.id]}
          canEdit={canEdit}
          canDelete={canDelete}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onMembershipChange={reloadMemberships}
        />
        {deleteDialog}
      </>
    );
  }
  if (recordId && loading) return <LoadingArea size={88} label="Loading list" className="min-h-[60vh]" />;

  const filtersActive = query || optInFilter !== "all" || growthFilter !== "all";

  const columns = [
    {
      key: "list",
      header: "List",
      render: (l) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{l.name}</span>
          <span className="truncate text-xs text-text-secondary">{l.description || "No description"}</span>
        </div>
      ),
    },
    {
      key: "optin",
      header: "Opt-in",
      render: (l) => <Badge variant={l.doubleOptIn ? "purple" : "neutral"}>{l.doubleOptIn ? "Double" : "Single"}</Badge>,
    },
    { key: "subscribers", header: "Subscribed", align: "right", className: "tabular-nums font-medium text-foreground", render: (l) => number(statsByList[l.id]?.subscribed) },
    { key: "pending", header: "Pending", align: "right", className: "tabular-nums text-muted-foreground", render: (l) => number(statsByList[l.id]?.pending) },
    { key: "growth", header: "30-day change", render: (l) => <GrowthValue {...growthOf(statsByList[l.id])} /> },
    { key: "created", header: "Created", className: "whitespace-nowrap text-muted-foreground", render: (l) => formatDate(l.createdAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (l) => (
        <ActionMenu
          label={`Actions for ${l.name}`}
          items={[
            { label: "Open", icon: Pencil, onSelect: () => openRecord(l.id) },
            canEdit ? { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(l) } : null,
            canExport ? { label: "Export CSV", icon: Download, onSelect: () => handleExport(l) } : null,
            canDelete ? { separator: true } : null,
            canDelete ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(l) } : null,
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Lists"
        description="Hand-managed groups of contacts for targeted sending, with per-list membership status."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New list
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={optInFilter} onValueChange={setOptInFilter} options={OPT_IN_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={growthFilter} onValueChange={setGrowthFilter} options={GROWTH_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search lists…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading lists" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(l) => l.id}
            onRowClick={(l) => openRecord(l.id)}
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
                          setOptInFilter("all");
                          setGrowthFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New list
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="lists" />
        </div>
      )}

      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ListsScreen;
