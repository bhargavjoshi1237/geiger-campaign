"use client";

import React, { useMemo, useState } from "react";
import { Play, Mail, Globe, Building2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Progress,
  ScreenHeader,
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
} from "@geiger/ui";

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

function ProviderCell({ provider }) {
  const meta = PROVIDER_META[provider];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{provider}</span>
        <span className="truncate text-xs text-text-secondary">{meta.label}</span>
      </div>
    </div>
  );
}

const COLUMNS = [
  { key: "provider", header: "Provider", render: (r) => <ProviderCell provider={r.provider} /> },
  {
    key: "inbox",
    header: "Inbox %",
    render: (r) => (
      <div className="flex w-40 items-center gap-3">
        <Progress value={r.inbox} className="h-1.5 bg-surface-hover" />
        <span className="tabular-nums text-xs font-medium text-emerald-700 dark:text-emerald-300">{r.inbox}%</span>
      </div>
    ),
  },
  { key: "spam", header: "Spam %", className: "tabular-nums text-muted-foreground", render: (r) => `${r.spam}%` },
  { key: "missing", header: "Missing %", className: "tabular-nums text-muted-foreground", render: (r) => `${r.missing}%` },
  { key: "tested", header: "Last tested", className: "whitespace-nowrap text-muted-foreground", render: (r) => r.tested },
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
    <MainScreenWrapper>
      <ScreenHeader
        title="Inbox Placement"
        description="See where your mail lands across major mailbox providers."
        actions={
          <Button onClick={runTest}>
            <Play className="h-4 w-4" /> Run test
          </Button>
        }
      />

      <Toolbar>
        <div />
        <SearchInput value={query} onChange={setQuery} placeholder="Search providers…" />
      </Toolbar>

      <DataTable
        columns={COLUMNS}
        data={filtered}
        getRowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={Mail}
            title="No providers found."
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />
    </MainScreenWrapper>
  );
}

export default InboxPlacementScreen;
