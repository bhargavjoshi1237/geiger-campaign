"use client";

import React, { useMemo, useState } from "react";
import { Plus, MousePointerClick, Pencil, Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const EVENT_TYPES = {
  Subscription: "blue",
  Behavioral: "violet",
  "E-commerce": "green",
  Date: "amber",
  Custom: "zinc",
};
const EVENTS = {
  Subscription: ["Joins a list", "Unsubscribes", "Confirms opt-in"],
  Behavioral: ["Opens an email", "Clicks a link", "Visits a page", "Submits a form"],
  "E-commerce": ["Abandons cart", "Makes a purchase", "Views a product"],
  Date: ["Birthday", "Anniversary", "Date field reached"],
  Custom: ["Custom API event"],
};
const SOURCES = ["Any channel", "Email", "Website", "Mobile app", "API"];

const INITIAL = [
  { id: 1, name: "New subscriber", event: "Joins a list", type: "Subscription", source: "Any channel", usedIn: 4 },
  { id: 2, name: "Cart abandoned", event: "Abandons cart", type: "E-commerce", source: "Website", usedIn: 2 },
  { id: 3, name: "Pricing page visit", event: "Visits a page", type: "Behavioral", source: "Website", usedIn: 3 },
  { id: 4, name: "Purchase made", event: "Makes a purchase", type: "E-commerce", source: "API", usedIn: 5 },
  { id: 5, name: "Contact birthday", event: "Birthday", type: "Date", source: "Any channel", usedIn: 1 },
];

function CreateTriggerDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Subscription", event: EVENTS.Subscription[0], source: SOURCES[0] });
  const setType = (t) => setForm((f) => ({ ...f, type: t, event: EVENTS[t][0] }));
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), event: form.event, type: form.type, source: form.source, usedIn: 0 });
    setForm({ name: "", type: "Subscription", event: EVENTS.Subscription[0], source: SOURCES[0] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create trigger</DialogTitle>
          <DialogDescription>Triggers start automations when a contact performs an event.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Trigger name" htmlFor="trg-name">
            <Input id="trg-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. New subscriber" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(EVENTS).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Event">
              <Select value={form.event} onValueChange={(v) => setForm((f) => ({ ...f, event: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EVENTS[form.type].map((ev) => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Source">
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create trigger</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TriggersScreen() {
  const [triggers, setTriggers] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return triggers.filter((t) => (typeFilter === "All" || t.type === typeFilter) && (!q || t.name.toLowerCase().includes(q)));
  }, [triggers, query, typeFilter]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Triggers"
        description="Reusable events that kick off workflows and journeys."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> Create trigger</Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search triggers…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-44">
              {typeFilter === "All" ? "All categories" : typeFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by category</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {["All", ...Object.keys(EVENT_TYPES)].map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setTypeFilter(t)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", typeFilter === t && "text-white")}>
                {t === "All" ? "All categories" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Trigger</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Used in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                      <MousePointerClick className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-[#ededed]">{t.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-[#a3a3a3]">{t.event}</TableCell>
                <TableCell><Pill tone={EVENT_TYPES[t.type]}>{t.type}</Pill></TableCell>
                <TableCell className="text-[#a3a3a3]">{t.source}</TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{t.usedIn} automations</TableCell>
                <TableCell className="text-right">
                  <RowActions items={[
                    { label: "Edit trigger", icon: Pencil },
                    { label: "Duplicate", icon: Copy },
                    { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setTriggers((p) => p.filter((x) => x.id !== t.id)) },
                  ]} />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent"><TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No triggers found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateTriggerDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTriggers((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default TriggersScreen;
