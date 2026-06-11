"use client";

import React, { useState } from "react";
import { Mail, ShoppingCart } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions } from "@/components/internal/shared/screen_kit";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const RECOVERY_TONE = {
  Recovered: "green",
  "Email sent": "blue",
  "Not contacted": "zinc",
};

const money = (n) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INITIAL = [
  { id: 1, customer: "Hannah Weiss", email: "hannah.weiss@northwind.io", items: 3, value: 284.0, abandoned: "32m ago", recovery: "Not contacted" },
  { id: 2, customer: "Marcus Bell", email: "marcus.bell@lumen.co", items: 1, value: 149.0, abandoned: "2h ago", recovery: "Email sent" },
  { id: 3, customer: "Yuki Tanaka", email: "yuki.tanaka@hverk.de", items: 5, value: 612.5, abandoned: "5h ago", recovery: "Not contacted" },
  { id: 4, customer: "Olivia Park", email: "olivia.park@brightpath.app", items: 2, value: 173.99, abandoned: "1d ago", recovery: "Recovered" },
  { id: 5, customer: "Tomás Reyes", email: "tomas.reyes@lumen.co", items: 1, value: 38.0, abandoned: "1d ago", recovery: "Email sent" },
  { id: 6, customer: "Greta Lind", email: "greta.lind@hverk.de", items: 4, value: 421.0, abandoned: "2d ago", recovery: "Not contacted" },
  { id: 7, customer: "Felix Hart", email: "felix.hart@northwind.io", items: 2, value: 217.0, abandoned: "3d ago", recovery: "Recovered" },
];

export function AbandonedCartsScreen() {
  const [carts, setCarts] = useState(INITIAL);

  const sendRecovery = (id) =>
    setCarts((p) => p.map((c) => (c.id === id ? { ...c, recovery: "Email sent" } : c)));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Abandoned Carts"
        description="Recover lost revenue from shoppers who didn't check out."
      />

      <TableShell className="mt-4">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Cart value</TableHead>
              <TableHead>Abandoned</TableHead>
              <TableHead>Recovery</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carts.map((c) => (
              <TableRow key={c.id} className="border-border">
                <TableCell>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">{c.customer}</span>
                    <span className="truncate text-xs text-text-secondary">{c.email}</span>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{c.items}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{money(c.value)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.abandoned}</TableCell>
                <TableCell><Pill tone={RECOVERY_TONE[c.recovery]}>{c.recovery}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Send recovery email", icon: Mail, onSelect: () => sendRecovery(c.id) },
                      { label: "View cart", icon: ShoppingCart },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {carts.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-text-secondary">No abandoned carts found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>
    </MainScreenWrapper>
  );
}

export default AbandonedCartsScreen;
