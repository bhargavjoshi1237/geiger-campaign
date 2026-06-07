"use client";

import React, { useMemo, useState } from "react";
import { Plus, Layout, LayoutTemplate, LayoutGrid, LayoutPanelTop, Pencil, Copy, ExternalLink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
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

const STATUS_TONE = { Published: "green", Draft: "zinc", Archived: "amber" };
const STATUSES = ["All", "Published", "Draft", "Archived"];

const TEMPLATE_META = {
  Blank: { icon: Layout, from: "#3b82f6", to: "#1e3a8a" },
  "Lead capture": { icon: LayoutTemplate, from: "#10b981", to: "#064e3b" },
  Webinar: { icon: LayoutPanelTop, from: "#8b5cf6", to: "#4c1d95" },
  Product: { icon: LayoutGrid, from: "#f59e0b", to: "#7c2d12" },
};
const TEMPLATES = Object.keys(TEMPLATE_META);

const INITIAL = [
  { id: 1, name: "Summer Sale", slug: "/lp/summer-sale", template: "Product", visits: 18240, conversion: 7, status: "Published" },
  { id: 2, name: "Q3 Product Webinar", slug: "/lp/q3-webinar", template: "Webinar", visits: 6410, conversion: 31, status: "Published" },
  { id: 3, name: "Free SaaS Playbook", slug: "/lp/saas-playbook", template: "Lead capture", visits: 9870, conversion: 22, status: "Published" },
  { id: 4, name: "Black Friday Preview", slug: "/lp/black-friday", template: "Product", visits: 0, conversion: 0, status: "Draft" },
  { id: 5, name: "Beta Waitlist", slug: "/lp/beta-waitlist", template: "Lead capture", visits: 4320, conversion: 18, status: "Published" },
  { id: 6, name: "Spring Launch 2025", slug: "/lp/spring-2025", template: "Blank", visits: 12600, conversion: 5, status: "Archived" },
];

function NewPageDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", slug: "", template: TEMPLATES[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    const slug = form.slug.trim()
      ? (form.slug.startsWith("/") ? form.slug.trim() : `/${form.slug.trim()}`)
      : `/lp/${form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    onCreate({ name: form.name.trim(), slug, template: form.template, visits: 0, conversion: 0, status: "Draft" });
    setForm({ name: "", slug: "", template: TEMPLATES[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>Pick a starting template — you can design it in the page builder next.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Page name" htmlFor="lp-name">
            <Input id="lp-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Holiday Promo" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="URL slug" htmlFor="lp-slug" hint="Leave blank to generate one from the name.">
            <Input id="lp-slug" value={form.slug} onChange={(e) => set("slug")(e.target.value)} placeholder="/lp/holiday-promo" className="bg-[#161616] border-[#2a2a2a] font-mono" />
          </Field>
          <Field label="Template">
            <Select value={form.template} onValueChange={set("template")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TEMPLATES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create page</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LandingPagesScreen() {
  const [pages, setPages] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) =>
      (status === "All" || p.status === status) &&
      (!q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)),
    );
  }, [pages, query, status]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Landing Pages"
        description="Standalone pages built to convert campaign traffic."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New page
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search pages…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-40">
              {status === "All" ? "All statuses" : status}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by status</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {STATUSES.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setStatus(s)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", status === s && "text-white")}>
                {s === "All" ? "All statuses" : s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const meta = TEMPLATE_META[p.template];
          const Icon = meta.icon;
          return (
            <div key={p.id} className="group overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] transition-colors hover:border-[#474747]">
              <div className="relative flex h-28 items-center justify-center" style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}>
                <Icon className="h-9 w-9 text-white/90" />
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <RowActions items={[
                    { label: "Edit", icon: Pencil },
                    { label: "Duplicate", icon: Copy },
                    { label: "View", icon: ExternalLink },
                    { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setPages((prev) => prev.filter((x) => x.id !== p.id)) },
                  ]} />
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-medium text-[#ededed]">{p.name}</h3>
                  <Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-[#737373]">{p.slug}</p>
                <div className="mt-3 flex items-center gap-5 border-t border-[#242424] pt-3 text-xs">
                  <div className="flex flex-col">
                    <span className="tabular-nums text-[#ededed]">{p.visits.toLocaleString()}</span>
                    <span className="text-[#737373]">Visits</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="tabular-nums text-[#ededed]">{p.conversion}%</span>
                    <span className="text-[#737373]">Conv.</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#1a1a1a] py-16 text-center text-sm text-[#737373]">
          No pages match your filters.
        </div>
      )}

      <NewPageDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(p) => setPages((prev) => [{ id: Date.now(), ...p }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default LandingPagesScreen;
