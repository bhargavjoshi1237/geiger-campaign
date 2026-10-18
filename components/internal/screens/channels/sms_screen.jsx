"use client";

import React, { useState } from "react";
import { Plus, Smartphone, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SectionCard,
  SettingRow,
  SettingsList,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const TYPE_TONE = {
  "Long code": "neutral",
  "Toll-free": "info",
  "Short code": "purple",
};

const COUNTRIES = ["United States", "United Kingdom", "Canada", "Australia"];
const NUMBER_TYPES = ["Long code", "Toll-free", "Short code"];

const INITIAL_NUMBERS = [
  { id: 1, number: "+1 (415) 555-0142", country: "United States", type: "Long code", capabilities: ["SMS", "MMS"], status: "Active" },
  { id: 2, number: "+1 (888) 555-0177", country: "United States", type: "Toll-free", capabilities: ["SMS"], status: "Active" },
  { id: 3, number: "+44 7400 555231", country: "United Kingdom", type: "Long code", capabilities: ["SMS"], status: "Active" },
  { id: 4, number: "55512", country: "United States", type: "Short code", capabilities: ["SMS", "MMS"], status: "Active" },
  { id: 5, number: "+1 (604) 555-0119", country: "Canada", type: "Long code", capabilities: ["SMS"], status: "Pending" },
];

function AddNumberDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ country: COUNTRIES[0], type: NUMBER_TYPES[0], areaCode: "" });

  const submit = () => {
    onCreate({
      number: form.areaCode.trim() ? `+1 (${form.areaCode.trim()}) 555-01XX` : "Provisioning…",
      country: form.country,
      type: form.type,
      capabilities: form.type === "Toll-free" ? ["SMS"] : ["SMS", "MMS"],
      status: "Pending",
    });
    setForm({ country: COUNTRIES[0], type: NUMBER_TYPES[0], areaCode: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add sending number</DialogTitle>
          <DialogDescription>Provision a new number for SMS campaigns. It activates once carrier registration completes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Country">
            <Select value={form.country} onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Number type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{NUMBER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Preferred area code" htmlFor="n-area" hint="We'll provision an available number.">
            <Input id="n-area" value={form.areaCode} onChange={(e) => setForm((f) => ({ ...f, areaCode: e.target.value }))} placeholder="e.g. 415" className="border-border" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Add number</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SmsScreen() {
  const [numbers, setNumbers] = useState(INITIAL_NUMBERS);
  const [createOpen, setCreateOpen] = useState(false);

  const [defaultNumber, setDefaultNumber] = useState(INITIAL_NUMBERS[0].number);
  const [optOutKeyword, setOptOutKeyword] = useState("STOP");
  const [helpKeyword, setHelpKeyword] = useState("HELP");
  const [appendOptOut, setAppendOptOut] = useState(true);

  const release = (id) => setNumbers((p) => p.filter((n) => n.id !== id));

  const columns = [
    {
      key: "number",
      header: "Number",
      render: (n) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Smartphone className="h-4 w-4" />
          </span>
          <span className="font-mono text-foreground">{n.number}</span>
        </div>
      ),
    },
    { key: "country", header: "Country", className: "text-muted-foreground", render: (n) => n.country },
    { key: "type", header: "Type", render: (n) => <Badge variant={TYPE_TONE[n.type]}>{n.type}</Badge> },
    {
      key: "capabilities",
      header: "Capabilities",
      render: (n) => (
        <div className="flex flex-wrap gap-1">
          {n.capabilities.map((c) => (
            <span key={c} className="rounded-md border border-border bg-surface-active px-1.5 py-0.5 text-xs text-muted-foreground">{c}</span>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (n) => <Badge variant={n.status === "Active" ? "success" : "warning"}>{n.status}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (n) => (
        <ActionMenu
          items={[
            { label: "Release number", icon: Trash2, destructive: true, onSelect: () => release(n.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="SMS"
        description="Manage sending numbers, sender IDs, and opt-out compliance."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add number
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <SectionCard title="SMS settings" contentClassName="space-y-4">
          <Field label="Default sender number">
            <Select value={defaultNumber} onValueChange={setDefaultNumber}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {numbers.map((n) => <SelectItem key={n.id} value={n.number}>{n.number}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Opt-out keyword" htmlFor="s-optout">
            <Input id="s-optout" value={optOutKeyword} onChange={(e) => setOptOutKeyword(e.target.value)} className="border-border" />
          </Field>
          <Field label="Help keyword" htmlFor="s-help">
            <Input id="s-help" value={helpKeyword} onChange={(e) => setHelpKeyword(e.target.value)} className="border-border" />
          </Field>

          <SettingsList>
            <SettingRow
              title="Append opt-out notice to first message"
              description={`Adds "Reply ${optOutKeyword} to unsubscribe" to a contact's first SMS.`}
              checked={appendOptOut}
              onCheckedChange={setAppendOptOut}
            />
          </SettingsList>
        </SectionCard>

        {/* Sending numbers */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Sending numbers</h2>
            <p className="text-xs text-text-secondary">Numbers and short codes registered to your account.</p>
          </div>

          <DataTable
            columns={columns}
            data={numbers}
            getRowKey={(n) => n.id}
            empty={
              <EmptyState
                icon={Smartphone}
                title="No sending numbers found"
                className="rounded-xl border border-border bg-surface-subtle"
                action={
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> Add number
                  </Button>
                }
              />
            }
          />
        </div>
      </div>

      <AddNumberDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(n) => setNumbers((p) => [{ id: Date.now(), ...n }, ...p])} />
    </MainScreenWrapper>
  );
}

export default SmsScreen;
