"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, AtSign, Copy, Inbox, Link2, Loader2, Pause, Pencil, Play, Plus, RefreshCw, Send, Trash2, Workflow } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { createInboundRoute, listInboundRoutes, newRouteSecret, softDeleteInboundRoute, updateInboundRoute } from "@/lib/supabase/inbound_routes";
import {
  ActionMenu,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  InlineTitleInput,
  Input,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
  Switch,
  Toolbar,
} from "@geiger/ui";
import {
  CodeBlock,
  CopyField,
  DANGER_ICON_BUTTON,
  DeleteConfirmDialog,
  ListEmptyState,
  OUTLINE_BUTTON,
  SectionLoading,
  TRANSACTIONAL_MANAGE,
  ValueRow,
  copyText,
  formatDateTime,
  formatRelative,
  useChannelStatus,
  useNow,
} from "@/components/internal/screens/channels/channels_kit";

// Inbound email routing: each route has its own webhook URL that an inbound provider (Postmark, SendGrid
// Inbound Parse, Mailgun or any JSON forwarder) POSTs parsed mail to. Mail matching the recipient/subject
// patterns becomes an inbox conversation, is forwarded (signed) to your app, or tags the sender.

const ACTIONS = {
  create_conversation: { label: "Create inbox conversation", tone: "info", hint: "Threads the email into Inbox → Conversations; replies to a previous message join its thread." },
  forward_webhook: { label: "Forward to webhook", tone: "purple", hint: "POSTs the parsed email as signed JSON to your endpoint. A failed forward answers 502 so the provider retries." },
  tag_contact: { label: "Tag the sender", tone: "neutral", hint: "Finds or creates the sender as a contact and adds the tags." },
};

const STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
};

const ACTION_FILTER_OPTIONS = [{ value: "all", label: "All actions" }, ...Object.entries(ACTIONS).map(([value, a]) => ({ value, label: a.label }))];
const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_MAP).map(([value, s]) => ({ value, label: s.label }))];

const ROUTE_NAV = [
  { key: "matching", label: "Matching", icon: AtSign, desc: "Which incoming mail this route handles." },
  { key: "action", label: "Action", icon: Workflow, desc: "What happens to mail that matches." },
  { key: "setup", label: "Inbound URL", icon: Link2, desc: "Point your inbound email provider at this address." },
  { key: "activity", label: "Activity", icon: Activity, desc: "What arrived and how the last attempt went." },
];

const HTTPS = /^https:\/\/\S+$/i;
const parseTags = (text) => [...new Set(String(text || "").split(",").map((t) => t.trim()).filter(Boolean))];

const EMPTY_FORM = { name: "", matchRecipient: "", matchSubject: "", action: "create_conversation", webhookUrl: "", tags: "", includeAttachments: true };

const inboundUrl = (base, route) => (base && route.secretKey ? `${base}/${route.secretKey}` : "");

// Returns an error message, or null when the route can be saved.
function validate(form) {
  if (!form.name.trim()) return "Give the route a name.";
  if (form.action === "forward_webhook" && !HTTPS.test(form.webhookUrl.trim())) return "Forwarding needs an https:// webhook URL.";
  if (form.action === "tag_contact" && !parseTags(form.tags).length) return "Add at least one tag.";
  return null;
}

const configFrom = (form) => ({
  webhookUrl: form.action === "forward_webhook" ? form.webhookUrl.trim() : "",
  tags: form.action === "tag_contact" ? parseTags(form.tags) : [],
  includeAttachments: form.includeAttachments,
});

