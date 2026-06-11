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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import {
  TableShell,
  SearchInput,
  Pill,
  RowActions,
  Field,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_TONE = {
  Subscribed: "green",
  Pending: "amber",
  Unsubscribed: "zinc",
  Bounced: "red",
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
        <DialogBody className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="c-first">
              <Input id="c-first" value={form.first} onChange={(e) => set("first")(e.target.value)} placeholder="Amara" className="bg-background border-border" />
            </Field>
            <Field label="Last name" htmlFor="c-last">
              <Input id="c-last" value={form.last} onChange={(e) => set("last")(e.target.value)} placeholder="Okafor" className="bg-background border-border" />
            </Field>
          </div>
          <Field label="Email address" htmlFor="c-email" hint="Used as the unique identifier for this contact.">
            <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="name@company.com" className="bg-background border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Subscribed", "Pending", "Unsubscribed"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Add to list">
              <Select value={form.list} onValueChange={set("list")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_LISTS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
            Cancel
          </Button>
          <Button onClick={submit} disabled={!form.email.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">
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
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Contacts"
        description="Every person in your audience — their subscription status, lists, and engagement."
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search name or email…" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle sm:w-40">
                {statusFilter === "All" ? "All statuses" : statusFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
              <DropdownMenuLabel className="text-text-secondary">Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-surface-hover" />
              {STATUS_FILTERS.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => setStatusFilter(s)}
                  className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", statusFilter === s && "text-white")}
                >
                  {s === "All" ? "All statuses" : s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 border-border bg-surface-card text-foreground hover:bg-surface-subtle">
                <Upload className="h-4 w-4" /> Import
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 border-border bg-surface-card text-foreground">
              <DropdownMenuItem className="cursor-pointer focus:bg-surface-hover focus:text-foreground">
                <FileUp className="mr-2 h-4 w-4" /> Upload CSV file
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer focus:bg-surface-hover focus:text-foreground">
                <Cloud className="mr-2 h-4 w-4" /> Import from integration
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setAddOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <UserPlus className="h-4 w-4" /> Add contact
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-card px-4 py-2.5">
          <span className="text-sm text-foreground">
            <span className="font-semibold text-white">{selected.size}</span> selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-surface-hover hover:text-foreground">
              <Tag className="h-4 w-4" /> Tag
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-surface-hover hover:text-foreground">
              <Mail className="h-4 w-4" /> Add to list
            </Button>
            <Button variant="ghost" size="sm" onClick={removeSelected} className="text-red-400 hover:bg-red-500/10 hover:text-red-300">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelected(new Set())} className="text-text-secondary hover:bg-surface-hover hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
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
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-active text-xs font-semibold text-foreground">
                      {initials(c.first, c.last)}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-foreground">{c.first} {c.last}</span>
                      <span className="truncate text-xs text-text-secondary">{c.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.lists.map((l) => (
                      <span key={l} className="rounded-md border border-border bg-surface-active px-1.5 py-0.5 text-xs text-muted-foreground">
                        {l}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.location}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.added}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit contact", icon: Pencil },
                      { label: "Manage tags", icon: Tag },
                      { label: "Unsubscribe", icon: Ban, separatorBefore: true },
                      { label: "Delete", icon: Trash2, danger: true, onSelect: () => setContacts((p) => p.filter((x) => x.id !== c.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-sm text-text-secondary">
                  No contacts match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

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
