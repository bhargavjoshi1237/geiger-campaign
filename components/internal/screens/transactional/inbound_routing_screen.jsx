"use client";

import React, { useMemo, useState } from "react";
import { Plus, Inbox, Pencil, Send, Trash2 } from "lucide-react";
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
  Switch,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  SettingsList,
  SettingRow,
} from "@geiger/ui";

const ACTION_TONE = {
  "Forward to webhook": "info",
  "Parse & store": "purple",
  Discard: "neutral",
};

const ACTIONS = Object.keys(ACTION_TONE);

const INITIAL = [
  { id: 1, match: "support@*.geiger.studio", action: "Forward to webhook", destination: "https://api.halcyon.studio/inbound", active: true },
  { id: 2, match: "reply+*@mail.geiger.studio", action: "Parse & store", destination: "https://api.halcyon.studio/threads", active: true },
  { id: 3, match: "receipts@geiger.studio", action: "Forward to webhook", destination: "https://hooks.halcyon.studio/receipts", active: false },
  { id: 4, match: "bounces@*.geiger.studio", action: "Parse & store", destination: "https://api.halcyon.studio/bounces", active: true },
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
        <div className="space-y-4 py-4">
          <Field label="Match pattern" htmlFor="r-match">
            <Input id="r-match" value={form.match} onChange={(e) => setForm((f) => ({ ...f, match: e.target.value }))} placeholder="support@*.geiger.studio" className="border-border font-mono" />
          </Field>
          <Field label="Action">
            <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Destination URL" htmlFor="r-dest" hint="Where parsed messages are POSTed.">
            <Input id="r-dest" value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} placeholder="https://" className="border-border font-mono" />
          </Field>
          <SettingsList className="rounded-lg border border-border bg-background px-3 py-2.5">
            <SettingRow
              title="Include attachments"
              description="Forward file attachments with the parsed payload."
              checked={form.attachments}
              onCheckedChange={(v) => setForm((f) => ({ ...f, attachments: v }))}
            />
          </SettingsList>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.match.trim()}>Add route</Button>
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

  const columns = [
    {
      key: "match",
      header: "Match",
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Inbox className="h-4 w-4" />
          </span>
          <span className="font-mono text-sm text-foreground">{r.match}</span>
        </div>
      ),
    },
    { key: "action", header: "Action", render: (r) => <Badge variant={ACTION_TONE[r.action]}>{r.action}</Badge> },
    { key: "destination", header: "Destination", className: "font-mono text-muted-foreground" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Switch checked={r.active} onCheckedChange={() => toggle(r.id)} />
          <Badge variant={r.active ? "success" : "warning"}>{r.active ? "Active" : "Paused"}</Badge>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Send test event", icon: Send },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(r.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Inbound Routing"
        description="Parse incoming email and route it to your application via webhooks."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add route
          </Button>
        }
      />

      <Toolbar>
        <div />
        <SearchInput value={query} onChange={setQuery} placeholder="Search routes…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={Inbox}
            title="No routes found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add route</Button>}
          />
        }
      />

      <CreateRouteDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(r) => setRoutes((p) => [{ id: Date.now(), ...r }, ...p])} />
    </MainScreenWrapper>
  );
}

export default InboundRoutingScreen;
