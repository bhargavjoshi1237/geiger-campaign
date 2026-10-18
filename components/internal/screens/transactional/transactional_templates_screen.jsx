"use client";

import React, { useMemo, useState } from "react";
import { Plus, FileCode, Pencil, Copy, Send, Trash2 } from "lucide-react";
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
  Switch,
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

const TYPE_TONE = {
  Welcome: "success",
  "Password reset": "warning",
  Receipt: "info",
  "Email verification": "purple",
  "Shipping update": "neutral",
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
        <div className="space-y-4 py-4">
          <Field label="Template name" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Welcome email" className="border-border" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject" htmlFor="t-subject">
            <Input id="t-subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Your order {{order_id}} is confirmed" className="border-border" />
          </Field>
          <Field label="Body" htmlFor="t-body" hint="Supports merge tags like {{first_name}} and {{order_id}}.">
            <Textarea id="t-body" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Hi {{first_name}}, …" className="bg-background" />
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

  const columns = [
    {
      key: "template",
      header: "Template",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <FileCode className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{t.name}</span>
            <span className="truncate text-xs text-text-secondary">{t.subject}</span>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (t) => <Badge variant={TYPE_TONE[t.type]}>{t.type}</Badge> },
    { key: "updated", header: "Last updated", className: "whitespace-nowrap text-muted-foreground" },
    { key: "active", header: "Active", render: (t) => <Switch checked={t.active} onCheckedChange={() => toggle(t.id)} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (t) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Duplicate", icon: Copy },
            { label: "Send test", icon: Send },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(t.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Transactional Templates"
        description="Reusable templates for receipts, password resets, and other system emails."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-44">
                {typeFilter === "All" ? "All types" : typeFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-surface-card">
              <DropdownMenuLabel className="text-text-secondary">Filter by type</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-surface-hover" />
              {["All", ...TYPES].map((t) => (
                <DropdownMenuItem key={t} onSelect={() => setTypeFilter(t)} className={cn("cursor-pointer focus:bg-surface-hover", typeFilter === t && "font-medium")}>
                  {t === "All" ? "All types" : t}
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
            icon={FileCode}
            title="No templates found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New template</Button>}
          />
        }
      />

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTemplates((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default TransactionalTemplatesScreen;
