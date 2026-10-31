"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus,
  Upload,
  Download,
  Pencil,
  Ban,
  BellRing,
  Trash2,
  ListPlus,
  Tag as TagIcon,
  X,
  Users,
  Loader2,
  Plus,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import {
  countContacts,
  createContact,
  findContactByEmail,
  listAllContacts,
  listContactsPage,
  retagContacts,
  softDeleteContacts,
  updateContacts,
} from "@/lib/supabase/contacts";
import { addListMembers, listMembershipsForContacts } from "@/lib/supabase/lists";
import { createTag } from "@/lib/supabase/tags";
import { recordConsents } from "@/lib/supabase/consents";
import { isValidEmail, normalizeEmail } from "@/lib/audience/contact_model";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  Avatar,
  AvatarFallback,
  cn,
} from "@geiger/ui";
import { ContactDetail } from "./contact_detail";
import { ContactImportDialog } from "./contact_import_dialog";
import { useAudienceCatalog } from "./use_audience_catalog";
import {
  CONTACT_STATUS_FILTER_OPTIONS,
  CONTACT_STATUS_MAP,
  DESTRUCTIVE_BUTTON,
  DESTRUCTIVE_GHOST,
  OUTLINE_BUTTON,
  TAG_DOT,
  formatDate,
  initials,
  number,
  plural,
} from "./constants";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "score", label: "Highest score" },
  { value: "name", label: "Name A–Z" },
];

const EMPTY_FORM = { firstName: "", lastName: "", email: "", phone: "", status: "subscribed", listId: "none", emailConsent: false };

