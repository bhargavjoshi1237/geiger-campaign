"use client";

import React, { useState } from "react";
import { Plus, Webhook, Eye, Send, Pause, Trash2, CheckCircle2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
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
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const EVENT_OPTIONS = [
  "email.sent",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "contact.created",
  "contact.unsubscribed",
];

const STATUS_TONE = { Active: "success", Failing: "danger", Paused: "warning" };

const INITIAL = [
  { id: 1, url: "https://api.halcyon.studio/hooks/geiger", events: ["email.opened", "email.clicked", "contact.created"], status: "Active", lastDelivery: "2m ago" },
  { id: 2, url: "https://hooks.zapier.com/hooks/catch/8821/geiger", events: ["email.bounced", "contact.unsubscribed"], status: "Active", lastDelivery: "11m ago" },
  { id: 3, url: "https://events.dashly.app/ingest/v2", events: ["email.sent", "email.opened", "email.clicked", "contact.created"], status: "Failing", lastDelivery: "1h ago" },
  { id: 4, url: "https://crm.northstar.co/api/webhooks/email", events: ["contact.created", "contact.unsubscribed"], status: "Paused", lastDelivery: "3d ago" },
  { id: 5, url: "https://analytics.brightloop.io/collect", events: ["email.clicked"], status: "Active", lastDelivery: "just now" },
];

function AddWebhookDialog({ open, onOpenChange, onCreate }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState(["email.opened"]);
  const [version, setVersion] = useState("2026-04-01");

  const toggleEvent = (ev, checked) =>
    setEvents((p) => (checked ? [...p, ev] : p.filter((e) => e !== ev)));

  const reset = () => {
    setUrl("");
    setEvents(["email.opened"]);
    setVersion("2026-04-01");
  };

  const submit = () => {
    if (!url.trim()) return;
    onCreate({
      url: url.trim(),
      events: events.length ? events : ["email.sent"],
      status: "Active",
      lastDelivery: "Never",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add webhook</DialogTitle>
          <DialogDescription>We will POST a signed JSON payload to this endpoint when subscribed events fire.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Endpoint URL" htmlFor="w-url">
            <Input id="w-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.yourapp.com/webhooks/geiger" className="border-border font-mono text-sm" />
          </Field>
          <Field label="Events">
            <div className="space-y-2 rounded-lg border border-border bg-background p-3">
              {EVENT_OPTIONS.map((ev) => (
                <Label key={ev} htmlFor={`ev-${ev}`} className="cursor-pointer gap-2.5 font-normal">
                  <Checkbox id={`ev-${ev}`} checked={events.includes(ev)} onCheckedChange={(c) => toggleEvent(ev, c === true)} />
                  <span className="font-mono text-sm text-muted-foreground">{ev}</span>
                </Label>
              ))}
            </div>
          </Field>
          <Field label="API version">
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2026-04-01">2026-04-01 (latest)</SelectItem>
                <SelectItem value="2025-11-15">2025-11-15</SelectItem>
                <SelectItem value="2025-06-30">2025-06-30</SelectItem>
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

export function WebhooksScreen() {
  const [webhooks, setWebhooks] = useState(INITIAL);
  const [createOpen, setCreateOpen] = useState(false);

  const remove = (id) => setWebhooks((p) => p.filter((w) => w.id !== id));
  const pause = (id) =>
    setWebhooks((p) => p.map((w) => (w.id === id ? { ...w, status: w.status === "Paused" ? "Active" : "Paused" } : w)));

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
          {w.events.length > 2 && (
            <Badge variant="neutral" className="text-text-secondary">+{w.events.length - 2}</Badge>
          )}
        </div>
      ),
    },
    { key: "status", header: "Status", render: (w) => <Badge variant={STATUS_TONE[w.status]}>{w.status}</Badge> },
    {
      key: "lastDelivery",
      header: "Last delivery",
      render: (w) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          {w.status === "Failing" ? (
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          {w.lastDelivery}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (w) => (
        <ActionMenu
          items={[
            { label: "View deliveries", icon: Eye },
            { label: "Send test", icon: Send },
            { separator: true },
            { label: w.status === "Paused" ? "Resume" : "Pause", icon: Pause, onSelect: () => pause(w.id) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(w.id) },
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

      <DataTable
        columns={columns}
        data={webhooks}
        getRowKey={(w) => w.id}
        empty={
          <EmptyState
            icon={Webhook}
            title="No webhooks found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add webhook</Button>}
          />
        }
      />

      <AddWebhookDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(w) => setWebhooks((p) => [{ id: Date.now(), ...w }, ...p])} />
    </MainScreenWrapper>
  );
}

export default WebhooksScreen;
