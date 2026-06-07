"use client";

import React, { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const STATUS_TONE = {
  Paid: "green",
  Pending: "amber",
  Fulfilled: "blue",
  Refunded: "zinc",
  Cancelled: "red",
};

const STATUSES = ["Paid", "Pending", "Fulfilled", "Refunded", "Cancelled"];

const money = (n) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INITIAL = [
  { id: 1, number: "#48213", customer: "Ava Cole", email: "ava.cole@northwind.io", total: 342.0, status: "Paid", date: "Jun 7, 2026", lineItems: [{ name: "Merino Wool Crew Sweater", qty: 2, price: 128 }, { name: "Leather Card Wallet", qty: 1, price: 45 }, { name: "Insulated Water Bottle 1L", qty: 1, price: 41 }] },
  { id: 2, number: "#48212", customer: "Liam O'Brien", email: "liam@obrien.dev", total: 184.5, status: "Fulfilled", date: "Jun 7, 2026", lineItems: [{ name: "Trail Runner GTX", qty: 1, price: 184.5 }] },
  { id: 3, number: "#48209", customer: "Maria Gomez", email: "maria.gomez@lumen.co", total: 222.99, status: "Pending", date: "Jun 6, 2026", lineItems: [{ name: "Canvas Weekender Bag", qty: 1, price: 96 }, { name: "Linen Throw Blanket", qty: 1, price: 74.99 }, { name: "Insulated Water Bottle 1L", qty: 1, price: 52 }] },
  { id: 4, number: "#48201", customer: "Noah Schmidt", email: "noah.schmidt@hverk.de", total: 149.0, status: "Refunded", date: "Jun 6, 2026", lineItems: [{ name: "Wireless Earbuds Pro", qty: 1, price: 149 }] },
  { id: 5, number: "#48198", customer: "Jordan Lee", email: "jordan.lee@brightpath.app", total: 412.0, status: "Paid", date: "Jun 5, 2026", lineItems: [{ name: "Oxford Button-Down Shirt", qty: 3, price: 89 }, { name: "Leather Card Wallet", qty: 1, price: 45 }, { name: "Canvas Weekender Bag", qty: 1, price: 100 }] },
  { id: 6, number: "#48190", customer: "Sofia Marchetti", email: "sofia.m@lumen.co", total: 76.0, status: "Cancelled", date: "Jun 5, 2026", lineItems: [{ name: "Insulated Water Bottle 1L", qty: 2, price: 38 }] },
  { id: 7, number: "#48185", customer: "Ethan Brooks", email: "ethan.brooks@brightpath.app", total: 268.5, status: "Fulfilled", date: "Jun 4, 2026", lineItems: [{ name: "Trail Runner GTX", qty: 1, price: 184.5 }, { name: "Canvas Weekender Bag", qty: 1, price: 84 }] },
  { id: 8, number: "#48179", customer: "Priya Nair", email: "priya.nair@northwind.io", total: 217.0, status: "Paid", date: "Jun 4, 2026", lineItems: [{ name: "Merino Wool Crew Sweater", qty: 1, price: 128 }, { name: "Oxford Button-Down Shirt", qty: 1, price: 89 }] },
  { id: 9, number: "#48172", customer: "Daniel Fischer", email: "daniel.fischer@hverk.de", total: 90.0, status: "Pending", date: "Jun 3, 2026", lineItems: [{ name: "Leather Card Wallet", qty: 2, price: 45 }] },
];

function LabeledRow({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-[#737373]">{label}</span>
      <div className="min-w-0 text-sm text-[#ededed]">{children}</div>
    </div>
  );
}

function OrderDetailDialog({ order, onOpenChange }) {
  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) onOpenChange(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order {order.number}</DialogTitle>
        </DialogHeader>
        <DialogBody className="py-4">
          <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <LabeledRow label="Order #"><span className="font-mono text-[#a3a3a3]">{order.number}</span></LabeledRow>
            <LabeledRow label="Customer">{order.customer}</LabeledRow>
            <LabeledRow label="Email"><span className="break-all text-[#a3a3a3]">{order.email}</span></LabeledRow>
            <LabeledRow label="Status"><Pill tone={STATUS_TONE[order.status]}>{order.status}</Pill></LabeledRow>
            <LabeledRow label="Total"><span className="tabular-nums">{money(order.total)}</span></LabeledRow>
            <LabeledRow label="Date"><span className="text-[#a3a3a3]">{order.date}</span></LabeledRow>
          </div>

          <div className="mt-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[#737373]">Line items</h3>
            <ul className="space-y-2">
              {order.lineItems.map((li, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-3 py-2 text-sm">
                  <span className="text-[#ededed]">{li.name} <span className="text-[#737373]">× {li.qty}</span></span>
                  <span className="tabular-nums text-[#a3a3a3]">{money(li.price)}</span>
                </li>
              ))}
            </ul>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(null)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrdersScreen() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INITIAL.filter((o) =>
      (statusFilter === "All" || o.status === statusFilter) &&
      (!q || o.customer.toLowerCase().includes(q) || o.email.toLowerCase().includes(q) || o.number.toLowerCase().includes(q)),
    );
  }, [query, statusFilter]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Orders"
        description="Every order flowing in from your connected stores."
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search order, customer, or email…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-40">
              {statusFilter === "All" ? "All statuses" : statusFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by status</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {["All", ...STATUSES].map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setStatusFilter(s)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", statusFilter === s && "text-white")}>
                {s === "All" ? "All statuses" : s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id} className="border-[#2a2a2a]">
                <TableCell className="font-mono font-medium text-[#ededed]">{o.number}</TableCell>
                <TableCell>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-[#ededed]">{o.customer}</span>
                    <span className="truncate text-xs text-[#737373]">{o.email}</span>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{o.lineItems.reduce((s, li) => s + li.qty, 0)}</TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{money(o.total)}</TableCell>
                <TableCell><Pill tone={STATUS_TONE[o.status]}>{o.status}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{o.date}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "View", icon: Eye, onSelect: () => setSelected(o) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-sm text-[#737373]">No orders found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <OrderDetailDialog order={selected} onOpenChange={setSelected} />
    </MainScreenWrapper>
  );
}

export default OrdersScreen;
