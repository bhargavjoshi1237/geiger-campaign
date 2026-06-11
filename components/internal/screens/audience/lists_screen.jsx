"use client";

import React, { useState } from "react";
import {
  Plus,
  List as ListIcon,
  Pencil,
  Copy,
  Download,
  Trash2,
  TrendingUp,
  TrendingDown,
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const INITIAL_LISTS = [
  { id: 1, name: "Newsletter", description: "Weekly digest for all opted-in contacts", type: "Standard", subscribers: 18420, growth: 4.2 },
  { id: 2, name: "Product Updates", description: "Release notes and feature announcements", type: "Standard", subscribers: 12180, growth: 2.1 },
  { id: 3, name: "Active in 30 days", description: "Auto-updates from engagement activity", type: "Dynamic", subscribers: 8740, growth: -1.4 },
  { id: 4, name: "Webinar Attendees", description: "Registered for any live session", type: "Standard", subscribers: 3120, growth: 11.7 },
  { id: 5, name: "VIP Customers", description: "Lifetime value over $1,000", type: "Dynamic", subscribers: 940, growth: 6.5 },
];

function CreateListDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", description: "", type: "Standard", doubleOptIn: true });

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      description: form.description.trim() || "—",
      type: form.type,
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
        <DialogBody className="space-y-4 py-4">
          <Field label="List name" htmlFor="l-name">
            <Input id="l-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring Promo" className="bg-background border-border" />
          </Field>
          <Field label="Description" htmlFor="l-desc">
            <Textarea id="l-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this list for?" />
          </Field>
          <Field label="List type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Standard">Standard — manually managed</SelectItem>
                <SelectItem value="Dynamic">Dynamic — rule-based, auto-updating</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Require double opt-in</p>
              <p className="text-xs text-text-secondary">New subscribers confirm via email before joining.</p>
            </div>
            <Switch checked={form.doubleOptIn} onCheckedChange={(v) => setForm((f) => ({ ...f, doubleOptIn: v }))} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create list</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ListsScreen() {
  const [lists, setLists] = useState(INITIAL_LISTS);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = lists.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Lists"
        description="Group contacts into standard or dynamic lists for targeted sending."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create list
          </Button>
        }
      />

      <div className="border-t border-surface-active pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search lists…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>List</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Subscribers</TableHead>
              <TableHead>30-day growth</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => {
              const up = l.growth >= 0;
              return (
                <TableRow key={l.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                        <ListIcon className="h-4 w-4" />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-foreground">{l.name}</span>
                        <span className="truncate text-xs text-text-secondary">{l.description}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Pill tone={l.type === "Dynamic" ? "violet" : "blue"}>{l.type}</Pill>
                  </TableCell>
                  <TableCell className="tabular-nums font-medium text-foreground">{l.subscribers.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1 text-sm font-medium tabular-nums", up ? "text-emerald-400" : "text-red-400")}>
                      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {up ? "+" : ""}{l.growth}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Edit list", icon: Pencil },
                        { label: "Duplicate", icon: Copy },
                        { label: "Export CSV", icon: Download },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setLists((p) => p.filter((x) => x.id !== l.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-text-secondary">No lists found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(l) => setLists((p) => [{ id: Date.now(), ...l }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ListsScreen;
