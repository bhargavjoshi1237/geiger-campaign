"use client";

import React, { useState } from "react";
import { Plus, Webhook, Eye, Send, Pause, Trash2, CheckCircle2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const EVENT_OPTIONS = [
  "email.sent",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "contact.created",
  "contact.unsubscribed",
];

const STATUS_TONE = { Active: "green", Failing: "red", Paused: "amber" };

const INITIAL = [
  { id: 1, url: "https://api.acme.io/hooks/geiger", events: ["email.opened", "email.clicked", "contact.created"], status: "Active", lastDelivery: "2m ago" },
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Endpoint URL" htmlFor="w-url">
            <Input id="w-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.yourapp.com/webhooks/geiger" className="bg-[#161616] border-[#2a2a2a] font-mono text-sm" />
          </Field>
          <Field label="Events">
            <div className="space-y-2 rounded-lg border border-[#2a2a2a] bg-[#161616] p-3">
              {EVENT_OPTIONS.map((ev) => (
                <label key={ev} htmlFor={`ev-${ev}`} className="flex cursor-pointer items-center gap-2.5">
                  <Checkbox id={`ev-${ev}`} checked={events.includes(ev)} onCheckedChange={(c) => toggleEvent(ev, c === true)} />
                  <span className="font-mono text-sm text-[#a3a3a3]">{ev}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="API version">
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2026-04-01">2026-04-01 (latest)</SelectItem>
                <SelectItem value="2025-11-15">2025-11-15</SelectItem>
                <SelectItem value="2025-06-30">2025-06-30</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!url.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Add webhook</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Webhooks"
        description="Send real-time event notifications to your endpoints."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add webhook
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead>Endpoint</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last delivery</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((w) => (
                <TableRow key={w.id} className="border-[#2a2a2a]">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                        <Webhook className="h-4 w-4" />
                      </span>
                      <span className="max-w-[260px] truncate font-mono text-sm text-[#ededed]">{w.url}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {w.events.slice(0, 2).map((ev) => (
                        <span key={ev} className="rounded border border-[#2a2a2a] bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-[#a3a3a3]">{ev}</span>
                      ))}
                      {w.events.length > 2 && (
                        <span className="rounded border border-[#2a2a2a] bg-[#242424] px-1.5 py-0.5 text-xs text-[#737373]">+{w.events.length - 2}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><Pill tone={STATUS_TONE[w.status]}>{w.status}</Pill></TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[#a3a3a3]">
                      {w.status === "Failing" ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      {w.lastDelivery}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "View deliveries", icon: Eye },
                        { label: "Send test", icon: Send },
                        { label: w.status === "Paused" ? "Resume" : "Pause", icon: Pause, separatorBefore: true, onSelect: () => pause(w.id) },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(w.id) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {webhooks.length === 0 && (
                <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                  <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No webhooks found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      </div>

      <AddWebhookDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(w) => setWebhooks((p) => [{ id: Date.now(), ...w }, ...p])} />
    </MainScreenWrapper>
  );
}

export default WebhooksScreen;
