"use client";

import React, { useMemo, useState } from "react";
import { Plus, Inbox, Pencil, Send, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ACTION_TONE = {
  "Forward to webhook": "blue",
  "Parse & store": "violet",
  Discard: "zinc",
};

const ACTIONS = Object.keys(ACTION_TONE);

const INITIAL = [
  { id: 1, match: "support@*.geiger.studio", action: "Forward to webhook", destination: "https://api.acme.io/inbound", active: true },
  { id: 2, match: "reply+*@mail.geiger.studio", action: "Parse & store", destination: "https://api.acme.io/threads", active: true },
  { id: 3, match: "receipts@geiger.studio", action: "Forward to webhook", destination: "https://hooks.acme.io/receipts", active: false },
  { id: 4, match: "bounces@*.geiger.studio", action: "Parse & store", destination: "https://api.acme.io/bounces", active: true },
  { id: 5, match: "noreply@geiger.studio", action: "Discard", destination: "—", active: true },
];

function CreateRouteDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ match: "", action: "Forward to webhook", destination: "", attachments: true });

  const submit = () => {
    if (!form.match.trim()) return;
    const isDiscard = form.action === "Discard";
    onCreate({
      match: form.match.trim(),
      action: form.action,
      destination: isDiscard ? "—" : form.destination.trim() || "—",
      active: true,
    });
    setForm({ match: "", action: "Forward to webhook", destination: "", attachments: true });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add route</DialogTitle>
          <DialogDescription>Match incoming addresses and decide how each message is handled.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Match pattern" htmlFor="r-match">
            <Input id="r-match" value={form.match} onChange={(e) => setForm((f) => ({ ...f, match: e.target.value }))} placeholder="support@*.geiger.studio" className="bg-background border-border font-mono" />
          </Field>
          <Field label="Action">
            <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Destination URL" htmlFor="r-dest" hint="Where parsed messages are POSTed.">
            <Input id="r-dest" value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} placeholder="https://" className="bg-background border-border font-mono" />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[#e5e5e5]">Include attachments</span>
              <span className="text-xs text-text-secondary">Forward file attachments with the parsed payload.</span>
            </div>
            <Switch checked={form.attachments} onCheckedChange={(v) => setForm((f) => ({ ...f, attachments: v }))} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.match.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Add route</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InboundRoutingScreen() {
  const [routes, setRoutes] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return routes.filter((r) =>
      !q || r.match.toLowerCase().includes(q) || r.destination.toLowerCase().includes(q),
    );
  }, [routes, query]);

  const toggle = (id) => setRoutes((p) => p.map((r) => (r.id === id ? { ...r, active: !r.active } : r)));
  const remove = (id) => setRoutes((p) => p.filter((r) => r.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Inbound Routing"
        description="Parse incoming email and route it to your application via webhooks."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add route
          </Button>
        }
      />

      <div className="border-t border-surface-active pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search routes…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Match</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                      <Inbox className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-sm text-foreground">{r.match}</span>
                  </div>
                </TableCell>
                <TableCell><Pill tone={ACTION_TONE[r.action]}>{r.action}</Pill></TableCell>
                <TableCell className="font-mono text-muted-foreground">{r.destination}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Switch checked={r.active} onCheckedChange={() => toggle(r.id)} />
                    <Pill tone={r.active ? "green" : "amber"}>{r.active ? "Active" : "Paused"}</Pill>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Send test event", icon: Send },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(r.id) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-text-secondary">No routes found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateRouteDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(r) => setRoutes((p) => [{ id: Date.now(), ...r }, ...p])} />
    </MainScreenWrapper>
  );
}

export default InboundRoutingScreen;
