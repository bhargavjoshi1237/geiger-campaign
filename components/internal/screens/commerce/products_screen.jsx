"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Boxes, CopyPlus, ExternalLink, Eye, EyeOff, FileText, Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { createProduct, listProducts, softDeleteProduct, updateProduct } from "@/lib/supabase/products";
import { listStores } from "@/lib/supabase/stores";
import { totalInPrimaryCurrency } from "@/lib/commerce/metrics";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SearchInput,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  StatsBar,
  StatusPill,
  SectionCard,
  SettingsList,
  SettingRow,
  InlineTitleInput,
  LoadingArea,
} from "@geiger/ui";
import {
  CURRENCIES,
  DANGER_ICON_BUTTON,
  OUTLINE_BUTTON,
  PRODUCT_STATUS_MAP,
  count,
  money,
  moneyShort,
  toFilterOptions,
} from "./constants";
import { ConfirmDialog, ListEmpty, ProductThumb } from "./commerce_ui";

const STATUS_FILTER_OPTIONS = toFilterOptions(PRODUCT_STATUS_MAP, "All statuses");
const STOCK_FILTER_OPTIONS = [
  { value: "all", label: "All stock" },
  { value: "in", label: "In stock" },
  { value: "out", label: "Out of stock" },
  { value: "untracked", label: "Not tracked" },
];

const PRODUCT_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Title, SKU, links and catalogue categories." },
  { key: "inventory", label: "Pricing & inventory", icon: Boxes, desc: "Price, stock on hand and whether blocks can show it." },
];

const MANUAL = "manual";
const EMPTY_FORM = { title: "", sku: "", storeId: MANUAL, price: "", inventory: "", categories: "", currency: "USD" };

const splitCategories = (text) => String(text || "").split(",").map((c) => c.trim()).filter(Boolean);
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

function stockBadge(p) {
  if (p.inventory == null) return <span className="text-muted-foreground">Not tracked</span>;
  if (p.inventory <= 0) return <Badge variant="danger">Out of stock</Badge>;
  return <span className="tabular-nums text-muted-foreground">{count(p.inventory)}</span>;
}

