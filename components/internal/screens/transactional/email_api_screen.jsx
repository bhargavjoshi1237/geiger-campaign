"use client";

import React, { useState } from "react";
import { Plus, Code, KeyRound, Eye, RefreshCw, Trash2 } from "lucide-react";
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

const CURL_EXAMPLE = `curl https://api.geiger.studio/v1/email/send \\
  -H "Authorization: Bearer $GEIGER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "customer@example.com",
    "from": "receipts@halcyon.studio",
    "subject": "Your order is confirmed",
    "html": "<h1>Thanks for your order!</h1><p>We'\\''ll email you when it ships.</p>"
  }'`;

const INITIAL = [
  { id: 1, name: "Production server", key: "gk_live_••••8f2a", env: "Live", created: "Apr 12, 2026", lastUsed: "2 minutes ago" },
  { id: 2, name: "CI pipeline", key: "gk_test_••••3c9d", env: "Test", created: "Apr 2, 2026", lastUsed: "14 hours ago" },
  { id: 3, name: "Backend worker", key: "gk_live_••••a17b", env: "Live", created: "Mar 21, 2026", lastUsed: "5 minutes ago" },
  { id: 4, name: "Staging", key: "gk_test_••••5e60", env: "Test", created: "Mar 9, 2026", lastUsed: "3 days ago" },
];

function CreateKeyDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", env: "Live", scope: "send" });

  const submit = () => {
    if (!form.name.trim()) return;
    const prefix = form.env === "Live" ? "gk_live_••••" : "gk_test_••••";
    onCreate({
      name: form.name.trim(),
      key: prefix + String(Date.now()).slice(-4),
      env: form.env,
      created: "Just now",
      lastUsed: "Never",
    });
    setForm({ name: "", env: "Live", scope: "send" });
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
            <Input id="k-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Production server" className="border-border" />
          </Field>
          <Field label="Environment">
            <Select value={form.env} onValueChange={(v) => setForm((f) => ({ ...f, env: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Live">Live</SelectItem>
                <SelectItem value="Test">Test</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Scope">
            <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="send">Send only</SelectItem>
                <SelectItem value="full">Full access</SelectItem>
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

export function EmailApiScreen() {
  const [keys, setKeys] = useState(INITIAL);
  const [createOpen, setCreateOpen] = useState(false);

  const remove = (id) => setKeys((p) => p.filter((k) => k.id !== id));

  const columns = [
    { key: "name", header: "Name", className: "font-medium text-foreground" },
    { key: "key", header: "Key", className: "font-mono text-muted-foreground" },
    { key: "env", header: "Environment", render: (k) => <Badge variant={k.env === "Live" ? "success" : "warning"}>{k.env}</Badge> },
    { key: "created", header: "Created", className: "whitespace-nowrap text-muted-foreground" },
    { key: "lastUsed", header: "Last used", className: "whitespace-nowrap text-muted-foreground" },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (k) => (
        <ActionMenu
          items={[
            { label: "Reveal key", icon: Eye },
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
        title="Email API"
        description="Send transactional email programmatically over a fast, reliable HTTP API."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create API key
          </Button>
        }
      />

      <SectionCard contentClassName="space-y-4">
        <Field label="Endpoint">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">
            <Code className="h-4 w-4 shrink-0 text-text-secondary" />
            POST https://api.geiger.studio/v1/email/send
          </div>
        </Field>
        <Field label="Example request">
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-xs leading-relaxed text-muted-foreground font-mono">
{CURL_EXAMPLE}
          </pre>
        </Field>
      </SectionCard>

      <SectionCard
        bare
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-text-secondary" />
            API keys
          </span>
        }
      >
        <DataTable
          columns={columns}
          data={keys}
          getRowKey={(k) => k.id}
          empty={
            <EmptyState
              icon={KeyRound}
              title="No API keys found"
              className="rounded-xl border border-border bg-surface-subtle"
              action={<Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create API key</Button>}
            />
          }
        />
      </SectionCard>

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(k) => setKeys((p) => [{ id: Date.now(), ...k }, ...p])} />
    </MainScreenWrapper>
  );
}

export default EmailApiScreen;
