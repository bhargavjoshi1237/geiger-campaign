"use client";

import React, { useState } from "react";
import { Plus, Store, RefreshCw, Settings, Unplug } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const PLATFORM_TONE = {
  Shopify: "success",
  WooCommerce: "purple",
  Magento: "warning",
  BigCommerce: "info",
};

const STATUS_TONE = { Connected: "success", Syncing: "warning", Error: "danger" };

const PLATFORMS = ["Shopify", "WooCommerce", "Magento", "BigCommerce"];

const INITIAL = [
  { id: 1, name: "Northwind Apparel", platform: "Shopify", products: 482, orders: 1240, status: "Connected", lastSync: "2 min ago" },
  { id: 2, name: "Lumen Home Goods", platform: "WooCommerce", products: 1893, orders: 642, status: "Syncing", lastSync: "Syncing now" },
  { id: 3, name: "Brightpath Outdoors", platform: "Magento", products: 3104, orders: 318, status: "Connected", lastSync: "18 min ago" },
  { id: 4, name: "Hverk Supply Co.", platform: "BigCommerce", products: 276, orders: 91, status: "Error", lastSync: "4 hours ago" },
];

function ConnectStoreDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", platform: "Shopify", url: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      platform: form.platform,
      products: 0,
      orders: 0,
      status: "Syncing",
      lastSync: "Syncing now",
    });
    setForm({ name: "", platform: "Shopify", url: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect store</DialogTitle>
          <DialogDescription>Link a storefront to sync its products, orders, and customers.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Store name" htmlFor="store-name">
            <Input id="store-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Northwind Apparel" className="border-border" />
          </Field>
          <Field label="Platform">
            <Select value={form.platform} onValueChange={set("platform")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Store URL" htmlFor="store-url" hint="The public domain of your storefront.">
            <Input id="store-url" value={form.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://store.myshopify.com" className="border-border" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Connect store</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StoresScreen() {
  const [stores, setStores] = useState(INITIAL);
  const [connectOpen, setConnectOpen] = useState(false);

  const syncNow = (id) =>
    setStores((p) => p.map((s) => (s.id === id ? { ...s, status: "Syncing", lastSync: "Syncing now" } : s)));

  const columns = [
    {
      key: "store",
      header: "Store",
      render: (s) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground"><Store className="h-4 w-4" /></span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{s.name}</span>
            <span className="truncate text-xs text-text-secondary">{s.platform}</span>
          </div>
        </div>
      ),
    },
    { key: "platform", header: "Platform", render: (s) => <Badge variant={PLATFORM_TONE[s.platform]}>{s.platform}</Badge> },
    { key: "products", header: "Products", className: "tabular-nums text-muted-foreground", render: (s) => s.products.toLocaleString() },
    { key: "orders", header: "Orders (30d)", className: "tabular-nums text-muted-foreground", render: (s) => s.orders.toLocaleString() },
    { key: "status", header: "Status", render: (s) => <Badge variant={STATUS_TONE[s.status]}>{s.status}</Badge> },
    { key: "lastSync", header: "Last sync", className: "whitespace-nowrap text-muted-foreground", render: (s) => s.lastSync },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (s) => (
        <ActionMenu
          items={[
            { label: "Sync now", icon: RefreshCw, onSelect: () => syncNow(s.id) },
            { label: "Settings", icon: Settings },
            { separator: true },
            { label: "Disconnect", icon: Unplug, destructive: true, onSelect: () => setStores((p) => p.filter((x) => x.id !== s.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Stores"
        description="Connect your storefronts to sync products, orders, and customers."
        actions={
          <Button onClick={() => setConnectOpen(true)}>
            <Plus className="h-4 w-4" /> Connect store
          </Button>
        }
      />

      <DataTable
        className="mt-4"
        columns={columns}
        data={stores}
        getRowKey={(s) => s.id}
        empty={
          <EmptyState
            icon={Store}
            title="No stores connected"
            className="rounded-xl border border-border bg-surface-subtle"
            action={
              <Button onClick={() => setConnectOpen(true)}>
                <Plus className="h-4 w-4" /> Connect store
              </Button>
            }
          />
        }
      />

      <ConnectStoreDialog open={connectOpen} onOpenChange={setConnectOpen} onCreate={(s) => setStores((p) => [{ id: Date.now(), ...s }, ...p])} />
    </MainScreenWrapper>
  );
}

export default StoresScreen;
