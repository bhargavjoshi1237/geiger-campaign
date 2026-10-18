"use client";

import React, { useState } from "react";
import { Plug, RefreshCw, Unplug } from "lucide-react";
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

const STATUS_TONE = {
  Connected: "success",
  Expired: "warning",
  Disconnected: "neutral",
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
  { id: 1, service: "Google", account: "alex@halcyon.studio", scope: "Email, Calendar", status: "Connected", connected: "May 12, 2026" },
  { id: 2, service: "Microsoft", account: "ops@halcyonstudio.onmicrosoft.com", scope: "Email, Contacts", status: "Connected", connected: "Apr 28, 2026" },
  { id: 3, service: "Shopify", account: "halcyon-shop.myshopify.com", scope: "Orders, Customers", status: "Expired", connected: "Feb 3, 2026" },
  { id: 4, service: "Stripe", account: "acct_1Q8vXkHalcyon", scope: "Payments, Customers", status: "Connected", connected: "Jan 19, 2026" },
  { id: 5, service: "Meta", account: "@halcyon.studio", scope: "Ads, Audiences", status: "Disconnected", connected: "—" },
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
        <div className="space-y-4 py-4">
          <Field label="Service">
            <Select value={service} onValueChange={setService}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
              className="border-border"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!account.trim()}>Connect</Button>
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

  const columns = [
    {
      key: "service",
      header: "Service",
      render: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-xs font-semibold text-foreground">
            {SERVICE_META[c.service]?.initials ?? c.service[0]}
          </span>
          <span className="font-medium text-foreground">{c.service}</span>
        </div>
      ),
    },
    { key: "account", header: "Account", className: "font-mono text-muted-foreground", render: (c) => c.account },
    { key: "scope", header: "Scope", className: "text-muted-foreground", render: (c) => c.scope },
    { key: "status", header: "Status", render: (c) => <Badge variant={STATUS_TONE[c.status]}>{c.status}</Badge> },
    { key: "connected", header: "Connected", className: "whitespace-nowrap text-muted-foreground", render: (c) => c.connected },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <ActionMenu
          items={[
            { label: "Reconnect", icon: RefreshCw, onSelect: () => reconnect(c.id) },
            { separator: true },
            { label: "Disconnect", icon: Unplug, destructive: true, onSelect: () => disconnect(c.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Connections"
        description="Authenticated accounts linked to your workspace."
        actions={
          <Button onClick={() => setConnectOpen(true)}>
            <Plug className="h-4 w-4" /> Connect account
          </Button>
        }
      />

      <div>
        <DataTable
          columns={columns}
          data={connections}
          getRowKey={(c) => c.id}
          empty={
            <EmptyState
              icon={Plug}
              title="No connections found"
              className="rounded-xl border border-border bg-surface-subtle"
              action={
                <Button onClick={() => setConnectOpen(true)}>
                  <Plug className="h-4 w-4" /> Connect account
                </Button>
              }
            />
          }
        />
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
