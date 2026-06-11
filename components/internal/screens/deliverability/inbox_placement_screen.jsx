"use client";

import React, { useMemo, useState } from "react";
import { Play, Mail, Globe, Building2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const PROVIDER_META = {
  Gmail: { icon: Mail, label: "Consumer" },
  Outlook: { icon: Mail, label: "Consumer" },
  Yahoo: { icon: Globe, label: "Consumer" },
  "Apple Mail": { icon: Mail, label: "Consumer" },
  Corporate: { icon: Building2, label: "Microsoft 365 / Workspace" },
};

const INITIAL = [
  { id: 1, provider: "Gmail", inbox: 94, spam: 4, missing: 2, tested: "Jun 6, 2026" },
  { id: 2, provider: "Outlook", inbox: 81, spam: 14, missing: 5, tested: "Jun 6, 2026" },
  { id: 3, provider: "Yahoo", inbox: 89, spam: 8, missing: 3, tested: "Jun 6, 2026" },
  { id: 4, provider: "Apple Mail", inbox: 97, spam: 2, missing: 1, tested: "Jun 6, 2026" },
  { id: 5, provider: "Corporate", inbox: 73, spam: 19, missing: 8, tested: "Jun 5, 2026" },
];

export function InboxPlacementScreen() {
  const [rows, setRows] = useState(INITIAL);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || r.provider.toLowerCase().includes(q));
  }, [rows, query]);

  const runTest = () => {
    setRows((p) => p.map((r) => ({ ...r, tested: "Just now" })));
  };

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Inbox Placement"
        description="See where your mail lands across major mailbox providers."
        actions={
          <Button onClick={runTest} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Play className="h-4 w-4" /> Run test
          </Button>
        }
      />

      <div className="border-t border-surface-active pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search providers…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Provider</TableHead>
              <TableHead>Inbox %</TableHead>
              <TableHead>Spam %</TableHead>
              <TableHead>Missing %</TableHead>
              <TableHead>Last tested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const meta = PROVIDER_META[r.provider];
              const Icon = meta.icon;
              return (
                <TableRow key={r.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-foreground">{r.provider}</span>
                        <span className="truncate text-xs text-text-secondary">{meta.label}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex w-40 items-center gap-3">
                      <Progress value={r.inbox} className="h-1.5 bg-surface-hover [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                      <span className="tabular-nums text-xs font-medium text-emerald-300">{r.inbox}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.spam}%</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.missing}%</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{r.tested}</TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-text-secondary">No providers found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>
    </MainScreenWrapper>
  );
}

export default InboxPlacementScreen;
