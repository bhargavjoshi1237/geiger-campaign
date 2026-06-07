"use client";

import React, { useMemo, useState } from "react";
import { Plus, FileCode, Pencil, Copy, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

const TYPE_TONE = {
  Welcome: "green",
  "Password reset": "amber",
  Receipt: "blue",
  "Email verification": "violet",
  "Shipping update": "zinc",
};

const TYPES = Object.keys(TYPE_TONE);

const INITIAL = [
  { id: 1, name: "Welcome email", subject: "Welcome to Geiger, {{first_name}}!", type: "Welcome", updated: "Jun 4, 2026", active: true },
  { id: 2, name: "Password reset", subject: "Reset your password", type: "Password reset", updated: "Jun 2, 2026", active: true },
  { id: 3, name: "Order receipt", subject: "Your receipt for order {{order_id}}", type: "Receipt", updated: "May 30, 2026", active: true },
  { id: 4, name: "Email verification", subject: "Confirm your email address", type: "Email verification", updated: "May 27, 2026", active: true },
  { id: 5, name: "Shipping confirmation", subject: "Your order {{order_id}} has shipped", type: "Shipping update", updated: "May 22, 2026", active: true },
  { id: 6, name: "Subscription renewal", subject: "Your subscription renews on {{renew_date}}", type: "Receipt", updated: "May 15, 2026", active: false },
];

function CreateTemplateDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Welcome", subject: "", body: "" });

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      type: form.type,
      subject: form.subject.trim() || "—",
      updated: "Just now",
      active: true,
    });
    setForm({ name: "", type: "Welcome", subject: "", body: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>Create a reusable template for a system-generated email.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Template name" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Welcome email" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject" htmlFor="t-subject">
            <Input id="t-subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Your order {{order_id}} is confirmed" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Body" htmlFor="t-body" hint="Supports merge tags like {{first_name}} and {{order_id}}.">
            <Textarea id="t-body" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Hi {{first_name}}, …" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransactionalTemplatesScreen() {
  const [templates, setTemplates] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) =>
      (typeFilter === "All" || t.type === typeFilter) &&
      (!q || t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q)),
    );
  }, [templates, query, typeFilter]);

  const toggle = (id) => setTemplates((p) => p.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
  const remove = (id) => setTemplates((p) => p.filter((t) => t.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Transactional Templates"
        description="Reusable templates for receipts, password resets, and other system emails."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New template
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-44">
              {typeFilter === "All" ? "All types" : typeFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {["All", ...TYPES].map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setTypeFilter(t)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", typeFilter === t && "text-white")}>
                {t === "All" ? "All types" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Template</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                      <FileCode className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{t.name}</span>
                      <span className="truncate text-xs text-[#737373]">{t.subject}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Pill tone={TYPE_TONE[t.type]}>{t.type}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{t.updated}</TableCell>
                <TableCell>
                  <Switch checked={t.active} onCheckedChange={() => toggle(t.id)} />
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Duplicate", icon: Copy },
                      { label: "Send test", icon: Send },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(t.id) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No templates found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTemplates((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default TransactionalTemplatesScreen;
