"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, AppWindow, Trash2, TimerOff, Loader2, KeyRound, PlugZap, Copy, ArrowUpRight, Unplug } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import { apiDelete, apiPost } from "@/lib/api/client";
import { listContacts } from "@/lib/supabase/contacts";
import { normalizeConnection } from "@/lib/supabase/channel_connections";
import { expireInAppMessage, listInAppMessages, softDeleteInAppMessage } from "@/lib/supabase/in_app_messages";
import {
  Button,
  Checkbox,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
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
  CodeBlock,
  CopyField,
  DeleteConfirmDialog,
  DisconnectDialog,
  ListEmptyState,
  NotConnectedCard,
  OUTLINE_BUTTON,
  SectionLoading,
  copyText,
  formatDateTime,
  formatRelative,
  useChannelConnection,
  useChannelStatus,
  useNow,
} from "./channels_kit";

// In-app messaging: a per-contact inbox your product renders through the SDK endpoint. Messages are
// queued through dispatch (channel in_app); the SDK proves who the user is with an HMAC user hash
// computed by your server, so the public key alone can't read anyone's messages.

const STATUS_MAP = {
  unread: { label: "Unread", variant: "info" },
  read: { label: "Read", variant: "success" },
  dismissed: { label: "Dismissed", variant: "neutral" },
  expired: { label: "Expired", variant: "neutral" },
};
const FORMAT_LABEL = { inbox: "Inbox", banner: "Banner", modal: "Modal" };
const FORMAT_TONE = { inbox: "neutral", banner: "info", modal: "purple" };

const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_MAP).map(([value, s]) => ({ value, label: s.label }))];
const FORMAT_FILTER_OPTIONS = [{ value: "all", label: "All formats" }, ...Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label }))];

const EMPTY_FORM = { title: "", body: "", ctaLabel: "", ctaUrl: "", format: "inbox", expiresInDays: "14" };

