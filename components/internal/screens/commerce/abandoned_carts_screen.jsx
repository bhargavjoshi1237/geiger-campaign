"use client";

import React, { useState } from "react";
import { Mail, ShoppingCart } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  Badge,
  ActionMenu,
} from "@geiger/ui";

const RECOVERY_TONE = {
  Recovered: "success",
  "Email sent": "info",
  "Not contacted": "neutral",
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

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{c.customer}</span>
          <span className="truncate text-xs text-text-secondary">{c.email}</span>
        </div>
      ),
    },
    { key: "items", header: "Items", className: "tabular-nums text-muted-foreground", render: (c) => c.items },
    { key: "value", header: "Cart value", className: "tabular-nums text-muted-foreground", render: (c) => money(c.value) },
    { key: "abandoned", header: "Abandoned", className: "whitespace-nowrap text-muted-foreground", render: (c) => c.abandoned },
    { key: "recovery", header: "Recovery", render: (c) => <Badge variant={RECOVERY_TONE[c.recovery]}>{c.recovery}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <ActionMenu
          items={[
            { label: "Send recovery email", icon: Mail, onSelect: () => sendRecovery(c.id) },
            { label: "View cart", icon: ShoppingCart },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Abandoned Carts"
        description="Recover lost revenue from shoppers who didn't check out."
      />

      <DataTable
        className="mt-4"
        columns={columns}
        data={carts}
        getRowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={ShoppingCart}
            title="No abandoned carts found"
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />
    </MainScreenWrapper>
  );
}

export default AbandonedCartsScreen;
