"use client";

import React, { useState } from "react";
import { Plus, Eye, RefreshCw, Trash2, KeyRound } from "lucide-react";
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
  ScreenHeader,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const PERMISSION_TONE = { "Read-only": "neutral", "Read & write": "info", Admin: "purple" };
const PERMISSIONS = ["Read-only", "Read & write", "Admin"];

const INITIAL = [
  { id: 1, name: "Production backend", key: "gk_••••3f9a", permission: "Read & write", created: "Apr 18, 2026", lastUsed: "3 minutes ago" },
  { id: 2, name: "Reporting dashboard", key: "gk_••••8b21", permission: "Read-only", created: "Mar 30, 2026", lastUsed: "1 hour ago" },
  { id: 3, name: "Ops automation", key: "gk_••••c14e", permission: "Admin", created: "Feb 22, 2026", lastUsed: "Yesterday" },
  { id: 4, name: "Mobile app", key: "gk_••••6d70", permission: "Read-only", created: "Jan 9, 2026", lastUsed: "2 weeks ago" },
];

function CreateKeyDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", permission: "Read-only", expiry: "Never" });

  const reset = () => setForm({ name: "", permission: "Read-only", expiry: "Never" });

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      key: "gk_••••" + String(Date.now()).slice(-4),
      permission: form.permission,
      created: "Just now",
      lastUsed: "Never",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>The full secret is shown only once after creation — store it securely.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Key name" htmlFor="k-name">
            <Input id="k-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Production backend" className="border-border" />
          </Field>
          <Field label="Permissions">
            <Select value={form.permission} onValueChange={(v) => setForm((f) => ({ ...f, permission: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERMISSIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Expiry">
            <Select value={form.expiry} onValueChange={(v) => setForm((f) => ({ ...f, expiry: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Never">Never</SelectItem>
                <SelectItem value="30 days">30 days</SelectItem>
                <SelectItem value="90 days">90 days</SelectItem>
                <SelectItem value="1 year">1 year</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysScreen() {
  const [keys, setKeys] = useState(INITIAL);
  const [createOpen, setCreateOpen] = useState(false);

  const remove = (id) => setKeys((p) => p.filter((k) => k.id !== id));

  const columns = [
    { key: "name", header: "Name", className: "font-medium text-foreground" },
    { key: "key", header: "Key", className: "font-mono text-muted-foreground" },
    { key: "permission", header: "Permissions", render: (k) => <Badge variant={PERMISSION_TONE[k.permission]}>{k.permission}</Badge> },
    { key: "created", header: "Created", className: "whitespace-nowrap text-muted-foreground" },
    { key: "lastUsed", header: "Last used", className: "whitespace-nowrap text-muted-foreground" },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (k) => (
        <ActionMenu
          items={[
            { label: "Reveal", icon: Eye },
            { separator: true },
            { label: "Roll key", icon: RefreshCw },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(k.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="API Keys"
        description="Programmatic access to your Geiger workspace."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create key
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={keys}
        getRowKey={(k) => k.id}
        empty={
          <EmptyState
            icon={KeyRound}
            title="No API keys found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create key</Button>}
          />
        }
      />

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(k) => setKeys((p) => [{ id: Date.now(), ...k }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ApiKeysScreen;
