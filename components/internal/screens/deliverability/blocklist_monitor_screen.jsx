"use client";

import React, { useMemo, useState } from "react";
import { ShieldAlert, RefreshCw, MailWarning } from "lucide-react";
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

const INITIAL = [
  { id: 1, name: "Spamhaus ZEN", monitored: "198.51.100.24", status: "Clear", checked: "8 min ago" },
  { id: 2, name: "Barracuda", monitored: "198.51.100.25", status: "Clear", checked: "8 min ago" },
  { id: 3, name: "SpamCop", monitored: "203.0.113.88", status: "Listed", checked: "8 min ago" },
  { id: 4, name: "SORBS", monitored: "mail.acmestore.com", status: "Clear", checked: "12 min ago" },
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Blocklist Monitor"
        description="Continuously check your IPs and domains against major blocklists."
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search blocklists…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle sm:w-40">
              {statusFilter === "All" ? "All statuses" : statusFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
            <DropdownMenuLabel className="text-text-secondary">Filter by status</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {FILTERS.map((f) => (
              <DropdownMenuItem key={f} onSelect={() => setStatusFilter(f)} className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", statusFilter === f && "text-white")}>
                {f === "All" ? "All statuses" : f}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Blocklist</TableHead>
              <TableHead>Monitored</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last checked</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                      <ShieldAlert className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-foreground">{r.name}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.monitored}</TableCell>
                <TableCell><Pill tone={r.status === "Listed" ? "red" : "green"}>{r.status}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{r.checked}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Check now", icon: RefreshCw, onSelect: () => checkNow(r.id) },
                      ...(r.status === "Listed"
                        ? [{ label: "Request delisting", icon: MailWarning, separatorBefore: true }]
                        : []),
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-text-secondary">No blocklists found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>
    </MainScreenWrapper>
  );
}

export default BlocklistMonitorScreen;
