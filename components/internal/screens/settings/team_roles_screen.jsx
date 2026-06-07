"use client";

import React, { useState } from "react";
import { UserPlus, Crown, Shield, Pencil, Eye, Trash2 } from "lucide-react";
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

const ROLE_TONE = {
  Owner: "violet",
  Admin: "blue",
  Editor: "zinc",
  Viewer: "zinc",
};

const STATUS_TONE = {
  Active: "green",
  Invited: "amber",
};

const INITIAL_MEMBERS = [
  { id: 1, name: "Jordan Vance", email: "jordan@acme.com", role: "Owner", status: "Active", lastActive: "2 min ago" },
  { id: 2, name: "Priya Nair", email: "priya.nair@acme.com", role: "Admin", status: "Active", lastActive: "1 hour ago" },
  { id: 3, name: "Marcus Holt", email: "marcus.holt@acme.com", role: "Editor", status: "Active", lastActive: "Yesterday" },
  { id: 4, name: "Elena Sokolova", email: "elena.s@acme.com", role: "Editor", status: "Active", lastActive: "3 days ago" },
  { id: 5, name: "Tom Becker", email: "tom.becker@acme.com", role: "Viewer", status: "Active", lastActive: "Last week" },
  { id: 6, name: "Aisha Rahman", email: "aisha.rahman@acme.com", role: "Viewer", status: "Invited", lastActive: "—" },
];

const ROLE_LEGEND = [
  { role: "Owner", desc: "Full control, including billing and workspace deletion." },
  { role: "Admin", desc: "Manage members, integrations and all campaigns." },
  { role: "Editor", desc: "Create and send campaigns, but no workspace settings." },
  { role: "Viewer", desc: "Read-only access to campaigns and reports." },
];

function initials(name) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function InviteMemberDialog({ open, onOpenChange, onInvite }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Editor");

  const submit = () => {
    if (!email.trim()) return;
    onInvite({
      name: email.trim().split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      email: email.trim(),
      role,
      status: "Invited",
      lastActive: "—",
    });
    setEmail("");
    setRole("Editor");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>Send an invitation to join this workspace.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Email address" htmlFor="inv-email">
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Role" hint="You can change this at any time.">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Editor">Editor</SelectItem>
                <SelectItem value="Viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!email.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamRolesScreen() {
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [inviteOpen, setInviteOpen] = useState(false);

  const setRole = (id, role) => setMembers((p) => p.map((m) => (m.id === id ? { ...m, role } : m)));
  const remove = (id) => setMembers((p) => p.filter((m) => m.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Team & Roles"
        description="Manage who has access and what they can do."
        actions={
          <Button onClick={() => setInviteOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <UserPlus className="h-4 w-4" /> Invite member
          </Button>
        }
      />

      <div className="space-y-4 border-t border-[#242424] pt-4">
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id} className="border-[#2a2a2a]">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#242424] text-xs font-semibold text-[#e7e7e7]">
                        {initials(m.name)}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-[#ededed]">{m.name}</span>
                        <span className="truncate text-xs text-[#737373]">{m.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Pill tone={ROLE_TONE[m.role]}>{m.role}</Pill></TableCell>
                  <TableCell><Pill tone={STATUS_TONE[m.status]}>{m.status}</Pill></TableCell>
                  <TableCell className="whitespace-nowrap text-[#a3a3a3]">{m.lastActive}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Make Owner", icon: Crown, onSelect: () => setRole(m.id, "Owner") },
                        { label: "Make Admin", icon: Shield, onSelect: () => setRole(m.id, "Admin") },
                        { label: "Make Editor", icon: Pencil, onSelect: () => setRole(m.id, "Editor") },
                        { label: "Make Viewer", icon: Eye, onSelect: () => setRole(m.id, "Viewer") },
                        { label: "Remove", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(m.id) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                  <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No members found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>

        {/* Roles legend */}
        <div className="space-y-2 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <h2 className="text-sm font-semibold text-[#ededed]">Roles</h2>
          {ROLE_LEGEND.map((r) => (
            <p key={r.role} className="text-xs text-[#737373]">
              <span className="font-medium text-[#a3a3a3]">{r.role}</span> — {r.desc}
            </p>
          ))}
        </div>
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={(m) => setMembers((p) => [{ id: Date.now(), ...m }, ...p])}
      />
    </MainScreenWrapper>
  );
}

export default TeamRolesScreen;
