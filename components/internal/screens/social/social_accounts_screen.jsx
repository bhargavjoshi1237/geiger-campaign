"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Gauge, KeyRound, Loader2, PlugZap, RefreshCw, Share2, Unplug } from "lucide-react";
import {
  ActionMenu,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { socialApi } from "@/lib/social/accounts/api";
import { CHANNEL_META, SOCIAL_CHANNELS, SOCIAL_NETWORKS } from "@/lib/social/accounts/catalog";
import { CHANNEL_MANAGE, DisconnectDialog, ListEmptyState, OUTLINE_BUTTON, SectionLoading } from "@/components/internal/screens/channels/channels_kit";
import { ConnectDialog, setupGap } from "@/components/internal/screens/channels/social/connect_dialogs";
import { useNow, useOAuthReturn, useSocialConfig, useSocialConnections } from "@/components/internal/screens/channels/social/hooks";
import { HEALTH_MAP, healthStatus, needsAttention, networkFor, relativeTime, tokenLabel, webhookLabel } from "@/components/internal/screens/channels/social/view_model";

// Every social account connected to the project across Instagram, Facebook Pages, Telegram, TikTok and RCS, with
// health at a glance. Connect / reconnect / disconnect run the same flows as each channel screen.

const TAB = "Social Accounts";
// Sidebar title of each channel's screen, where an account's full editor lives.
const CHANNEL_TAB = { instagram: "Instagram", messenger: "Messenger", telegram: "Telegram", tiktok: "TikTok", rcs: "RCS" };
const NETWORK_LABEL = { instagram: "Instagram", messenger: "Facebook Page", telegram: "Telegram", tiktok: "TikTok", rcs: "RCS" };

const NETWORK_OPTIONS = [{ value: "all", label: "All networks" }, ...SOCIAL_CHANNELS.map((c) => ({ value: c, label: NETWORK_LABEL[c] }))];
const HEALTH_OPTIONS = [
  { value: "all", label: "Any health" },
  { value: "healthy", label: "Healthy" },
  { value: "attention", label: "Needs attention" },
  { value: "reauth", label: "Reconnect needed" },
  { value: "unchecked", label: "Not checked" },
];

function matchesHealth(connection, filter) {
  const status = healthStatus(connection);
  if (filter === "all") return true;
  if (filter === "attention") return needsAttention(connection);
  return status === filter;
}

// Network picker: what each network is used for, whether this deployment can connect it, and what's missing.
function NetworkPicker({ open, onOpenChange, config, onPick }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect an account</DialogTitle>
          <DialogDescription>Only official platform APIs — each network&apos;s own login or credentials, never a password.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {SOCIAL_NETWORKS.map((network) => {
            const gap = network.available ? setupGap(network.channel, config) : null;
            const disabled = !network.available || Boolean(gap);
            return (
              <button
                key={network.key}
                type="button"
                disabled={disabled}
                onClick={() => onPick(network.channel)}
                className="flex w-full items-center justify-between gap-4 bg-surface-subtle px-4 py-3 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:hover:bg-surface-subtle"
              >
                <span className="flex min-w-0 flex-col">
                  <span className={disabled ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium text-foreground"}>{network.label}</span>
                  <span className="text-xs text-text-secondary">{network.available ? gap || network.uses.join(" · ") : `${network.uses.join(" · ")} — not available yet`}</span>
                </span>
                {disabled ? null : <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SocialAccountsScreen() {
  const { projectId } = useProject();
  const canManage = useCan(CHANNEL_MANAGE);
  const now = useNow();
  const config = useSocialConfig(projectId);
  const { openRecordInTab } = useWorkspaceUrl();
  const { connections, loading, reload, replace, remove } = useSocialConnections(projectId, SOCIAL_CHANNELS);
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("all");
  const [health, setHealth] = useState("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [connectChannel, setConnectChannel] = useState(null);
  const [reconnectTarget, setReconnectTarget] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [pending, setPending] = useState(null);
  useOAuthReturn(reload);

  const live = useMemo(() => connections.filter((c) => c.status !== "disconnected"), [connections]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live.filter((c) => {
      if (network !== "all" && c.channel !== network) return false;
      if (!matchesHealth(c, health)) return false;
      if (q && ![c.name, c.handle, c.externalId, c.config?.brand].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [live, query, network, health]);
  const pager = usePagination(filtered, { resetKey: `${query}|${network}|${health}` });

  const stats = useMemo(() => {
    const reauth = live.filter((c) => healthStatus(c) === "reauth").length;
    const attention = live.filter(needsAttention).length;
    const networks = new Set(live.map((c) => c.channel)).size;
    const checked = live.filter((c) => c.health?.checkedAt || c.lastCheckedAt).length;
    return [
      { label: "Connected accounts", value: live.length.toLocaleString("en-US"), footer: `${checked} health-checked` },
      { label: "Need attention", value: attention.toLocaleString("en-US"), footer: "permissions, webhook or pending" },
      { label: "Reconnect needed", value: reauth.toLocaleString("en-US"), footer: "token expired or revoked" },
      { label: "Networks", value: `${networks} of ${SOCIAL_CHANNELS.length}`, footer: "with at least one account" },
    ];
  }, [live]);

  const startConnect = (channel, target = null) => {
    setPickerOpen(false);
    setReconnectTarget(target);
    setConnectChannel(channel);
  };

  const checkAll = async () => {
    setPending("check");
    const res = await socialApi.checkAll(projectId);
    setPending(null);
    if (!res.ok) return toast.error(res.error || "Couldn't run the health checks.");
    replace(res.data.connections || []);
    const rows = res.data.connections || [];
    toast.success(`Checked ${rows.length} account${rows.length === 1 ? "" : "s"}.`);
  };

  const checkOne = async (connection) => {
    const res = await socialApi.checkHealth(projectId, connection.id);
    if (!res.ok) return toast.error(res.error || "Couldn't run the health check.");
    replace(res.data.connection);
    toast.success(`Checked ${connection.name || "the account"}.`);
  };

  const disconnect = async () => {
    const target = disconnectTarget;
    setPending("disconnect");
    const res = await socialApi.disconnect(projectId, target.id);
    setPending(null);
    if (!res.ok) return toast.error(res.error || "Couldn't disconnect the account.");
    setDisconnectTarget(null);
    remove(target.id);
    toast.success(`Disconnected ${target.name || NETWORK_LABEL[target.channel]}.`, res.data?.notes?.length ? { description: res.data.notes.join(" ") } : undefined);
  };

  const filtersActive = Boolean(query) || network !== "all" || health !== "all";
  const clearFilters = () => {
    setQuery("");
    setNetwork("all");
    setHealth("all");
  };

  const columns = [
    {
      key: "account",
      header: "Account",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{c.name || c.handle || "—"}</span>
          <span className="truncate font-mono text-xs text-text-secondary">{c.handle || c.externalId || "—"}</span>
        </div>
      ),
    },
    { key: "network", header: "Network", className: "whitespace-nowrap", render: (c) => <Badge variant="neutral">{NETWORK_LABEL[c.channel] || c.channel}</Badge> },
    { key: "uses", header: "Used for", className: "whitespace-nowrap text-muted-foreground", render: (c) => networkFor(c.channel)?.uses.join(" · ") || "—" },
    { key: "health", header: "Health", className: "whitespace-nowrap", render: (c) => <StatusPill status={healthStatus(c)} map={HEALTH_MAP} /> },
    { key: "token", header: "Token", className: "whitespace-nowrap text-muted-foreground", render: (c) => tokenLabel(c, now) },
    { key: "webhook", header: "Webhook", className: "whitespace-nowrap text-muted-foreground", render: (c) => webhookLabel(c) },
    { key: "checked", header: "Last checked", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (c) => relativeTime(c.health?.checkedAt || c.lastCheckedAt, now) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name || "account"}`}
          items={[
            { label: `Open in ${CHANNEL_TAB[c.channel]}`, icon: Gauge, onSelect: () => openRecordInTab(c.id, CHANNEL_TAB[c.channel]) },
            canManage && { label: "Check now", icon: RefreshCw, onSelect: () => checkOne(c) },
            canManage && { label: "Reconnect", icon: KeyRound, onSelect: () => startConnect(c.channel, c) },
            canManage && { separator: true },
            canManage && { label: "Disconnect", icon: Unplug, destructive: true, onSelect: () => setDisconnectTarget(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Social Accounts"
        description="Every Instagram account, Facebook Page, Telegram bot, TikTok account and RCS agent connected to this project."
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              {live.length ? (
                <Button variant="outline" className={OUTLINE_BUTTON} disabled={pending === "check"} onClick={checkAll}>
                  {pending === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check health
                </Button>
              ) : null}
              <Button onClick={() => setPickerOpen(true)}>
                <PlugZap className="h-4 w-4" /> Connect account
              </Button>
            </div>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={network} onValueChange={setNetwork} options={NETWORK_OPTIONS} height="h-9" />
          <FilterDropdown value={health} onValueChange={setHealth} options={HEALTH_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search accounts…" />
      </Toolbar>

      {loading ? (
        <SectionLoading label="Loading accounts" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecordInTab(c.id, CHANNEL_TAB[c.channel])}
            empty={
              <ListEmptyState
                icon={Share2}
                filtersActive={filtersActive}
                onClear={clearFilters}
                title="No social accounts connected"
                description="Connect Instagram, a Facebook Page, a Telegram bot, TikTok or an RCS agent. Each uses the platform's official API."
                action={
                  canManage ? (
                    <Button onClick={() => setPickerOpen(true)}>
                      <PlugZap className="h-4 w-4" /> Connect account
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="accounts" />
        </div>
      )}

      <NetworkPicker open={pickerOpen} onOpenChange={setPickerOpen} config={config} onPick={(channel) => startConnect(channel)} />
      <ConnectDialog
        key={`${connectChannel || "none"}:${reconnectTarget?.id || "new"}`}
        channel={connectChannel}
        open={Boolean(connectChannel)}
        onOpenChange={(open) => !open && setConnectChannel(null)}
        projectId={projectId}
        tab={TAB}
        config={config}
        initialRegion={reconnectTarget?.config?.region}
        onConnected={(row) => {
          replace(row);
          setConnectChannel(null);
        }}
      />
      <DisconnectDialog
        open={Boolean(disconnectTarget)}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        name={disconnectTarget?.name || CHANNEL_META[disconnectTarget?.channel]?.label || "account"}
        consequence="Messages, comments and automations on this account stop arriving and sending. Conversation history stays in the inbox."
        pending={pending === "disconnect"}
        onConfirm={disconnect}
      />
    </MainScreenWrapper>
  );
}

export default SocialAccountsScreen;
