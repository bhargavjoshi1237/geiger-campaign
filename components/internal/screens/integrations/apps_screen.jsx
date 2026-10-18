"use client";

import React, { useMemo, useState } from "react";
import { Blocks } from "lucide-react";
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
  EmptyState,
  Badge,
} from "@geiger/ui";

const CATEGORIES = ["CRM", "E-commerce", "Analytics", "Productivity", "Support"];

const INITIAL = [
  { id: 1, name: "Salesforce", category: "CRM", description: "Sync contacts and campaign activity with your CRM records.", from: "#38bdf8", to: "#0c4a6e", connected: true },
  { id: 2, name: "HubSpot", category: "CRM", description: "Two-way sync of lists, lifecycle stages, and email engagement.", from: "#fb923c", to: "#7c2d12", connected: false },
  { id: 3, name: "Shopify", category: "E-commerce", description: "Pull orders and customers to power abandoned-cart flows.", from: "#4ade80", to: "#14532d", connected: true },
  { id: 4, name: "Stripe", category: "E-commerce", description: "Trigger receipts and dunning emails from payment events.", from: "#818cf8", to: "#312e81", connected: false },
  { id: 5, name: "Slack", category: "Productivity", description: "Get campaign alerts and approval requests in your channels.", from: "#a78bfa", to: "#4c1d95", connected: true },
  { id: 6, name: "Google Analytics", category: "Analytics", description: "Attribute web conversions back to your email campaigns.", from: "#fbbf24", to: "#78350f", connected: false },
  { id: 7, name: "Zapier", category: "Productivity", description: "Connect Geiger to 6,000+ apps with no-code automations.", from: "#fb7185", to: "#881337", connected: true },
  { id: 8, name: "Segment", category: "Analytics", description: "Stream unified customer events into Geiger audiences.", from: "#34d399", to: "#064e3b", connected: false },
  { id: 9, name: "Zendesk", category: "Support", description: "Surface support tickets alongside subscriber profiles.", from: "#5eead4", to: "#134e4a", connected: false },
];

export function AppsScreen() {
  const [apps, setApps] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter(
      (a) =>
        (category === "All" || a.category === category) &&
        (!q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)),
    );
  }, [apps, query, category]);

  const setConnected = (id, connected) =>
    setApps((p) => p.map((a) => (a.id === id ? { ...a, connected } : a)));

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Apps"
        description="Connect Geiger to the tools your team already uses."
      />

      <Toolbar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-44">
              {category === "All" ? "All categories" : category}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-surface-card">
            <DropdownMenuLabel className="text-text-secondary">Filter by category</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {["All", ...CATEGORIES].map((c) => (
              <DropdownMenuItem key={c} onSelect={() => setCategory(c)} className={cn("cursor-pointer focus:bg-surface-hover", category === c && "font-medium")}>
                {c === "All" ? "All categories" : c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SearchInput value={query} onChange={setQuery} placeholder="Search apps…" />
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <div key={a.id} className="flex flex-col rounded-xl border border-border bg-surface-subtle p-5 transition-colors hover:border-border-strong">
            <div className="flex items-start gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white/95"
                style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
              >
                {a.name.charAt(0)}
              </span>
              <div className="flex min-w-0 flex-col">
                <h3 className="truncate font-medium text-foreground">{a.name}</h3>
                <Badge variant="neutral" className="mt-1 w-fit">
                  <Blocks /> {a.category}
                </Badge>
              </div>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">{a.description}</p>

            <div className="mt-4 flex items-center justify-between border-t border-surface-active pt-4">
              {a.connected ? (
                <>
                  <Badge variant="success">Connected</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConnected(a.id, false)}
                    className="text-muted-foreground"
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-text-secondary">Not connected</span>
                  <Button
                    size="sm"
                    onClick={() => setConnected(a.id, true)}
                  >
                    Connect
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={Blocks}
          title="No apps match your filters"
          className="rounded-xl border border-border bg-surface-subtle"
        />
      )}
    </MainScreenWrapper>
  );
}

export default AppsScreen;
