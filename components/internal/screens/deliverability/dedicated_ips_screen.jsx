"use client";

import React, { useMemo, useState } from "react";
import { Plus, Network, FolderInput, Pause, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const REGION_LABEL = { us: "US (us-east)", eu: "EU (eu-west)", au: "AU (ap-southeast)" };

const INITIAL = [
  { id: 1, ip: "198.51.100.24", region: "us", pool: "Marketing", reputation: 96, status: "Active", sends: 184320 },
  { id: 2, ip: "198.51.100.25", region: "us", pool: "Transactional", reputation: 99, status: "Active", sends: 52140 },
  { id: 3, ip: "203.0.113.88", region: "eu", pool: "Marketing", reputation: 71, status: "Warming", sends: 12400 },
  { id: 4, ip: "192.0.2.140", region: "au", pool: "Default", reputation: 48, status: "Paused", sends: 0 },
];

const STATUS_TONE = { Active: "green", Warming: "amber", Paused: "zinc" };

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
        <DialogBody className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pool">
              <Select value={pool} onValueChange={setPool}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Transactional">Transactional</SelectItem>
                  <SelectItem value="Default">Default</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Region">
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="eu">European Union</SelectItem>
                  <SelectItem value="au">Australia</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} className="bg-white text-black hover:bg-[#e5e5e5]">Add IP</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Dedicated IPs"
        description="Manage the dedicated IP addresses your campaigns send from."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add IP
          </Button>
        }
      />

      <div className="border-t border-surface-active pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search IPs or pools…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>IP</TableHead>
              <TableHead>Pool</TableHead>
              <TableHead>Reputation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sends today</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((i) => (
              <TableRow key={i.id} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                      <Network className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-mono font-medium text-foreground">{i.ip}</span>
                      <span className="truncate text-xs text-text-secondary">{REGION_LABEL[i.region]}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{i.pool}</TableCell>
                <TableCell>
                  <div className="flex w-40 items-center gap-3">
                    <Progress value={i.reputation} className="h-1.5 bg-surface-hover [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                    <span className="tabular-nums text-xs text-muted-foreground">{i.reputation}%</span>
                  </div>
                </TableCell>
                <TableCell><Pill tone={STATUS_TONE[i.status]}>{i.status}</Pill></TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{i.sends.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Move to pool", icon: FolderInput },
                      { label: "Pause", icon: Pause, onSelect: () => pause(i.id) },
                      { label: "Remove", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(i.id) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-text-secondary">No IPs found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <AddIpDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(i) => setIps((p) => [{ id: Date.now(), ...i }, ...p])} />
    </MainScreenWrapper>
  );
}

export default DedicatedIpsScreen;
