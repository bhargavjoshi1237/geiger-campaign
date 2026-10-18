"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Download, Receipt, Zap } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  Button,
  Progress,
  ScreenHeader,
  SectionCard,
  DataTable,
  EmptyState,
  SearchInput,
  Toolbar,
  Badge,
  ActionMenu,
} from "@geiger/ui";

const USAGE = [
  { label: "Contacts", used: 38200, limit: 50000, fmt: (n) => n.toLocaleString("en-US") },
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

const INVOICE_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "Paid", label: "Paid" },
  { value: "Due", label: "Due" },
];

const INVOICE_COLUMNS = [
  { key: "number", header: "Invoice #", className: "font-mono text-muted-foreground", render: (inv) => inv.number },
  { key: "date", header: "Date", className: "whitespace-nowrap text-muted-foreground", render: (inv) => inv.date },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    className: "tabular-nums text-muted-foreground",
    render: (inv) => `$${inv.amount.toFixed(2)}`,
  },
  {
    key: "status",
    header: "Status",
    render: (inv) => <Badge variant={inv.status === "Paid" ? "success" : "warning"}>{inv.status}</Badge>,
  },
  {
    key: "actions",
    header: "",
    align: "right",
    render: (inv) => (
      <ActionMenu
        label="Invoice actions"
        items={[
          {
            label: "Download PDF",
            icon: Download,
            onSelect: () => toast.success(`Downloading ${inv.number}.`),
          },
        ]}
      />
    ),
  },
];

export function BillingScreen() {
  const [invoices] = useState(INVOICES);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (q && !`${inv.number} ${inv.date}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoices, search, statusFilter]);

  const pager = usePagination(filtered, { resetKey: `${search}|${statusFilter}` });
  const filtersActive = search || statusFilter !== "all";

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Billing" description="Your plan, usage, and invoices." />

      <div className="space-y-6">
        {/* Current plan */}
        <SectionCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
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
            <Button variant="outline">Change plan</Button>
          </div>
        </SectionCard>

        <SectionCard title="Usage this cycle" contentClassName="space-y-5">
          {USAGE.map((u) => (
            <div key={u.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{u.label}</span>
                <span className="tabular-nums text-text-secondary">
                  {u.fmt(u.used)} / {u.fmt(u.limit)}
                </span>
              </div>
              <Progress value={(u.used / u.limit) * 100} className="h-1.5 bg-surface-hover" />
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Payment method">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                <CreditCard className="h-4 w-4" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Visa •••• 4242</p>
                <p className="text-xs text-text-secondary">Expires 09/2028</p>
              </div>
            </div>
            <Button variant="outline">Update</Button>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">Invoices</h2>
          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown
                value={statusFilter}
                onValueChange={setStatusFilter}
                options={INVOICE_STATUS_FILTER_OPTIONS}
                height="h-9"
              />
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Search invoices…" />
          </Toolbar>

          <div className="space-y-5">
            <DataTable
              columns={INVOICE_COLUMNS}
              data={pager.pageItems}
              getRowKey={(inv) => inv.id}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState
                    icon={Receipt}
                    title={filtersActive ? "No matches" : "No invoices yet"}
                    description={
                      filtersActive
                        ? "Try a different search or filter."
                        : "Invoices appear here after your first billing cycle."
                    }
                    action={
                      filtersActive ? (
                        <Button
                          variant="outline"
                          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                          onClick={() => {
                            setSearch("");
                            setStatusFilter("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : null
                    }
                  />
                </div>
              }
            />
            <ListPagination {...pager} itemLabel="invoices" />
          </div>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default BillingScreen;
