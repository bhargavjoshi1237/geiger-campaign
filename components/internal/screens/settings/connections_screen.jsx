"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plug } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listConnections } from "@/lib/supabase/channel_connections";
import { listLinkedAccounts } from "@/lib/supabase/workspace_settings";
import {
  Button,
  DataTable,
  EmptyState,
  LogoLoading,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@geiger/ui";

const DAY = 24 * 60 * 60 * 1000;

const STATUS_MAP = {
  connected: { label: "Connected", variant: "success" },
  expiring: { label: "Token expiring", variant: "warning" },
  pending: { label: "Pending", variant: "warning" },
  error: { label: "Error", variant: "danger" },
  disconnected: { label: "Disconnected", variant: "neutral" },
  not_connected: { label: "Not set up", variant: "outline", dot: false },
};

// Channel -> the sidebar screen that connects and manages it.
const CHANNELS = [
  { key: "email", label: "Email", tab: "Email" },
  { key: "sms", label: "SMS", tab: "SMS" },
  { key: "whatsapp", label: "WhatsApp", tab: "WhatsApp" },
  { key: "instagram", label: "Instagram", tab: "Instagram" },
  { key: "messenger", label: "Messenger", tab: "Messenger" },
  { key: "telegram", label: "Telegram", tab: "Telegram" },
  { key: "tiktok", label: "TikTok", tab: "TikTok" },
  { key: "rcs", label: "RCS", tab: "RCS" },
  { key: "push", label: "Push", tab: "Push" },
  { key: "in_app", label: "In-app", tab: "In-App" },
];
const CHANNEL = Object.fromEntries(CHANNELS.map((c) => [c.key, c]));

const PROVIDER_LABEL = {
  geiger_email: "Geiger email",
  twilio: "Twilio",
  meta_cloud: "WhatsApp Cloud API",
  meta_graph: "Meta Graph API",
  telegram_bot: "Telegram Bot API",
  tiktok: "TikTok",
  google_rcs: "Google RCS",
  web_push: "Web Push",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  custom: "Custom store",
  meta_ads: "Meta Ads",
};
const providerLabel = (p) => PROVIDER_LABEL[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, " ") : "—");

const KIND_LABEL = { channel: "Channel", integration: "App", store: "Store", ads: "Ad account" };
const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "channel", label: "Channels" },
  { value: "integration", label: "Apps" },
  { value: "store", label: "Stores" },
  { value: "ads", label: "Ad accounts" },
];
const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "attention", label: "Needs attention" },
  ...Object.entries(STATUS_MAP).map(([value, m]) => ({ value, label: m.label })),
];

const ATTENTION = new Set(["error", "pending", "expiring"]);

function effectiveStatus(status, expiresAt) {
  const s = ["connected", "pending", "error", "disconnected"].includes(status) ? status : "pending";
  if (s === "connected" && expiresAt && new Date(expiresAt).getTime() - Date.now() < 7 * DAY) return "expiring";
  return s;
}

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

function buildRows(connections, linked) {
  const rows = connections.map((c) => ({
    id: c.id,
    kind: "channel",
    channel: c.channel,
    name: c.name || CHANNEL[c.channel]?.label || c.channel,
    provider: c.provider,
    handle: c.handle || c.externalId || "",
    status: effectiveStatus(c.status, c.health?.tokenExpiresAt || c.health?.expiresAt),
    error: c.health?.lastError || (Array.isArray(c.health?.issues) ? c.health.issues.find((i) => i?.level === "error")?.message : "") || "",
    connectedAt: c.connectedAt,
    destination: CHANNEL[c.channel]?.tab || "Email",
  }));
  for (const a of linked) {
    rows.push({ ...a, status: effectiveStatus(a.status, a.expiresAt), error: a.error || "" });
  }
  const used = new Set(connections.map((c) => c.channel));
  for (const ch of CHANNELS) {
    if (used.has(ch.key)) continue;
    rows.push({ id: `missing:${ch.key}`, kind: "channel", channel: ch.key, name: ch.label, provider: "", handle: "", status: "not_connected", error: "", connectedAt: null, destination: ch.tab });
  }
  return rows;
}

export function ConnectionsScreen() {
  const { projectId } = useProject();
  const { setTab } = useWorkspaceUrl();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listConnections(projectId), listLinkedAccounts(projectId)]).then(([connections, linked]) => {
      if (!alive) return;
      setRows(buildRows(connections ?? [], linked ?? []));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.kind !== typeFilter) return false;
      if (statusFilter === "attention" ? !ATTENTION.has(r.status) : statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !`${r.name} ${r.handle} ${providerLabel(r.provider)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const count = (fn) => rows.filter(fn).length.toLocaleString("en-US");
    return [
      { label: "Connected", value: count((r) => r.status === "connected" || r.status === "expiring") },
      { label: "Needs attention", value: count((r) => ATTENTION.has(r.status)) },
      { label: "Disconnected", value: count((r) => r.status === "disconnected") },
      { label: "Channels not set up", value: count((r) => r.status === "not_connected") },
    ];
  }, [rows]);

  const pager = usePagination(filtered, { resetKey: `${query}|${typeFilter}|${statusFilter}` });
  const filtersActive = query || typeFilter !== "all" || statusFilter !== "all";

  const columns = [
    {
      key: "name",
      header: "Connection",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{r.name}</p>
          <p className="truncate text-xs text-text-tertiary">{r.provider ? providerLabel(r.provider) : "No provider connected"}</p>
        </div>
      ),
    },
    { key: "kind", header: "Type", className: "whitespace-nowrap text-muted-foreground", render: (r) => (r.kind === "channel" ? `${KIND_LABEL.channel} · ${CHANNEL[r.channel]?.label ?? r.channel}` : KIND_LABEL[r.kind]) },
    { key: "handle", header: "Account", className: "max-w-56 truncate font-mono text-xs text-muted-foreground", render: (r) => r.handle || "—" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div className="space-y-1">
          <StatusPill status={r.status} map={STATUS_MAP} />
          {r.error ? <p className="max-w-64 truncate text-xs text-red-600 dark:text-red-400" title={r.error}>{r.error}</p> : null}
        </div>
      ),
    },
    { key: "connectedAt", header: "Connected", className: "whitespace-nowrap text-muted-foreground", render: (r) => formatDate(r.connectedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setTab(r.destination);
          }}
        >
          {r.status === "not_connected" ? "Connect" : "Manage"} <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Connections" description="Every channel account, app, store and ad account linked to this workspace, in one place." />

      {loading ? (
        <div className="flex min-h-60 items-center justify-center">
          <LogoLoading size={48} aria-label="Loading connections" />
        </div>
      ) : (
        <>
          <StatsBar stats={stats} />

          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
              <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search connections…" />
          </Toolbar>

          <div className="space-y-5">
            <DataTable
              columns={columns}
              data={pager.pageItems}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setTab(r.destination)}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState
                    icon={Plug}
                    title={filtersActive ? "No matches" : "No connections yet"}
                    description={filtersActive ? "Try a different search or filter." : "Connect a channel to start sending."}
                    action={
                      filtersActive ? (
                        <Button
                          variant="outline"
                          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                          onClick={() => {
                            setQuery("");
                            setTypeFilter("all");
                            setStatusFilter("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : (
                        <Button onClick={() => setTab("Email")}>
                          <Plug className="h-4 w-4" /> Connect email
                        </Button>
                      )
                    }
                  />
                </div>
              }
            />
            <ListPagination {...pager} itemLabel="connections" />
          </div>
        </>
      )}
    </MainScreenWrapper>
  );
}

export default ConnectionsScreen;
