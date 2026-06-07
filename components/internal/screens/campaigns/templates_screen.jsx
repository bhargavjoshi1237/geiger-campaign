"use client";

import React, { useMemo, useState } from "react";
import { Plus, FileText, Pencil, Copy, Trash2, Mail, ShoppingBag, Megaphone, CalendarDays, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { SearchInput, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
        <DialogBody className="space-y-4 py-4">
          <Field label="Template name" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring Newsletter" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
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
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Templates"
        description="Reusable email designs your team can launch campaigns from in seconds."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> New template</Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-44">
              {category === "All" ? "All categories" : category}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((t) => {
          const meta = CATEGORY_META[t.category];
          const Icon = meta.icon;
          return (
            <div key={t.id} className="group overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] transition-colors hover:border-[#474747]">
              <div
                className="relative flex h-32 items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
              >
                <Icon className="h-9 w-9 text-white/90" />
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <RowActions items={[
                    { label: "Edit", icon: Pencil },
                    { label: "Duplicate", icon: Copy },
                    { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setTemplates((p) => p.filter((x) => x.id !== t.id)) },
                  ]} />
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-medium text-[#ededed]">{t.name}</h3>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-[#737373]">
                  <span className="rounded border border-[#2a2a2a] bg-[#242424] px-1.5 py-0.5">{t.category}</span>
                  <span>·</span>
                  <span>Edited {t.edited}</span>
                </div>
                <Button variant="outline" className="mt-3 h-8 w-full border-[#2a2a2a] bg-[#202020] text-xs text-[#ededed] hover:bg-[#242424]">
                  Use template
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#1a1a1a] py-16 text-center text-sm text-[#737373]">
          No templates match your filters.
        </div>
      )}

      <NewTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTemplates((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default TemplatesScreen;
