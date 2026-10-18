"use client";

import React, { useState } from "react";
import { Plus, Server, KeyRound, Ban, Trash2 } from "lucide-react";
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
  Badge,
  ActionMenu,
  Field,
  SectionCard,
  DataTable,
  EmptyState,
} from "@geiger/ui";

const INITIAL = [
  { id: 1, name: "Production app", username: "smtp_a1b2c3", created: "Apr 14, 2026", status: "Active" },
  { id: 2, name: "Marketing worker", username: "smtp_d4e5f6", created: "Apr 3, 2026", status: "Active" },
  { id: 3, name: "Legacy CRM bridge", username: "smtp_9z8y7x", created: "Feb 22, 2026", status: "Revoked" },
  { id: 4, name: "Staging sandbox", username: "smtp_q1w2e3", created: "Feb 10, 2026", status: "Active" },
];

function CreateCredentialDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const username = "smtp_" + String(Date.now()).slice(-6);

  const submit = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      username,
      created: "Just now",
      status: "Active",
    });
    setName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create SMTP credential</DialogTitle>
          <DialogDescription>Use these credentials with any standard SMTP client to relay mail.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Credential name" htmlFor="c-name">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production app" className="border-border" />
          </Field>
          <Field label="Generated username" hint="A password will be shown once after creation.">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">{username}</div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Create credential</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SmtpRelayScreen() {
  const [creds, setCreds] = useState(INITIAL);
  const [port, setPort] = useState("587");
  const [security, setSecurity] = useState("starttls");
  const [createOpen, setCreateOpen] = useState(false);

  const revoke = (id) => setCreds((p) => p.map((c) => (c.id === id ? { ...c, status: "Revoked" } : c)));
  const remove = (id) => setCreds((p) => p.filter((c) => c.id !== id));

  const columns = [
    { key: "name", header: "Name", className: "font-medium text-foreground" },
    { key: "username", header: "Username", className: "font-mono text-muted-foreground" },
    { key: "created", header: "Created", className: "whitespace-nowrap text-muted-foreground" },
    { key: "status", header: "Status", render: (c) => <Badge variant={c.status === "Active" ? "success" : "neutral"}>{c.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <ActionMenu
          items={[
            { label: "Reset password", icon: KeyRound },
            { separator: true },
            { label: "Revoke", icon: Ban, destructive: true, onSelect: () => revoke(c.id) },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(c.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="SMTP Relay"
        description="Send through a standard SMTP relay using credentials you control."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create credential
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Connection settings */}
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Server className="h-4 w-4 text-text-secondary" />
              Connection settings
            </span>
          }
          contentClassName="space-y-4"
        >
          <Field label="Host">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">smtp.geiger.studio</div>
          </Field>
          <Field label="Port">
            <Select value={port} onValueChange={setPort}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="587">587 (STARTTLS)</SelectItem>
                <SelectItem value="465">465 (SSL)</SelectItem>
                <SelectItem value="2525">2525</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Security">
            <Select value={security} onValueChange={setSecurity}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starttls">STARTTLS</SelectItem>
                <SelectItem value="ssl">SSL/TLS</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-text-secondary">Point your app's SMTP client at this host using one of the credentials on the right.</p>
        </SectionCard>

        {/* Credentials */}
        <SectionCard
          bare
          title={
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-text-secondary" />
              Credentials
            </span>
          }
        >
          <DataTable
            columns={columns}
            data={creds}
            getRowKey={(c) => c.id}
            empty={
              <EmptyState
                icon={KeyRound}
                title="No credentials found"
                className="rounded-xl border border-border bg-surface-subtle"
                action={<Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create credential</Button>}
              />
            }
          />
        </SectionCard>
      </div>

      <CreateCredentialDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(c) => setCreds((p) => [{ id: Date.now(), ...c }, ...p])} />
    </MainScreenWrapper>
  );
}

export default SmtpRelayScreen;
