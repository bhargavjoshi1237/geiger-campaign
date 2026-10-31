"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Smartphone, Star, Copy, Send, Loader2, RefreshCw, KeyRound, Unplug, PlugZap, Webhook } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useCan } from "@/context/rbac-context";
import { apiDelete, apiPost } from "@/lib/api/client";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { mergeConnectionMeta, normalizeConnection } from "@/lib/supabase/channel_connections";
import { channelSettings, parseKeywordList } from "@/lib/channels/policy";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
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
  Switch,
} from "@geiger/ui";
import {
  CHANNEL_MANAGE,
  CONNECTION_STATUS_MAP,
  CopyField,
  DisconnectDialog,
  DeliveryRulesFields,
  ListEmptyState,
  NotConnectedCard,
  OUTLINE_BUTTON,
  RecentDeliveries,
  SaveChangesButton,
  SectionLoading,
  copyText,
  deliveryStats,
  formatRelative,
  useChannelConnection,
  useChannelStatus,
  useNow,
  useSettingsDraft,
} from "./channels_kit";

// SMS through the customer's own Twilio account (pluggable provider, no carrier work here): connect +
// live verification, sender numbers synced from Twilio, inbound routing, STOP/START/HELP handling and
// delivery rules. Numbers are bought or ported in Twilio; this screen never invents them.

const TYPE_LABEL = { long_code: "Long code", toll_free: "Toll-free", short_code: "Short code" };
const TYPE_TONE = { long_code: "neutral", toll_free: "info", short_code: "purple" };

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

const INBOUND_FILTER_OPTIONS = [
  { value: "all", label: "Any inbound" },
  { value: "routed", label: "Routed to Geiger" },
  { value: "other", label: "Routed elsewhere" },
];

