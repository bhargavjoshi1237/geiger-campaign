"use client";

import React, { useMemo, useState } from "react";
import { Plus, FileText, Pencil, Copy, Trash2, Mail, ShoppingBag, Megaphone, CalendarDays, Sparkles } from "lucide-react";
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
  cn,
  ScreenHeader,
  SearchInput,
  Toolbar,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const CATEGORY_META = {
  Newsletter: { icon: Mail, from: "#3b82f6", to: "#1e3a8a" },
  Promotion: { icon: Megaphone, from: "#f59e0b", to: "#7c2d12" },
  "E-commerce": { icon: ShoppingBag, from: "#10b981", to: "#064e3b" },
  Event: { icon: CalendarDays, from: "#8b5cf6", to: "#4c1d95" },
  Welcome: { icon: Sparkles, from: "#ec4899", to: "#831843" },
};
const CATEGORIES = Object.keys(CATEGORY_META);

const INITIAL = [
  { id: 1, name: "Weekly Newsletter", category: "Newsletter", edited: "2 days ago" },
  { id: 2, name: "Flash Sale Promo", category: "Promotion", edited: "5 days ago" },
  { id: 3, name: "Abandoned Cart", category: "E-commerce", edited: "1 week ago" },
  { id: 4, name: "Webinar Invite", category: "Event", edited: "1 week ago" },
  { id: 5, name: "Welcome Series — Email 1", category: "Welcome", edited: "2 weeks ago" },
  { id: 6, name: "Product Announcement", category: "Promotion", edited: "3 weeks ago" },
  { id: 7, name: "Order Confirmation", category: "E-commerce", edited: "1 month ago" },
  { id: 8, name: "Monthly Digest", category: "Newsletter", edited: "1 month ago" },
];

function NewTemplateDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0] });
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), category: form.category, edited: "Just now" });
    setForm({ name: "", category: CATEGORIES[0] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>Start from scratch — you can design it in the email builder.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Template name" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring Newsletter" className="border-border" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
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

export function TemplatesScreen() {
  const [templates, setTemplates] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => (category === "All" || t.category === category) && (!q || t.name.toLowerCase().includes(q)));
  }, [templates, query, category]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Templates"
        description="Reusable email designs your team can launch campaigns from in seconds."
        actions={
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New template</Button>
        }
      />

      <Toolbar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between bg-surface-card sm:w-44">
              {category === "All" ? "All categories" : category}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuLabel className="text-text-secondary">Filter by category</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {["All", ...CATEGORIES].map((c) => (
              <DropdownMenuItem key={c} onSelect={() => setCategory(c)} className={cn("cursor-pointer", category === c && "font-medium")}>
                {c === "All" ? "All categories" : c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates…" />
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((t) => {
          const meta = CATEGORY_META[t.category];
          const Icon = meta.icon;
          return (
            <div key={t.id} className="group overflow-hidden rounded-xl border border-border bg-surface-subtle transition-colors hover:border-border-strong">
              <div
                className="relative flex h-32 items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
              >
                <Icon className="h-9 w-9 text-white/90" />
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <ActionMenu items={[
                    { label: "Edit", icon: Pencil },
                    { label: "Duplicate", icon: Copy },
                    { separator: true },
                    { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setTemplates((p) => p.filter((x) => x.id !== t.id)) },
                  ]} />
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-medium text-foreground">{t.name}</h3>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                  <Badge variant="neutral">{t.category}</Badge>
                  <span>·</span>
                  <span>Edited {t.edited}</span>
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full bg-surface-card text-xs">
                  Use template
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No templates found"
          description="No templates match your filters."
          className="rounded-xl border border-dashed border-border bg-surface-subtle"
          action={<Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New template</Button>}
        />
      )}

      <NewTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTemplates((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default TemplatesScreen;
