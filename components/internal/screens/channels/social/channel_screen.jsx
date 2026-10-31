"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, Gauge, KeyRound, Loader2, MessagesSquare, PlugZap, RefreshCw, Scale, Send, ShieldCheck, Unplug } from "lucide-react";
import { ActionMenu, Badge, Button, DataTable, ScreenHeader, SectionCard, StatsBar, StatusPill } from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listConversations } from "@/lib/supabase/conversations";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { socialApi } from "@/lib/social/accounts/api";
import { CHANNEL_META, INSTAGRAM_WEBHOOK_FIELDS, PAGE_WEBHOOK_FIELDS, TELEGRAM_ALLOWED_UPDATES } from "@/lib/social/accounts/catalog";
import { CHANNEL_MANAGE, CopyField, DisconnectDialog, NotConnectedCard, OUTLINE_BUTTON, SectionLoading } from "../channels_kit";
import { ActivitySection, GuardrailsSection, OverviewSection, StartersSection, TestSection } from "./account_sections";
import { ConnectDialog, SetupNotice, setupGap } from "./connect_dialogs";
import { RulesPanel } from "./rules_panel";
import { useNow, useOAuthReturn, useSocialConfig, useSocialConnections } from "./hooks";
import { DAY, HEALTH_MAP, healthStatus, needsAttention, recentlyAt, relativeTime, tokenLabel, webhookLabel, windowState } from "./view_model";

// One social messaging channel (Instagram, Messenger, Telegram, TikTok, RCS): its connected accounts with live
// health, the platform rules it sends under, webhook status and recent activity. A row opens the account editor.

const SENT = new Set(["sent", "delivered", "read", "opened", "clicked", "replied"]);
const WINDOWED = new Set(["instagram", "messenger", "tiktok"]);

const COPY = {
  instagram: {
    connect: "Connect Instagram",
    emptyTitle: "Connect an Instagram professional account",
    emptyDescription: "Sign in with Facebook and choose the Pages whose linked Instagram accounts should send DMs, comments, story replies and mentions here.",
    disconnect: "DMs, comments and automations on this account stop arriving and sending.",
  },
  messenger: {
    connect: "Connect a Page",
    emptyTitle: "Connect a Facebook Page",
    emptyDescription: "Sign in with Facebook and pick the Pages to connect. Messenger conversations and Page comments arrive in the inbox.",
    disconnect: "Messenger conversations and Page comments stop arriving, and automations on this Page stop sending.",
  },
  telegram: {
    connect: "Connect a bot",
    emptyTitle: "Connect a Telegram bot",
    emptyDescription: "Create a bot with @BotFather and paste its token. Geiger registers the webhook, and people who start the bot land in the inbox.",
    disconnect: "The webhook is removed, so messages to the bot stop arriving and broadcasts stop sending.",
  },
  tiktok: {
    connect: "Connect TikTok",
    emptyTitle: "Connect a TikTok business account",
    emptyDescription: "Authorize a TikTok business account to answer DMs within TikTok's 48-hour window. Not offered for accounts in the EEA, Switzerland or the UK.",
    disconnect: "DMs to this account stop arriving here and replies can't be sent.",
  },
  rcs: {
    connect: "Connect an agent",
    emptyTitle: "Connect an RCS agent",
    emptyDescription: "Add your Google RBM agent with its service-account key. Until carriers launch it, only registered test devices receive messages.",
    disconnect: "Messages to this agent stop arriving here and RCS sends stop.",
  },
};

function editorNav(channel) {
  return [
    { key: "overview", label: "Overview", icon: Gauge, desc: "Health, token, webhook and permissions." },
    { key: "guardrails", label: "Guardrails", icon: ShieldCheck, desc: "Human handover, quiet hours and opt-out keywords." },
    CHANNEL_META[channel]?.starters
      ? { key: "starters", label: channel === "telegram" ? "Bot profile" : "Conversation starters", icon: MessagesSquare, desc: "Synced to the platform when you save." }
      : null,
    { key: "rules", label: "Platform rules", icon: Scale, desc: "The limits this account sends under, with live counts." },
    { key: "activity", label: "Activity", icon: Activity, desc: "Recent messages and every send through this account." },
    { key: "test", label: "Test message", icon: Send, desc: "A real message through this account." },
  ].filter(Boolean);
}

function useChannelActivity(projectId, channel) {
  const [state, setState] = useState({ conversations: [], deliveries: [], loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listConversations(projectId, { channel, limit: 500 }), listDeliveries(projectId, { channel, limit: 500 })]).then(([conversations, deliveries]) => {
      if (alive) setState({ conversations: conversations ?? [], deliveries: deliveries ?? [], loading: false });
    });
    return () => {
      alive = false;
    };
  }, [projectId, channel, tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refresh };
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-foreground">{children}</span>
    </div>
  );
}

