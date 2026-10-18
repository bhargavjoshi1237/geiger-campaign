"use client";

import React, { useMemo, useState } from "react";
import { Plus, Database, Play, Pencil, Trash2 } from "lucide-react";
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
  SectionCard,
  SettingsList,
  SettingRow,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const PROVIDERS = {
  Snowflake: "geiger.us-east-1.snowflakecomputing.com",
  BigQuery: "geiger-analytics-prod.bq.googleapis.com",
  Redshift: "geiger-cluster.abc123.us-east-1.redshift.amazonaws.com",
  Postgres: "warehouse.geiger.internal:5432/analytics",
};

const FREQUENCIES = ["Hourly", "Every 6h", "Daily"];
const DIRECTIONS = ["Import", "Export"];
const DIRECTION_TONE = { Import: "info", Export: "purple" };
const STATUS_TONE = { Success: "success", Running: "warning", Failed: "danger" };

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
        <div className="space-y-4 py-4">
          <Field label="Table / dataset" htmlFor="s-table" hint="Fully-qualified, e.g. analytics.fct_orders.">
            <Input id="s-table" value={form.table} onChange={(e) => setForm((f) => ({ ...f, table: e.target.value }))} placeholder="e.g. analytics.fct_orders" className="border-border font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction">
              <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Frequency">
              <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map((fr) => <SelectItem key={fr} value={fr}>{fr}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.table.trim()}>Create sync</Button>
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

  const columns = [
    { key: "table", header: "Table / dataset", className: "font-mono text-foreground" },
    { key: "direction", header: "Direction", render: (j) => <Badge variant={DIRECTION_TONE[j.direction]}>{j.direction}</Badge> },
    { key: "rows", header: "Rows", className: "tabular-nums text-muted-foreground", render: (j) => j.rows.toLocaleString() },
    { key: "frequency", header: "Frequency", className: "whitespace-nowrap text-muted-foreground" },
    { key: "lastSync", header: "Last sync", className: "whitespace-nowrap text-muted-foreground" },
    { key: "status", header: "Status", render: (j) => <Badge variant={STATUS_TONE[j.status]}>{j.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (j) => (
        <ActionMenu
          items={[
            { label: "Run now", icon: Play, onSelect: () => runNow(j.id) },
            { label: "Edit", icon: Pencil },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(j.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Warehouse Sync"
        description="Sync data both ways with your data warehouse."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New sync
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Connection config */}
        <SectionCard
          title="Connection"
          action={<Badge variant="success">Connected</Badge>}
          contentClassName="space-y-4"
        >
          <Field label="Provider">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(PROVIDERS).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <Field label="Host / account">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground break-all">
              {host}
            </div>
          </Field>

          <SettingsList>
            <SettingRow
              title="Sync enabled"
              description="Pause all jobs without deleting them."
              checked={syncEnabled}
              onCheckedChange={setSyncEnabled}
            />
          </SettingsList>

          <Field label="Sync frequency" hint="Default cadence applied to new jobs.">
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </SectionCard>

        {/* Sync jobs */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Sync jobs</h2>
          </div>
          <DataTable
            columns={columns}
            data={jobs}
            getRowKey={(j) => j.id}
            empty={
              <EmptyState
                icon={Database}
                title="No sync jobs found"
                className="rounded-xl border border-border bg-surface-subtle"
                action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New sync</Button>}
              />
            }
          />
        </div>
      </div>

      <CreateSyncDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(j) => setJobs((p) => [{ id: Date.now(), ...j }, ...p])} />
    </MainScreenWrapper>
  );
}

export default WarehouseSyncScreen;
