"use client";

import React, { useMemo, useState } from "react";
import { Plus, Package, Pencil, Copy, Trash2 } from "lucide-react";
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

const STATUS_TONE = { Active: "green", Draft: "zinc" };

const CATEGORIES = ["Apparel", "Footwear", "Accessories", "Home", "Outdoor", "Electronics"];

const money = (n) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const initials = (name) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const INITIAL = [
  { id: 1, name: "Merino Wool Crew Sweater", sku: "NW-APP-1042", category: "Apparel", price: 128, stock: 214, status: "Active" },
  { id: 2, name: "Trail Runner GTX", sku: "BP-FTW-3308", category: "Footwear", price: 184.5, stock: 0, status: "Active" },
  { id: 3, name: "Canvas Weekender Bag", sku: "HV-ACC-0571", category: "Accessories", price: 96, stock: 58, status: "Active" },
  { id: 4, name: "Linen Throw Blanket", sku: "LM-HOM-2210", category: "Home", price: 74.99, stock: 132, status: "Draft" },
  { id: 5, name: "Insulated Water Bottle 1L", sku: "BP-OUT-0918", category: "Outdoor", price: 38, stock: 487, status: "Active" },
  { id: 6, name: "Wireless Earbuds Pro", sku: "HV-ELE-7740", category: "Electronics", price: 149, stock: 0, status: "Draft" },
  { id: 7, name: "Oxford Button-Down Shirt", sku: "NW-APP-1190", category: "Apparel", price: 89, stock: 301, status: "Active" },
  { id: 8, name: "Leather Card Wallet", sku: "HV-ACC-0623", category: "Accessories", price: 45, stock: 76, status: "Active" },
];

function AddProductDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", sku: "", category: CATEGORIES[0], price: "", stock: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.sku.trim();

  const submit = () => {
    if (!valid) return;
    onCreate({
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      category: form.category,
      price: parseFloat(form.price) || 0,
      stock: parseInt(form.stock, 10) || 0,
      status: "Draft",
    });
    setForm({ name: "", sku: "", category: CATEGORIES[0], price: "", stock: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>New products start as drafts until you publish them.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Product name" htmlFor="p-name">
            <Input id="p-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Merino Wool Crew Sweater" className="bg-background border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU" htmlFor="p-sku">
              <Input id="p-sku" value={form.sku} onChange={(e) => set("sku")(e.target.value.toUpperCase())} placeholder="NW-APP-1042" className="bg-background border-border font-mono" />
            </Field>
            <Field label="Category">
              <Select value={form.category} onValueChange={set("category")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price" htmlFor="p-price">
              <Input id="p-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set("price")(e.target.value)} placeholder="0.00" className="bg-background border-border" />
            </Field>
            <Field label="Stock" htmlFor="p-stock">
              <Input id="p-stock" type="number" min="0" value={form.stock} onChange={(e) => set("stock")(e.target.value)} placeholder="0" className="bg-background border-border" />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!valid} className="bg-white text-black hover:bg-[#e5e5e5]">Add product</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterMenu({ label, value, options, onChange }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle sm:w-40">
          {value === "All" ? label : value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
        <DropdownMenuLabel className="text-text-secondary">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-surface-hover" />
        {options.map((o) => (
          <DropdownMenuItem key={o} onSelect={() => onChange(o)} className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", value === o && "text-white")}>
            {o === "All" ? label : o}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProductsScreen() {
  const [products, setProducts] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) =>
      (category === "All" || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    );
  }, [products, query, category]);

  const duplicate = (p) =>
    setProducts((prev) => [{ ...p, id: Date.now(), name: `${p.name} (Copy)`, sku: `${p.sku}-C`, status: "Draft" }, ...prev]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Products"
        description="Your synced catalog, ready for product blocks and recommendations."
        actions={
          <Button onClick={() => setAddOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add product
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name or SKU…" />
        <FilterMenu label="All categories" value={category} options={["All", ...CATEGORIES]} onChange={setCategory} />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-xs font-medium text-muted-foreground">{initials(p.name)}</span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="truncate font-mono text-xs text-text-secondary">{p.sku}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.category}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{money(p.price)}</TableCell>
                <TableCell>
                  {p.stock === 0 ? (
                    <Pill tone="red">Out of stock</Pill>
                  ) : (
                    <span className="tabular-nums text-muted-foreground">{p.stock.toLocaleString()}</span>
                  )}
                </TableCell>
                <TableCell><Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Duplicate", icon: Copy, onSelect: () => duplicate(p) },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setProducts((prev) => prev.filter((x) => x.id !== p.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-text-secondary">No products found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} onCreate={(p) => setProducts((prev) => [{ id: Date.now(), ...p }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default ProductsScreen;
