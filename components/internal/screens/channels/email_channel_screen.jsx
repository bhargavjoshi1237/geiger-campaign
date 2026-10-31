"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Mail, Star, Pencil, Send, Trash2, FileText, ShieldCheck, Loader2, RefreshCw, ArrowUpRight } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { mergeConnectionMeta, normalizeConnection } from "@/lib/supabase/channel_connections";
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
  InlineTitleInput,
} from "@geiger/ui";
import {
  CHANNEL_MANAGE,
  CONNECTION_STATUS_MAP,
  DANGER_ICON_BUTTON,
  DeleteConfirmDialog,
  DeliveryRulesFields,
  ListEmptyState,
  OUTLINE_BUTTON,
  RecentDeliveries,
  SaveChangesButton,
  SectionLoading,
  deliveryStats,
  formatDate,
  formatRelative,
  useChannelConnection,
  useChannelStatus,
  useNow,
  useSettingsDraft,
} from "./channels_kit";

// Email channel: delivery always leaves through Geiger Dash's API, so this screen owns the sender
// identities (from name/address), the default sender and delivery rules. A sender counts as verified
// once a test send from it was accepted — Dash rejects addresses on domains it can't send for.

const SENDER_STATUS_MAP = {
  verified: { label: "Verified", variant: "success" },
  failed: { label: "Rejected", variant: "danger" },
  untested: { label: "Untested", variant: "neutral" },
};

const SENDER_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(SENDER_STATUS_MAP).map(([value, s]) => ({ value, label: s.label })),
];

