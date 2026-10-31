"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Webhook,
  Eye,
  Send,
  Pause,
  Play,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Globe,
  Zap,
  Activity,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
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
  Checkbox,
  Label,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  StatsBar,
  StatusPill,
  SectionCard,
  SettingsList,
  SettingRow,
} from "@geiger/ui";

const EVENT_OPTIONS = [
  "email.sent",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "contact.created",
  "contact.unsubscribed",
];

const EVENT_DESCRIPTIONS = {
  "email.sent": "A message was accepted for delivery.",
  "email.opened": "A recipient opened a message.",
  "email.clicked": "A recipient clicked a tracked link.",
  "email.bounced": "The receiving server rejected a message.",
  "contact.created": "A contact was added to your audience.",
  "contact.unsubscribed": "A contact opted out of your emails.",
};

const API_VERSIONS = [
  { value: "2026-04-01", label: "2026-04-01 (latest)" },
  { value: "2025-11-15", label: "2025-11-15" },
  { value: "2025-06-30", label: "2025-06-30" },
];

const LATEST_VERSION = API_VERSIONS[0].value;

const STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Failing: { label: "Failing", variant: "danger" },
  Paused: { label: "Paused", variant: "warning" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.keys(STATUS_MAP).map((s) => ({ value: s, label: s })),
];

const EVENT_FILTER_OPTIONS = [
  { value: "all", label: "All events" },
  ...EVENT_OPTIONS.map((ev) => ({ value: ev, label: ev })),
];

const INITIAL = [
  { id: 1, url: "https://api.halcyon.studio/hooks/geiger", events: ["email.opened", "email.clicked", "contact.created"], status: "Active", lastDelivery: "2m ago" },
  { id: 2, url: "https://hooks.zapier.com/hooks/catch/8821/geiger", events: ["email.bounced", "contact.unsubscribed"], status: "Active", lastDelivery: "11m ago" },
  { id: 3, url: "https://events.dashly.app/ingest/v2", events: ["email.sent", "email.opened", "email.clicked", "contact.created"], status: "Failing", lastDelivery: "1h ago" },
  { id: 4, url: "https://crm.northstar.co/api/webhooks/email", events: ["contact.created", "contact.unsubscribed"], status: "Paused", lastDelivery: "3d ago" },
  { id: 5, url: "https://analytics.brightloop.io/collect", events: ["email.clicked"], status: "Active", lastDelivery: "just now" },
];

const WEBHOOK_NAV = [
  { key: "endpoint", label: "Endpoint", icon: Globe, desc: "Where we POST events and which payload version to send." },
  { key: "events", label: "Events", icon: Zap, desc: "The events this endpoint is subscribed to." },
  { key: "delivery", label: "Delivery", icon: Activity, desc: "Delivery status, recent activity, and test events." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

// Short label for an endpoint: its host, or the raw text while the URL is incomplete.
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url.trim() || "Untitled webhook";
  }
}

// Keeps subscribed events in catalogue order.
const toggleIn = (events, ev, on) => (on ? EVENT_OPTIONS.filter((e) => e === ev || events.includes(e)) : events.filter((e) => e !== ev));

