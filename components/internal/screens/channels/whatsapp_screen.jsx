"use client";

import React, { useMemo, useState } from "react";
import { Plus, MessageCircle, Pencil, Copy, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  DataTable,
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
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Toolbar,
  Badge,
  ActionMenu,
  Field,
  cn,
} from "@geiger/ui";

const CATEGORY_TONE = { Marketing: "info", Utility: "neutral", Authentication: "purple" };
const STATUS_TONE = { Approved: "success", Pending: "warning", Rejected: "danger" };
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
        <div className="space-y-4 py-4">
          <Field label="Template name" htmlFor="wa-name">
            <Input id="wa-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. order_confirmation" className="border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.category} onValueChange={set("category")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Language">
              <Select value={form.language} onValueChange={set("language")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Body" htmlFor="wa-body" hint="Use {{1}}, {{2}} for variables. Templates require approval before sending.">
            <Textarea id="wa-body" value={form.body} onChange={(e) => set("body")(e.target.value)} placeholder="Hi {{1}}, your order {{2}} is on its way!" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create template</Button>
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

  const columns = [
    {
      key: "template",
      header: "Template",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{t.name}</span>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (t) => <Badge variant={CATEGORY_TONE[t.category]}>{t.category}</Badge> },
    { key: "language", header: "Language", className: "whitespace-nowrap text-muted-foreground", render: (t) => t.language },
    { key: "status", header: "Status", render: (t) => <Badge variant={STATUS_TONE[t.status]}>{t.status}</Badge> },
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (t) => t.updated },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (t) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Duplicate", icon: Copy },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setTemplates((p) => p.filter((x) => x.id !== t.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="WhatsApp"
        description="Manage your WhatsApp Business number and approved message templates."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create template
          </Button>
        }
      />

      <div>
        <SectionCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-foreground">Halcyon Studio</span>
                <span className="text-xs text-text-secondary">+1 415 555 0142</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">Status <Badge variant="success">Connected</Badge></span>
              <span className="inline-flex items-center gap-1.5">Quality: <Badge variant="success">High</Badge></span>
              <span className="text-xs text-text-secondary">Messaging limit · 10K / 24h</span>
            </div>
          </div>
        </SectionCard>
      </div>

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
                {category === "All" ? "All categories" : category}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44 bg-surface-card">
              <DropdownMenuLabel className="text-text-secondary">Filter by category</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-surface-hover" />
              {["All", ...CATEGORIES].map((c) => (
                <DropdownMenuItem key={c} onSelect={() => setCategory(c)} className={cn("cursor-pointer focus:bg-surface-hover", category === c && "font-medium")}>
                  {c === "All" ? "All categories" : c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(t) => t.id}
        empty={
          <EmptyState
            icon={MessageCircle}
            title="No templates found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create template
              </Button>
            }
          />
        }
      />

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTemplates((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default WhatsAppScreen;