const SENDER_NAV = [
  { key: "identity", label: "Identity", icon: FileText, desc: "The name and address recipients see." },
  { key: "verification", label: "Verification", icon: ShieldCheck, desc: "Send a test to prove the address can send." },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_FORM = { fromName: "", email: "" };
const domainOf = (email) => String(email || "").split("@")[1] || "";

function AddSenderDialog({ open, onOpenChange, onCreate, existing }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const email = form.email.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      toast.error("Enter a valid from address.");
      return;
    }
    if (existing.some((s) => s.email === email)) {
      toast.error("That address is already a sender.");
      return;
    }
    onCreate({ fromName: form.fromName.trim(), email });
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add sender identity</DialogTitle>
          <DialogDescription>The domain must be one Geiger Dash can send for. Send a test from the sender to confirm it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="From name" htmlFor="s-name">
            <Input id="s-name" value={form.fromName} onChange={(e) => set("fromName")(e.target.value)} placeholder="e.g. Halcyon Studio" autoFocus />
          </Field>
          <Field label="From address" htmlFor="s-email">
            <Input
              id="s-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. hello@halcyon.studio"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.email.trim()}>Add sender</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestSendDialog({ sender, onOpenChange, onSend, defaultTo }) {
  const [to, setTo] = useState(defaultTo || "");
  const [pending, setPending] = useState(false);
  const send = async () => {
    if (!EMAIL.test(to.trim())) {
      toast.error("Enter an email address to send the test to.");
      return;
    }
    setPending(true);
    const ok = await onSend(sender, to.trim());
    setPending(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={!!sender} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            Sends a short test from <span className="font-medium text-foreground">{sender?.email}</span> through Geiger Dash.
          </DialogDescription>
        </DialogHeader>
        <Field label="Send to" htmlFor="t-to">
          <Input id="t-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@company.com" autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (s) => ({ fromName: s.fromName || "", email: s.email || "" });

function SenderEditor({ record, isDefault, canManage, now, onBack, onSave, onDelete, onTest, onSetDefault }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const { setTab } = useWorkspaceUrl();

  const save = async () => {
    const email = draft.email.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      toast.error("A sender needs a valid from address.");
      return;
    }
    setSaving(true);
    await onSave(record.id, { fromName: draft.fromName.trim(), email });
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.fromName}
          onChange={(e) => set("fromName")(e.target.value)}
          aria-label="From name"
          placeholder={record.email}
          disabled={!canManage}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.verification}
      statusMap={SENDER_STATUS_MAP}
      badges={
        <>
          {isDefault ? <Badge variant="info">Default</Badge> : null}
          <span className="font-mono text-xs text-text-tertiary">{record.email}</span>
          <span className="text-xs text-text-tertiary">· Added {formatDate(record.createdAt)}</span>
        </>
      }
      actions={
        canManage ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Remove sender" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={SENDER_NAV}
      defaultSection="identity"
    >
      {({ active }) => (
        <>
          {active === "identity" ? (
            <SectionCard bare title="From details" description="How this sender appears in recipients' inboxes.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From name" htmlFor="se-name" hint="Shown in the recipient's inbox next to the subject.">
                  <Input id="se-name" value={draft.fromName} disabled={!canManage} onChange={(e) => set("fromName")(e.target.value)} placeholder="e.g. Halcyon Studio" />
                </Field>
                <Field label="From address" htmlFor="se-email" hint="Changing it resets verification until the next test.">
                  <Input id="se-email" type="email" value={draft.email} disabled={!canManage} onChange={(e) => set("email")(e.target.value)} placeholder="e.g. hello@halcyon.studio" />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "verification" ? (
            <SectionCard bare title="Test & default" description="Prove the address can send, check its domain and choose the default sender.">
              <SettingsList>
                <SettingRow
                  title="Last test"
                  description={
                    record.lastTest
                      ? record.verification === "failed"
                        ? `Rejected ${formatRelative(record.lastTest.createdAt, now)}: ${record.lastTest.error || "the provider refused the sender."}`
                        : `Accepted ${formatRelative(record.lastTest.createdAt, now)} — this address can send.`
                      : "No test has been sent from this address yet."
                  }
                  control={<StatusPill status={record.verification} map={SENDER_STATUS_MAP} />}
                />
                <SettingRow
                  title="Send test"
                  description="A real email through Geiger Dash, logged under Message Logs."
                  control={
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={!canManage || dirty} onClick={() => onTest(record)}>
                      <Send className="h-4 w-4" /> Send test
                    </Button>
                  }
                />
                <SettingRow
                  title="Sending domain"
                  description={`SPF, DKIM and DMARC for ${domainOf(record.email)} are checked under Deliverability.`}
                  control={
                    <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => setTab("Sending Domains")}>
                      Sending domains <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
                <SettingRow
                  title="Default sender"
                  description="Campaigns and transactional email send from the default unless they set their own."
                  control={
                    isDefault ? (
                      <Badge variant="info">Default</Badge>
                    ) : (
                      <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={!canManage} onClick={() => onSetDefault(record)}>
                        <Star className="h-4 w-4" /> Make default
                      </Button>
                    )
                  }
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function EmailChannelScreen() {
  const { projectId, connection, setConnection, loading } = useChannelConnection("email");
  const { status } = useChannelStatus();
  const canManage = useCan(CHANNEL_MANAGE);
  const now = useNow();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [testTarget, setTestTarget] = useState(null);
  const [tests, setTests] = useState([]);
  const [recent, setRecent] = useState([]);
  const [setupPending, setSetupPending] = useState(false);
  const [myEmail, setMyEmail] = useState("");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    const since = new Date(now - 30 * 86_400_000).toISOString();
    Promise.all([
      listDeliveries(projectId, { channel: "email", sourceType: "test", limit: 300 }),
      listDeliveries(projectId, { channel: "email", since, limit: 5000 }),
    ]).then(([testRows, recentRows]) => {
      if (!alive) return;
      setTests(testRows ?? []);
      setRecent(recentRows ?? []);
    });
    getUser().then((u) => alive && setMyEmail(u?.email || ""));
    return () => {
      alive = false;
    };
  }, [projectId, now]);

  const settings = useMemo(() => channelSettings(connection, "email"), [connection]);
  const rawSenders = useMemo(() => (Array.isArray(connection?.senders) ? connection.senders : []), [connection]);

  // Each sender's verification is its latest test delivery (newest first from the data layer).
  const senders = useMemo(
    () =>
      rawSenders.map((s) => {
        const lastTest = tests.find((d) => d.senderId === s.id && (d.from || "").toLowerCase() === s.email) || null;
        const verification = !lastTest ? "untested" : ["failed", "bounced", "not_sent"].includes(lastTest.status) ? "failed" : "verified";
        return { ...s, lastTest, verification };
      }),
    [rawSenders, tests],
  );

  const defaultSenderId = settings.defaultSender || senders.find((s) => s.isDefault)?.id || "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return senders.filter((s) => {
      if (statusFilter !== "all" && s.verification !== statusFilter) return false;
      if (q && !`${s.fromName} ${s.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [senders, query, statusFilter]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}` });
  const stats = useMemo(() => deliveryStats(recent), [recent]);

  // The email connection row holds senders + settings; create it on first use.
  const ensureConnection = async () => {
    if (connection) return connection;
    const res = await apiPost(`/api/projects/${projectId}/channels/connect`, { channel: "email" });
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    const next = normalizeConnection(res.data.connection);
    setConnection(next);
    return next;
  };

  const setupEmail = async () => {
    setSetupPending(true);
    const res = connection
      ? await apiPost(`/api/projects/${projectId}/channels/${connection.id}/verify`, {})
      : await apiPost(`/api/projects/${projectId}/channels/connect`, { channel: "email" });
    setSetupPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setConnection(normalizeConnection(res.data.connection));
    toast.success(res.data.connection.status === "connected" ? "Email delivery is ready." : "Saved — email delivery still isn't configured.");
  };

  // Optimistic sender list write through merge_meta; rolls back on failure.
  const persistSenders = async (next, patch = {}, message) => {
    const conn = await ensureConnection();
    if (!conn) return false;
    const previous = conn;
    setConnection({ ...conn, senders: next, ...(patch.settings ? { settings: patch.settings } : {}) });
    const merged = await mergeConnectionMeta(conn.id, { senders: next, ...patch });
    if (!merged) {
      setConnection(previous);
      toast.error("Couldn't save the sender.");
      return false;
    }
    if (message) toast.success(message);
    return true;
  };

  const strip = (list) => list.map(({ id, fromName, email, isDefault, createdAt }) => ({ id, fromName, email, isDefault: Boolean(isDefault), createdAt }));

  const handleCreate = async (s) => {
    const id = crypto.randomUUID();
    const first = rawSenders.length === 0;
    const next = [...strip(rawSenders), { id, ...s, isDefault: first, createdAt: new Date().toISOString() }];
    const patch = first ? { settings: { ...(connection?.settings || {}), defaultSender: id } } : {};
    if (await persistSenders(next, patch, `Added ${s.email}. Send a test to verify it.`)) openRecord(id);
  };

  const handleSave = async (id, patch) => {
    await persistSenders(strip(rawSenders).map((s) => (s.id === id ? { ...s, ...patch } : s)), {}, "Sender saved.");
  };

  const makeDefault = async (s) => {
    const next = strip(rawSenders).map((x) => ({ ...x, isDefault: x.id === s.id }));
    await persistSenders(next, { settings: { ...(connection?.settings || {}), defaultSender: s.id } }, `${s.email} is now the default sender.`);
  };

  const handleDelete = async (s) => {
    setDeleteTarget(null);
    const remaining = strip(rawSenders).filter((x) => x.id !== s.id);
    const nextDefault = defaultSenderId === s.id ? remaining[0]?.id || "" : defaultSenderId;
    const next = remaining.map((x) => ({ ...x, isDefault: x.id === nextDefault }));
    if (await persistSenders(next, { settings: { ...(connection?.settings || {}), defaultSender: nextDefault } }, `Removed ${s.email}.`)) {
      if (s.id === recordId) closeRecord();
    }
  };

  const sendTest = async (sender, to) => {
    const conn = await ensureConnection();
    if (!conn) return false;
    const res = await apiPost(`/api/projects/${projectId}/channels/${conn.id}/test`, { to, senderId: sender.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const delivery = {
      id: res.data.deliveryId,
      status: res.data.status,
      error: res.data.error,
      senderId: sender.id,
      from: sender.email,
      createdAt: new Date().toISOString(),
    };
    setTests((prev) => [delivery, ...prev]);
    if (res.data.status === "sent") toast.success(`Test sent to ${to}.`);
    else toast.error(res.data.error || "The test wasn't sent.");
    return true;
  };

  const draft = useSettingsDraft(
    { defaultSender: defaultSenderId, quietHours: settings.quietHours, frequencyCap: settings.frequencyCap },
    async (values) => {
      const conn = await ensureConnection();
      if (!conn) return false;
      const nextSettings = { ...(conn.settings || {}), ...values };
      const next = strip(rawSenders).map((s) => ({ ...s, isDefault: s.id === values.defaultSender }));
      const merged = await mergeConnectionMeta(conn.id, { settings: nextSettings, senders: next });
      if (!merged) {
        toast.error("Couldn't save the email settings.");
        return false;
      }
      setConnection({ ...conn, settings: nextSettings, senders: next });
      toast.success("Email settings saved.");
      return true;
    },
  );

  const deleteDialog = (
    <DeleteConfirmDialog
      target={deleteTarget}
      title="Remove sender"
      name={deleteTarget?.email}
      confirmLabel="Remove"
      description="Campaigns that name it fall back to the default sender."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );
  const testDialog = (
    <TestSendDialog key={testTarget?.id || "none"} sender={testTarget} defaultTo={myEmail} onOpenChange={(o) => !o && setTestTarget(null)} onSend={sendTest} />
  );

  const open = senders.find((s) => s.id === recordId);
  if (open) {
    return (
      <>
        <SenderEditor
          key={`${open.id}:${open.email}:${open.fromName}`}
          record={open}
          isDefault={open.id === defaultSenderId}
          canManage={canManage}
          now={now}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onTest={setTestTarget}
          onSetDefault={makeDefault}
        />
        {deleteDialog}
        {testDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };
  const emailConfigured = status?.email?.configured;

  const columns = [
    {
      key: "identity",
      header: "Identity",
      render: (s) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Mail className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{s.fromName || s.email}</span>
            <span className="truncate text-xs text-text-secondary">{s.email}</span>
          </div>
          {s.id === defaultSenderId ? <Badge variant="info">Default</Badge> : null}
        </div>
      ),
    },
    { key: "domain", header: "Domain", className: "whitespace-nowrap font-mono text-xs text-muted-foreground", render: (s) => domainOf(s.email) },
    { key: "status", header: "Verification", className: "whitespace-nowrap", render: (s) => <StatusPill status={s.verification} map={SENDER_STATUS_MAP} /> },
    { key: "tested", header: "Last test", className: "whitespace-nowrap text-muted-foreground", render: (s) => (s.lastTest ? formatRelative(s.lastTest.createdAt, now) : "—") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <ActionMenu
          label={`Actions for ${s.email}`}
          items={[
            { label: "Edit sender", icon: Pencil, onSelect: () => openRecord(s.id) },
            canManage && { label: "Send test", icon: Send, onSelect: () => setTestTarget(s) },
            canManage && s.id !== defaultSenderId && { label: "Set as default", icon: Star, onSelect: () => makeDefault(s) },
            canManage && { separator: true },
            canManage && { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(s) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Email"
        description="Sender identities, the default sender and delivery rules for email sent through Geiger Dash."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add sender
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <SectionCard>
        <SettingsList>
          <SettingRow
            title="Geiger Dash email API"
            description={
              status
                ? emailConfigured
                  ? `Email leaves through ${status.email.apiHost} with its send log and Resend account.`
                  : "GEIGER_EMAIL_API_KEY isn't set on this deployment, so email can't be sent. Add a Dash API key to the environment."
                : "Checking the deployment…"
            }
            control={
              status ? (
                <Badge variant={emailConfigured ? "success" : "warning"}>{emailConfigured ? "Configured" : "Not configured"}</Badge>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
              )
            }
          />
          <SettingRow
            title="Email channel"
            description={
              connection
                ? connection.health?.lastError || `Last checked ${formatRelative(connection.lastCheckedAt, now)}.`
                : "Not set up for this project yet — senders and settings are stored on the channel."
            }
            control={
              <div className="flex items-center gap-2">
                {connection ? <StatusPill status={connection.status} map={CONNECTION_STATUS_MAP} /> : null}
                {canManage ? (
                  <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={setupPending} onClick={setupEmail}>
                    {setupPending ? <Loader2 className="h-4 w-4 animate-spin" /> : connection ? <RefreshCw className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {connection ? "Re-check" : "Set up email"}
                  </Button>
                ) : null}
              </div>
            }
          />
        </SettingsList>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <SectionCard title="Sending defaults" contentClassName="space-y-4">
          <Field label="Default sender" hint="Used when a campaign or template doesn't set its own from address.">
            <Select value={draft.values.defaultSender || undefined} onValueChange={(v) => draft.set({ defaultSender: v })} disabled={!canManage || !senders.length}>
              <SelectTrigger className="w-full"><SelectValue placeholder={senders.length ? "Choose a sender" : "Add a sender first"} /></SelectTrigger>
              <SelectContent>
                {senders.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.fromName ? `${s.fromName} <${s.email}>` : s.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DeliveryRulesFields values={draft.values} set={draft.set} disabled={!canManage} idPrefix="email" />
          {canManage ? (
            <div className="flex justify-end">
              <SaveChangesButton dirty={draft.dirty} saving={draft.saving} onClick={draft.save} />
            </div>
          ) : null}
        </SectionCard>

        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Sender identities</h2>
            <p className="text-xs text-text-secondary">Addresses your campaigns and transactional email can send from.</p>
          </div>
          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={SENDER_FILTER_OPTIONS} height="h-9" />
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search senders…" />
          </Toolbar>
          {loading ? (
            <SectionLoading label="Loading senders" />
          ) : (
            <div className="space-y-5">
              <DataTable
                columns={columns}
                data={pager.pageItems}
                getRowKey={(s) => s.id}
                onRowClick={(s) => openRecord(s.id)}
                empty={
                  <ListEmptyState
                    icon={Mail}
                    filtersActive={filtersActive}
                    onClear={clearFilters}
                    title="No sender identities yet"
                    description="Add the address your email should come from, then send a test to verify it."
                    action={
                      canManage ? (
                        <Button onClick={() => setCreateOpen(true)}>
                          <Plus className="h-4 w-4" /> Add sender
                        </Button>
                      ) : null
                    }
                  />
                }
              />
              <ListPagination {...pager} itemLabel="senders" />
            </div>
          )}
        </div>
      </div>

      <RecentDeliveries channel="email" description="The latest email deliveries from every source." />

      <AddSenderDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} existing={rawSenders} />
      {deleteDialog}
      {testDialog}
    </MainScreenWrapper>
  );
}

export default EmailChannelScreen;
