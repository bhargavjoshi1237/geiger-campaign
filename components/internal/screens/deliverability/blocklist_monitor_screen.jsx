"use client";

import React, { useMemo, useState } from "react";
import { ShieldAlert, RefreshCw, MailWarning } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
  ScreenHeader,
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
} from "@geiger/ui";

const INITIAL = [
  { id: 1, name: "Spamhaus ZEN", monitored: "198.51.100.24", status: "Clear", checked: "8 min ago" },
  { id: 2, name: "Barracuda", monitored: "198.51.100.25", status: "Clear", checked: "8 min ago" },
  { id: 3, name: "SpamCop", monitored: "203.0.113.88", status: "Listed", checked: "8 min ago" },
  { id: 4, name: "SORBS", monitored: "mail.halcyon.studio", status: "Clear", checked: "12 min ago" },
  { id: 5, name: "Invaluement", monitored: "news.brightlabs.io", status: "Clear", checked: "12 min ago" },
  { id: 6, name: "Spamhaus DBL", monitored: "send.northwind.co", status: "Clear", checked: "15 min ago" },
];

const FILTERS = ["All", "Listed", "Clear"];

export function BlocklistMonitorScreen() {
  const [rows, setRows] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (statusFilter === "All" || r.status === statusFilter) &&
        (!q || r.name.toLowerCase().includes(q) || r.monitored.toLowerCase().includes(q)),
    );
  }, [rows, query, statusFilter]);

  const checkNow = (id) => setRows((p) => p.map((r) => (r.id === id ? { ...r, checked: "Just now" } : r)));

  const columns = [
    {
      key: "name",
      header: "Blocklist",
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{r.name}</span>
        </div>
      ),
    },
    { key: "monitored", header: "Monitored", className: "font-mono text-xs text-muted-foreground", render: (r) => r.monitored },
    { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "Listed" ? "danger" : "success"}>{r.status}</Badge> },
    { key: "checked", header: "Last checked", className: "whitespace-nowrap text-muted-foreground", render: (r) => r.checked },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <ActionMenu
          items={[
            { label: "Check now", icon: RefreshCw, onSelect: () => checkNow(r.id) },
            ...(r.status === "Listed"
              ? [{ separator: true }, { label: "Request delisting", icon: MailWarning }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Blocklist Monitor"
        description="Continuously check your IPs and domains against major blocklists."
      />

      <Toolbar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
              {statusFilter === "All" ? "All statuses" : statusFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 bg-surface-card">
            <DropdownMenuLabel className="text-text-secondary">Filter by status</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {FILTERS.map((f) => (
              <DropdownMenuItem key={f} onSelect={() => setStatusFilter(f)} className={cn("cursor-pointer focus:bg-surface-hover", statusFilter === f && "font-medium")}>
                {f === "All" ? "All statuses" : f}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SearchInput value={query} onChange={setQuery} placeholder="Search blocklists…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={ShieldAlert}
            title="No blocklists found."
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />
    </MainScreenWrapper>
  );
}

export default BlocklistMonitorScreen;
