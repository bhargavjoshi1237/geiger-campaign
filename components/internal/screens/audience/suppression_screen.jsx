"use client";

import React, { useMemo, useState } from "react";
import { ShieldOff, Plus, RotateCcw, Trash2, Download } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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

const REASON_TONE = {
  Unsubscribed: "zinc",
  "Hard bounce": "red",
  "Spam complaint": "amber",
  Manual: "violet",
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Email address" htmlFor="sup-email">
            <Input id="sup-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Reason">
            <Select value={form.reason} onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Internal note" htmlFor="sup-note" hint="Optional — visible to your team only.">
            <Textarea id="sup-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Why is this address being suppressed?" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.email.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Suppress address</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Suppression"
        description="Addresses excluded from all sends — bounces, complaints, unsubscribes, and manual blocks."
        actions={
          <Button onClick={() => setAddOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add address
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search email…" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-44">
                {reasonFilter === "All" ? "All reasons" : reasonFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
              <DropdownMenuLabel className="text-[#737373]">Filter by reason</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#2a2a2a]" />
              {["All", ...REASONS].map((r) => (
                <DropdownMenuItem
                  key={r}
                  onSelect={() => setReasonFilter(r)}
                  className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", reasonFilter === r && "text-white")}
                >
                  {r === "All" ? "All reasons" : r}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button variant="outline" className="h-9 border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a]">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Email address</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Suppressed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#737373]">
                      <ShieldOff className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-[#ededed]">{e.email}</span>
                  </div>
                </TableCell>
                <TableCell><Pill tone={REASON_TONE[e.reason]}>{e.reason}</Pill></TableCell>
                <TableCell className="text-[#a3a3a3]">{e.source}</TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{e.added}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Remove from list", icon: RotateCcw, onSelect: () => remove(e.id) },
                      { label: "Delete record", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(e.id) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No suppressed addresses match your filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <AddSuppressionDialog open={addOpen} onOpenChange={setAddOpen} onCreate={(e) => setEntries((p) => [{ id: Date.now(), ...e }, ...p])} />
    </MainScreenWrapper>
  );
}

export default SuppressionScreen;