// Where the platform posts events for this channel, how they're verified and what each account last received.
function WebhookCard({ channel, config, connections, now }) {
  const meta = channel === "instagram" || channel === "messenger";
  const sharedUrl = meta ? config?.meta?.webhookUrl : channel === "tiktok" ? config?.tiktok?.webhookUrl : null;
  const fields = channel === "instagram" ? INSTAGRAM_WEBHOOK_FIELDS : channel === "messenger" ? [...PAGE_WEBHOOK_FIELDS, "leadgen"] : channel === "telegram" ? TELEGRAM_ALLOWED_UPDATES : [];
  const verification = {
    instagram: "X-Hub-Signature-256, signed with META_APP_SECRET",
    messenger: "X-Hub-Signature-256, signed with META_APP_SECRET",
    telegram: "Secret token header set when the webhook is registered",
    tiktok: "TikTok-Signature, signed with TIKTOK_APP_SECRET",
    rcs: "HMAC with the agent's webhook client token",
  }[channel];

  const columns = [
    { key: "account", header: "Account", render: (c) => <span className="font-medium text-foreground">{c.name || c.handle || "—"}</span> },
    { key: "status", header: "Subscription", className: "whitespace-nowrap text-muted-foreground", render: (c) => webhookLabel(c) },
    { key: "last", header: "Last event", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (c) => relativeTime(c.health?.webhook?.lastEventAt, now) },
    {
      key: "url",
      header: "Callback",
      className: "max-w-xs",
      render: (c) => <span className="break-all font-mono text-xs text-text-secondary">{c.health?.webhook?.url || "Set on the next health check"}</span>,
    },
  ];

  return (
    <SectionCard title="Webhook" description="Inbound messages, comments and receipts reach Geiger through this callback. Unsigned requests are rejected.">
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          {sharedUrl ? (
            <CopyField label="Callback URL" htmlFor={`${channel}-webhook-url`} value={sharedUrl} hint={meta ? "Register it in the Meta app's Webhooks settings." : "Register it in the TikTok developer portal."} />
          ) : (
            <div className="text-sm text-text-secondary">
              {channel === "telegram"
                ? "Each bot gets its own callback, registered automatically with setWebhook when you connect or check health."
                : "Each agent has its own callback. Register it in the RBM partner console with the agent's client token."}
            </div>
          )}
          <div className="divide-y divide-border">
            <Row label="Verification">{verification}</Row>
            {meta ? <Row label="Verify token">{config?.meta?.verifyTokenSet ? "Set" : <span className="text-amber-700 dark:text-amber-300">META_WEBHOOK_VERIFY_TOKEN isn&apos;t set</span>}</Row> : null}
          </div>
        </div>
        {fields.length ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">{channel === "telegram" ? "Allowed updates" : "Subscribed fields"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {fields.map((f) => (
                <Badge key={f} variant="neutral" className="font-mono">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {connections.length ? <DataTable columns={columns} data={connections} getRowKey={(c) => c.id} /> : null}
      </div>
    </SectionCard>
  );
}

function AccountEditor({ channel, connection, projectId, conversations, deliveries, now, canManage, onBack, onSaved, onReconnect, onDisconnect, onSent }) {
  const [checking, setChecking] = useState(false);
  const label = CHANNEL_META[channel].label;
  const scopedConversations = useMemo(() => conversations.filter((c) => c.connectionId === connection.id), [conversations, connection.id]);
  const scopedDeliveries = useMemo(() => deliveries.filter((d) => d.connectionId === connection.id), [deliveries, connection.id]);

  const check = async () => {
    setChecking(true);
    const res = await socialApi.checkHealth(projectId, connection.id);
    setChecking(false);
    if (!res.ok) return toast.error(res.error || "Couldn't run the health check.");
    onSaved(res.data.connection);
    const status = healthStatus({ ...connection, ...res.data.connection, health: res.data.connection.health || {} });
    if (status === "healthy") toast.success(`${connection.name || label} is healthy.`);
    else toast.error(HEALTH_MAP[status]?.label || "The check found a problem.");
  };

  const save = async (settings, options = {}) => {
    const res = await socialApi.update(projectId, connection.id, { settings });
    if (!res.ok) {
      toast.error(res.error || "Couldn't save the settings.");
      return false;
    }
    onSaved(res.data.connection);
    if (options.starters) {
      const sync = res.data.profileSync;
      if (sync && !sync.ok) toast.error(`Saved, but ${label} rejected the update: ${sync.error}`);
      else toast.success(sync ? `Saved and live on ${label}.` : "Saved.");
    }
    return true;
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={<span className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{connection.name || connection.handle || label}</span>}
      status={healthStatus(connection)}
      statusMap={HEALTH_MAP}
      badges={
        <>
          {connection.handle ? <Badge variant="neutral" className="font-mono">{connection.handle}</Badge> : null}
          <span className="text-xs text-text-tertiary">Checked {relativeTime(connection.health?.checkedAt || connection.lastCheckedAt, now)}</span>
        </>
      }
      actions={
        canManage ? (
          <>
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={onReconnect}>
              <KeyRound className="h-4 w-4" /> Reconnect
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={onDisconnect}>
              <Unplug className="h-4 w-4" /> Disconnect
            </Button>
          </>
        ) : null
      }
      nav={editorNav(channel)}
      defaultSection="overview"
    >
      {({ active }) => (
        <>
          {active === "overview" ? <OverviewSection connection={connection} now={now} canManage={canManage} checking={checking} onCheck={check} onReconnect={onReconnect} /> : null}
          {active === "guardrails" ? <GuardrailsSection key={connection.id} connection={connection} canManage={canManage} onSave={save} /> : null}
          {active === "starters" ? <StartersSection key={connection.id} connection={connection} now={now} canManage={canManage} onSave={save} /> : null}
          {active === "rules" ? (
            <SectionCard title="Rules in effect" description="Enforced on every send from this account; blocked sends are logged with the reason.">
              <RulesPanel channel={channel} connections={[connection]} conversations={scopedConversations} deliveries={scopedDeliveries} now={now} />
            </SectionCard>
          ) : null}
          {active === "activity" ? <ActivitySection projectId={projectId} conversations={scopedConversations} deliveries={scopedDeliveries} now={now} /> : null}
          {active === "test" ? <TestSection projectId={projectId} connection={connection} conversations={scopedConversations} now={now} canManage={canManage} onSent={onSent} /> : null}
        </>
      )}
    </EditorShell>
  );
}

export function SocialChannelScreen({ channel, title, description, icon: Icon }) {
  const { projectId } = useProject();
  const canManage = useCan(CHANNEL_MANAGE);
  const now = useNow();
  const config = useSocialConfig(projectId);
  const channels = useMemo(() => [channel], [channel]);
  const { connections, loading, reload, replace, remove } = useSocialConnections(projectId, channels);
  const { conversations, deliveries, loading: activityLoading, refresh } = useChannelActivity(projectId, channel);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [connectOpen, setConnectOpen] = useState(false);
  const [reconnectTarget, setReconnectTarget] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [pending, setPending] = useState(null);
  const copy = COPY[channel];
  useOAuthReturn(reload);

  const gap = setupGap(channel, config);
  const live = useMemo(() => connections.filter((c) => c.status !== "disconnected"), [connections]);
  const pager = usePagination(live);
  const conversationCount = useMemo(() => {
    const counts = new Map();
    for (const c of conversations) counts.set(c.connectionId, (counts.get(c.connectionId) || 0) + 1);
    return counts;
  }, [conversations]);
  const recentConversations = useMemo(() => conversations.slice(0, 100), [conversations]);

  const stats = useMemo(() => {
    const attention = live.filter(needsAttention).length;
    const dms = conversations.filter((c) => c.kind !== "comment");
    const week = deliveries.filter((d) => recentlyAt(d.createdAt, now, 7 * DAY));
    const sent = week.filter((d) => SENT.has(d.status)).length;
    const blocked = week.filter((d) => d.status === "not_sent" || d.blockedBy).length;
    const active = conversations.filter((c) => recentlyAt(c.lastInboundAt, now, 7 * DAY)).length;
    const open = dms.filter((c) => windowState(c, channel, now).state === "open").length;
    return [
      { label: "Accounts", value: live.length.toLocaleString("en-US"), footer: live.length ? (attention ? `${attention} need attention` : "all healthy") : "none connected" },
      WINDOWED.has(channel)
        ? { label: "Open windows", value: open.toLocaleString("en-US"), footer: "free-form replies allowed now" }
        : { label: channel === "telegram" ? "Started the bot" : "Conversations", value: dms.length.toLocaleString("en-US"), footer: "all time" },
      { label: "Active conversations", value: active.toLocaleString("en-US"), footer: "inbound in the last 7 days" },
      { label: "Sent", value: sent.toLocaleString("en-US"), footer: `${blocked} blocked by a platform rule (7d)` },
    ];
  }, [live, conversations, deliveries, channel, now]);

  const openConnect = (target = null) => {
    setReconnectTarget(target);
    setConnectOpen(true);
  };

  const checkAll = async () => {
    setPending("check");
    const res = await socialApi.checkAll(projectId);
    setPending(null);
    if (!res.ok) return toast.error(res.error || "Couldn't run the health checks.");
    const rows = (res.data.connections || []).filter((r) => r.channel === channel);
    replace(rows);
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
    if (recordId === target.id) closeRecord();
    toast.success(`Disconnected ${target.name || CHANNEL_META[channel].label}.`, res.data?.notes?.length ? { description: res.data.notes.join(" ") } : undefined);
  };

  const dialogs = (
    <>
      <ConnectDialog
        key={`${connectOpen}:${reconnectTarget?.id || "new"}`}
        channel={channel}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        projectId={projectId}
        tab={title}
        config={config}
        initialRegion={reconnectTarget?.config?.region}
        onConnected={(row) => {
          replace(row);
          setConnectOpen(false);
        }}
      />
      <DisconnectDialog
        open={Boolean(disconnectTarget)}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        name={disconnectTarget?.name || CHANNEL_META[channel].label}
        consequence={copy.disconnect}
        pending={pending === "disconnect"}
        onConfirm={disconnect}
      />
    </>
  );

  const open = live.find((c) => c.id === recordId);
  if (open) {
    return (
      <>
        <AccountEditor
          channel={channel}
          connection={open}
          projectId={projectId}
          conversations={conversations}
          deliveries={deliveries}
          now={now}
          canManage={canManage}
          onBack={closeRecord}
          onSaved={replace}
          onReconnect={() => openConnect(open)}
          onDisconnect={() => setDisconnectTarget(open)}
          onSent={refresh}
        />
        {dialogs}
      </>
    );
  }

  const columns = [
    {
      key: "account",
      header: "Account",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{c.name || c.handle || "—"}</span>
          <span className="truncate font-mono text-xs text-text-secondary">{[c.handle, c.config?.pageName && channel === "instagram" ? `Page: ${c.config.pageName}` : null].filter(Boolean).join(" · ") || c.externalId}</span>
        </div>
      ),
    },
    { key: "health", header: "Health", className: "whitespace-nowrap", render: (c) => <StatusPill status={healthStatus(c)} map={HEALTH_MAP} /> },
    { key: "token", header: "Token", className: "whitespace-nowrap text-muted-foreground", render: (c) => tokenLabel(c, now) },
    { key: "webhook", header: "Webhook", className: "whitespace-nowrap text-muted-foreground", render: (c) => webhookLabel(c) },
    { key: "conversations", header: "Conversations", align: "right", className: "tabular-nums text-muted-foreground", render: (c) => (conversationCount.get(c.id) || 0).toLocaleString("en-US") },
    { key: "checked", header: "Last checked", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (c) => relativeTime(c.health?.checkedAt || c.lastCheckedAt, now) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name || "account"}`}
          items={[
            { label: "Open", icon: Gauge, onSelect: () => openRecord(c.id) },
            canManage && { label: "Check now", icon: RefreshCw, onSelect: () => checkOne(c) },
            canManage && { label: "Reconnect", icon: KeyRound, onSelect: () => openConnect(c) },
            canManage && { separator: true },
            canManage && { label: "Disconnect", icon: Unplug, destructive: true, onSelect: () => setDisconnectTarget(c) },
          ]}
        />
      ),
    },
  ];

  const connectButton = canManage ? (
    <Button disabled={Boolean(gap)} onClick={() => openConnect()}>
      <PlugZap className="h-4 w-4" /> {copy.connect}
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={title}
        description={description}
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              {live.length ? (
                <Button variant="outline" className={OUTLINE_BUTTON} disabled={pending === "check"} onClick={checkAll}>
                  {pending === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check health
                </Button>
              ) : null}
              {connectButton}
            </div>
          ) : null
        }
      />

      <SetupNotice channel={channel} config={config} />

      <StatsBar stats={stats} />

      {loading ? (
        <SectionLoading label={`Loading ${CHANNEL_META[channel].label}`} />
      ) : live.length ? (
        <div className="space-y-5">
          <DataTable columns={columns} data={pager.pageItems} getRowKey={(c) => c.id} onRowClick={(c) => openRecord(c.id)} />
          <ListPagination {...pager} itemLabel="accounts" />
        </div>
      ) : (
        <NotConnectedCard icon={Icon} title={copy.emptyTitle} description={copy.emptyDescription} action={connectButton} />
      )}

      <SectionCard title="Platform rules" description="Enforced on every send from this channel, so nothing goes out that the platform would penalise. Counts are live.">
        <RulesPanel channel={channel} connections={live} conversations={conversations} deliveries={deliveries} now={now} />
      </SectionCard>

      <WebhookCard channel={channel} config={config} connections={live} now={now} />

      {activityLoading ? <SectionLoading label="Loading activity" /> : <ActivitySection projectId={projectId} conversations={recentConversations} deliveries={deliveries} now={now} />}
      {dialogs}
    </MainScreenWrapper>
  );
}

export default SocialChannelScreen;
