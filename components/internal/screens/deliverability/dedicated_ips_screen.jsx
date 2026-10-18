"use client";

import React, { useMemo, useState } from "react";
import { Plus, Network, FolderInput, Pause, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const REGION_LABEL = { us: "US (us-east)", eu: "EU (eu-west)", au: "AU (ap-southeast)" };

const INITIAL = [
  { id: 1, ip: "198.51.100.24", region: "us", pool: "Marketing", reputation: 96, status: "Active", sends: 184320 },
  { id: 2, ip: "198.51.100.25", region: "us", pool: "Transactional", reputation: 99, status: "Active", sends: 52140 },
  { id: 3, ip: "203.0.113.88", region: "eu", pool: "Marketing", reputation: 71, status: "Warming", sends: 12400 },
  { id: 4, ip: "192.0.2.140", region: "au", pool: "Default", reputation: 48, status: "Paused", sends: 0 },
];

const STATUS_TONE = { Active: "success", Warming: "warning", Paused: "neutral" };

function AddIpDialog({ open, onOpenChange, onCreate }) {
  const [pool, setPool] = useState("Marketing");
  const [region, setRegion] = useState("us");

  const submit = () => {
    onCreate({
      ip: "203.0.113." + String(Date.now() % 200 + 10),
      region,
      pool,
      reputation: 50,
      status: "Warming",
      sends: 0,
    });
    setPool("Marketing");
    setRegion("us");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add dedicated IP</DialogTitle>
          <DialogDescription>A new IP starts in warmup until it has built reputation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pool">
              <Select value={pool} onValueChange={setPool}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Transactional">Transactional</SelectItem>
                  <SelectItem value="Default">Default</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Region">
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="eu">European Union</SelectItem>
                  <SelectItem value="au">Australia</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Add IP</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DedicatedIpsScreen() {
  const [ips, setIps] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ips.filter((i) => !q || i.ip.includes(q) || i.pool.toLowerCase().includes(q));
  }, [ips, query]);

  const pause = (id) => setIps((p) => p.map((i) => (i.id === id ? { ...i, status: "Paused", sends: 0 } : i)));
  const remove = (id) => setIps((p) => p.filter((i) => i.id !== id));

  const columns = [
    {
      key: "ip",
      header: "IP",
      render: (i) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Network className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-mono font-medium text-foreground">{i.ip}</span>
            <span className="truncate text-xs text-text-secondary">{REGION_LABEL[i.region]}</span>
          </div>
        </div>
      ),
    },
    { key: "pool", header: "Pool", className: "text-muted-foreground", render: (i) => i.pool },
    {
      key: "reputation",
      header: "Reputation",
      render: (i) => (
        <div className="flex w-40 items-center gap-3">
          <Progress value={i.reputation} className="h-1.5 bg-surface-hover" />
          <span className="tabular-nums text-xs text-muted-foreground">{i.reputation}%</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (i) => <Badge variant={STATUS_TONE[i.status]}>{i.status}</Badge> },
    { key: "sends", header: "Sends today", className: "tabular-nums text-muted-foreground", render: (i) => i.sends.toLocaleString() },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (i) => (
        <ActionMenu
          items={[
            { label: "Move to pool", icon: FolderInput },
            { label: "Pause", icon: Pause, onSelect: () => pause(i.id) },
            { separator: true },
            { label: "Remove", icon: Trash2, destructive: true, onSelect: () => remove(i.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Dedicated IPs"
        description="Manage the dedicated IP addresses your campaigns send from."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add IP
          </Button>
        }
      />

      <Toolbar>
        <div />
        <SearchInput value={query} onChange={setQuery} placeholder="Search IPs or pools…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(i) => i.id}
        empty={
          <EmptyState
            icon={Network}
            title="No IPs found."
            className="rounded-xl border border-border bg-surface-subtle"
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Add IP
              </Button>
            }
          />
        }
      />

      <AddIpDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(i) => setIps((p) => [{ id: Date.now(), ...i }, ...p])} />
    </MainScreenWrapper>
  );
}

export default DedicatedIpsScreen;