function ConnectTwilioDialog({ open, onOpenChange, onConnect, updating }) {
  const [form, setForm] = useState({ accountSid: "", authToken: "" });
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!/^AC[0-9a-f]{32}$/i.test(form.accountSid.trim())) {
      toast.error("The Account SID starts with AC and has 34 characters.");
      return;
    }
    if (!form.authToken.trim()) {
      toast.error("Enter the Auth Token.");
      return;
    }
    setPending(true);
    const ok = await onConnect({ accountSid: form.accountSid.trim(), authToken: form.authToken.trim() });
    setPending(false);
    if (ok) {
      setForm({ accountSid: "", authToken: "" });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{updating ? "Update Twilio credentials" : "Connect Twilio"}</DialogTitle>
          <DialogDescription>
            Find both in the Twilio console under Account info. They&apos;re checked with Twilio, then stored server-side — never in the browser.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Account SID" htmlFor="tw-sid">
            <Input id="tw-sid" value={form.accountSid} onChange={(e) => set("accountSid")(e.target.value)} placeholder="AC…" className="font-mono" autoFocus autoComplete="off" />
          </Field>
          <Field label="Auth Token" htmlFor="tw-token" hint="Also used to verify X-Twilio-Signature on webhooks.">
            <Input id="tw-token" type="password" value={form.authToken} onChange={(e) => set("authToken")(e.target.value)} className="font-mono" autoComplete="off" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} {updating ? "Verify and save" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestSmsDialog({ open, onOpenChange, numbers, defaultFrom, onSend }) {
  const [form, setForm] = useState({ to: "", body: "Test message from Geiger Campaign.", from: defaultFrom || "" });
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const send = async () => {
    if (!/^\+?[\d\s()-]{6,}$/.test(form.to.trim())) {
      toast.error("Enter the phone number in international format, e.g. +14155550142.");
      return;
    }
    setPending(true);
    const ok = await onSend(form);
    setPending(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test SMS</DialogTitle>
          <DialogDescription>A real message through Twilio, logged under Message Logs. Twilio bills it like any other.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="To" htmlFor="sms-to">
              <Input id="sms-to" value={form.to} onChange={(e) => set("to")(e.target.value)} placeholder="+14155550142" className="font-mono" autoFocus />
            </Field>
            <Field label="From">
              <Select value={form.from || undefined} onValueChange={set("from")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Default sender" /></SelectTrigger>
                <SelectContent>
                  {numbers.map((n) => (
                    <SelectItem key={n.sid} value={n.number}>{n.number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Message" htmlFor="sms-body" hint={`${form.body.length} characters · ${Math.max(1, Math.ceil(form.body.length / 153))} segment(s)`}>
            <Textarea id="sms-body" value={form.body} onChange={(e) => set("body")(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={pending || !form.body.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const settingsDraft = (s) => ({
  defaultSender: s.defaultSender,
  optOutKeywords: s.optOutKeywords.join(", "),
  optInKeywords: s.optInKeywords.join(", "),
  helpKeywords: s.helpKeywords.join(", "),
  autoReply: s.autoReply,
  optOutReply: s.optOutReply,
  optInReply: s.optInReply,
  helpReply: s.helpReply,
  appendOptOutNotice: s.appendOptOutNotice,
  optOutNotice: s.optOutNotice,
  quietHours: s.quietHours,
  frequencyCap: s.frequencyCap,
});

export function SmsScreen() {
  const { projectId, connection, setConnection, loading } = useChannelConnection("sms");
  const { status } = useChannelStatus();
  const canManage = useCan(CHANNEL_MANAGE);
  const now = useNow();
  const [recent, setRecent] = useState([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [inboundFilter, setInboundFilter] = useState("all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listDeliveries(projectId, { channel: "sms", since: new Date(now - 30 * 86_400_000).toISOString(), limit: 5000 }).then((rows) => {
      if (alive) setRecent(rows ?? []);
    });
    return () => {
      alive = false;
    };
  }, [projectId, now]);

  const connected = connection && connection.status !== "disconnected";
  const settings = useMemo(() => channelSettings(connection, "sms"), [connection]);
  const numbers = useMemo(() => (Array.isArray(connection?.config?.numbers) ? connection.config.numbers : []), [connection]);
  const smsNumbers = numbers.filter((n) => (n.capabilities || []).includes("sms"));
  const defaultSender = settings.defaultSender || smsNumbers[0]?.number || "";
  const stats = useMemo(() => deliveryStats(recent), [recent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return numbers.filter((n) => {
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      if (inboundFilter === "routed" && !n.inbound) return false;
      if (inboundFilter === "other" && n.inbound) return false;
      if (q && !`${n.number} ${n.friendlyName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [numbers, query, typeFilter, inboundFilter]);
  const pager = usePagination(filtered, { resetKey: `${query}|${typeFilter}|${inboundFilter}` });

  const applyConnection = (row) => setConnection(normalizeConnection(row));

  const connect = async (credentials) => {
    const res = await apiPost(`/api/projects/${projectId}/channels/connect`, { channel: "sms", credentials });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    applyConnection(res.data.connection);
    toast.success(`Connected ${res.data.connection.name || "Twilio"} — ${(res.data.connection.config?.numbers || []).length} number(s) found.`);
    return true;
  };

  const recheck = async () => {
    setPending("verify");
    const res = await apiPost(`/api/projects/${projectId}/channels/${connection.id}/verify`, {});
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    applyConnection(res.data.connection);
    if (res.data.connection.status === "connected") toast.success("Twilio connection checked.");
    else toast.error(res.data.connection.health?.lastError || "Twilio reported a problem.");
  };

  const disconnect = async () => {
    setPending("disconnect");
    const res = await apiDelete(`/api/projects/${projectId}/channels/${connection.id}`);
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    setDisconnectOpen(false);
    setConnection(null);
    toast.success("Twilio disconnected.");
  };

  const routeInbound = async (n) => {
    setPending(n.sid);
    const res = await apiPost(`/api/projects/${projectId}/channels/${connection.id}/numbers/${n.sid}/inbound`, {});
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    applyConnection(res.data.connection);
    toast.success(`Replies to ${n.number} now land in the inbox.`);
  };

  const sendTest = async (form) => {
    const res = await apiPost(`/api/projects/${projectId}/channels/${connection.id}/test`, { to: form.to, body: form.body, from: form.from || undefined });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (res.data.status === "sent") toast.success(`Test sent to ${form.to}.`);
    else toast.error(res.data.error || "The test wasn't sent.");
    return res.data.status === "sent";
  };

  const saveSettings = async (values) => {
    const next = {
      ...(connection.settings || {}),
      ...values,
      optOutKeywords: parseKeywordList(values.optOutKeywords),
      optInKeywords: parseKeywordList(values.optInKeywords),
      helpKeywords: parseKeywordList(values.helpKeywords),
    };
    if (!next.optOutKeywords.length) {
      toast.error("Keep at least one opt-out keyword — STOP is expected by carriers.");
      return false;
    }
    const merged = await mergeConnectionMeta(connection.id, { settings: next });
    if (!merged) {
      toast.error("Couldn't save the SMS settings.");
      return false;
    }
    setConnection({ ...connection, settings: next });
    toast.success("SMS settings saved.");
    return true;
  };
  const draft = useSettingsDraft(settingsDraft({ ...settings, defaultSender }), saveSettings);

  const makeDefault = async (n) => {
    const next = { ...(connection.settings || {}), defaultSender: n.number };
    const merged = await mergeConnectionMeta(connection.id, { settings: next });
    if (!merged) return toast.error("Couldn't change the default sender.");
    setConnection({ ...connection, settings: next });
    toast.success(`${n.number} is now the default sender.`);
  };

  const header = (
    <ScreenHeader
      title="SMS"
      description="Your Twilio account, sender numbers and opt-out compliance."
      actions={
        canManage && !loading ? (
          connected ? (
            <Button onClick={() => setTestOpen(true)} disabled={connection.status !== "connected"}>
              <Send className="h-4 w-4" /> Send test
            </Button>
          ) : (
            <Button onClick={() => setConnectOpen(true)}>
              <PlugZap className="h-4 w-4" /> Connect Twilio
            </Button>
          )
        ) : null
      }
    />
  );

  const dialogs = (
    <>
      <ConnectTwilioDialog open={connectOpen} onOpenChange={setConnectOpen} onConnect={connect} updating={Boolean(connected)} />
      <TestSmsDialog key={testOpen ? "open" : "closed"} open={testOpen} onOpenChange={setTestOpen} numbers={smsNumbers} defaultFrom={defaultSender} onSend={sendTest} />
      <DisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        name="Twilio"
        consequence="SMS campaigns and automations stop sending and inbound replies are no longer threaded."
        pending={pending === "disconnect"}
        onConfirm={disconnect}
      />
    </>
  );

  if (loading) {
    return (
      <MainScreenWrapper>
        {header}
        <SectionLoading label="Loading SMS" />
      </MainScreenWrapper>
    );
  }

  if (!connected) {
    return (
      <MainScreenWrapper>
        {header}
        <NotConnectedCard
          icon={Smartphone}
          title="Connect Twilio to send SMS"
          description="Geiger sends SMS through your own Twilio account. Connect it with your Account SID and Auth Token; numbers are read from Twilio."
          action={
            canManage ? (
              <Button onClick={() => setConnectOpen(true)}>
                <PlugZap className="h-4 w-4" /> Connect Twilio
              </Button>
            ) : (
              <span className="text-sm text-text-secondary">Ask someone with channel access to connect it.</span>
            )
          }
        />
        {dialogs}
      </MainScreenWrapper>
    );
  }

  const filtersActive = query || typeFilter !== "all" || inboundFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setInboundFilter("all");
  };
  const trial = connection.health?.accountType === "Trial" || connection.config?.accountType === "Trial";

  const columns = [
    {
      key: "number",
      header: "Number",
      render: (n) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Smartphone className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-foreground">{n.number}</span>
            {n.friendlyName && n.friendlyName !== n.number ? <span className="truncate text-xs text-text-secondary">{n.friendlyName}</span> : null}
          </div>
          {n.number === defaultSender ? <Badge variant="info">Default</Badge> : null}
        </div>
      ),
    },
    { key: "type", header: "Type", render: (n) => <Badge variant={TYPE_TONE[n.type] || "neutral"}>{TYPE_LABEL[n.type] || n.type}</Badge> },
    {
      key: "capabilities",
      header: "Capabilities",
      render: (n) => (
        <div className="flex flex-wrap gap-1">
          {(n.capabilities || []).map((c) => (
            <Badge key={c} variant="neutral">{c.toUpperCase()}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: "inbound",
      header: "Inbound",
      className: "whitespace-nowrap",
      render: (n) => (n.inbound ? <Badge variant="success">Routed to Geiger</Badge> : <Badge variant="neutral">Elsewhere</Badge>),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (n) =>
        pending === n.sid ? (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-text-secondary" />
        ) : (
          <ActionMenu
            label={`Actions for ${n.number}`}
            items={[
              canManage && (n.capabilities || []).includes("sms") && n.number !== defaultSender && { label: "Set as default", icon: Star, onSelect: () => makeDefault(n) },
              canManage && !n.inbound && { label: "Route replies to Geiger", icon: Webhook, onSelect: () => routeInbound(n) },
              { label: "Copy number", icon: Copy, onSelect: () => copyText(n.number, "Number copied") },
            ]}
          />
        ),
    },
  ];

  return (
    <MainScreenWrapper>
      {header}
      <StatsBar stats={stats} />

      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
              <Smartphone className="h-5 w-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-medium text-foreground">
                {connection.name || "Twilio"} <StatusPill status={connection.status} map={CONNECTION_STATUS_MAP} />
                {trial ? <Badge variant="warning">Trial</Badge> : null}
              </span>
              <span className="truncate font-mono text-xs text-text-secondary">{connection.externalId}</span>
              <span className="text-xs text-text-tertiary">
                {connection.health?.lastError || (trial ? "Trial accounts can only text numbers verified in Twilio." : `Checked ${formatRelative(connection.lastCheckedAt, now)}.`)}
              </span>
            </div>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={pending === "verify"} onClick={recheck}>
                {pending === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-check
              </Button>
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setConnectOpen(true)}>
                <KeyRound className="h-4 w-4" /> Credentials
              </Button>
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setDisconnectOpen(true)}>
                <Unplug className="h-4 w-4" /> Disconnect
              </Button>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <SectionCard title="SMS settings" contentClassName="space-y-4">
          <Field label="Default sender" hint="A number from the list, or a Twilio Messaging Service SID (MG…).">
            <Input value={draft.values.defaultSender} disabled={!canManage} onChange={(e) => draft.set({ defaultSender: e.target.value.trim() })} placeholder="+14155550142 or MG…" className="font-mono" />
          </Field>
          <Field label="Opt-out keywords" htmlFor="s-optout" hint="A reply that is exactly one of these records an SMS opt-out.">
            <Input id="s-optout" value={draft.values.optOutKeywords} disabled={!canManage} onChange={(e) => draft.set({ optOutKeywords: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opt-in keywords" htmlFor="s-optin">
              <Input id="s-optin" value={draft.values.optInKeywords} disabled={!canManage} onChange={(e) => draft.set({ optInKeywords: e.target.value })} />
            </Field>
            <Field label="Help keywords" htmlFor="s-help">
              <Input id="s-help" value={draft.values.helpKeywords} disabled={!canManage} onChange={(e) => draft.set({ helpKeywords: e.target.value })} />
            </Field>
          </div>
          <SettingsList>
            <SettingRow
              title="Keyword auto-replies"
              description="Turn off if Twilio Advanced Opt-Out already replies on your numbers."
              control={<Switch checked={draft.values.autoReply} disabled={!canManage} aria-label="Keyword auto-replies" onCheckedChange={(v) => draft.set({ autoReply: v })} />}
            />
          </SettingsList>
          {draft.values.autoReply ? (
            <div className="grid gap-3">
              <Field label="Opt-out reply" htmlFor="s-r-out">
                <Textarea id="s-r-out" rows={2} value={draft.values.optOutReply} disabled={!canManage} onChange={(e) => draft.set({ optOutReply: e.target.value })} />
              </Field>
              <Field label="Opt-in reply" htmlFor="s-r-in">
                <Textarea id="s-r-in" rows={2} value={draft.values.optInReply} disabled={!canManage} onChange={(e) => draft.set({ optInReply: e.target.value })} />
              </Field>
              <Field label="Help reply" htmlFor="s-r-help">
                <Textarea id="s-r-help" rows={2} value={draft.values.helpReply} disabled={!canManage} onChange={(e) => draft.set({ helpReply: e.target.value })} />
              </Field>
            </div>
          ) : null}
          <SettingsList>
            <SettingRow
              title="Opt-out notice on first message"
              description="Appended to the first SMS a number receives from you."
              control={<Switch checked={draft.values.appendOptOutNotice} disabled={!canManage} aria-label="Opt-out notice on first message" onCheckedChange={(v) => draft.set({ appendOptOutNotice: v })} />}
            />
          </SettingsList>
          {draft.values.appendOptOutNotice ? (
            <Field label="Notice" htmlFor="s-notice">
              <Input id="s-notice" value={draft.values.optOutNotice} disabled={!canManage} onChange={(e) => draft.set({ optOutNotice: e.target.value })} />
            </Field>
          ) : null}
          <DeliveryRulesFields values={draft.values} set={draft.set} disabled={!canManage} idPrefix="sms" />
          {canManage ? (
            <div className="flex justify-end">
              <SaveChangesButton dirty={draft.dirty} saving={draft.saving} onClick={draft.save} />
            </div>
          ) : null}
        </SectionCard>

        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Sender numbers</h2>
            <p className="text-xs text-text-secondary">Numbers and short codes on the Twilio account. Buy or port numbers in Twilio, then re-check.</p>
          </div>
          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
              <FilterDropdown value={inboundFilter} onValueChange={setInboundFilter} options={INBOUND_FILTER_OPTIONS} height="h-9" />
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search numbers…" />
          </Toolbar>
          <div className="space-y-5">
            <DataTable
              columns={columns}
              data={pager.pageItems}
              getRowKey={(n) => n.sid}
              empty={
                <ListEmptyState
                  icon={Smartphone}
                  filtersActive={filtersActive}
                  onClear={clearFilters}
                  title="No numbers on this account"
                  description="Buy an SMS-capable number in the Twilio console, then re-check the connection."
                />
              }
            />
            <ListPagination {...pager} itemLabel="numbers" />
          </div>

          <SectionCard title="Webhooks" description="Set automatically by “Route replies to Geiger”; copy them for Messaging Services.">
            <div className="grid gap-4">
              <CopyField label="Inbound messages" value={status?.urls?.twilioInbound} hint="Incoming SMS → inbox threads and STOP/START handling." />
              <CopyField label="Status callback" value={status?.urls?.twilioStatus} hint="Sent with every message; updates delivery status and cost." />
            </div>
          </SectionCard>
        </div>
      </div>

      <RecentDeliveries channel="sms" description="The latest SMS from every source." />
      {dialogs}
    </MainScreenWrapper>
  );
}

export default SmsScreen;
