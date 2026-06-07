"use client";

import React, { useMemo, useState } from "react";
import { Plus, MessageCircle, Pencil, Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const CATEGORY_TONE = { Marketing: "blue", Utility: "zinc", Authentication: "violet" };
const STATUS_TONE = { Approved: "green", Pending: "amber", Rejected: "red" };
const CATEGORIES = ["Marketing", "Utility", "Authentication"];
const LANGUAGES = ["English (US)", "Spanish", "French", "German"];

const INITIAL = [
  { id: 1, name: "order_confirmation", category: "Utility", language: "English (US)", status: "Approved", updated: "Jun 3, 2026" },
  { id: 2, name: "shipping_update", category: "Utility", language: "English (US)", status: "Approved", updated: "Jun 2, 2026" },
  { id: 3, name: "otp_verification", category: "Authentication", language: "English (US)", status: "Approved", updated: "May 29, 2026" },
  { id: 4, name: "abandoned_cart", category: "Marketing", language: "Spanish", status: "Pending", updated: "May 27, 2026" },
  { id: 5, name: "welcome_message", category: "Marketing", language: "English (US)", status: "Approved", updated: "May 21, 2026" },
  { id: 6, name: "appointment_reminder", category: "Utility", language: "French", status: "Rejected", updated: "May 15, 2026" },
];

function CreateTemplateDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", category: "Marketing", language: "English (US)", body: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      category: form.category,
      language: form.language,
      status: "Pending",
      updated: "Just now",
    });
    setForm({ name: "", category: "Marketing", language: "English (US)", body: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create template</DialogTitle>
          <DialogDescription>Submit a message template to WhatsApp for approval.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Template name" htmlFor="wa-name">
            <Input id="wa-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. order_confirmation" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.category} onValueChange={set("category")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Language">
              <Select value={form.language} onValueChange={set("language")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Body" htmlFor="wa-body" hint="Use {{1}}, {{2}} for variables. Templates require approval before sending.">
            <Textarea id="wa-body" value={form.body} onChange={(e) => set("body")(e.target.value)} placeholder="Hi {{1}}, your order {{2}} is on its way!" />
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

export function WhatsAppScreen() {
  const [templates, setTemplates] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) =>
      (category === "All" || t.category === category) &&
      (!q || t.name.toLowerCase().includes(q)),
    );
  }, [templates, query, category]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="WhatsApp"
        description="Manage your WhatsApp Business number and approved message templates."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create template
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-[#ededed]">Geiger Studio</span>
                <span className="text-xs text-[#737373]">+1 415 555 0142</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-[#a3a3a3]">
              <span className="inline-flex items-center gap-1.5">Status <Pill tone="green">Connected</Pill></span>
              <span className="inline-flex items-center gap-1.5">Quality: <Pill tone="green">High</Pill></span>
              <span className="text-xs text-[#737373]">Messaging limit · 10K / 24h</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-40">
              {category === "All" ? "All categories" : category}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by category</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {["All", ...CATEGORIES].map((c) => (
              <DropdownMenuItem key={c} onSelect={() => setCategory(c)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", category === c && "text-white")}>
                {c === "All" ? "All categories" : c}
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
              <TableHead>Category</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-[#ededed]">{t.name}</span>
                  </div>
                </TableCell>
                <TableCell><Pill tone={CATEGORY_TONE[t.category]}>{t.category}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{t.language}</TableCell>
                <TableCell><Pill tone={STATUS_TONE[t.status]}>{t.status}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{t.updated}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Duplicate", icon: Copy },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setTemplates((p) => p.filter((x) => x.id !== t.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No templates found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTemplates((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default WhatsAppScreen;
