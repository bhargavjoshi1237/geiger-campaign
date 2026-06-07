"use client";

import React, { useState } from "react";
import { Plus, Code, KeyRound, Eye, RefreshCw, Trash2 } from "lucide-react";
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

const CURL_EXAMPLE = `curl https://api.geiger.studio/v1/email/send \\
  -H "Authorization: Bearer $GEIGER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "customer@example.com",
    "from": "receipts@geiger.studio",
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Key name" htmlFor="k-name">
            <Input id="k-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Production server" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Environment">
            <Select value={form.env} onValueChange={(v) => setForm((f) => ({ ...f, env: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Live">Live</SelectItem>
                <SelectItem value="Test">Test</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Scope">
            <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="send">Send only</SelectItem>
                <SelectItem value="full">Full access</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmailApiScreen() {
  const [keys, setKeys] = useState(INITIAL);
  const [createOpen, setCreateOpen] = useState(false);

  const remove = (id) => setKeys((p) => p.filter((k) => k.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Email API"
        description="Send transactional email programmatically over a fast, reliable HTTP API."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create API key
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
        <Field label="Endpoint">
          <div className="flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#161616] px-3 py-2 font-mono text-sm text-[#a3a3a3]">
            <Code className="h-4 w-4 shrink-0 text-[#737373]" />
            POST https://api.geiger.studio/v1/email/send
          </div>
        </Field>
        <Field label="Example request">
          <pre className="overflow-x-auto rounded-lg border border-[#2a2a2a] bg-[#161616] p-4 text-xs leading-relaxed text-[#a3a3a3] font-mono">
{CURL_EXAMPLE}
          </pre>
        </Field>
        </div>
      </div>

      <div className="space-y-3 border-t border-[#242424] pt-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#737373]" />
          <h2 className="text-sm font-semibold text-[#ededed]">API keys</h2>
        </div>
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id} className="border-[#2a2a2a]">
                  <TableCell className="font-medium text-[#ededed]">{k.name}</TableCell>
                  <TableCell className="font-mono text-[#a3a3a3]">{k.key}</TableCell>
                  <TableCell><Pill tone={k.env === "Live" ? "green" : "amber"}>{k.env}</Pill></TableCell>
                  <TableCell className="whitespace-nowrap text-[#a3a3a3]">{k.created}</TableCell>
                  <TableCell className="whitespace-nowrap text-[#a3a3a3]">{k.lastUsed}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Reveal key", icon: Eye },
                        { label: "Roll key", icon: RefreshCw, separatorBefore: true },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(k.id) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {keys.length === 0 && (
                <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                  <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No API keys found.</TableCell>
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

export default EmailApiScreen;
