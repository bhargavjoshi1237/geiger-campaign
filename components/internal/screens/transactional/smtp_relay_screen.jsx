"use client";

import React, { useState } from "react";
import { Plus, Server, KeyRound, Ban, Trash2 } from "lucide-react";
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Credential name" htmlFor="c-name">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production app" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Generated username" hint="A password will be shown once after creation.">
            <div className="rounded-md border border-[#2a2a2a] bg-[#161616] px-3 py-2 font-mono text-sm text-[#a3a3a3]">{username}</div>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create credential</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="SMTP Relay"
        description="Send through a standard SMTP relay using credentials you control."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create credential
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 border-t border-[#242424] pt-4 lg:grid-cols-[360px_1fr]">
        {/* Connection settings */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-[#737373]" />
            <h2 className="text-sm font-semibold text-[#ededed]">Connection settings</h2>
          </div>
          <Field label="Host">
            <div className="rounded-md border border-[#2a2a2a] bg-[#161616] px-3 py-2 font-mono text-sm text-[#a3a3a3]">smtp.geiger.studio</div>
          </Field>
          <Field label="Port">
            <Select value={port} onValueChange={setPort}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="587">587 (STARTTLS)</SelectItem>
                <SelectItem value="465">465 (SSL)</SelectItem>
                <SelectItem value="2525">2525</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Security">
            <Select value={security} onValueChange={setSecurity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starttls">STARTTLS</SelectItem>
                <SelectItem value="ssl">SSL/TLS</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-[#737373]">Point your app's SMTP client at this host using one of the credentials on the right.</p>
        </div>

        {/* Credentials */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#737373]" />
            <h2 className="text-sm font-semibold text-[#ededed]">Credentials</h2>
          </div>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creds.map((c) => (
                  <TableRow key={c.id} className="border-[#2a2a2a]">
                    <TableCell className="font-medium text-[#ededed]">{c.name}</TableCell>
                    <TableCell className="font-mono text-[#a3a3a3]">{c.username}</TableCell>
                    <TableCell className="whitespace-nowrap text-[#a3a3a3]">{c.created}</TableCell>
                    <TableCell><Pill tone={c.status === "Active" ? "green" : "zinc"}>{c.status}</Pill></TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        items={[
                          { label: "Reset password", icon: KeyRound },
                          { label: "Revoke", icon: Ban, danger: true, separatorBefore: true, onSelect: () => revoke(c.id) },
                          { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(c.id) },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {creds.length === 0 && (
                  <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                    <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No credentials found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>

      <CreateCredentialDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(c) => setCreds((p) => [{ id: Date.now(), ...c }, ...p])} />
    </MainScreenWrapper>
  );
}

export default SmtpRelayScreen;
