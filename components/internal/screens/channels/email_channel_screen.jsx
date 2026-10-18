"use client";

import React, { useState } from "react";
import { Plus, Mail, Star, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  ScreenHeader,
  SectionCard,
  SettingRow,
  SettingsList,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const INITIAL_SENDERS = [
  { id: 1, fromName: "Marketing", email: "hello@halcyon.studio", domain: "Verified", isDefault: true, added: "Jan 12, 2026" },
  { id: 2, fromName: "Support", email: "support@halcyon.studio", domain: "Verified", isDefault: false, added: "Jan 12, 2026" },
  { id: 3, fromName: "Receipts", email: "receipts@halcyon.studio", domain: "Verified", isDefault: false, added: "Feb 3, 2026" },
  { id: 4, fromName: "Events", email: "events@updates.halcyon.studio", domain: "Pending", isDefault: false, added: "May 28, 2026" },
];

function AddSenderDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ fromName: "", email: "", replyTo: "" });

  const submit = () => {
    if (!form.email.trim()) return;
    onCreate({
      fromName: form.fromName.trim() || form.email.trim(),
      email: form.email.trim(),
      domain: "Pending",
      isDefault: false,
      added: "Just now",
    });
    setForm({ fromName: "", email: "", replyTo: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add sender identity</DialogTitle>
          <DialogDescription>New identities are verified before they can send. We'll email a confirmation link.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="From name" htmlFor="s-name">
            <Input id="s-name" value={form.fromName} onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))} placeholder="e.g. Marketing" className="border-border" />
          </Field>
          <Field label="From email" htmlFor="s-email">
            <Input id="s-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="e.g. hello@geiger.studio" className="border-border" />
          </Field>
          <Field label="Reply-to address" htmlFor="s-reply" hint="Optional — defaults to the from address.">
            <Input id="s-reply" type="email" value={form.replyTo} onChange={(e) => setForm((f) => ({ ...f, replyTo: e.target.value }))} placeholder="e.g. support@geiger.studio" className="border-border" />
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

export function EmailChannelScreen() {
  const [senders, setSenders] = useState(INITIAL_SENDERS);
  const [createOpen, setCreateOpen] = useState(false);

  const [fromName, setFromName] = useState("Halcyon Studio");
  const [fromEmail, setFromEmail] = useState("hello@halcyon.studio");
  const [replyTo, setReplyTo] = useState("support@halcyon.studio");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [unsubscribeFooter, setUnsubscribeFooter] = useState(true);

  const setDefault = (id) =>
    setSenders((p) => p.map((s) => ({ ...s, isDefault: s.id === id })));
  const remove = (id) => setSenders((p) => p.filter((s) => s.id !== id));

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
            <span className="font-medium text-foreground">{s.fromName}</span>
            <span className="truncate text-xs text-text-secondary">{s.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: "domain",
      header: "Domain",
      render: (s) => <Badge variant={s.domain === "Verified" ? "success" : "warning"}>{s.domain}</Badge>,
    },
    {
      key: "default",
      header: "Default",
      render: (s) => (s.isDefault ? <Badge variant="info">Default</Badge> : <span className="text-text-secondary">—</span>),
    },
    { key: "added", header: "Added", className: "whitespace-nowrap text-muted-foreground", render: (s) => s.added },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (s) => (
        <ActionMenu
          items={[
            { label: "Set as default", icon: Star, onSelect: () => setDefault(s.id) },
            { separator: true },
            { label: "Remove", icon: Trash2, destructive: true, onSelect: () => remove(s.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Email"
        description="Configure how email is sent — sending identities, defaults, and tracking."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add sender
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <SectionCard title="Sending defaults" contentClassName="space-y-4">
          <Field label="Default from name" htmlFor="d-name">
            <Input id="d-name" value={fromName} onChange={(e) => setFromName(e.target.value)} className="border-border" />
          </Field>
          <Field label="Default from email" htmlFor="d-email">
            <Input id="d-email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} className="border-border" />
          </Field>
          <Field label="Reply-to address" htmlFor="d-reply">
            <Input id="d-reply" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className="border-border" />
          </Field>

          <SettingsList>
            <SettingRow title="Track opens" description="Embed a pixel to record when emails are opened." checked={trackOpens} onCheckedChange={setTrackOpens} />
            <SettingRow title="Track clicks" description="Rewrite links to measure click-through." checked={trackClicks} onCheckedChange={setTrackClicks} />
            <SettingRow title="Include unsubscribe footer" description="Append a one-click unsubscribe link to every email." checked={unsubscribeFooter} onCheckedChange={setUnsubscribeFooter} />
          </SettingsList>
        </SectionCard>

        {/* Sender identities */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Sender identities</h2>
            <p className="text-xs text-text-secondary">Verified addresses your campaigns can send from.</p>
          </div>

          <DataTable
            columns={columns}
            data={senders}
            getRowKey={(s) => s.id}
            empty={
              <EmptyState
                icon={Mail}
                title="No sender identities found"
                className="rounded-xl border border-border bg-surface-subtle"
                action={
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> Add sender
                  </Button>
                }
              />
            }
          />
        </div>
      </div>

      <AddSenderDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(s) => setSenders((p) => [{ id: Date.now(), ...s }, ...p])} />
    </MainScreenWrapper>
  );
}

export default EmailChannelScreen;
