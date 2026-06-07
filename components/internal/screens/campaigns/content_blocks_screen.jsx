"use client";

import React, { useMemo, useState } from "react";
import { Plus, SquareStack, Pencil, Copy, Trash2, LayoutPanelTop, MousePointerClick, PanelBottom, ShoppingBag, Share2, Type } from "lucide-react";
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

const TYPE_META = {
  Header: { icon: LayoutPanelTop, tone: "blue" },
  Hero: { icon: Type, tone: "violet" },
  CTA: { icon: MousePointerClick, tone: "amber" },
  Footer: { icon: PanelBottom, tone: "zinc" },
  Product: { icon: ShoppingBag, tone: "green" },
  Social: { icon: Share2, tone: "blue" },
};
const TYPES = Object.keys(TYPE_META);

const INITIAL = [
  { id: 1, name: "Primary header — logo + nav", description: "Brand logo with 3-link navigation bar", type: "Header", usedIn: 14, updated: "Jun 1, 2026" },
  { id: 2, name: "Hero — promo banner", description: "Full-width image with headline overlay", type: "Hero", usedIn: 6, updated: "May 30, 2026" },
  { id: 3, name: "Shop now CTA", description: "Centered button with supporting text", type: "CTA", usedIn: 22, updated: "May 28, 2026" },
  { id: 4, name: "Standard footer", description: "Address, unsubscribe, and social links", type: "Footer", usedIn: 31, updated: "May 20, 2026" },
  { id: 5, name: "Product grid (3-up)", description: "Three products with image, name, price", type: "Product", usedIn: 9, updated: "May 18, 2026" },
  { id: 6, name: "Social follow row", description: "Icon row linking to social profiles", type: "Social", usedIn: 17, updated: "May 12, 2026" },
];

function CreateBlockDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Header", description: "" });
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), type: form.type, description: form.description.trim() || "—", usedIn: 0, updated: "Just now" });
    setForm({ name: "", type: "Header", description: "" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New content block</DialogTitle>
          <DialogDescription>Saved blocks can be dropped into any campaign or template.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Block name" htmlFor="b-name">
            <Input id="b-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring hero banner" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Description" htmlFor="b-desc">
            <Textarea id="b-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this block contain?" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create block</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContentBlocksScreen() {
  const [blocks, setBlocks] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blocks.filter((b) => (typeFilter === "All" || b.type === typeFilter) && (!q || b.name.toLowerCase().includes(q)));
  }, [blocks, query, typeFilter]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Content Blocks"
        description="Reusable, brand-consistent building blocks you can drop into any email."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New block
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search blocks…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-40">
              {typeFilter === "All" ? "All types" : typeFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
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
              <TableHead>Block</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Used in</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((b) => {
              const meta = TYPE_META[b.type];
              const Icon = meta.icon;
              return (
                <TableRow key={b.id} className="border-[#2a2a2a]">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-[#ededed]">{b.name}</span>
                        <span className="truncate text-xs text-[#737373]">{b.description}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Pill tone={meta.tone}>{b.type}</Pill></TableCell>
                  <TableCell className="tabular-nums text-[#a3a3a3]">{b.usedIn} campaigns</TableCell>
                  <TableCell className="whitespace-nowrap text-[#a3a3a3]">{b.updated}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Edit block", icon: Pencil },
                        { label: "Duplicate", icon: Copy },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setBlocks((p) => p.filter((x) => x.id !== b.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No blocks found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateBlockDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(b) => setBlocks((p) => [{ id: Date.now(), ...b }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ContentBlocksScreen;