function AddProductDialog({ open, onOpenChange, stores, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Add a product name first.");
      return;
    }
    setPending(true);
    const store = stores.find((s) => s.id === form.storeId);
    const ok = await onCreate({
      title: form.title.trim(),
      sku: form.sku.trim(),
      storeId: store ? store.id : null,
      currency: store ? store.currency : form.currency,
      price: Number(form.price) || 0,
      inventory: numOrNull(form.inventory),
      categories: splitCategories(form.categories),
      status: "draft",
    });
    setPending(false);
    if (!ok) return;
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>For items your store doesn&apos;t sync. New products start as drafts until you activate them.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Product name" htmlFor="p-name">
            <Input id="p-name" value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Ceramic pour-over dripper" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU" htmlFor="p-sku">
              <Input id="p-sku" value={form.sku} onChange={(e) => set("sku")(e.target.value.toUpperCase())} placeholder="AT-DRP-01" className="font-mono" />
            </Field>
            <Field label="Store">
              <Select value={form.storeId} onValueChange={set("storeId")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={MANUAL}>No store</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price" htmlFor="p-price">
              <Input id="p-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set("price")(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Stock" htmlFor="p-stock" hint="Leave empty if you don't track it.">
              <Input id="p-stock" type="number" min="0" value={form.inventory} onChange={(e) => set("inventory")(e.target.value)} placeholder="Not tracked" />
            </Field>
          </div>
          <Field label="Categories" htmlFor="p-cats" hint="Comma separated, e.g. Coffee, Equipment.">
            <Input id="p-cats" value={form.categories} onChange={(e) => set("categories")(e.target.value)} placeholder="Coffee, Equipment" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.title.trim() || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a product; compared against the row to derive dirty state.
const toDraft = (p) => ({
  title: p.title,
  sku: p.sku,
  handle: p.handle,
  url: p.url,
  imageUrl: p.imageUrl,
  categories: p.categories.join(", "),
  price: String(p.price),
  compareAtPrice: p.compareAtPrice == null ? "" : String(p.compareAtPrice),
  currency: p.currency,
  inventory: p.inventory == null ? "" : String(p.inventory),
  status: p.status,
});

function ProductEditor({ record, store, canEdit, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const synced = Boolean(record.externalId);

  const save = async () => {
    setSaving(true);
    const saved = await onSave(record.id, {
      title: draft.title.trim() || "Untitled product",
      sku: draft.sku,
      handle: draft.handle,
      url: draft.url,
      imageUrl: draft.imageUrl,
      categories: splitCategories(draft.categories),
      price: Number(draft.price) || 0,
      compareAtPrice: numOrNull(draft.compareAtPrice),
      currency: draft.currency,
      inventory: numOrNull(draft.inventory),
      status: draft.status,
    });
    setSaving(false);
    if (saved) setDraft(toDraft(saved));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.title}
          onChange={(e) => set("title")(e.target.value)}
          aria-label="Product name"
          placeholder="Untitled product"
          readOnly={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={draft.status}
      statusMap={PRODUCT_STATUS_MAP}
      badges={
        <>
          <Badge variant="neutral">{store ? store.name : "No store"}</Badge>
          {record.sku ? <span className="font-mono text-xs text-text-tertiary">{record.sku}</span> : null}
          {synced ? <span className="text-xs text-text-tertiary">Synced · store id {record.externalId}</span> : null}
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete product" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={PRODUCT_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {synced ? (
            <p className="mb-4 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-text-secondary">
              This product syncs from {store?.name || "its store"}. The store&apos;s next update overwrites edits made here.
            </p>
          ) : null}

          {active === "details" ? (
            <SectionCard bare title="Product details" description="How the product is named, identified and linked in emails and rules.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product name" htmlFor="pe-name" className="sm:col-span-2">
                  <Input id="pe-name" value={draft.title} disabled={!canEdit} onChange={(e) => set("title")(e.target.value)} />
                </Field>
                <Field label="SKU" htmlFor="pe-sku">
                  <Input id="pe-sku" value={draft.sku} disabled={!canEdit} onChange={(e) => set("sku")(e.target.value.toUpperCase())} className="font-mono" />
                </Field>
                <Field label="Handle" htmlFor="pe-handle" hint="The product's slug in the store.">
                  <Input id="pe-handle" value={draft.handle} disabled={!canEdit} onChange={(e) => set("handle")(e.target.value)} className="font-mono" />
                </Field>
                <Field label="Product URL" htmlFor="pe-url" hint="Where product blocks link to." className="sm:col-span-2">
                  <Input id="pe-url" value={draft.url} disabled={!canEdit} onChange={(e) => set("url")(e.target.value)} placeholder="https://shop.example.com/products/…" />
                </Field>
                <Field label="Image URL" htmlFor="pe-image" className="sm:col-span-2">
                  <Input id="pe-image" value={draft.imageUrl} disabled={!canEdit} onChange={(e) => set("imageUrl")(e.target.value)} placeholder="https://…" />
                </Field>
                <Field label="Categories" htmlFor="pe-cats" hint="Comma separated. Category rules match on these." className="sm:col-span-2">
                  <Input id="pe-cats" value={draft.categories} disabled={!canEdit} onChange={(e) => set("categories")(e.target.value)} />
                </Field>
              </div>
              {record.url ? (
                <a href={record.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" /> Open in store
                </a>
              ) : null}
            </SectionCard>
          ) : null}

          {active === "inventory" ? (
            <SectionCard bare title="Price & stock" description="What it costs, how many are on hand and whether blocks can show it.">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Price" htmlFor="pe-price">
                  <Input id="pe-price" type="number" min="0" step="0.01" value={draft.price} disabled={!canEdit} onChange={(e) => set("price")(e.target.value)} />
                </Field>
                <Field label="Compare-at price" htmlFor="pe-compare" hint="Shown struck through.">
                  <Input id="pe-compare" type="number" min="0" step="0.01" value={draft.compareAtPrice} disabled={!canEdit} onChange={(e) => set("compareAtPrice")(e.target.value)} placeholder="None" />
                </Field>
                <Field label="Currency">
                  <Select value={draft.currency} onValueChange={set("currency")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([draft.currency, ...CURRENCIES])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Stock" htmlFor="pe-stock" hint="Empty = not tracked. In-stock-only rules skip 0.">
                  <Input id="pe-stock" type="number" min="0" value={draft.inventory} disabled={!canEdit} onChange={(e) => set("inventory")(e.target.value)} placeholder="Not tracked" />
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Active"
                  description="Only active products appear in product blocks and recommendations."
                  checked={draft.status === "active"}
                  onCheckedChange={(on) => canEdit && set("status")(on ? "active" : "draft")}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function ProductsScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.commerce.edit");
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    Promise.all([listProducts(projectId, { limit: 5000 }), listStores(projectId)]).then(([rows, storeRows]) => {
      if (!alive) return;
      setProducts(rows ?? []);
      setStores(storeRows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const storeOptions = useMemo(
    () => [{ value: "all", label: "All stores" }, ...stores.map((s) => ({ value: s.id, label: s.name })), { value: MANUAL, label: "No store" }],
    [stores],
  );

  const categoryOptions = useMemo(() => {
    const all = [...new Set(products.flatMap((p) => p.categories))].sort((a, b) => a.localeCompare(b));
    return [{ value: "all", label: "All categories" }, ...all.map((c) => ({ value: c, label: c }))];
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (storeFilter === MANUAL && p.storeId) return false;
      if (storeFilter !== "all" && storeFilter !== MANUAL && p.storeId !== storeFilter) return false;
      if (categoryFilter !== "all" && !p.categories.includes(categoryFilter)) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (stockFilter === "in" && !(p.inventory > 0)) return false;
      if (stockFilter === "out" && !(p.inventory != null && p.inventory <= 0)) return false;
      if (stockFilter === "untracked" && p.inventory != null) return false;
      if (q && !`${p.title} ${p.sku} ${p.handle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, query, storeFilter, categoryFilter, statusFilter, stockFilter]);

  const stats = useMemo(() => {
    const active = products.filter((p) => p.status === "active").length;
    const outOfStock = products.filter((p) => p.inventory != null && p.inventory <= 0).length;
    const tracked = products.filter((p) => p.inventory != null && p.inventory > 0);
    const value = totalInPrimaryCurrency(tracked, (p) => p.price * p.inventory);
    return [
      { label: "Products", value: count(products.length), footer: `${count(stores.length)} stores` },
      { label: "Active", value: count(active), footer: "Eligible for blocks" },
      { label: "Out of stock", value: count(outOfStock) },
      { label: "Inventory value", value: moneyShort(value.total, value.currency), footer: value.excluded ? `${count(value.excluded)} in other currencies not included` : "Tracked stock at list price" },
    ];
  }, [products, stores]);

  const pager = usePagination(filtered, { resetKey: `${query}|${storeFilter}|${categoryFilter}|${statusFilter}|${stockFilter}` });

  const handleCreate = async (input) => {
    const id = crypto.randomUUID();
    const user = await getUser();
    const optimistic = { id, projectId, externalId: null, handle: "", compareAtPrice: null, imageUrl: "", url: "", ...input };
    setProducts((prev) => [optimistic, ...prev]);
    const created = await createProduct(projectId, { ...input, id, createdBy: user?.id ?? null });
    if (!created) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.error("Couldn't add the product.");
      return null;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? created : p)));
    toast.success("Product added.");
    openRecord(id);
    return created;
  };

  const handleSave = async (id, patch, message = "Product saved.") => {
    const before = products.find((p) => p.id === id);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const saved = await updateProduct(id, patch);
    if (!saved) {
      setProducts((prev) => prev.map((p) => (p.id === id ? before : p)));
      toast.error("Couldn't save the product.");
      return null;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? saved : p)));
    toast.success(message);
    return saved;
  };

  const handleDuplicate = async (p) => {
    const id = crypto.randomUUID();
    const copy = {
      title: `${p.title} (copy)`,
      sku: p.sku ? `${p.sku}-COPY` : "",
      storeId: p.storeId,
      handle: "",
      url: p.url,
      imageUrl: p.imageUrl,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      currency: p.currency,
      inventory: p.inventory,
      categories: p.categories,
      status: "draft",
    };
    setProducts((prev) => [{ ...copy, id, projectId, externalId: null }, ...prev]);
    const created = await createProduct(projectId, { ...copy, id });
    if (!created) {
      setProducts((prev) => prev.filter((x) => x.id !== id));
      toast.error("Couldn't duplicate the product.");
      return;
    }
    setProducts((prev) => prev.map((x) => (x.id === id ? created : x)));
    toast.success("Product duplicated as a draft.");
  };

  const handleDelete = async (p) => {
    setDeleteTarget(null);
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    if (String(p.id) === recordId) closeRecord();
    if (await softDeleteProduct(p.id)) {
      toast.success(`Deleted "${p.title}".`);
    } else {
      setProducts((prev) => [p, ...prev]);
      toast.error(`Couldn't delete "${p.title}".`);
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(o) => !o && setDeleteTarget(null)}
      title="Delete product"
      description={
        <>
          Delete <span className="font-medium text-foreground">{deleteTarget?.title}</span>? Product blocks and recommendations stop showing it.
          {deleteTarget?.externalId ? " If the store updates it again, it comes back." : ""}
        </>
      }
      confirmLabel="Delete"
      icon={Trash2}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const open = products.find((p) => String(p.id) === recordId);
  if (open) {
    return (
      <>
        <ProductEditor key={open.id} record={open} store={storeById.get(open.storeId)} canEdit={canEdit} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || storeFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all" || stockFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStoreFilter("all");
    setCategoryFilter("all");
    setStatusFilter("all");
    setStockFilter("all");
  };

  const columns = [
    {
      key: "product",
      header: "Product",
      render: (p) => (
        <div className="flex items-center gap-3">
          <ProductThumb imageUrl={p.imageUrl} title={p.title} />
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{p.title}</span>
            <span className="truncate font-mono text-xs text-text-secondary">{p.sku || p.handle || "No SKU"}</span>
          </div>
        </div>
      ),
    },
    { key: "store", header: "Store", className: "text-muted-foreground", render: (p) => storeById.get(p.storeId)?.name || "No store" },
    { key: "category", header: "Category", className: "text-muted-foreground", render: (p) => p.categories[0] || "—" },
    {
      key: "price",
      header: "Price",
      className: "whitespace-nowrap tabular-nums text-muted-foreground",
      render: (p) => (
        <>
          {money(p.price, p.currency)}
          {p.compareAtPrice > p.price ? <span className="ml-1.5 text-xs text-text-tertiary line-through">{money(p.compareAtPrice, p.currency)}</span> : null}
        </>
      ),
    },
    { key: "stock", header: "Stock", render: stockBadge },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (p) => <StatusPill status={p.status} map={PRODUCT_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${p.title}`}
            items={[
              { label: canEdit ? "Edit product" : "View product", icon: Pencil, onSelect: () => openRecord(String(p.id)) },
              p.url && { label: "Open in store", icon: ExternalLink, href: p.url },
              canEdit && { label: "Duplicate", icon: CopyPlus, onSelect: () => handleDuplicate(p) },
              canEdit &&
                (p.status === "active"
                  ? { label: "Move to drafts", icon: EyeOff, onSelect: () => handleSave(p.id, { status: "draft" }, `${p.title} moved to drafts.`) }
                  : { label: "Activate", icon: Eye, onSelect: () => handleSave(p.id, { status: "active" }, `${p.title} is now active.`) }),
              canEdit && { separator: true },
              canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(p) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Products"
        description="The catalogue your stores sync, ready for product blocks and recommendations."
        actions={
          canEdit ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={storeFilter} onValueChange={setStoreFilter} options={storeOptions} height="h-9" />
          <FilterDropdown value={categoryFilter} onValueChange={setCategoryFilter} options={categoryOptions} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={stockFilter} onValueChange={setStockFilter} options={STOCK_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, SKU or handle…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading products" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(p) => p.id}
            onRowClick={(p) => openRecord(String(p.id))}
            empty={
              <ListEmpty
                icon={Package}
                title={filtersActive ? "No matches" : "No products yet"}
                description={filtersActive ? "Try a different search or filter." : "Products arrive when a connected store sends product webhooks. You can also add one by hand."}
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                  ) : canEdit ? (
                    <Button onClick={() => setAddOpen(true)}>
                      <Plus className="h-4 w-4" /> Add product
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="products" />
        </div>
      )}

      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} stores={stores} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ProductsScreen;
