"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Globe, BellRing, Trash2, Loader2, RefreshCw, Unplug, PlugZap, Smartphone, Send } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useCan } from "@/context/rbac-context";
import { apiDelete, apiPost } from "@/lib/api/client";
import { listContacts } from "@/lib/supabase/contacts";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { mergeConnectionMeta, normalizeConnection } from "@/lib/supabase/channel_connections";
import { listPushSubscriptions, softDeletePushSubscription } from "@/lib/supabase/push_subscriptions";
import { channelSettings } from "@/lib/channels/policy";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  StatsBar,
  StatusPill,
  SectionCard,
  SettingsList,
  SettingRow,
} from "@geiger/ui";
import {
  CHANNEL_MANAGE,
  CONNECTION_STATUS_MAP,
  CodeBlock,
  CopyField,
  DeleteConfirmDialog,
  DeliveryRulesFields,
  DisconnectDialog,
  ListEmptyState,
  NotConnectedCard,
  OUTLINE_BUTTON,
  RecentDeliveries,
  SaveChangesButton,
  SectionLoading,
  formatRelative,
  useChannelConnection,
  useChannelStatus,
  useNow,
  useSettingsDraft,
} from "./channels_kit";

// Web push straight to browser push services (VAPID + RFC 8291 encryption, no third-party service).
// Native iOS/Android push (APNs/FCM) isn't implemented, and the screen says so instead of pretending.

const SUBSCRIPTION_STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "neutral" },
  unsubscribed: { label: "Unsubscribed", variant: "neutral" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(SUBSCRIPTION_STATUS_MAP).map(([value, s]) => ({ value, label: s.label })),
];

