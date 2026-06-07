"use client";

import React, { useState } from "react";
import { Plug, RefreshCw, Unplug } from "lucide-react";
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

const STATUS_TONE = {
  Connected: "green",
  Expired: "amber",
  Disconnected: "zinc",
};

const SERVICE_META = {
  Google: { initials: "G", scope: "Email, Calendar" },
  Microsoft: { initials: "MS", scope: "Email, Contacts" },
  Shopify: { initials: "SH", scope: "Orders, Customers" },
  Stripe: { initials: "ST", scope: "Payments, Customers" },
  Meta: { initials: "M", scope: "Ads, Audiences" },
  Slack: { initials: "SL", scope: "Notifications" },
};

const INITIAL = [
  { id: 1, service: "Google", account: "jordan@acme.com", scope: "Email, Calendar", status: "Connected", connected: "May 12, 2026" },
  { id: 2, service: "Microsoft", account: "ops@acme.onmicrosoft.com", scope: "Email, Contacts", status: "Connected", connected: "Apr 28, 2026" },
  { id: 3, service: "Shopify", account: "acme-store.myshopify.com", scope: "Orders, Customers", status: "Expired", connected: "Feb 3, 2026" },
  { id: 4, service: "Stripe", account: "acct_1Q8vXkAcme", scope: "Payments, Customers", status: "Connected", connected: "Jan 19, 2026" },
  { id: 5, service: "Meta", account: "@acmebrand", scope: "Ads, Audiences", status: "Disconnected", connected: "—" },
];

function ConnectAccountDialog({ open, onOpenChange, onConnect }) {
  const [service, setService] = useState("Google");
  const [account, setAccount] = useState("");

  const submit = () => {
    if (!account.trim()) return;
    onConnect({
      service,
      account: account.trim(),
      scope: SERVICE_META[service]?.scope ?? "—",
      status: "Connected",
      connected: "Just now",
    });
    setService("Google");
    setAccount("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect account</DialogTitle>
          <DialogDescription>Link an external account to your workspace via OAuth.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Service">
            <Select value={service} onValueChange={setService}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(SERVICE_META).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Account" htmlFor="conn-account" hint="The email or handle authorizing the connection.">
            <Input
              id="conn-account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="name@company.com"
              className="bg-[#161616] border-[#2a2a2a]"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!account.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectionsScreen() {
  const [connections, setConnections] = useState(INITIAL);
  const [connectOpen, setConnectOpen] = useState(false);

  const reconnect = (id) => setConnections((p) => p.map((c) => (c.id === id ? { ...c, status: "Connected", connected: "Just now" } : c)));
  const disconnect = (id) => setConnections((p) => p.map((c) => (c.id === id ? { ...c, status: "Disconnected", connected: "—" } : c)));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Connections"
        description="Authenticated accounts linked to your workspace."
        actions={
          <Button onClick={() => setConnectOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plug className="h-4 w-4" /> Connect account
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead>Service</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Connected</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((c) => (
                <TableRow key={c.id} className="border-[#2a2a2a]">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-xs font-semibold text-[#e7e7e7]">
                        {SERVICE_META[c.service]?.initials ?? c.service[0]}
                      </span>
                      <span className="font-medium text-[#ededed]">{c.service}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[#a3a3a3]">{c.account}</TableCell>
                  <TableCell className="text-[#a3a3a3]">{c.scope}</TableCell>
                  <TableCell><Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill></TableCell>
                  <TableCell className="whitespace-nowrap text-[#a3a3a3]">{c.connected}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Reconnect", icon: RefreshCw, onSelect: () => reconnect(c.id) },
                        { label: "Disconnect", icon: Unplug, danger: true, separatorBefore: true, onSelect: () => disconnect(c.id) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {connections.length === 0 && (
                <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                  <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No connections found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      </div>

      <ConnectAccountDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnect={(c) => setConnections((p) => [{ id: Date.now(), ...c }, ...p])}
      />
    </MainScreenWrapper>
  );
}

export default ConnectionsScreen;
