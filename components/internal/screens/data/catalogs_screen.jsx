"use client";

import React, { useMemo, useState } from "react";
import { Plus, BookOpen, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const TYPES = ["Products", "Articles", "Events", "Properties"];
const TYPE_TONE = { Products: "green", Articles: "blue", Events: "violet", Properties: "amber" };
const SOURCES = ["Shopify", "CSV import", "API", "Contentful", "WooCommerce"];
const STATUS_TONE = { Synced: "green", Syncing: "amber", Error: "red" };

const INITIAL = [
  { id: 1, name: "Storefront products", type: "Products", items: 4820, source: "Shopify", lastSync: "4 minutes ago", status: "Synced" },
  { id: 2, name: "Blog articles", type: "Articles", items: 312, source: "Contentful", lastSync: "1 hour ago", status: "Synced" },
  { id: 3, name: "Workshop events", type: "Events", items: 47, source: "API", lastSync: "Syncing now", status: "Syncing" },
  { id: 4, name: "Property listings", type: "Properties", items: 1294, source: "CSV import", lastSync: "Yesterday", status: "Error" },
  { id: 5, name: "Clearance catalog", type: "Products", items: 638, source: "WooCommerce", lastSync: "12 minutes ago", status: "Synced" },
];

function CreateCatalogDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Products", source: "Shopify" });

  const reset = () => setForm({ name: "", type: "Products", source: "Shopify" });

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      type: form.type,
      items: 0,
      source: form.source,
      lastSync: "Never",
      status: "Syncing",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New catalog</DialogTitle>
          <DialogDescription>Connect a product or content source to power blocks and recommendations.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Catalog name" htmlFor="c-name">
            <Input id="c-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Storefront products" className="bg-background border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create catalog</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogsScreen() {
  const [catalogs, setCatalogs] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogs.filter((c) =>
      (typeFilter === "All" || c.type === typeFilter) &&
      (!q || c.name.toLowerCase().includes(q) || c.source.toLowerCase().includes(q)),
    );
  }, [catalogs, query, typeFilter]);

  const remove = (id) => setCatalogs((p) => p.filter((c) => c.id !== id));
  const syncNow = (id) => setCatalogs((p) => p.map((c) => (c.id === id ? { ...c, status: "Syncing", lastSync: "Syncing now" } : c)));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Catalogs"
        description="Synced product and content catalogs for blocks and recommendations."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New catalog
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search catalogs…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle sm:w-40">
              {typeFilter === "All" ? "All types" : typeFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
            <DropdownMenuLabel className="text-text-secondary">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {["All", ...TYPES].map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setTypeFilter(t)} className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", typeFilter === t && "text-white")}>
                {t === "All" ? "All types" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Catalog</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Last sync</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-foreground">{c.name}</span>
                  </div>
                </TableCell>
                <TableCell><Pill tone={TYPE_TONE[c.type]}>{c.type}</Pill></TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{c.items.toLocaleString()}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.source}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.lastSync}</TableCell>
                <TableCell><Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Sync now", icon: RefreshCw, onSelect: () => syncNow(c.id) },
                      { label: "Edit", icon: Pencil },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(c.id) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-sm text-text-secondary">No catalogs found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateCatalogDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(c) => setCatalogs((p) => [{ id: Date.now(), ...c }, ...p])} />
    </MainScreenWrapper>
  );
}

export default CatalogsScreen;
