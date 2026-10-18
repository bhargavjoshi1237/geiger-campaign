"use client";

import React, { useMemo, useState } from "react";
import { Plus, BookOpen, RefreshCw, Pencil, Trash2 } from "lucide-react";
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
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const TYPES = ["Products", "Articles", "Events", "Properties"];
const TYPE_TONE = { Products: "success", Articles: "info", Events: "purple", Properties: "warning" };
const SOURCES = ["Shopify", "CSV import", "API", "Contentful", "WooCommerce"];
const STATUS_TONE = { Synced: "success", Syncing: "warning", Error: "danger" };

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
        <div className="space-y-4 py-4">
          <Field label="Catalog name" htmlFor="c-name">
            <Input id="c-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Storefront products" className="border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create catalog</Button>
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

  const columns = [
    {
      key: "catalog",
      header: "Catalog",
      render: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{c.name}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (c) => <Badge variant={TYPE_TONE[c.type]}>{c.type}</Badge> },
    { key: "items", header: "Items", className: "tabular-nums text-muted-foreground", render: (c) => c.items.toLocaleString() },
    { key: "source", header: "Source", className: "whitespace-nowrap text-muted-foreground" },
    { key: "lastSync", header: "Last sync", className: "whitespace-nowrap text-muted-foreground" },
    { key: "status", header: "Status", render: (c) => <Badge variant={STATUS_TONE[c.status]}>{c.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <ActionMenu
          items={[
            { label: "Sync now", icon: RefreshCw, onSelect: () => syncNow(c.id) },
            { label: "Edit", icon: Pencil },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(c.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Catalogs"
        description="Synced product and content catalogs for blocks and recommendations."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New catalog
          </Button>
        }
      />

      <Toolbar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
              {typeFilter === "All" ? "All types" : typeFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 bg-surface-card">
            <DropdownMenuLabel className="text-text-secondary">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {["All", ...TYPES].map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setTypeFilter(t)} className={cn("cursor-pointer focus:bg-surface-hover", typeFilter === t && "font-medium")}>
                {t === "All" ? "All types" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SearchInput value={query} onChange={setQuery} placeholder="Search catalogs…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={BookOpen}
            title="No catalogs found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New catalog</Button>}
          />
        }
      />

      <CreateCatalogDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(c) => setCatalogs((p) => [{ id: Date.now(), ...c }, ...p])} />
    </MainScreenWrapper>
  );
}

export default CatalogsScreen;
