"use client";

import React, { useState } from "react";
import { Plus, Eye, RefreshCw, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PERMISSION_TONE = { "Read-only": "zinc", "Read & write": "blue", Admin: "violet" };
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Key name" htmlFor="k-name">
            <Input id="k-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Production backend" className="bg-background border-border" />
          </Field>
          <Field label="Permissions">
            <Select value={form.permission} onValueChange={(v) => setForm((f) => ({ ...f, permission: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERMISSIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Expiry">
            <Select value={form.expiry} onValueChange={(v) => setForm((f) => ({ ...f, expiry: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Never">Never</SelectItem>
                <SelectItem value="30 days">30 days</SelectItem>
                <SelectItem value="90 days">90 days</SelectItem>
                <SelectItem value="1 year">1 year</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysScreen() {
  const [keys, setKeys] = useState(INITIAL);
  const [createOpen, setCreateOpen] = useState(false);

  const remove = (id) => setKeys((p) => p.filter((k) => k.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="API Keys"
        description="Programmatic access to your Geiger workspace."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create key
          </Button>
        }
      />

      <div className="border-t border-surface-active pt-4">
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id} className="border-border">
                  <TableCell className="font-medium text-foreground">{k.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{k.key}</TableCell>
                  <TableCell><Pill tone={PERMISSION_TONE[k.permission]}>{k.permission}</Pill></TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{k.created}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{k.lastUsed}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Reveal", icon: Eye },
                        { label: "Roll key", icon: RefreshCw, separatorBefore: true },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(k.id) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {keys.length === 0 && (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={6} className="py-14 text-center text-sm text-text-secondary">No API keys found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      </div>

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(k) => setKeys((p) => [{ id: Date.now(), ...k }, ...p])} />
    </MainScreenWrapper>
  );
}

export default ApiKeysScreen;
