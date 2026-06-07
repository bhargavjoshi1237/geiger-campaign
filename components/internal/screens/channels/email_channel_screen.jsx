"use client";

import React, { useState } from "react";
import { Plus, Mail, Star, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const INITIAL_SENDERS = [
  { id: 1, fromName: "Marketing", email: "hello@geiger.studio", domain: "Verified", isDefault: true, added: "Jan 12, 2026" },
  { id: 2, fromName: "Support", email: "support@geiger.studio", domain: "Verified", isDefault: false, added: "Jan 12, 2026" },
  { id: 3, fromName: "Receipts", email: "receipts@geiger.studio", domain: "Verified", isDefault: false, added: "Feb 3, 2026" },
  { id: 4, fromName: "Events", email: "events@updates.geiger.studio", domain: "Pending", isDefault: false, added: "May 28, 2026" },
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
        <DialogBody className="space-y-4 py-4">
          <Field label="From name" htmlFor="s-name">
            <Input id="s-name" value={form.fromName} onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))} placeholder="e.g. Marketing" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="From email" htmlFor="s-email">
            <Input id="s-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="e.g. hello@geiger.studio" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Reply-to address" htmlFor="s-reply" hint="Optional — defaults to the from address.">
            <Input id="s-reply" type="email" value={form.replyTo} onChange={(e) => setForm((f) => ({ ...f, replyTo: e.target.value }))} placeholder="e.g. support@geiger.studio" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.email.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Add sender</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmailChannelScreen() {
  const [senders, setSenders] = useState(INITIAL_SENDERS);
  const [createOpen, setCreateOpen] = useState(false);

  const [fromName, setFromName] = useState("Geiger Studio");
  const [fromEmail, setFromEmail] = useState("hello@geiger.studio");
  const [replyTo, setReplyTo] = useState("support@geiger.studio");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [unsubscribeFooter, setUnsubscribeFooter] = useState(true);

  const setDefault = (id) =>
    setSenders((p) => p.map((s) => ({ ...s, isDefault: s.id === id })));
  const remove = (id) => setSenders((p) => p.filter((s) => s.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Email"
        description="Configure how email is sent — sending identities, defaults, and tracking."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add sender
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 border-t border-[#242424] pt-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <h2 className="text-sm font-semibold text-[#ededed]">Sending defaults</h2>

          <Field label="Default from name" htmlFor="d-name">
            <Input id="d-name" value={fromName} onChange={(e) => setFromName(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Default from email" htmlFor="d-email">
            <Input id="d-email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Reply-to address" htmlFor="d-reply">
            <Input id="d-reply" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Track opens</p>
              <p className="text-xs text-[#737373]">Embed a pixel to record when emails are opened.</p>
            </div>
            <Switch checked={trackOpens} onCheckedChange={setTrackOpens} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Track clicks</p>
              <p className="text-xs text-[#737373]">Rewrite links to measure click-through.</p>
            </div>
            <Switch checked={trackClicks} onCheckedChange={setTrackClicks} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Include unsubscribe footer</p>
              <p className="text-xs text-[#737373]">Append a one-click unsubscribe link to every email.</p>
            </div>
            <Switch checked={unsubscribeFooter} onCheckedChange={setUnsubscribeFooter} />
          </div>
        </div>

        {/* Sender identities */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[#ededed]">Sender identities</h2>
            <p className="text-xs text-[#737373]">Verified addresses your campaigns can send from.</p>
          </div>

          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <TableHead>Identity</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {senders.map((s) => (
                  <TableRow key={s.id} className="border-[#2a2a2a]">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                          <Mail className="h-4 w-4" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium text-[#ededed]">{s.fromName}</span>
                          <span className="truncate text-xs text-[#737373]">{s.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Pill tone={s.domain === "Verified" ? "green" : "amber"}>{s.domain}</Pill>
                    </TableCell>
                    <TableCell>
                      {s.isDefault ? <Pill tone="blue">Default</Pill> : <span className="text-[#737373]">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[#a3a3a3]">{s.added}</TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        items={[
                          { label: "Set as default", icon: Star, onSelect: () => setDefault(s.id) },
                          { label: "Remove", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(s.id) },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {senders.length === 0 && (
                  <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                    <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No sender identities found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>

      <AddSenderDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(s) => setSenders((p) => [{ id: Date.now(), ...s }, ...p])} />
    </MainScreenWrapper>
  );
}

export default EmailChannelScreen;