function ActionFields({ form, set, disabled, idPrefix }) {
  return (
    <div className="grid gap-4">
      <Field label="Action" hint={ACTIONS[form.action]?.hint}>
        <Select value={form.action} onValueChange={set("action")} disabled={disabled}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(ACTIONS).map(([value, a]) => <SelectItem key={value} value={value}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      {form.action === "forward_webhook" ? (
        <>
          <Field label="Webhook URL" htmlFor={`${idPrefix}-url`} hint="Must answer 2xx within 10 seconds.">
            <Input id={`${idPrefix}-url`} value={form.webhookUrl} disabled={disabled} onChange={(e) => set("webhookUrl")(e.target.value)} placeholder="https://api.yourapp.com/inbound" className="font-mono" />
          </Field>
          <SettingsList>
            <SettingRow
              title="Include attachments"
              description="Send attachment contents (base64) in the payload; off sends names and sizes only."
              control={<Switch checked={form.includeAttachments} disabled={disabled} aria-label="Include attachments" onCheckedChange={set("includeAttachments")} />}
            />
          </SettingsList>
        </>
      ) : null}
      {form.action === "tag_contact" ? (
        <Field label="Tags" htmlFor={`${idPrefix}-tags`} hint="Comma-separated. Added to the sender's contact.">
          <Input id={`${idPrefix}-tags`} value={form.tags} disabled={disabled} onChange={(e) => set("tags")(e.target.value)} placeholder="inbound, support" />
        </Field>
      ) : null}
    </div>
  );
}

function CreateRouteDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const error = validate(form);
    if (error) {
      toast.error(error);
      return;
    }
    setPending(true);
    const ok = await onCreate({
      name: form.name.trim(),
      matchRecipient: form.matchRecipient.trim(),
      matchSubject: form.matchSubject.trim(),
      action: form.action,
      config: configFrom(form),
    });
    setPending(false);
    if (ok) {
      setForm(EMPTY_FORM);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add route</DialogTitle>
          <DialogDescription>Each route gets its own inbound URL. Leave a pattern empty to match everything.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="r-name">
            <Input id="r-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Support inbox" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recipient pattern" htmlFor="r-to" hint="* is a wildcard.">
              <Input id="r-to" value={form.matchRecipient} onChange={(e) => set("matchRecipient")(e.target.value)} placeholder="support@*" className="font-mono" />
            </Field>
            <Field label="Subject pattern" htmlFor="r-subject" hint="Case-insensitive.">
              <Input id="r-subject" value={form.matchSubject} onChange={(e) => set("matchSubject")(e.target.value)} placeholder="*order*" className="font-mono" />
            </Field>
          </div>
          <ActionFields form={form} set={set} idPrefix="r" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !form.name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (r) => ({
  name: r.name,
  matchRecipient: r.matchRecipient,
  matchSubject: r.matchSubject,
  action: r.action,
  webhookUrl: r.config.webhookUrl || "",
  tags: (r.config.tags || []).join(", "),
  includeAttachments: r.config.includeAttachments !== false,
  active: r.status === "active",
});

const PROVIDERS = [
  ["Postmark", "Servers → your inbound stream → Settings → Webhook URL."],
  ["SendGrid", "Settings → Inbound Parse → Add host & URL (leave “POST the raw, full MIME message” off)."],
  ["Mailgun", "Receiving → Create route → Forward to this URL."],
  ["Anything else", "POST JSON with from, to, cc, subject, text, html and attachments."],
];

function RouteEditor({ record, canManage, inboundBase, now, testing, onBack, onSave, onDelete, onTest, onRotate }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const locked = !canManage;
  const url = inboundUrl(inboundBase, record);
  const last = record.lastResult;

  const save = async () => {
    const error = validate(draft);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    await onSave(record.id, {
      name: draft.name.trim(),
      matchRecipient: draft.matchRecipient.trim(),
      matchSubject: draft.matchSubject.trim(),
      action: draft.action,
      config: { ...record.config, ...configFrom(draft) },
      status: draft.active ? "active" : "paused",
    });
    setSaving(false);
  };

  const signatureSample = `// Forwarded requests carry X-Geiger-Signature: sha256=<hex> and X-Geiger-Route: ${record.id}
import crypto from "node:crypto";

export function verifyInbound(rawBody, header, routeSecret) {
  const expected = "sha256=" + crypto.createHmac("sha256", routeSecret).update(rawBody).digest("hex");
  return header?.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
// routeSecret = the last path segment of this route's inbound URL.`;

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Route name"
          placeholder="Untitled route"
          disabled={locked}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={draft.active ? "active" : "paused"}
      statusMap={STATUS_MAP}
      badges={
        <>
          <Badge variant={ACTIONS[draft.action]?.tone || "neutral"}>{ACTIONS[draft.action]?.label || draft.action}</Badge>
          <span className="text-xs text-text-tertiary">
            {record.receivedCount.toLocaleString("en-US")} received · last {formatRelative(record.lastReceivedAt, now).toLowerCase()}
          </span>
        </>
      }
      actions={
        <>
          {canManage ? (
            <Button variant="ghost" size="icon" aria-label="Delete route" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={dirty || testing} onClick={() => onTest(record)}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
        </>
      }
      nav={ROUTE_NAV}
      defaultSection="matching"
    >
      {({ active }) => (
        <>
          {active === "matching" ? (
            <SectionCard bare title="Match patterns" description="The recipient and subject patterns incoming mail must match, and whether the route is on.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Recipient pattern" htmlFor="re-to" hint="Matched against To and Cc. * is a wildcard; empty matches any recipient.">
                  <Input id="re-to" value={draft.matchRecipient} disabled={locked} onChange={(e) => set("matchRecipient")(e.target.value)} placeholder="support@*" className="font-mono" />
                </Field>
                <Field label="Subject pattern" htmlFor="re-subject" hint="Case-insensitive, * wildcards; empty matches any subject.">
                  <Input id="re-subject" value={draft.matchSubject} disabled={locked} onChange={(e) => set("matchSubject")(e.target.value)} placeholder="*order*" className="font-mono" />
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Route active"
                  description="Paused routes answer 200 to the provider but don't run their action."
                  control={<Switch checked={draft.active} disabled={locked} aria-label="Route active" onCheckedChange={set("active")} />}
                />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "action" ? (
            <SectionCard bare title="Handling" description="Where matching mail goes and what's done with it.">
              <ActionFields form={draft} set={set} disabled={locked} idPrefix="re" />
            </SectionCard>
          ) : null}

          {active === "setup" ? (
            <div className="space-y-4">
              <SectionCard contentClassName="space-y-4">
                <CopyField label="Inbound URL" value={url} hint="The secret at the end is the route's address — treat it like a password." htmlFor="re-inbound-url" />
                <div className="divide-y divide-border rounded-lg border border-border">
                  {PROVIDERS.map(([name, how]) => (
                    <div key={name} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <span className="text-sm font-medium text-foreground">{name}</span>
                      <span className="text-xs text-text-secondary sm:text-right">{how}</span>
                    </div>
                  ))}
                </div>
                {canManage ? (
                  <SettingsList>
                    <SettingRow
                      title="Rotate address"
                      description="Issue a new secret. The current URL stops accepting mail immediately."
                      control={
                        <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={dirty} onClick={() => onRotate(record)}>
                          <RefreshCw className="h-3.5 w-3.5" /> Rotate
                        </Button>
                      }
                    />
                  </SettingsList>
                ) : null}
              </SectionCard>
              {draft.action === "forward_webhook" ? (
                <SectionCard title="Verify forwarded requests" description="The body is an email.received event with the parsed message.">
                  <CodeBlock label="verification code">{signatureSample}</CodeBlock>
                </SectionCard>
              ) : null}
            </div>
          ) : null}

          {active === "activity" ? (
            <SectionCard bare title="Delivery summary" description="How much mail this route has received and how the last attempt went.">
              <SettingsList>
                <ValueRow title="Received" description="Emails delivered to this route's URL (tests excluded)." value={record.receivedCount.toLocaleString("en-US")} />
                <ValueRow title="Last received" description="The most recent real email." value={record.lastReceivedAt ? formatDateTime(record.lastReceivedAt) : "Never"} />
                <SettingRow
                  title="Last attempt"
                  description={last ? `${last.test ? "Test" : "Email"} from ${last.from || "unknown"} · ${last.subject || "no subject"}` : "Nothing has arrived yet. Send a test to check the action."}
                  control={
                    last ? (
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={last.ok ? "success" : "danger"}>{last.ok ? "Succeeded" : "Failed"}</Badge>
                        <span className="text-xs text-text-tertiary">{formatRelative(last.at, now)}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-text-secondary">—</span>
                    )
                  }
                />
                {last?.error ? <SettingRow title="Error" description="From the last attempt." control={<span className="max-w-[320px] text-right text-sm text-red-600 dark:text-red-400">{last.error}</span>} /> : null}
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function InboundRoutingScreen() {
  const { projectId, recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const { status } = useChannelStatus();
  const canManage = useCan(TRANSACTIONAL_MANAGE);
  const now = useNow();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rotateTarget, setRotateTarget] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const inboundBase = status?.urls?.inboundEmail || "";

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listInboundRoutes(projectId).then((rows) => {
      if (!alive) return;
      setRoutes(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return routes.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !`${r.name} ${r.matchRecipient} ${r.matchSubject} ${r.config.webhookUrl || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [routes, query, actionFilter, statusFilter]);

  const stats = useMemo(() => {
    const received = routes.reduce((sum, r) => sum + r.receivedCount, 0);
    const latest = routes.map((r) => r.lastReceivedAt).filter(Boolean).sort().pop();
    const failing = routes.filter((r) => r.lastResult && !r.lastResult.ok).length;
    return [
      { label: "Routes", value: routes.length.toLocaleString("en-US"), footer: `${routes.filter((r) => r.status === "active").length} active` },
      { label: "Received", value: received.toLocaleString("en-US"), footer: "emails, all time" },
      { label: "Last email", value: latest ? formatRelative(latest, now) : "Never", footer: latest ? formatDateTime(latest) : "nothing received yet" },
      { label: "Failing", value: failing.toLocaleString("en-US"), footer: "last attempt failed" },
    ];
  }, [routes, now]);

  const pager = usePagination(filtered, { resetKey: `${query}|${actionFilter}|${statusFilter}` });
  const replace = (row) => setRoutes((prev) => prev.map((r) => (r.id === row.id ? row : r)));

  const handleCreate = async (input) => {
    const user = await getUser();
    const optimistic = { id: crypto.randomUUID(), ...input, status: "active", secretKey: newRouteSecret(), createdBy: user?.id || null };
    setRoutes((prev) => [{ ...optimistic, receivedCount: 0, lastReceivedAt: null, lastResult: null, position: 0 }, ...prev]);
    const created = await createInboundRoute(projectId, optimistic);
    if (!created) {
      setRoutes((prev) => prev.filter((r) => r.id !== optimistic.id));
      toast.error("Couldn't add the route.");
      return false;
    }
    replace(created);
    openRecord(created.id);
    toast.success("Route added. Point your inbound provider at its URL.");
    return true;
  };

  const handleSave = async (id, patch) => {
    const previous = routes.find((r) => r.id === id);
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const saved = await updateInboundRoute(id, patch);
    if (!saved) {
      setRoutes((prev) => prev.map((r) => (r.id === id ? previous : r)));
      toast.error("Couldn't save the route.");
      return;
    }
    replace(saved);
    toast.success("Route saved.");
  };

  const setActive = async (r, active) => {
    const next = active ? "active" : "paused";
    setRoutes((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
    const saved = await updateInboundRoute(r.id, { status: next });
    if (!saved) {
      setRoutes((prev) => prev.map((x) => (x.id === r.id ? r : x)));
      toast.error("Couldn't change the route.");
      return;
    }
    replace(saved);
    toast.success(`“${r.name}” ${active ? "resumed" : "paused"}.`);
  };

  // Copies start paused with their own URL, so nothing changes until the provider is pointed at it.
  const handleDuplicate = async (r) => {
    const copy = { id: crypto.randomUUID(), name: `${r.name} (copy)`, matchRecipient: r.matchRecipient, matchSubject: r.matchSubject, action: r.action, config: r.config, status: "paused", secretKey: newRouteSecret() };
    setRoutes((prev) => [{ ...copy, receivedCount: 0, lastReceivedAt: null, lastResult: null }, ...prev]);
    const created = await createInboundRoute(projectId, copy);
    if (!created) {
      setRoutes((prev) => prev.filter((x) => x.id !== copy.id));
      toast.error("Couldn't duplicate the route.");
      return;
    }
    replace(created);
    toast.success("Route duplicated as paused, with its own URL.");
  };

  const handleRotate = async (r) => {
    setRotateTarget(null);
    const saved = await updateInboundRoute(r.id, { secretKey: newRouteSecret() });
    if (!saved) {
      toast.error("Couldn't rotate the address.");
      return;
    }
    replace(saved);
    toast.success("New inbound URL issued. Update your provider.");
  };

  const handleDelete = async (r) => {
    setDeleteTarget(null);
    setRoutes((prev) => prev.filter((x) => x.id !== r.id));
    if (r.id === recordId) closeRecord();
    if (!(await softDeleteInboundRoute(r.id))) {
      setRoutes((prev) => [r, ...prev]);
      toast.error("Couldn't delete the route.");
      return;
    }
    toast.success(`Deleted “${r.name}”.`);
  };

  const handleTest = async (r) => {
    setTestingId(r.id);
    const res = await apiPost(`/api/projects/${projectId}/transactional/inbound/${r.id}/test`, {});
    setTestingId(null);
    if (!res.ok) return toast.error(res.error);
    const { result, email } = res.data;
    const fresh = await listInboundRoutes(projectId);
    if (fresh) setRoutes(fresh);
    if (!result.matched) return toast.error(`A sample to ${email.to} (“${email.subject}”) didn't match the patterns.`);
    if (!result.ok) return toast.error(result.error || "The action failed.");
    if (r.action === "forward_webhook") return toast.success(`Your endpoint answered HTTP ${result.status}.`);
    toast.success("The sample matched. Real mail will run the action; tests don't write contacts or threads.");
  };

  const dialogs = (
    <>
      <DeleteConfirmDialog
        target={deleteTarget}
        title="Delete route"
        name={deleteTarget?.name}
        description="Its inbound URL stops accepting mail. This can't be undone."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
      <Dialog open={!!rotateTarget} onOpenChange={(o) => !o && setRotateTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rotate inbound URL</DialogTitle>
            <DialogDescription>
              Mail sent to the current URL for <span className="font-medium text-foreground">{rotateTarget?.name}</span> will be rejected until your provider uses the new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRotateTarget(null)}>Cancel</Button>
            <Button onClick={() => handleRotate(rotateTarget)}>
              <RefreshCw className="h-4 w-4" /> Rotate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  const open = routes.find((r) => r.id === recordId);
  if (open) {
    return (
      <>
        <RouteEditor
          key={`${open.id}:${open.updatedAt}`}
          record={open}
          canManage={canManage}
          inboundBase={inboundBase}
          now={now}
          testing={testingId === open.id}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onTest={handleTest}
          onRotate={setRotateTarget}
        />
        {dialogs}
      </>
    );
  }

  const filtersActive = query || actionFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setActionFilter("all");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Route",
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Inbox className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{r.name}</span>
            <span className="truncate font-mono text-xs text-text-secondary">
              {r.matchRecipient || "any recipient"}
              {r.matchSubject ? ` · “${r.matchSubject}”` : ""}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (r) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Badge variant={ACTIONS[r.action]?.tone || "neutral"}>{ACTIONS[r.action]?.label || r.action}</Badge>
          {r.action === "forward_webhook" && r.config.webhookUrl ? <span className="max-w-[220px] truncate font-mono text-xs text-text-tertiary">{r.config.webhookUrl}</span> : null}
        </div>
      ),
    },
    { key: "received", header: "Received", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => r.receivedCount.toLocaleString("en-US") },
    { key: "last", header: "Last email", className: "whitespace-nowrap text-muted-foreground", render: (r) => formatRelative(r.lastReceivedAt, now) },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusPill status={r.status} map={STATUS_MAP} />
          {r.lastResult && !r.lastResult.ok ? <Badge variant="danger">Last failed</Badge> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        testingId === r.id ? (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-text-secondary" />
        ) : (
          <ActionMenu
            label={`Actions for ${r.name}`}
            items={[
              { label: canManage ? "Edit route" : "View route", icon: Pencil, onSelect: () => openRecord(r.id) },
              { label: "Copy inbound URL", icon: Copy, onSelect: () => copyText(inboundUrl(inboundBase, r), "Inbound URL copied") },
              canManage && { label: "Send test", icon: Send, onSelect: () => handleTest(r) },
              canManage && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(r) },
              canManage &&
                (r.status === "active"
                  ? { label: "Pause", icon: Pause, onSelect: () => setActive(r, false) }
                  : { label: "Resume", icon: Play, onSelect: () => setActive(r, true) }),
              canManage && { separator: true },
              canManage && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(r) },
            ]}
          />
        ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Inbound Routing"
        description="Turn incoming email into conversations, webhooks or contact tags."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add route
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={actionFilter} onValueChange={setActionFilter} options={ACTION_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search routes…" />
      </Toolbar>

      {loading ? (
        <SectionLoading label="Loading routes" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(r) => r.id}
            onRowClick={(r) => openRecord(r.id)}
            empty={
              <ListEmptyState
                icon={Inbox}
                filtersActive={filtersActive}
                onClear={clearFilters}
                title="No routes yet"
                description="Add a route, then point Postmark, SendGrid Inbound Parse or Mailgun at its URL."
                action={
                  canManage ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> Add route
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="routes" />
        </div>
      )}

      <CreateRouteDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {dialogs}
    </MainScreenWrapper>
  );
}

export default InboundRoutingScreen;
