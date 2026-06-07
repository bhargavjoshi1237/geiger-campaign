"use client";

import React, { useState } from "react";
import { Plus, Store, RefreshCw, Settings, Unplug } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PLATFORM_TONE = {
  Shopify: "green",
  WooCommerce: "violet",
  Magento: "amber",
  BigCommerce: "blue",
};

const STATUS_TONE = { Connected: "green", Syncing: "amber", Error: "red" };

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
        <DialogBody className="space-y-4 py-4">
          <Field label="Store name" htmlFor="store-name">
            <Input id="store-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Northwind Apparel" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Platform">
            <Select value={form.platform} onValueChange={set("platform")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Store URL" htmlFor="store-url" hint="The public domain of your storefront.">
            <Input id="store-url" value={form.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://store.myshopify.com" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Connect store</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Stores"
        description="Connect your storefronts to sync products, orders, and customers."
        actions={
          <Button onClick={() => setConnectOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Connect store
          </Button>
        }
      />

      <TableShell className="mt-4">
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Store</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Orders (30d)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sync</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((s) => (
              <TableRow key={s.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]"><Store className="h-4 w-4" /></span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{s.name}</span>
                      <span className="truncate text-xs text-[#737373]">{s.platform}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Pill tone={PLATFORM_TONE[s.platform]}>{s.platform}</Pill></TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{s.products.toLocaleString()}</TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{s.orders.toLocaleString()}</TableCell>
                <TableCell><Pill tone={STATUS_TONE[s.status]}>{s.status}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{s.lastSync}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Sync now", icon: RefreshCw, onSelect: () => syncNow(s.id) },
                      { label: "Settings", icon: Settings },
                      { label: "Disconnect", icon: Unplug, danger: true, separatorBefore: true, onSelect: () => setStores((p) => p.filter((x) => x.id !== s.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {stores.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-sm text-[#737373]">No stores connected.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <ConnectStoreDialog open={connectOpen} onOpenChange={setConnectOpen} onCreate={(s) => setStores((p) => [{ id: Date.now(), ...s }, ...p])} />
    </MainScreenWrapper>
  );
}

export default StoresScreen;