const URGENCY_OPTIONS = [
  { value: "very-low", label: "Very low" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

function SetupDialog({ open, onOpenChange, onSetup }) {
  const [subject, setSubject] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (subject && !/^(mailto:|https:\/\/)/.test(subject.trim())) {
      toast.error("The contact is a mailto: address or an https:// URL.");
      return;
    }
    setPending(true);
    const ok = await onSetup(subject.trim());
    setPending(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up web push</DialogTitle>
          <DialogDescription>Generates a VAPID key pair. The private key stays on the server; the public key goes into your site&apos;s subscribe call.</DialogDescription>
        </DialogHeader>
        <Field label="Contact for push services" htmlFor="push-subject" hint="Browser vendors use it if your notifications cause problems.">
          <Input id="push-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="mailto:dev@halcyon.studio" autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Generate keys
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestPushDialog({ target, subscriptions, onOpenChange, onSend }) {
  const active = subscriptions.filter((s) => s.status === "active");
  const [form, setForm] = useState({ subscriptionId: target?.id || active[0]?.id || "", title: "Test notification", body: "Sent from Geiger Campaign.", url: "" });
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const send = async () => {
    setPending(true);
    const ok = await onSend(form);
    setPending(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test notification</DialogTitle>
          <DialogDescription>Delivered to one browser subscription and logged under Message Logs.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Subscription">
            <Select value={form.subscriptionId || undefined} onValueChange={set("subscriptionId")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="No active subscriptions" /></SelectTrigger>
              <SelectContent>
                {active.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{`${s.device} · ${s.contactLabel || "anonymous"}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title" htmlFor="pt-title">
            <Input id="pt-title" value={form.title} onChange={(e) => set("title")(e.target.value)} />
          </Field>
          <Field label="Body" htmlFor="pt-body">
            <Input id="pt-body" value={form.body} onChange={(e) => set("body")(e.target.value)} />
          </Field>
          <Field label="Open URL" htmlFor="pt-url" hint="Optional — opened when the notification is clicked.">
            <Input id="pt-url" value={form.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://halcyon.studio" className="font-mono" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={pending || !form.subscriptionId || !form.title.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SERVICE_WORKER = `// sw.js — serve from the root of your site
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const beacon = (kind) => data.track && fetch(data.track.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: data.track.token, event: kind }),
  });
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || "", { body: data.body, icon: data.icon || undefined, tag: data.tag || undefined, data }),
    beacon("shown"),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  event.waitUntil(Promise.all([
    data.url ? clients.openWindow(data.url) : null,
    data.track ? fetch(data.track.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: data.track.token, event: "clicked" }),
    }) : null,
  ]));
});`;

const subscribeSnippet = (urls) => `// After the visitor opts in (call from a click handler)
const KEY = "gcp_…"; // your Geiger public key
const registration = await navigator.serviceWorker.register("/sw.js");
const config = await fetch("${urls?.pushConfig || "/api/public/push/config"}?key=" + KEY).then((r) => r.json());
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: config.vapidPublicKey,
});
await fetch("${urls?.pushSubscribe || "/api/public/push/subscribe"}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    key: KEY,
    subscription: subscription.toJSON(),
    // Optional: link to a contact with the same user hash the in-app SDK uses.
    user: "ava@example.com",
    hash: USER_HASH_FROM_YOUR_SERVER,
  }),
});`;

export function PushScreen() {
  const { projectId, connection, setConnection, loading } = useChannelConnection("push");
  const { status } = useChannelStatus();
  const canManage = useCan(CHANNEL_MANAGE);
  const now = useNow();
  const [subscriptions, setSubscriptions] = useState([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [recent, setRecent] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [setupOpen, setSetupOpen] = useState(false);
  const [testTarget, setTestTarget] = useState(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([
      listPushSubscriptions(projectId),
      listContacts(projectId, { limit: 2000 }),
      listDeliveries(projectId, { channel: "push", since: new Date(now - 30 * 86_400_000).toISOString(), limit: 5000 }),
    ]).then(([subs, people, deliveries]) => {
      if (!alive) return;
      setSubscriptions(subs ?? []);
      setContacts(people ?? []);
      setRecent(deliveries ?? []);
      setSubsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, now]);

  const connected = connection && connection.status !== "disconnected";
  const settings = useMemo(() => channelSettings(connection, "push"), [connection]);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const rows = useMemo(
    () => subscriptions.map((s) => ({ ...s, contactLabel: s.contactId ? contactById.get(s.contactId)?.email || contactById.get(s.contactId)?.name || "Contact" : "" })),
    [subscriptions, contactById],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q && !`${s.device} ${s.contactLabel} ${s.pushService}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, statusFilter]);
  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}` });

  const stats = useMemo(() => {
    const active = subscriptions.filter((s) => s.status === "active");
    const sent = recent.filter((d) => ["sent", "delivered", "clicked"].includes(d.status)).length;
    const clicked = recent.filter((d) => d.status === "clicked").length;
    return [
      { label: "Active subscriptions", value: active.length.toLocaleString("en-US"), footer: "browsers that can receive push" },
      { label: "Linked to contacts", value: active.filter((s) => s.contactId).length.toLocaleString("en-US"), footer: "identified with a user hash" },
      { label: "Sent", value: sent.toLocaleString("en-US"), footer: "last 30 days" },
      { label: "Clicked", value: clicked.toLocaleString("en-US"), footer: sent ? `${Math.round((clicked / sent) * 100)}% of sent` : "no sends yet" },
    ];
  }, [subscriptions, recent]);

  const setup = async (subject) => {
    const res = await apiPost(`/api/projects/${projectId}/channels/connect`, { channel: "push", subject });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setConnection(normalizeConnection(res.data.connection));
    toast.success("Web push is ready — add the snippets to your site.");
    return true;
  };

  const recheck = async () => {
    setPending("verify");
    const res = await apiPost(`/api/projects/${projectId}/channels/${connection.id}/verify`, {});
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    setConnection(normalizeConnection(res.data.connection));
    toast.success(res.data.connection.status === "connected" ? "VAPID keys are valid." : res.data.connection.health?.lastError);
  };

  const disconnect = async () => {
    setPending("disconnect");
    const res = await apiDelete(`/api/projects/${projectId}/channels/${connection.id}`);
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    setDisconnectOpen(false);
    setConnection(null);
    toast.success("Web push disconnected.");
  };

  const sendTest = async (form) => {
    const res = await apiPost(`/api/projects/${projectId}/channels/${connection.id}/test`, form);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (res.data.status === "sent") toast.success("Test notification sent.");
    else toast.error(res.data.error || "The notification wasn't sent.");
    const fresh = await listPushSubscriptions(projectId);
    if (fresh) setSubscriptions(fresh);
    return res.data.status === "sent";
  };

  const removeSubscription = async (s) => {
    setDeleteTarget(null);
    const previous = subscriptions;
    setSubscriptions((prev) => prev.filter((x) => x.id !== s.id));
    if (!(await softDeletePushSubscription(s.id))) {
      setSubscriptions(previous);
      toast.error("Couldn't remove the subscription.");
      return;
    }
    toast.success("Subscription removed.");
  };

  const draft = useSettingsDraft(
    { ttlSeconds: settings.ttlSeconds, urgency: settings.urgency, quietHours: settings.quietHours, frequencyCap: settings.frequencyCap },
    async (values) => {
      const next = { ...(connection.settings || {}), ...values };
      if (!(await mergeConnectionMeta(connection.id, { settings: next }))) {
        toast.error("Couldn't save the push settings.");
        return false;
      }
      setConnection({ ...connection, settings: next });
      toast.success("Push settings saved.");
      return true;
    },
  );

  const capabilities = (
    <SectionCard>
      <SettingsList>
        <SettingRow
          icon={Globe}
          title="Web push"
          description="Chrome, Edge, Firefox and Safari 16.4+ (installed web apps on iOS). Sent with VAPID straight to the browser's push service."
          control={<Badge variant="success">Supported</Badge>}
        />
        <SettingRow
          icon={Smartphone}
          title="iOS and Android apps"
          description="Native push needs APNs and FCM credentials and a mobile SDK. Geiger doesn't send native push yet."
          control={<Badge variant="neutral">Not supported yet</Badge>}
        />
      </SettingsList>
    </SectionCard>
  );

  const header = (
    <ScreenHeader
      title="Push"
      description="Web push notifications sent straight to browsers — no third-party push service in between."
      actions={
        canManage && !loading ? (
          connected ? (
            <Button onClick={() => setTestTarget({})} disabled={connection.status !== "connected"}>
              <Send className="h-4 w-4" /> Send test
            </Button>
          ) : (
            <Button onClick={() => setSetupOpen(true)}>
              <PlugZap className="h-4 w-4" /> Set up web push
            </Button>
          )
        ) : null
      }
    />
  );

  const dialogs = (
    <>
      <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} onSetup={setup} />
      <TestPushDialog key={testTarget ? testTarget.id || "any" : "closed"} target={testTarget} subscriptions={rows} onOpenChange={(o) => !o && setTestTarget(null)} onSend={sendTest} />
      <DisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        name="web push"
        consequence="The VAPID keys are deleted, so every existing browser subscription stops working and visitors must subscribe again."
        pending={pending === "disconnect"}
        onConfirm={disconnect}
      />
      <DeleteConfirmDialog
        target={deleteTarget}
        title="Remove subscription"
        name={deleteTarget?.device}
        confirmLabel="Remove"
        description="That browser stops receiving notifications until it subscribes again."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={removeSubscription}
      />
    </>
  );

  if (loading) {
    return (
      <MainScreenWrapper>
        {header}
        <SectionLoading label="Loading push" />
      </MainScreenWrapper>
    );
  }

  if (!connected) {
    return (
      <MainScreenWrapper>
        {header}
        {capabilities}
        <NotConnectedCard
          icon={BellRing}
          title="Web push isn't set up"
          description="Generate VAPID keys, then add a service worker and the subscribe call to your site. Subscriptions appear here as visitors opt in."
          action={
            canManage ? (
              <Button onClick={() => setSetupOpen(true)}>
                <PlugZap className="h-4 w-4" /> Set up web push
              </Button>
            ) : null
          }
        />
        {dialogs}
      </MainScreenWrapper>
    );
  }

  const filtersActive = query || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "device",
      header: "Browser",
      render: (s) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Globe className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{s.device}</span>
            <span className="truncate font-mono text-xs text-text-secondary">{s.pushService}</span>
          </div>
        </div>
      ),
    },
    { key: "contact", header: "Contact", className: "text-muted-foreground", render: (s) => s.contactLabel || <span className="text-text-tertiary">Anonymous</span> },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (s) => <StatusPill status={s.status} map={SUBSCRIPTION_STATUS_MAP} /> },
    { key: "seen", header: "Last seen", className: "whitespace-nowrap text-muted-foreground", render: (s) => formatRelative(s.lastSeenAt || s.createdAt, now) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <ActionMenu
          label={`Actions for ${s.device}`}
          items={[
            canManage && s.status === "active" && { label: "Send test", icon: BellRing, onSelect: () => setTestTarget(s) },
            canManage && { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(s) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      {header}
      <StatsBar stats={stats} />

      <SectionCard
        title="Web push keys"
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={pending === "verify"} onClick={recheck}>
                {pending === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-check
              </Button>
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setDisconnectOpen(true)}>
                <Unplug className="h-4 w-4" /> Disconnect
              </Button>
            </div>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <CopyField label="VAPID public key" value={connection.config?.vapidPublicKey} hint="Public by design — the private key never leaves the server." />
          <div className="flex items-center gap-2 pb-5">
            <StatusPill status={connection.status} map={CONNECTION_STATUS_MAP} />
            <span className="text-xs text-text-tertiary">{connection.health?.lastError || connection.config?.subject || "No push-service contact set"}</span>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <SectionCard title="Delivery settings" contentClassName="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Keep for (hours)" htmlFor="push-ttl" hint="Push services drop it after this if the browser is offline.">
              <Input
                id="push-ttl"
                type="number"
                min={0}
                max={672}
                value={Math.round(draft.values.ttlSeconds / 3600)}
                disabled={!canManage}
                onChange={(e) => draft.set({ ttlSeconds: Math.max(0, Math.min(672, Number(e.target.value) || 0)) * 3600 })}
              />
            </Field>
            <Field label="Urgency">
              <Select value={draft.values.urgency} onValueChange={(v) => draft.set({ urgency: v })} disabled={!canManage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {URGENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DeliveryRulesFields values={draft.values} set={draft.set} disabled={!canManage} idPrefix="push" />
          {canManage ? (
            <div className="flex justify-end">
              <SaveChangesButton dirty={draft.dirty} saving={draft.saving} onClick={draft.save} />
            </div>
          ) : null}
        </SectionCard>

        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Subscriptions</h2>
            <p className="text-xs text-text-secondary">Browsers that opted in through your site. Dead endpoints expire automatically on the next send.</p>
          </div>
          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search subscriptions…" />
          </Toolbar>
          {subsLoading ? (
            <SectionLoading label="Loading subscriptions" />
          ) : (
            <div className="space-y-5">
              <DataTable
                columns={columns}
                data={pager.pageItems}
                getRowKey={(s) => s.id}
                empty={
                  <ListEmptyState
                    icon={BellRing}
                    filtersActive={filtersActive}
                    onClear={clearFilters}
                    title="No subscriptions yet"
                    description="Add the service worker and subscribe call below to your site; visitors who allow notifications show up here."
                  />
                }
              />
              <ListPagination {...pager} itemLabel="subscriptions" />
            </div>
          )}
        </div>
      </div>

      <SectionCard bare title="Add web push to your site" description="Two pieces: a service worker that shows notifications, and the subscribe call after the visitor opts in.">
        <div className="grid gap-4 xl:grid-cols-2">
          <CodeBlock label="service worker">{SERVICE_WORKER}</CodeBlock>
          <CodeBlock label="subscribe snippet">{subscribeSnippet(status?.urls)}</CodeBlock>
        </div>
      </SectionCard>

      {capabilities}
      <RecentDeliveries channel="push" description="The latest push notifications from every source." />
      {dialogs}
    </MainScreenWrapper>
  );
}

export default PushScreen;
