"use client";

import React, { useMemo, useState } from "react";
import { ShieldOff, Plus, RotateCcw, Trash2, Download } from "lucide-react";
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
} from "@geiger/ui";

const REASON_TONE = {
  Unsubscribed: "neutral",
  "Hard bounce": "danger",
  "Spam complaint": "warning",
  Manual: "purple",
};

const REASONS = ["Unsubscribed", "Hard bounce", "Spam complaint", "Manual"];

const INITIAL = [
  { id: 1, email: "noah.schmidt@hverk.de", reason: "Hard bounce", source: "Summer Sale — Early Access", added: "Jun 3, 2026" },
  { id: 2, email: "liam@obrien.dev", reason: "Unsubscribed", source: "Weekly Digest #42", added: "Jun 2, 2026" },
  { id: 3, email: "no-reply@spamtrap.net", reason: "Spam complaint", source: "Product Launch Teaser", added: "Jun 1, 2026" },
  { id: 4, email: "old.address@legacy.co", reason: "Manual", source: "Imported list cleanup", added: "May 29, 2026" },
  { id: 5, email: "bounce@deadhost.io", reason: "Hard bounce", source: "Cart Reminder", added: "May 27, 2026" },
  { id: 6, email: "test.unsub@mail.com", reason: "Unsubscribed", source: "Newsletter", added: "May 24, 2026" },
];

function AddSuppressionDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ email: "", reason: "Manual", note: "" });

  const submit = () => {
    if (!form.email.trim()) return;
    onCreate({
      email: form.email.trim(),
      reason: form.reason,
      source: form.note.trim() || "Added manually",
      added: "Just now",
    });
    setForm({ email: "", reason: "Manual", note: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to suppression list</DialogTitle>
          <DialogDescription>Suppressed addresses are excluded from every send across all channels.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Email address" htmlFor="sup-email">
            <Input id="sup-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" />
          </Field>
          <Field label="Reason">
            <Select value={form.reason} onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Internal note" htmlFor="sup-note" hint="Optional — visible to your team only.">
            <Textarea id="sup-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Why is this address being suppressed?" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.email.trim()}>Suppress address</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SuppressionScreen() {
  const [entries, setEntries] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("All");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const matchesReason = reasonFilter === "All" || e.reason === reasonFilter;
      const matchesQuery = !q || e.email.toLowerCase().includes(q);
      return matchesReason && matchesQuery;
    });
  }, [entries, query, reasonFilter]);

  const remove = (id) => setEntries((p) => p.filter((e) => e.id !== id));

  const columns = [
    {
      key: "email",
      header: "Email address",
      render: (e) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-text-secondary">
            <ShieldOff className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{e.email}</span>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (e) => <Badge variant={REASON_TONE[e.reason]}>{e.reason}</Badge>,
    },
    { key: "source", header: "Source", className: "text-muted-foreground", render: (e) => e.source },
    { key: "added", header: "Suppressed", className: "whitespace-nowrap text-muted-foreground", render: (e) => e.added },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (e) => (
        <ActionMenu
          label={`Actions for ${e.email}`}
          items={[
            { label: "Remove from list", icon: RotateCcw, onSelect: () => remove(e.id) },
            { separator: true },
            { label: "Delete record", icon: Trash2, destructive: true, onSelect: () => remove(e.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Suppression"
        description="Addresses excluded from all sends — bounces, complaints, unsubscribes, and manual blocks."
        actions={
          <>
            <Button variant="outline">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add address
            </Button>
          </>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 justify-between bg-surface-card sm:w-44">
                {reasonFilter === "All" ? "All reasons" : reasonFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuLabel className="text-text-secondary">Filter by reason</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["All", ...REASONS].map((r) => (
                <DropdownMenuItem
                  key={r}
                  onSelect={() => setReasonFilter(r)}
                  className={cn("cursor-pointer", reasonFilter === r && "font-medium")}
                >
                  {r === "All" ? "All reasons" : r}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search email…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(e) => e.id}
        empty={
          <EmptyState
            icon={ShieldOff}
            title="No suppressed addresses"
            description="No suppressed addresses match your filters."
            className="rounded-xl border border-border bg-surface-subtle"
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add address
              </Button>
            }
          />
        }
      />

      <AddSuppressionDialog open={addOpen} onOpenChange={setAddOpen} onCreate={(e) => setEntries((p) => [{ id: Date.now(), ...e }, ...p])} />
    </MainScreenWrapper>
  );
}

export default SuppressionScreen;
