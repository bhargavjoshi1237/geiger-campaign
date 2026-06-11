"use client";

import React, { useState } from "react";
import { CreditCard, Download, Zap } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const USAGE = [
  { label: "Contacts", used: 38200, limit: 50000, fmt: (n) => n.toLocaleString() },
  { label: "Emails this month", used: 182000, limit: 250000, fmt: (n) => `${Math.round(n / 1000)}k` },
  { label: "Automations", used: 8, limit: 20, fmt: (n) => String(n) },
];

const INVOICES = [
  { id: 1, number: "INV-2026-0006", date: "Jun 1, 2026", amount: 99, status: "Paid" },
  { id: 2, number: "INV-2026-0005", date: "May 1, 2026", amount: 99, status: "Paid" },
  { id: 3, number: "INV-2026-0004", date: "Apr 1, 2026", amount: 99, status: "Paid" },
  { id: 4, number: "INV-2026-0003", date: "Mar 1, 2026", amount: 79, status: "Paid" },
  { id: 5, number: "INV-2026-0007", date: "Jul 1, 2026", amount: 99, status: "Due" },
];

export function BillingScreen() {
  const [invoices] = useState(INVOICES);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Billing"
        description="Your plan, usage, and invoices."
      />

      <div className="space-y-4 border-t border-surface-active pt-4">
        {/* Current plan */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
              <Zap className="h-5 w-5" />
            </span>
            <div className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold text-foreground">Growth</h2>
                <span className="text-sm text-muted-foreground">$99/mo</span>
              </div>
              <p className="text-xs text-text-secondary">Renews on Jul 1, 2026 · billed monthly</p>
            </div>
          </div>
          <Button variant="outline" className="h-9 border-border bg-surface-card text-foreground hover:bg-surface-subtle">
            Change plan
          </Button>
        </div>

        {/* Usage */}
        <div className="space-y-5 rounded-xl border border-border bg-surface-subtle p-5">
          <h2 className="text-sm font-semibold text-foreground">Usage this cycle</h2>
          {USAGE.map((u) => (
            <div key={u.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{u.label}</span>
                <span className="tabular-nums text-text-secondary">
                  {u.fmt(u.used)} / {u.fmt(u.limit)}
                </span>
              </div>
              <Progress
                value={(u.used / u.limit) * 100}
                className="h-1.5 bg-surface-hover [&_[data-slot=progress-indicator]]:bg-[#ededed]"
              />
            </div>
          ))}
        </div>

        {/* Payment method */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
              <CreditCard className="h-4 w-4" />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Visa •••• 4242</p>
              <p className="text-xs text-text-secondary">Expires 09/2028</p>
            </div>
          </div>
          <Button variant="outline" className="h-9 border-border bg-surface-card text-foreground hover:bg-surface-subtle">
            Update
          </Button>
        </div>

        {/* Invoices */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Invoices</h2>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id} className="border-border">
                    <TableCell className="font-mono text-muted-foreground">{inv.number}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{inv.date}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">${inv.amount.toFixed(2)}</TableCell>
                    <TableCell><Pill tone={inv.status === "Paid" ? "green" : "amber"}>{inv.status}</Pill></TableCell>
                    <TableCell className="text-right">
                      <RowActions items={[{ label: "Download PDF", icon: Download }]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default BillingScreen;
