"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Blocks, Eye, Plug, Unplug, FileText, Link2, Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  Toolbar,
  SearchInput,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
  SectionCard,
  StatsBar,
  cn,
} from "@geiger/ui";

const CATEGORIES = ["CRM", "E-commerce", "Analytics", "Productivity", "Support"];

const DIRECTIONS = [
  { value: "inbound", label: "One-way to Geiger" },
  { value: "two-way", label: "Two-way" },
];
const FREQUENCIES = [
  { value: "realtime", label: "Real-time" },
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Once a day" },
];

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "All categories" },
  ...CATEGORIES.map((c) => ({ value: c, label: c })),
];
const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All apps" },
  { value: "connected", label: "Connected" },
  { value: "available", label: "Not connected" },
];

// Account a fresh connection authorizes when the app has none on record yet.
const DEFAULT_ACCOUNT = "ops@halcyon.studio";
const connectedAccount = (a) => a.account || DEFAULT_ACCOUNT;

const INITIAL = [
  {
    id: 1, name: "Salesforce", category: "CRM", description: "Sync contacts and campaign activity with your CRM records.", from: "#38bdf8", to: "#0c4a6e",
    connected: true, account: "revops@halcyon.studio", connectedAt: "Mar 14, 2026", direction: "two-way", frequency: "hourly",
    syncs: ["Contacts & leads", "Campaign activity", "Lifecycle stages"],
    activity: [
      { id: "sf-1", label: "Synced 1,284 contacts", time: "12 min ago", status: "success" },
      { id: "sf-2", label: "Pushed campaign activity for Summer Sale", time: "2 hours ago", status: "success" },
      { id: "sf-3", label: "Field mapping updated", time: "Yesterday", status: "success" },
    ],
  },
  {
    id: 2, name: "HubSpot", category: "CRM", description: "Two-way sync of lists, lifecycle stages, and email engagement.", from: "#fb923c", to: "#7c2d12",
    connected: false, account: "", connectedAt: "", direction: "two-way", frequency: "hourly",
    syncs: ["Lists", "Lifecycle stages", "Email engagement"], activity: [],
  },
  {
    id: 3, name: "Shopify", category: "E-commerce", description: "Pull orders and customers to power abandoned-cart flows.", from: "#4ade80", to: "#14532d",
    connected: true, account: "halcyon-store.myshopify.com", connectedAt: "Jan 8, 2026", direction: "inbound", frequency: "realtime",
    syncs: ["Customers", "Orders", "Abandoned carts", "Products"],
    activity: [
      { id: "sh-1", label: "Imported 86 orders", time: "5 min ago", status: "success" },
      { id: "sh-2", label: "Streamed 14 abandoned-cart events", time: "1 hour ago", status: "success" },
      { id: "sh-3", label: "Product catalog refreshed", time: "Yesterday", status: "success" },
    ],
  },
  {
    id: 4, name: "Stripe", category: "E-commerce", description: "Trigger receipts and dunning emails from payment events.", from: "#818cf8", to: "#312e81",
    connected: false, account: "", connectedAt: "", direction: "inbound", frequency: "realtime",
    syncs: ["Payments", "Subscriptions", "Failed charges"], activity: [],
  },
  {
    id: 5, name: "Slack", category: "Productivity", description: "Get campaign alerts and approval requests in your channels.", from: "#a78bfa", to: "#4c1d95",
    connected: true, account: "halcyon.slack.com", connectedAt: "Feb 2, 2026", direction: "two-way", frequency: "realtime",
    syncs: ["Campaign alerts", "Approval requests"],
    activity: [
      { id: "sl-1", label: "Sent an approval request to #marketing", time: "30 min ago", status: "success" },
      { id: "sl-2", label: "Posted alert: Flash Sale Promo sent", time: "3 hours ago", status: "success" },
      { id: "sl-3", label: "Couldn't post to #launches — channel archived", time: "2 days ago", status: "error" },
    ],
  },
  {
    id: 6, name: "Google Analytics", category: "Analytics", description: "Attribute web conversions back to your email campaigns.", from: "#fbbf24", to: "#78350f",
    connected: false, account: "", connectedAt: "", direction: "inbound", frequency: "daily",
    syncs: ["Web sessions", "Goal conversions", "UTM attribution"], activity: [],
  },
  {
    id: 7, name: "Zapier", category: "Productivity", description: "Connect Geiger to 6,000+ apps with no-code automations.", from: "#fb7185", to: "#881337",
    connected: true, account: "ops@halcyon.studio", connectedAt: "Apr 21, 2026", direction: "two-way", frequency: "realtime",
    syncs: ["Triggers", "Actions", "Webhooks"],
    activity: [
      { id: "zp-1", label: "“New lead → Contact” zap ran 42 times", time: "Today", status: "success" },
      { id: "zp-2", label: "Webhook credentials refreshed", time: "3 days ago", status: "success" },
    ],
  },
  {
    id: 8, name: "Segment", category: "Analytics", description: "Stream unified customer events into Geiger audiences.", from: "#34d399", to: "#064e3b",
    connected: false, account: "", connectedAt: "", direction: "inbound", frequency: "realtime",
    syncs: ["Identify calls", "Track events", "Audiences"], activity: [],
  },
  {
    id: 9, name: "Zendesk", category: "Support", description: "Surface support tickets alongside subscriber profiles.", from: "#5eead4", to: "#134e4a",
    connected: false, account: "", connectedAt: "", direction: "inbound", frequency: "hourly",
    syncs: ["Support tickets", "Satisfaction ratings"], activity: [],
  },
];