function ComposeDialog({ open, onOpenChange, contacts, onSend }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => !q || `${c.name} ${c.email}`.toLowerCase().includes(q)).slice(0, 100);
  }, [contacts, search]);

  const toggle = (id, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Give the message a title.");
      return;
    }
    if (!selected.size) {
      toast.error("Pick at least one contact.");
      return;
    }
    if (form.ctaUrl && !/^https?:\/\//.test(form.ctaUrl.trim())) {
      toast.error("The button link must start with https://.");
      return;
    }
    setPending(true);
    const ok = await onSend({
      contactIds: Array.from(selected),
      title: form.title.trim(),
      body: form.body.trim(),
      format: form.format,
      cta: form.ctaUrl.trim() ? { label: form.ctaLabel.trim() || "Open", url: form.ctaUrl.trim() } : {},
      expiresInDays: Number(form.expiresInDays) || 0,
    });
    setPending(false);
    if (ok) {
      setForm(EMPTY_FORM);
      setSelected(new Set());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New in-app message</DialogTitle>
          <DialogDescription>Queued for each contact; your product shows it the next time the SDK fetches their messages.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-4">
            <Field label="Title" htmlFor="ia-title">
              <Input id="ia-title" value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="Your invoice is ready" autoFocus />
            </Field>
            <Field label="Message" htmlFor="ia-body">
              <Textarea id="ia-body" rows={4} value={form.body} onChange={(e) => set("body")(e.target.value)} placeholder="What should the user know?" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Button text" htmlFor="ia-cta">
                <Input id="ia-cta" value={form.ctaLabel} onChange={(e) => set("ctaLabel")(e.target.value)} placeholder="View invoice" />
              </Field>
              <Field label="Button link" htmlFor="ia-url">
                <Input id="ia-url" value={form.ctaUrl} onChange={(e) => set("ctaUrl")(e.target.value)} placeholder="https://" className="font-mono" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Format" hint="A hint for how your app renders it.">
                <Select value={form.format} onValueChange={set("format")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAT_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Expires after (days)" htmlFor="ia-exp" hint="0 keeps it until read.">
                <Input id="ia-exp" type="number" min={0} value={form.expiresInDays} onChange={(e) => set("expiresInDays")(e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <Field label={`Recipients · ${selected.size} selected`} htmlFor="ia-search">
              <Input id="ia-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts…" />
            </Field>
            <div className="max-h-72 min-h-40 overflow-y-auto rounded-lg border border-border bg-surface-card">
              {matches.length ? (
                matches.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-surface-hover">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={(on) => toggle(c.id, Boolean(on))} aria-label={`Select ${c.name}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{c.name}</span>
                      <span className="block truncate text-xs text-text-secondary">{c.email || c.phone}</span>
                    </span>
                  </label>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-sm text-text-secondary">No contacts match.</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !form.title.trim() || !selected.size}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Queue for {selected.size || 0} contact{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({ secret, onClose }) {
  return (
    <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy your identity secret</DialogTitle>
          <DialogDescription>This is the only time it&apos;s shown. Keep it on your server — it signs user hashes for the SDK.</DialogDescription>
        </DialogHeader>
        <div className="break-all rounded-lg border border-border bg-surface-card px-3 py-2.5 font-mono text-sm text-foreground">{secret}</div>
        <DialogFooter>
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => copyText(secret, "Secret copied")}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageSheet({ message, contact, onClose, onExpire, onDelete, canManage }) {
  const { openRecordInTab } = useWorkspaceUrl();
  const timeline = message
    ? [
        ["Queued", message.createdAt],
        ["Read", message.readAt],
        ["Clicked", message.clickedAt],
        ["Dismissed", message.dismissedAt],
        [message.status === "expired" ? "Expired" : "Expires", message.expiresAt],
      ].filter(([, at]) => at)
    : [];
  return (
    <Sheet open={Boolean(message)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full border-border bg-background sm:max-w-md">
        {message ? (
          <>
            <SheetHeader className="border-b border-border">
              <SheetTitle>{message.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <StatusPill status={message.status} map={STATUS_MAP} />
                <Badge variant={FORMAT_TONE[message.format]}>{FORMAT_LABEL[message.format]}</Badge>
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-4">
              <div className="rounded-lg border border-border bg-surface-subtle p-4 text-sm">
                <p className="font-medium text-foreground">{message.title}</p>
                {message.body ? <p className="mt-1 whitespace-pre-wrap text-text-secondary">{message.body}</p> : null}
                {message.cta?.url ? (
                  <p className="mt-3 text-xs text-text-secondary">
                    Button “{message.cta.label || "Open"}” → <span className="font-mono">{message.cta.url}</span>
                  </p>
                ) : null}
              </div>
              <SettingsList>
                <SettingRow title="Contact" control={<span className="text-sm text-foreground">{contact?.email || contact?.name || "—"}</span>} />
                {timeline.map(([label, at]) => (
                  <SettingRow key={label} title={label} control={<span className="text-sm tabular-nums text-muted-foreground">{formatDateTime(at)}</span>} />
                ))}
              </SettingsList>
              {message.deliveryId ? (
                <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => openRecordInTab(message.deliveryId, "Message Logs")}>
                  Delivery log <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            {canManage ? (
              <div className="flex justify-end gap-2 border-t border-border p-4">
                {message.status === "unread" ? (
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onExpire(message)}>
                    <TimerOff className="h-4 w-4" /> Withdraw
                  </Button>
                ) : null}
                <Button variant="outline" className="border-border bg-transparent text-red-600 hover:bg-red-500/10 dark:text-red-400" onClick={() => onDelete(message)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const serverSnippet = `// On your server: prove which user the page belongs to.
import { createHmac } from "node:crypto";

const userHash = createHmac("sha256", process.env.GEIGER_IN_APP_SECRET)
  .update(user.email.toLowerCase()) // or the Geiger contact id
  .digest("hex");`;

const clientSnippet = (url) => `// In your app: fetch the user's messages, then report reads and clicks.
const params = new URLSearchParams({ key: "gcp_…", user: user.email, hash: userHash });
const { messages, unread } = await fetch("${url || "/api/public/in-app/messages"}?" + params).then((r) => r.json());

await fetch("${url || "/api/public/in-app/messages"}/" + message.id, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "gcp_…", user: user.email, hash: userHash, action: "read" }), // or "click", "dismiss"
});`;

export function InAppScreen() {
  const { projectId, connection, setConnection, loading } = useChannelConnection("in_app");
  const { status } = useChannelStatus();
  const canManage = useCan(CHANNEL_MANAGE);
  const now = useNow();
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [issuedSecret, setIssuedSecret] = useState(null);
  const [pending, setPending] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listInAppMessages(projectId), listContacts(projectId, { limit: 2000 })]).then(([rows, people]) => {
      if (!alive) return;
      setMessages(rows ?? []);
      setContacts(people ?? []);
      setMessagesLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const enabled = connection?.status === "connected";
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (formatFilter !== "all" && m.format !== formatFilter) return false;
      const who = contactById.get(m.contactId);
      if (q && !`${m.title} ${m.body} ${who?.email || ""} ${who?.name || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [messages, query, statusFilter, formatFilter, contactById]);
  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${formatFilter}` });

  const stats = useMemo(() => {
    const count = (s) => messages.filter((m) => m.status === s).length;
    const seen = messages.filter((m) => m.readAt).length;
    const clicked = messages.filter((m) => m.clickedAt).length;
    const live = count("unread") + count("read") + count("dismissed");
    return [
      { label: "Waiting", value: count("unread").toLocaleString("en-US"), footer: "unread and not expired" },
      { label: "Read", value: seen.toLocaleString("en-US"), footer: live ? `${Math.round((seen / Math.max(1, messages.length)) * 100)}% of queued` : "nothing queued yet" },
      { label: "Clicked", value: clicked.toLocaleString("en-US"), footer: seen ? `${Math.round((clicked / seen) * 100)}% of read` : "no reads yet" },
      { label: "Expired", value: count("expired").toLocaleString("en-US"), footer: "withdrawn or past expiry" },
    ];
  }, [messages]);

  const enable = async (rotate = false) => {
    setPending(rotate ? "rotate" : "enable");
    const res = await apiPost(`/api/projects/${projectId}/channels/connect`, { channel: "in_app", rotate });
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    setConnection(normalizeConnection(res.data.connection));
    if (res.data.issuedSecret) setIssuedSecret(res.data.issuedSecret);
    toast.success(rotate ? "Identity secret rotated — update your server." : "In-app messaging enabled.");
  };

  const disconnect = async () => {
    setPending("disconnect");
    const res = await apiDelete(`/api/projects/${projectId}/channels/${connection.id}`);
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    setDisconnectOpen(false);
    setConnection(null);
    toast.success("In-app messaging disabled.");
  };

  const send = async (body) => {
    const res = await apiPost(`/api/projects/${projectId}/channels/in-app/messages`, body);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const rows = await listInAppMessages(projectId);
    if (rows) setMessages(rows);
    if (res.data.failed) toast.error(`Queued ${res.data.sent}; ${res.data.failed} failed: ${res.data.error}`);
    else toast.success(`Queued for ${res.data.sent} contact${res.data.sent === 1 ? "" : "s"}.`);
    return res.data.sent > 0;
  };

  const expire = async (m) => {
    const previous = messages;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "expired" } : x)));
    const saved = await expireInAppMessage(m.id);
    if (!saved) {
      setMessages(previous);
      return toast.error("Couldn't withdraw the message.");
    }
    setMessages((prev) => prev.map((x) => (x.id === m.id ? saved : x)));
    toast.success("Withdrawn — the SDK no longer returns it.");
  };

  const remove = async (m) => {
    setDeleteTarget(null);
    const previous = messages;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    if (m.id === recordId) closeRecord();
    if (!(await softDeleteInAppMessage(m.id))) {
      setMessages(previous);
      return toast.error("Couldn't delete the message.");
    }
    toast.success("Message deleted.");
  };

  const header = (
    <ScreenHeader
      title="In-App"
      description="A per-contact message inbox your product shows through the in-app SDK."
      actions={
        canManage && !loading ? (
          enabled ? (
            <Button onClick={() => setComposeOpen(true)}>
              <Plus className="h-4 w-4" /> New message
            </Button>
          ) : (
            <Button onClick={() => enable(false)} disabled={pending === "enable"}>
              {pending === "enable" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Enable in-app
            </Button>
          )
        ) : null
      }
    />
  );

  const dialogs = (
    <>
      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} contacts={contacts} onSend={send} />
      <SecretDialog secret={issuedSecret} onClose={() => setIssuedSecret(null)} />
      <DeleteConfirmDialog target={deleteTarget} title="Delete message" name={deleteTarget?.title} description="It disappears from the contact's inbox." onCancel={() => setDeleteTarget(null)} onConfirm={remove} />
      <DisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        name="in-app messaging"
        consequence="The SDK stops returning messages and the identity secret is deleted."
        pending={pending === "disconnect"}
        onConfirm={disconnect}
      />
    </>
  );

  if (loading) {
    return (
      <MainScreenWrapper>
        {header}
        <SectionLoading label="Loading in-app messaging" />
      </MainScreenWrapper>
    );
  }

  if (!enabled) {
    return (
      <MainScreenWrapper>
        {header}
        <NotConnectedCard
          icon={AppWindow}
          title="In-app messaging isn't enabled"
          description="Enabling it creates an identity secret for your server. Your app then fetches each signed-in user's messages from the SDK endpoint."
          action={
            canManage ? (
              <Button onClick={() => enable(false)} disabled={pending === "enable"}>
                {pending === "enable" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Enable in-app
              </Button>
            ) : null
          }
        />
        {dialogs}
      </MainScreenWrapper>
    );
  }

  const filtersActive = query || statusFilter !== "all" || formatFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setFormatFilter("all");
  };
  const openMessage = messages.find((m) => m.id === recordId) || null;

  const columns = [
    {
      key: "message",
      header: "Message",
      render: (m) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <AppWindow className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{m.title}</span>
            <span className="max-w-xs truncate text-xs text-text-secondary">{m.body || "—"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      className: "text-muted-foreground",
      render: (m) => contactById.get(m.contactId)?.email || contactById.get(m.contactId)?.name || "—",
    },
    { key: "format", header: "Format", render: (m) => <Badge variant={FORMAT_TONE[m.format]}>{FORMAT_LABEL[m.format]}</Badge> },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (m) => <StatusPill status={m.status} map={STATUS_MAP} /> },
    { key: "queued", header: "Queued", className: "whitespace-nowrap text-muted-foreground", render: (m) => formatRelative(m.createdAt, now) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (m) => (
        <ActionMenu
          label={`Actions for ${m.title}`}
          items={[
            { label: "View", icon: AppWindow, onSelect: () => openRecord(m.id) },
            canManage && m.status === "unread" && { label: "Withdraw", icon: TimerOff, onSelect: () => expire(m) },
            canManage && { separator: true },
            canManage && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(m) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      {header}
      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={formatFilter} onValueChange={setFormatFilter} options={FORMAT_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search messages or contacts…" />
      </Toolbar>

      {messagesLoading ? (
        <SectionLoading label="Loading messages" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(m) => m.id}
            onRowClick={(m) => openRecord(m.id)}
            empty={
              <ListEmptyState
                icon={AppWindow}
                filtersActive={filtersActive}
                onClear={clearFilters}
                title="No in-app messages yet"
                description="Queue one for selected contacts, or send on the in-app channel from campaigns and automations."
                action={
                  canManage ? (
                    <Button onClick={() => setComposeOpen(true)}>
                      <Plus className="h-4 w-4" /> New message
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="messages" />
        </div>
      )}

      <SectionCard
        bare
        title="Connect your app"
        description="Your server signs each user with the identity secret; your app reads and reports through the SDK endpoint with your public key."
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={pending === "rotate"} onClick={() => enable(true)}>
                {pending === "rotate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Rotate secret
              </Button>
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setDisconnectOpen(true)}>
                <Unplug className="h-4 w-4" /> Disable
              </Button>
            </div>
          ) : null
        }
      >
        <div className="grid gap-4">
          <CopyField label="SDK endpoint" value={status?.urls?.inAppMessages} hint="GET with ?key=&user=&hash=; POST /<message id> with an action." />
          <div className="grid gap-4 xl:grid-cols-2">
            <CodeBlock label="server snippet">{serverSnippet}</CodeBlock>
            <CodeBlock label="client snippet">{clientSnippet(status?.urls?.inAppMessages)}</CodeBlock>
          </div>
        </div>
      </SectionCard>

      <MessageSheet
        message={openMessage}
        contact={openMessage ? contactById.get(openMessage.contactId) : null}
        canManage={canManage}
        onClose={closeRecord}
        onExpire={expire}
        onDelete={setDeleteTarget}
      />
      {dialogs}
    </MainScreenWrapper>
  );
}

export default InAppScreen;