function AddContactDialog({ open, onOpenChange, lists, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(EMPTY_FORM);
  }

  const email = normalizeEmail(form.email);
  const valid = (email ? isValidEmail(email) : false) || (!email && form.phone.trim());

  const submit = async () => {
    if (email && !isValidEmail(email)) {
      toast.error("That email address doesn't look right.");
      return;
    }
    if (!email && !form.phone.trim()) {
      toast.error("Add an email address or a phone number.");
      return;
    }
    setSaving(true);
    const ok = await onCreate({ ...form, email });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>Create one contact. Email is the unique identifier within this project.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="c-first">
              <Input id="c-first" value={form.firstName} onChange={(e) => set("firstName")(e.target.value)} placeholder="Erin" autoFocus />
            </Field>
            <Field label="Last name" htmlFor="c-last">
              <Input id="c-last" value={form.lastName} onChange={(e) => set("lastName")(e.target.value)} placeholder="Walsh" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email address" htmlFor="c-email">
              <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="name@company.com" />
            </Field>
            <Field label="Phone" htmlFor="c-phone" hint="International format, e.g. +351 912 345 678.">
              <Input id="c-phone" value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="+1 555 010 2000" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["subscribed", "pending", "unsubscribed"].map((s) => (
                    <SelectItem key={s} value={s}>{CONTACT_STATUS_MAP[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Add to list">
              <Select value={form.listId} onValueChange={set("listId")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No list</SelectItem>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {email ? (
            <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-card px-4 py-3 text-sm">
              <Checkbox checked={form.emailConsent} onCheckedChange={(v) => set("emailConsent")(Boolean(v))} className="mt-0.5" />
              <span>
                <span className="font-medium text-foreground">They agreed to receive marketing email</span>
                <span className="block text-xs text-text-secondary">Adds an opt-in to the consent ledger with your name as the source.</span>
              </span>
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Bulk-bar tag picker: catalog tags plus a free-text new tag.
function TagMenu({ label, icon: Icon, tags, onPick, allowNew }) {
  const [draft, setDraft] = useState("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Icon className="h-4 w-4" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto border-border bg-surface-subtle">
        {allowNew ? (
          <>
            <div className="p-1.5">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && draft.trim()) {
                    onPick(draft.trim());
                    setDraft("");
                  }
                }}
                placeholder="New tag, then Enter"
                aria-label="New tag"
                className="h-8"
              />
            </div>
            {tags.length ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {tags.length ? (
          tags.map((t) => (
            <DropdownMenuItem key={t.name} className="cursor-pointer" onSelect={() => onPick(t.name)}>
              <span className={cn("h-2 w-2 rounded-full", TAG_DOT[t.color] || "bg-zinc-400")} /> {t.name}
            </DropdownMenuItem>
          ))
        ) : !allowNew ? (
          <DropdownMenuLabel className="text-xs font-normal text-text-tertiary">No tags on the selection</DropdownMenuLabel>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const exportColumns = (customFields) => [
  ["Email", (c) => c.email],
  ["First name", (c) => c.firstName],
  ["Last name", (c) => c.lastName],
  ["Phone", (c) => c.phone],
  ["Status", (c) => c.status],
  ["Tags", (c) => c.tags.join(", ")],
  ["Lead score", (c) => c.leadScore],
  ["Source", (c) => c.source],
  ["Timezone", (c) => c.timezone],
  ["Language", (c) => c.locale],
  ["Created", (c) => c.createdAt],
  ...customFields.map((f) => [f.label, (c) => c.attributes?.[f.key] ?? ""]),
];

export function ContactsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.contact.edit");
  const canDelete = can("campaign.contact.delete");
  const canImport = can("campaign.contact.import");
  const canExport = can("campaign.contact.export");
  const catalog = useAudienceCatalog(projectId);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState({ key: null, rows: [], total: 0, memberships: {} });
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(null);

  // Debounce the search box into the server query.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const filterKey = `${search}|${statusFilter}|${tagFilter}|${sort}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
    setSelected(new Set());
  }

  const filters = useMemo(
    () => ({ search, status: statusFilter, tag: tagFilter }),
    [search, statusFilter, tagFilter],
  );
  const pageKey = `${projectId}|${filterKey}|${page}|${pageSize}|${version}`;

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listContactsPage(projectId, { ...filters, sort, page, pageSize }).then(async (res) => {
      const rows = res?.rows ?? [];
      const memberships = (await listMembershipsForContacts(projectId, rows.map((r) => r.id))) ?? {};
      if (!alive) return;
      if (!res) toast.error("Couldn't load contacts.");
      setResult({ key: pageKey, rows, total: res?.total ?? 0, memberships });
    });
    return () => {
      alive = false;
    };
  }, [projectId, filters, sort, page, pageSize, pageKey]);

  const loadStats = useCallback(async () => {
    const [total, subscribed, unsubscribed, bounced, complained] = await Promise.all([
      countContacts(projectId),
      countContacts(projectId, { status: "subscribed" }),
      countContacts(projectId, { status: "unsubscribed" }),
      countContacts(projectId, { status: "bounced" }),
      countContacts(projectId, { status: "complained" }),
    ]);
    return { total, subscribed, unsubscribed, undeliverable: (bounced ?? 0) + (complained ?? 0) };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    loadStats().then((s) => alive && setStats(s));
    return () => {
      alive = false;
    };
  }, [loadStats, projectId, version]);

  const loading = result.key !== pageKey;
  const rows = result.rows;
  const listById = useMemo(() => Object.fromEntries(catalog.lists.map((l) => [l.id, l])), [catalog.lists]);
  const tagColor = useMemo(() => Object.fromEntries(catalog.tags.map((t) => [t.name.toLowerCase(), t.color])), [catalog.tags]);

  const statItems = useMemo(
    () => [
      { label: "Contacts", value: stats ? number(stats.total) : "", footer: "In this project" },
      { label: "Subscribed", value: stats ? number(stats.subscribed) : "", footer: "Can receive marketing" },
      { label: "Unsubscribed", value: stats ? number(stats.unsubscribed) : "", footer: "Opted out" },
      { label: "Bounced or complained", value: stats ? number(stats.undeliverable) : "", footer: "Not sendable" },
    ],
    [stats],
  );

  const patchRows = (ids, fn) =>
    setResult((prev) => ({ ...prev, rows: prev.rows.map((c) => (ids.has(c.id) ? fn(c) : c)) }));

  const refresh = () => setVersion((v) => v + 1);

  const pageIds = rows.map((c) => c.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (pageSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreate = async (form) => {
    if (form.email) {
      const existing = await findContactByEmail(projectId, form.email);
      if (existing) {
        toast.error(`${form.email} is already a contact.`, { action: { label: "Open", onClick: () => openRecord(existing.id) } });
        return false;
      }
    }
    const user = await getUser();
    const id = crypto.randomUUID();
    const created = await createContact(projectId, {
      id,
      email: form.email,
      phone: form.phone,
      firstName: form.firstName,
      lastName: form.lastName,
      status: form.status,
      source: "manual",
      unsubscribedAt: form.status === "unsubscribed" ? new Date().toISOString() : null,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't add the contact.");
      return false;
    }
    if (form.listId !== "none") await addListMembers(projectId, form.listId, [id], { status: form.status === "subscribed" ? "subscribed" : form.status, createdBy: user?.id ?? null });
    if (form.emailConsent && form.email) {
      await recordConsents(
        projectId,
        [{ contactId: id, channel: "email", status: "opted_in", source: "Added manually", proof: { method: "manual", recorded_by: user?.id ?? null } }],
        { createdBy: user?.id ?? null },
      );
    }
    toast.success(`Added ${created.name}.`);
    refresh();
    return true;
  };

  const setStatus = async (ids, status) => {
    const list = [...ids];
    const at = new Date().toISOString();
    const before = rows.filter((c) => ids.has(c.id));
    patchRows(ids, (c) => ({ ...c, status }));
    const ok = await updateContacts(list, { status, unsubscribedAt: status === "unsubscribed" ? at : null });
    if (!ok) {
      setResult((prev) => ({ ...prev, rows: prev.rows.map((c) => before.find((b) => b.id === c.id) ?? c) }));
      toast.error("Couldn't change the status.");
      return;
    }
    const user = await getUser();
    await recordConsents(
      projectId,
      before
        .filter((c) => c.email)
        .map((c) => ({
          contactId: c.id,
          channel: "email",
          status: status === "unsubscribed" ? "opted_out" : "opted_in",
          source: status === "unsubscribed" ? "Unsubscribed by a teammate" : "Resubscribed by a teammate",
          proof: { method: "manual", recorded_by: user?.id ?? null },
        })),
      { createdBy: user?.id ?? null },
    );
    toast.success(`${list.length === 1 ? "Contact" : plural(list.length, "contact")} ${status === "unsubscribed" ? "unsubscribed" : "resubscribed"}.`);
    loadStats().then(setStats);
  };

  const ensureCatalogTag = async (name) => {
    if (catalog.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    const user = await getUser();
    const tag = await createTag(projectId, { name, color: "zinc", createdBy: user?.id ?? null });
    if (tag) catalog.setCatalog((prev) => ({ ...prev, tags: [...prev.tags, tag].sort((a, b) => a.name.localeCompare(b.name)) }));
  };

  const retag = async (mode, tag) => {
    const ids = new Set(selected);
    setBusy("tag");
    patchRows(ids, (c) => ({
      ...c,
      tags: mode === "add"
        ? c.tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? c.tags : [...c.tags, tag]
        : c.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
    }));
    const touched = await retagContacts(projectId, [...ids], mode === "add" ? { add: [tag] } : { remove: [tag] });
    setBusy(null);
    if (touched === null) {
      toast.error("Couldn't update tags.");
      refresh();
      return;
    }
    if (mode === "add") await ensureCatalogTag(tag);
    toast.success(mode === "add" ? `Tagged ${plural(ids.size, "contact")} "${tag}".` : `Removed "${tag}" from ${plural(ids.size, "contact")}.`);
  };

  const addSelectedToList = async (list) => {
    setBusy("list");
    const user = await getUser();
    const ok = await addListMembers(projectId, list.id, [...selected], { createdBy: user?.id ?? null });
    setBusy(null);
    if (!ok) {
      toast.error(`Couldn't add contacts to ${list.name}.`);
      return;
    }
    toast.success(`Added ${plural(selected.size, "contact")} to ${list.name}.`);
    refresh();
  };

  const handleDelete = async (targets) => {
    const ids = targets.map((c) => c.id);
    setDeleteTarget(null);
    setResult((prev) => ({ ...prev, rows: prev.rows.filter((c) => !ids.includes(c.id)), total: Math.max(0, prev.total - ids.length) }));
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    if (ids.includes(recordId)) closeRecord();
    const ok = await softDeleteContacts(ids);
    if (!ok) toast.error("Couldn't delete — the contacts were restored.");
    else toast.success(targets.length === 1 ? `Deleted ${targets[0].name}.` : `Deleted ${plural(targets.length, "contact")}.`);
    refresh();
  };

  const exportContacts = async (onlySelected) => {
    setBusy("export");
    const all = await listAllContacts(projectId, { filters: onlySelected ? {} : filters });
    setBusy(null);
    if (!all) {
      toast.error("Couldn't export contacts.");
      return;
    }
    const pickedRows = onlySelected ? all.filter((c) => selected.has(c.id)) : all;
    const cols = exportColumns(catalog.customFields);
    downloadCsv(
      `contacts-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv([cols.map(([h]) => h), ...pickedRows.map((c) => cols.map(([, get]) => get(c)))]),
    );
    toast.success(`Exported ${plural(pickedRows.length, "contact")}.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deleteTarget?.length > 1 ? `Delete ${number(deleteTarget.length)} contacts` : "Delete contact"}</DialogTitle>
          <DialogDescription>
            {deleteTarget?.length > 1 ? (
              <>Delete the {number(deleteTarget.length)} selected contacts?</>
            ) : (
              <>
                Delete <span className="font-medium text-foreground">{deleteTarget?.[0]?.name}</span>?
              </>
            )}{" "}
            They stop receiving every send and drop out of lists and segments. Their send history stays in reports.
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

  if (recordId) {
    return (
      <>
        <ContactDetail
          key={recordId}
          contactId={recordId}
          projectId={projectId}
          catalog={catalog}
          onBack={closeRecord}
          onChanged={(contact) => patchRows(new Set([contact.id]), () => contact)}
          onDelete={(contact) => setDeleteTarget([contact])}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || tagFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setSearch("");
    setStatusFilter("all");
    setTagFilter("all");
  };

  const tagOptions = [{ value: "all", label: "All tags" }, ...catalog.tags.map((t) => ({ value: t.name, label: t.name }))];
  const selectedRows = rows.filter((c) => selected.has(c.id));
  const selectedTags = [...new Set(selectedRows.flatMap((c) => c.tags))].map((name) => ({ name, color: tagColor[name.toLowerCase()] }));

  const columns = [
    {
      key: "select",
      header: <Checkbox checked={pageSelected} onCheckedChange={togglePage} aria-label="Select all on this page" />,
      headClassName: "w-10 pr-0",
      className: "w-10 pr-0",
      render: (c) => (
        // Selecting must not open the row.
        <div onClick={(e) => e.stopPropagation()} className="flex">
          <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label={`Select ${c.name}`} />
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (c) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-9 border border-border">
            <AvatarFallback className="bg-surface-active text-xs font-semibold text-foreground">{initials(c)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{c.name}</span>
            <span className="truncate text-xs text-text-secondary">{c.email || c.phone || "No address"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (c) => <StatusPill status={c.status} map={CONTACT_STATUS_MAP} />,
    },
    {
      key: "lists",
      header: "Lists",
      render: (c) => {
        const names = (result.memberships[c.id] || []).filter((m) => m.status !== "removed").map((m) => listById[m.listId]?.name).filter(Boolean);
        if (!names.length) return <span className="text-text-tertiary">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {names.slice(0, 2).map((n) => <Badge key={n} variant="neutral">{n}</Badge>)}
            {names.length > 2 ? <Badge variant="outline">+{names.length - 2}</Badge> : null}
          </div>
        );
      },
    },
    {
      key: "tags",
      header: "Tags",
      render: (c) =>
        c.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {c.tags.slice(0, 2).map((t) => (
              <Badge key={t} variant="outline">
                <span className={cn("h-1.5 w-1.5 rounded-full", TAG_DOT[tagColor[t.toLowerCase()]] || "bg-zinc-400")} />
                {t}
              </Badge>
            ))}
            {c.tags.length > 2 ? <Badge variant="outline">+{c.tags.length - 2}</Badge> : null}
          </div>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      className: "tabular-nums font-medium text-foreground",
      render: (c) => c.leadScore,
    },
    {
      key: "added",
      header: "Added",
      className: "whitespace-nowrap text-muted-foreground",
      render: (c) => formatDate(c.createdAt),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: "Open contact", icon: Pencil, onSelect: () => openRecord(c.id) },
            canEdit
              ? c.status === "unsubscribed"
                ? { label: "Resubscribe", icon: BellRing, onSelect: () => setStatus(new Set([c.id]), "subscribed") }
                : { label: "Unsubscribe", icon: Ban, onSelect: () => setStatus(new Set([c.id]), "unsubscribed") }
              : null,
            canDelete ? { separator: true } : null,
            canDelete ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget([c]) } : null,
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Contacts"
        description="Every person in your audience — subscription status, lists, tags, consent and engagement."
        actions={
          <>
            {canExport ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => exportContacts(false)} disabled={busy === "export" || !result.total}>
                {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
              </Button>
            ) : null}
            {canImport ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
            ) : null}
            {canEdit ? (
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4" /> Add contact
              </Button>
            ) : null}
          </>
        }
      />

      <StatsBar stats={statItems} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={CONTACT_STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={tagFilter} onValueChange={setTagFilter} options={tagOptions} height="h-9" />
          <FilterDropdown value={sort} onValueChange={setSort} options={SORT_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or phone…" />
      </Toolbar>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-card px-4 py-2.5">
          <span className="text-sm text-foreground">
            <span className="font-semibold tabular-nums">{number(selected.size)}</span> selected
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {canEdit ? (
              <>
                <TagMenu label="Tag" icon={TagIcon} tags={catalog.tags} onPick={(t) => retag("add", t)} allowNew />
                <TagMenu label="Untag" icon={X} tags={selectedTags} onPick={(t) => retag("remove", t)} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy === "list"}>
                      {busy === "list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />} Add to list
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 border-border bg-surface-subtle">
                    {catalog.lists.length ? (
                      catalog.lists.map((l) => (
                        <DropdownMenuItem key={l.id} className="cursor-pointer" onSelect={() => addSelectedToList(l)}>
                          {l.name}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuLabel className="text-xs font-normal text-text-tertiary">Create a list first</DropdownMenuLabel>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setStatus(new Set(selected), "unsubscribed")}>
                  <Ban className="h-4 w-4" /> Unsubscribe
                </Button>
              </>
            ) : null}
            {canExport ? (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => exportContacts(true)} disabled={busy === "export"}>
                <Download className="h-4 w-4" /> Export
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="ghost" size="sm" className={DESTRUCTIVE_GHOST} onClick={() => setDeleteTarget(selectedRows)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="text-text-secondary">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {loading && !rows.length ? (
        <LoadingArea size={48} label="Loading contacts" panel />
      ) : (
        <div className={cn("space-y-5", loading && "opacity-60 transition-opacity")}>
          <DataTable
            columns={columns}
            data={rows}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecord(c.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Users}
                  title={filtersActive ? "No matches" : "No contacts yet"}
                  description={filtersActive ? "Try a different search or filter." : "Add your first contact or import a CSV to build your audience."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                    ) : canImport ? (
                      <Button onClick={() => setImportOpen(true)}>
                        <Upload className="h-4 w-4" /> Import CSV
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" /> Add contact
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={result.total}
            totalPages={Math.max(1, Math.ceil(result.total / pageSize))}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            itemLabel="contacts"
          />
        </div>
      )}

      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} lists={catalog.lists} onCreate={handleCreate} />
      <ContactImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={projectId}
        catalog={catalog}
        onImported={() => {
          refresh();
          catalog.reload();
        }}
      />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ContactsScreen;