const APP_NAV = [
  { key: "overview", label: "Overview", icon: FileText, desc: "What this app does and the data it brings into Geiger." },
  { key: "connection", label: "Connection", icon: Link2, desc: "The authorized account and how data syncs." },
  { key: "activity", label: "Activity", icon: Activity, desc: "Recent sync events for this connection." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const todayLabel = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function AppTile({ app, className }) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-xl font-semibold text-white/95", className)}
      style={{ background: `linear-gradient(135deg, ${app.from}, ${app.to})` }}
    >
      {app.name.charAt(0)}
    </span>
  );
}

function StatusBadge({ connected }) {
  return connected ? <Badge variant="success">Connected</Badge> : <Badge variant="neutral">Not connected</Badge>;
}

// Editable slice of an app row; compared against the row to derive dirty state.
const toDraft = (a) => ({ account: a.account, direction: a.direction, frequency: a.frequency });

function AppEditor({ record, onBack, onSave, onToggle }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));

  const save = () => {
    const patch = { ...draft, account: draft.account.trim() || connectedAccount(record) };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

  // Connecting authorizes a default account when none is on record; keep the draft in step.
  const toggle = () => {
    if (!record.connected) setDraft((d) => ({ ...d, account: d.account || connectedAccount(record) }));
    onToggle(record);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <div className="flex min-w-0 items-center gap-3">
          <AppTile app={record} className="h-10 w-10 text-base" />
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{record.name}</h1>
        </div>
      }
      badges={
        <>
          <Badge variant="neutral">
            <Blocks /> {record.category}
          </Badge>
          <StatusBadge connected={record.connected} />
        </>
      }
      actions={
        <>
          {record.connected ? (
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={toggle}>
              <Unplug className="h-4 w-4" /> Disconnect
            </Button>
          ) : (
            <Button onClick={toggle}>
              <Plug className="h-4 w-4" /> Connect
            </Button>
          )}
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={APP_NAV}
      defaultSection="overview"
    >
      {({ active }) => (
        <>
          {active === "overview" ? (
            <SectionCard contentClassName="space-y-5">
              <p className="text-sm text-text-secondary">{record.description}</p>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">What it syncs</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {record.syncs.map((s) => (
                    <div key={s} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-card px-4 py-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-text-tertiary" />
                      <span className="text-sm text-foreground">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          ) : null}

          {active === "connection" ? (
            <SectionCard bare title="Account & sync" description="The account Geiger syncs with, and which way and how often data moves." contentClassName="space-y-5">
              {record.connected ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Connected account" htmlFor="app-account" hint="The account or workspace Geiger syncs with.">
                    <Input id="app-account" value={draft.account} onChange={(e) => set("account")(e.target.value)} placeholder={DEFAULT_ACCOUNT} />
                  </Field>
                  <Field label="Connected since">
                    <p className="flex h-9 items-center text-sm text-foreground">{record.connectedAt}</p>
                  </Field>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-secondary">Connect {record.name} to authorize an account. Sync preferences below apply once it&apos;s connected.</p>
                  <Button size="sm" onClick={toggle}>
                    <Plug className="h-3.5 w-3.5" /> Connect
                  </Button>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sync direction" hint="Two-way also writes Geiger engagement back to the app.">
                  <Select value={draft.direction} onValueChange={set("direction")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{DIRECTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Sync frequency">
                  <Select value={draft.frequency} onValueChange={set("frequency")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "activity" ? (
            record.connected && record.activity.length > 0 ? (
              <SectionCard>
                <ul className="space-y-2">
                  {record.activity.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-card px-4 py-3">
                      {e.status === "error" ? (
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{e.label}</span>
                      <span className="shrink-0 text-xs text-text-tertiary">{e.time}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : (
              <EmptyState
                icon={Activity}
                title={record.connected ? "No sync activity yet" : "Not connected"}
                description={record.connected ? "Sync events will show up here as data moves." : `Connect ${record.name} to start syncing and see its activity here.`}
                className="rounded-xl border border-border bg-surface-subtle"
              />
            )
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function AppsScreen() {
  const [apps, setApps] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (statusFilter === "connected" && !a.connected) return false;
      if (statusFilter === "available" && a.connected) return false;
      if (q && !`${a.name} ${a.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [apps, query, categoryFilter, statusFilter]);

  const stats = useMemo(() => [
    { label: "Available apps", value: apps.length.toLocaleString("en-US") },
    { label: "Connected", value: apps.filter((a) => a.connected).length.toLocaleString("en-US") },
    { label: "Categories", value: new Set(apps.map((a) => a.category)).size.toLocaleString("en-US") },
  ], [apps]);

  const handleToggle = (app) => {
    const connecting = !app.connected;
    setApps((p) =>
      p.map((a) =>
        a.id === app.id
          ? connecting
            ? {
                ...a,
                connected: true,
                account: connectedAccount(a),
                connectedAt: todayLabel(),
                activity: [{ id: crypto.randomUUID(), label: "Connection authorized", time: "Just now", status: "success" }, ...a.activity],
              }
            : { ...a, connected: false }
          : a,
      ),
    );
    toast.success(connecting ? `Connected ${app.name}.` : `Disconnected ${app.name}.`);
  };

  const handleSave = (id, patch) => {
    setApps((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    toast.success("Connection settings saved.");
  };

  const open = apps.find((a) => String(a.id) === recordId);
  if (open) {
    return <AppEditor key={open.id} record={open} onBack={closeRecord} onSave={handleSave} onToggle={handleToggle} />;
  }

  const filtersActive = query || categoryFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  // Enter/Space on the card itself opens it; keys from inner controls are ignored.
  const onCardKey = (e, id) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    openRecord(String(id));
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Apps"
        description="Connect Geiger to the tools your team already uses."
      />

      <StatsBar stats={stats} columns={3} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={categoryFilter} onValueChange={setCategoryFilter} options={CATEGORY_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search apps…" />
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            aria-label={`Open ${a.name}`}
            onClick={() => openRecord(String(a.id))}
            onKeyDown={(e) => onCardKey(e, a.id)}
            className="group flex cursor-pointer flex-col rounded-xl border border-border bg-surface-subtle p-5 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex items-start gap-3">
              <AppTile app={a} className="h-11 w-11 text-base" />
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className="truncate font-medium text-foreground">{a.name}</h3>
                <Badge variant="neutral" className="mt-1 w-fit">
                  <Blocks /> {a.category}
                </Badge>
              </div>
              <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <ActionMenu
                  label={`Actions for ${a.name}`}
                  items={[
                    { label: "Open", icon: Eye, onSelect: () => openRecord(String(a.id)) },
                    a.connected
                      ? { label: "Disconnect", icon: Unplug, onSelect: () => handleToggle(a) }
                      : { label: "Connect", icon: Plug, onSelect: () => handleToggle(a) },
                  ]}
                />
              </div>
            </div>

            <p className="mt-3 flex-1 text-sm text-muted-foreground">{a.description}</p>

            <div className="mt-4 flex items-center justify-between border-t border-surface-active pt-4">
              {a.connected ? (
                <>
                  <StatusBadge connected />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(a);
                    }}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(a);
                    }}
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
          title={filtersActive ? "No apps match your filters" : "No apps available"}
          description={filtersActive ? "Try a different search or filter." : "Apps will appear here as integrations are added."}
          className="rounded-xl border border-border bg-surface-subtle"
          action={
            filtersActive ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
      )}
    </MainScreenWrapper>
  );
}

export default AppsScreen;
