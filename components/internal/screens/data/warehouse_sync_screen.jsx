"use client";

import React, { useMemo, useState } from "react";
import { Plus, Database, Play, Pencil, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PROVIDERS = {
  Snowflake: "geiger.us-east-1.snowflakecomputing.com",
  BigQuery: "geiger-analytics-prod.bq.googleapis.com",
  Redshift: "geiger-cluster.abc123.us-east-1.redshift.amazonaws.com",
  Postgres: "warehouse.geiger.internal:5432/analytics",
};

const FREQUENCIES = ["Hourly", "Every 6h", "Daily"];
const DIRECTIONS = ["Import", "Export"];
const DIRECTION_TONE = { Import: "blue", Export: "violet" };
const STATUS_TONE = { Success: "green", Running: "amber", Failed: "red" };

const INITIAL_JOBS = [
  { id: 1, table: "analytics.fct_orders", direction: "Import", rows: 482910, frequency: "Hourly", lastSync: "9 minutes ago", status: "Success" },
  { id: 2, table: "analytics.dim_customers", direction: "Import", rows: 128440, frequency: "Every 6h", lastSync: "2 hours ago", status: "Success" },
  { id: 3, table: "geiger.contact_scores", direction: "Export", rows: 96120, frequency: "Daily", lastSync: "Running now", status: "Running" },
  { id: 4, table: "analytics.web_sessions", direction: "Import", rows: 2104330, frequency: "Hourly", lastSync: "14 minutes ago", status: "Success" },
  { id: 5, table: "geiger.campaign_engagement", direction: "Export", rows: 53880, frequency: "Daily", lastSync: "Yesterday", status: "Failed" },
];

function CreateSyncDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ table: "", direction: "Import", frequency: "Hourly" });

  const reset = () => setForm({ table: "", direction: "Import", frequency: "Hourly" });

  const submit = () => {
    if (!form.table.trim()) return;
    onCreate({
      table: form.table.trim(),
      direction: form.direction,
      rows: 0,
      frequency: form.frequency,
      lastSync: "Never",
      status: "Running",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New sync job</DialogTitle>
          <DialogDescription>Move a table or dataset between Geiger and your warehouse.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Table / dataset" htmlFor="s-table" hint="Fully-qualified, e.g. analytics.fct_orders.">
            <Input id="s-table" value={form.table} onChange={(e) => setForm((f) => ({ ...f, table: e.target.value }))} placeholder="e.g. analytics.fct_orders" className="bg-[#161616] border-[#2a2a2a] font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction">
              <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Frequency">
              <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map((fr) => <SelectItem key={fr} value={fr}>{fr}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.table.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create sync</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WarehouseSyncScreen() {
  const [jobs, setJobs] = useState(INITIAL_JOBS);
  const [provider, setProvider] = useState("Snowflake");
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [frequency, setFrequency] = useState("Hourly");
  const [createOpen, setCreateOpen] = useState(false);

  const host = useMemo(() => PROVIDERS[provider], [provider]);

  const remove = (id) => setJobs((p) => p.filter((j) => j.id !== id));
  const runNow = (id) => setJobs((p) => p.map((j) => (j.id === id ? { ...j, status: "Running", lastSync: "Running now" } : j)));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Warehouse Sync"
        description="Sync data both ways with your data warehouse."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New sync
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 border-t border-[#242424] pt-4 lg:grid-cols-[360px_1fr]">
        {/* Connection config */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#ededed]">Connection</h2>
            <Pill tone="green">Connected</Pill>
          </div>

          <Field label="Provider">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(PROVIDERS).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <Field label="Host / account">
            <div className="rounded-md border border-[#2a2a2a] bg-[#161616] px-3 py-2 font-mono text-sm text-[#a3a3a3] break-all">
              {host}
            </div>
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Sync enabled</p>
              <p className="text-xs text-[#737373]">Pause all jobs without deleting them.</p>
            </div>
            <Switch checked={syncEnabled} onCheckedChange={setSyncEnabled} />
          </div>

          <Field label="Sync frequency" hint="Default cadence applied to new jobs.">
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        {/* Sync jobs */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#737373]" />
            <h2 className="text-sm font-semibold text-[#ededed]">Sync jobs</h2>
          </div>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <TableHead>Table / dataset</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id} className="border-[#2a2a2a]">
                    <TableCell className="font-mono text-[#ededed]">{j.table}</TableCell>
                    <TableCell><Pill tone={DIRECTION_TONE[j.direction]}>{j.direction}</Pill></TableCell>
                    <TableCell className="tabular-nums text-[#a3a3a3]">{j.rows.toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap text-[#a3a3a3]">{j.frequency}</TableCell>
                    <TableCell className="whitespace-nowrap text-[#a3a3a3]">{j.lastSync}</TableCell>
                    <TableCell><Pill tone={STATUS_TONE[j.status]}>{j.status}</Pill></TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        items={[
                          { label: "Run now", icon: Play, onSelect: () => runNow(j.id) },
                          { label: "Edit", icon: Pencil },
                          { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(j.id) },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 && (
                  <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                    <TableCell colSpan={7} className="py-14 text-center text-sm text-[#737373]">No sync jobs found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>

      <CreateSyncDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(j) => setJobs((p) => [{ id: Date.now(), ...j }, ...p])} />
    </MainScreenWrapper>
  );
}

export default WarehouseSyncScreen;