function AddWebhookDialog({ open, onOpenChange, onCreate }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState(["email.opened"]);
  const [version, setVersion] = useState(LATEST_VERSION);

  const submit = () => {
    if (!url.trim()) {
      toast.error("Add an endpoint URL first.");
      return;
    }
    if (!events.length) {
      toast.error("Subscribe to at least one event.");
      return;
    }
    onCreate({ url: url.trim(), events, version, status: "Active", lastDelivery: "Never" });
    setUrl("");
    setEvents(["email.opened"]);
    setVersion(LATEST_VERSION);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add webhook</DialogTitle>
          <DialogDescription>We will POST a signed JSON payload to this endpoint when subscribed events fire.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Endpoint URL" htmlFor="w-url">
            <Input
              id="w-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="https://api.yourapp.com/webhooks/geiger"
              className="font-mono text-sm"
              autoFocus
            />
          </Field>
          <Field label="Events">
            <div className="space-y-2 rounded-lg border border-border bg-surface-card p-3">
              {EVENT_OPTIONS.map((ev) => (
                <Label key={ev} htmlFor={`ev-${ev}`} className="cursor-pointer gap-2.5 font-normal">
                  <Checkbox id={`ev-${ev}`} checked={events.includes(ev)} onCheckedChange={(c) => setEvents((p) => toggleIn(p, ev, c === true))} />
                  <span className="font-mono text-sm text-muted-foreground">{ev}</span>
                </Label>
              ))}
            </div>
          </Field>
          <Field label="API version">
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {API_VERSIONS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!url.trim()}>Add webhook</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a webhook row; compared against the row to derive dirty state.
const toDraft = (w) => ({
  url: w.url,
  events: w.events,
  version: w.version ?? LATEST_VERSION,
  paused: w.status === "Paused",
});

function WebhookEditor({ record, defaultSection, onBack, onSave, onSendTest, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));

  // Pausing wins; un-pausing returns to Active, otherwise the pipeline's status stands.
  const status = draft.paused ? "Paused" : record.status === "Paused" ? "Active" : record.status;

  const save = () => {
    if (!draft.url.trim()) {
      toast.error("A webhook needs an endpoint URL.");
      return;
    }
    if (!draft.events.length) {
      toast.error("Subscribe to at least one event.");
      return;
    }
    const patch = { url: draft.url.trim(), events: draft.events, version: draft.version, status };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={hostOf(draft.url)}
      status={status}
      statusMap={STATUS_MAP}
      badges={
        <>
          <Badge variant="neutral" className="font-mono">API {draft.version}</Badge>
          <span className="text-xs text-text-tertiary">Last delivery {record.lastDelivery}</span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete webhook" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={WEBHOOK_NAV}
      defaultSection={defaultSection}
    >
      {({ active }) => (
        <>
          {active === "endpoint" ? (
            <SectionCard bare title="Destination" description="The URL we POST events to and the payload version it expects.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Endpoint URL" htmlFor="we-url" hint="Must accept HTTPS POST requests." className="sm:col-span-2">
                  <Input id="we-url" value={draft.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://api.yourapp.com/webhooks/geiger" className="font-mono text-sm" />
                </Field>
                <Field label="API version" hint="Sets the payload shape we send.">
                  <Select value={draft.version} onValueChange={set("version")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {API_VERSIONS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "events" ? (
            <SectionCard bare title="Subscribed events" description="Turn on each event this endpoint should receive.">
              <SettingsList>
                {EVENT_OPTIONS.map((ev) => (
                  <SettingRow
                    key={ev}
                    title={<span className="font-mono">{ev}</span>}
                    description={EVENT_DESCRIPTIONS[ev]}
                    checked={draft.events.includes(ev)}
                    onCheckedChange={(on) => setDraft((d) => ({ ...d, events: toggleIn(d.events, ev, on) }))}
                  />
                ))}
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "delivery" ? (
            <SectionCard bare title="Delivery status" description="Pause deliveries, see the last attempt and send a test payload.">
              <SettingsList>
                <SettingRow
                  title="Deliver events"
                  description="Turn off to pause deliveries without losing the configuration."
                  checked={!draft.paused}
                  onCheckedChange={(on) => set("paused")(!on)}
                />
                <SettingRow
                  title="Last delivery"
                  description="The most recent attempt to reach this endpoint."
                  control={<span className="text-sm font-medium text-foreground">{record.lastDelivery}</span>}
                />
                <SettingRow
                  title="Send a test event"
                  description="POST a sample payload to check the endpoint responds."
                  control={
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => onSendTest(record)}>
                      <Send className="h-4 w-4" /> Send test
                    </Button>
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

export function WebhooksScreen() {
  const [webhooks, setWebhooks] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editorSection, setEditorSection] = useState("endpoint");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return webhooks.filter((w) => {
      if (statusFilter !== "all" && w.status !== statusFilter) return false;
      if (eventFilter !== "all" && !w.events.includes(eventFilter)) return false;
      if (q && !w.url.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [webhooks, query, statusFilter, eventFilter]);

  const stats = useMemo(() => {
    const count = (s) => webhooks.filter((w) => w.status === s).length.toLocaleString("en-US");
    return [
      { label: "Endpoints", value: webhooks.length.toLocaleString("en-US") },
      { label: "Active", value: count("Active") },
      { label: "Failing", value: count("Failing") },
      { label: "Paused", value: count("Paused") },
    ];
  }, [webhooks]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${eventFilter}` });

  // Opens the editor on a given section ("View deliveries" lands on Delivery).
  const openWebhook = (id, section = "endpoint") => {
    setEditorSection(section);
    openRecord(String(id));
  };

  const updateRow = (id, patch) => setWebhooks((p) => p.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const handleCreate = (w) => {
    const id = crypto.randomUUID();
    setWebhooks((p) => [{ id, ...w }, ...p]);
    toast.success(`Added ${hostOf(w.url)}.`);
    openWebhook(id);
  };

  const handleSave = (id, patch) => {
    updateRow(id, patch);
    toast.success("Webhook saved.");
  };

  const togglePause = (w) => {
    const status = w.status === "Paused" ? "Active" : "Paused";
    updateRow(w.id, { status });
    toast.success(`${status === "Paused" ? "Paused" : "Resumed"} ${hostOf(w.url)}.`);
  };

  const sendTest = (w) => {
    updateRow(w.id, { lastDelivery: "just now" });
    toast.success(`Test event sent to ${hostOf(w.url)}.`);
  };

  const handleDelete = (w) => {
    setDeleteTarget(null);
    setWebhooks((p) => p.filter((x) => x.id !== w.id));
    if (String(w.id) === recordId) closeRecord();
    toast.success(`Deleted ${hostOf(w.url)}.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete webhook</DialogTitle>
          <DialogDescription>
            Delete <span className="break-all font-medium text-foreground">{deleteTarget?.url}</span>? We&apos;ll stop sending events to it. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = webhooks.find((w) => String(w.id) === recordId);
  if (open) {
    return (
      <>
        <WebhookEditor
          key={open.id}
          record={open}
          defaultSection={editorSection}
          onBack={closeRecord}
          onSave={handleSave}
          onSendTest={sendTest}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || eventFilter !== "all";

  const columns = [
    {
      key: "url",
      header: "Endpoint",
      render: (w) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Webhook className="h-4 w-4" />
          </span>
          <span className="max-w-[260px] truncate font-mono text-sm text-foreground">{w.url}</span>
        </div>
      ),
    },
    {
      key: "events",
      header: "Events",
      render: (w) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {w.events.slice(0, 2).map((ev) => (
            <Badge key={ev} variant="neutral" className="font-mono">{ev}</Badge>
          ))}
          {w.events.length > 2 ? (
            <Badge variant="neutral" className="text-text-secondary">+{w.events.length - 2}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (w) => <StatusPill status={w.status} map={STATUS_MAP} />,
    },
    {
      key: "lastDelivery",
      header: "Last delivery",
      render: (w) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          {w.status === "Failing" ? (
            <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          {w.lastDelivery}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (w) => (
        <ActionMenu
          label={`Actions for ${hostOf(w.url)}`}
          items={[
            { label: "Edit webhook", icon: Pencil, onSelect: () => openWebhook(w.id) },
            { label: "View deliveries", icon: Eye, onSelect: () => openWebhook(w.id, "delivery") },
            { label: "Send test", icon: Send, onSelect: () => sendTest(w) },
            w.status === "Paused"
              ? { label: "Resume", icon: Play, onSelect: () => togglePause(w) }
              : { label: "Pause", icon: Pause, onSelect: () => togglePause(w) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(w) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Webhooks"
        description="Send real-time event notifications to your endpoints."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add webhook
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={eventFilter} onValueChange={setEventFilter} options={EVENT_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search endpoints…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(w) => w.id}
          onRowClick={(w) => openWebhook(w.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Webhook}
                title={filtersActive ? "No matches" : "No webhooks yet"}
                description={filtersActive ? "Try a different search or filter." : "Add an endpoint to receive email and contact events as they happen."}
                action={
                  filtersActive ? (
                    <Button
                      variant="outline"
                      className={OUTLINE_BUTTON}
                      onClick={() => {
                        setQuery("");
                        setStatusFilter("all");
                        setEventFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> Add webhook
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="webhooks" />
      </div>

      <AddWebhookDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default WebhooksScreen;
