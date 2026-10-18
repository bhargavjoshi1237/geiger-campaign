"use client";

import React, { useMemo, useState } from "react";
import { Plus, SquareStack, Pencil, Copy, Trash2, LayoutPanelTop, MousePointerClick, PanelBottom, ShoppingBag, Share2, Type } from "lucide-react";
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
  Textarea,
  cn,
  ScreenHeader,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const TYPE_META = {
  Header: { icon: LayoutPanelTop, tone: "info" },
  Hero: { icon: Type, tone: "purple" },
  CTA: { icon: MousePointerClick, tone: "warning" },
  Footer: { icon: PanelBottom, tone: "neutral" },
  Product: { icon: ShoppingBag, tone: "success" },
  Social: { icon: Share2, tone: "info" },
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
        <div className="space-y-4 py-4">
          <Field label="Block name" htmlFor="b-name">
            <Input id="b-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring hero banner" className="border-border" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Description" htmlFor="b-desc">
            <Textarea id="b-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this block contain?" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create block</Button>
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

  const columns = [
    {
      key: "block",
      header: "Block",
      render: (b) => {
        const Icon = TYPE_META[b.type].icon;
        return (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="font-medium text-foreground">{b.name}</span>
              <span className="truncate text-xs text-text-secondary">{b.description}</span>
            </div>
          </div>
        );
      },
    },
    { key: "type", header: "Type", render: (b) => <Badge variant={TYPE_META[b.type].tone}>{b.type}</Badge> },
    { key: "usedIn", header: "Used in", className: "tabular-nums text-muted-foreground", render: (b) => `${b.usedIn} campaigns` },
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (b) => b.updated },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (b) => (
        <ActionMenu
          items={[
            { label: "Edit block", icon: Pencil },
            { label: "Duplicate", icon: Copy },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setBlocks((p) => p.filter((x) => x.id !== b.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Content Blocks"
        description="Reusable, brand-consistent building blocks you can drop into any email."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New block
          </Button>
        }
      />

      <Toolbar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between bg-surface-card sm:w-40">
              {typeFilter === "All" ? "All types" : typeFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuLabel className="text-text-secondary">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {["All", ...TYPES].map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setTypeFilter(t)} className={cn("cursor-pointer", typeFilter === t && "font-medium")}>
                {t === "All" ? "All types" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SearchInput value={query} onChange={setQuery} placeholder="Search blocks…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(b) => b.id}
        empty={
          <EmptyState
            icon={SquareStack}
            title="No blocks found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New block</Button>}
          />
        }
      />

      <CreateBlockDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(b) => setBlocks((p) => [{ id: Date.now(), ...b }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ContentBlocksScreen;
