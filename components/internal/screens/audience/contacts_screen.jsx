"use client";

import React, { useMemo, useState } from "react";
import {
  UserPlus,
  Upload,
  FileUp,
  Cloud,
  Pencil,
  Tag,
  Ban,
  Trash2,
  Mail,
  X,
  Users,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  Checkbox,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  SectionCard,
  EmptyState,
  Avatar,
  AvatarFallback,
} from "@geiger/ui";

const STATUS_TONE = {
  Subscribed: "success",
  Pending: "warning",
  Unsubscribed: "neutral",
  Bounced: "danger",
};

const INITIAL_CONTACTS = [
  { id: 1, first: "Amara", last: "Okafor", email: "amara.okafor@northwind.io", status: "Subscribed", lists: ["Newsletter", "Product"], location: "Lagos, NG", added: "Jun 2, 2026" },
  { id: 2, first: "Daniel", last: "Reyes", email: "d.reyes@brightmail.com", status: "Subscribed", lists: ["Newsletter"], location: "Madrid, ES", added: "Jun 1, 2026" },
  { id: 3, first: "Mei", last: "Tanaka", email: "mei.tanaka@kaisho.jp", status: "Pending", lists: ["Webinar"], location: "Osaka, JP", added: "May 30, 2026" },
  { id: 4, first: "Liam", last: "O'Brien", email: "liam@obrien.dev", status: "Unsubscribed", lists: ["Product"], location: "Dublin, IE", added: "May 28, 2026" },
  { id: 5, first: "Priya", last: "Nair", email: "priya.nair@lumen.co", status: "Subscribed", lists: ["Newsletter", "VIP"], location: "Bengaluru, IN", added: "May 27, 2026" },
  { id: 6, first: "Noah", last: "Schmidt", email: "noah.schmidt@hverk.de", status: "Bounced", lists: ["Product"], location: "Berlin, DE", added: "May 25, 2026" },
  { id: 7, first: "Sofia", last: "Costa", email: "sofia.costa@vela.pt", status: "Subscribed", lists: ["Newsletter", "Webinar"], location: "Lisbon, PT", added: "May 24, 2026" },
  { id: 8, first: "Ethan", last: "Walker", email: "ethan.walker@plinth.us", status: "Subscribed", lists: ["VIP"], location: "Austin, US", added: "May 22, 2026" },
];

const STATUS_FILTERS = ["All", "Subscribed", "Pending", "Unsubscribed", "Bounced"];
const ALL_LISTS = ["Newsletter", "Product", "Webinar", "VIP"];

function initials(first, last) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function AddContactDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ first: "", last: "", email: "", status: "Subscribed", list: "Newsletter" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.email.trim()) return;
    onCreate({
      first: form.first.trim() || "—",
      last: form.last.trim(),
      email: form.email.trim(),
      status: form.status,
      lists: [form.list],
      location: "—",
      added: "Just now",
    });
    setForm({ first: "", last: "", email: "", status: "Subscribed", list: "Newsletter" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>Create a single contact and add them to a list.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="c-first">
              <Input id="c-first" value={form.first} onChange={(e) => set("first")(e.target.value)} placeholder="Amara" />
            </Field>
            <Field label="Last name" htmlFor="c-last">
              <Input id="c-last" value={form.last} onChange={(e) => set("last")(e.target.value)} placeholder="Okafor" />
            </Field>
          </div>
          <Field label="Email address" htmlFor="c-email" hint="Used as the unique identifier for this contact.">
            <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="name@company.com" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Subscribed", "Pending", "Unsubscribed"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Add to list">
              <Select value={form.list} onValueChange={set("list")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_LISTS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!form.email.trim()}>
            Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContactsScreen() {
  const [contacts, setContacts] = useState(INITIAL_CONTACTS);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState(() => new Set());
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      const matchesStatus = statusFilter === "All" || c.status === statusFilter;
      const matchesQuery =
        !q ||
        `${c.first} ${c.last}`.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [contacts, query, statusFilter]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filtered.forEach((c) => next.delete(c.id));
      } else {
        filtered.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const removeSelected = () => {
    setContacts((prev) => prev.filter((c) => !selected.has(c.id)));
    setSelected(new Set());
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Contacts"
        description="Every person in your audience — their subscription status, lists, and engagement."
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Upload className="h-4 w-4" /> Import
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="cursor-pointer">
                  <FileUp className="mr-2 h-4 w-4" /> Upload CSV file
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <Cloud className="mr-2 h-4 w-4" /> Import from integration
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add contact
            </Button>
          </>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 justify-between bg-surface-card sm:w-40">
                {statusFilter === "All" ? "All statuses" : statusFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              <DropdownMenuLabel className="text-text-secondary">Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STATUS_FILTERS.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => setStatusFilter(s)}
                  className={cn("cursor-pointer", statusFilter === s && "font-medium")}
                >
                  {s === "All" ? "All statuses" : s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search name or email…" />
      </Toolbar>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-card px-4 py-2.5">
          <span className="text-sm text-foreground">
            <span className="font-semibold">{selected.size}</span> selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Tag className="h-4 w-4" /> Tag
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Mail className="h-4 w-4" /> Add to list
            </Button>
            <Button variant="ghost" size="sm" onClick={removeSelected} className="text-red-400 hover:bg-red-500/10 hover:text-red-400">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="text-text-secondary">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Table keeps shadcn Table for header select-all + selected-row state */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts found"
          description="No contacts match your filters."
          className="rounded-xl border border-border bg-surface-subtle"
          action={
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add contact
            </Button>
          }
        />
      ) : (
        <SectionCard bodyPadding={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 pr-0">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lists</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined} className="border-border">
                  <TableCell className="pr-0">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label={`Select ${c.first}`} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 border border-border">
                        <AvatarFallback className="bg-surface-active text-xs font-semibold text-foreground">
                          {initials(c.first, c.last)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-foreground">{c.first} {c.last}</span>
                        <span className="truncate text-xs text-text-secondary">{c.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.lists.map((l) => (
                        <Badge key={l} variant="neutral">{l}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.location}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{c.added}</TableCell>
                  <TableCell className="text-right">
                    <ActionMenu
                      label={`Actions for ${c.first} ${c.last}`}
                      items={[
                        { label: "Edit contact", icon: Pencil },
                        { label: "Manage tags", icon: Tag },
                        { separator: true },
                        { label: "Unsubscribe", icon: Ban },
                        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setContacts((p) => p.filter((x) => x.id !== c.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      <p className="text-xs text-text-secondary">
        Showing {filtered.length} of {contacts.length} contacts
      </p>

      <AddContactDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={(c) => setContacts((prev) => [{ id: Date.now(), ...c }, ...prev])}
      />
    </MainScreenWrapper>
  );
}

export default ContactsScreen;
