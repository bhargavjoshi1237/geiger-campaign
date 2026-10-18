"use client";

import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
  Toolbar,
  SectionCard,
  EmptyState,
  Badge,
  Avatar,
  AvatarFallback,
  Field,
} from "@geiger/ui";

const PIPELINES = ["Sales pipeline", "Onboarding"];
const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won"];

const INITIAL_DEALS = [
  { id: 1, name: "Enterprise rollout", company: "Kaisho Industries", value: 96000, stage: "Lead", owner: "Maya Chen" },
  { id: 2, name: "Team seats expansion", company: "Lumen Analytics", value: 8600, stage: "Lead", owner: "Noor Haddad" },
  { id: 3, name: "Premium support contract", company: "Hverk GmbH", value: 33200, stage: "Qualified", owner: "Noor Haddad" },
  { id: 4, name: "Pilot program", company: "Plinth Robotics", value: 5400, stage: "Qualified", owner: "Priya Nair" },
  { id: 5, name: "Onboarding services package", company: "Brightmail Co.", value: 12400, stage: "Proposal", owner: "Priya Nair" },
  { id: 6, name: "Data warehouse add-on", company: "Vela Studios", value: 18900, stage: "Proposal", owner: "Alex Rivera" },
  { id: 7, name: "Annual platform license", company: "Northwind Logistics", value: 48000, stage: "Negotiation", owner: "Alex Rivera" },
  { id: 8, name: "Multi-region SLA", company: "Aria Telecom", value: 64000, stage: "Negotiation", owner: "Maya Chen" },
  { id: 9, name: "Migration & integration", company: "Vela Studios", value: 21500, stage: "Won", owner: "Alex Rivera" },
  { id: 10, name: "Renewal — Growth tier", company: "Crestwood Bank", value: 27800, stage: "Won", owner: "Priya Nair" },
];

const fmt = (n) => `$${Number(n || 0).toLocaleString("en-US")}`;

function initials(name) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function AddDealDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", company: "", value: "", stage: STAGES[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.company.trim();

  const submit = () => {
    if (!valid) return;
    onCreate({
      name: form.name.trim(),
      company: form.company.trim(),
      value: Number(form.value) || 0,
      stage: form.stage,
      owner: "Alex Rivera",
    });
    setForm({ name: "", company: "", value: "", stage: STAGES[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add deal</DialogTitle>
          <DialogDescription>Drop a new card into the selected stage column.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Deal name" htmlFor="p-name">
            <Input id="p-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Annual platform license" className="border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company" htmlFor="p-company">
              <Input id="p-company" value={form.company} onChange={(e) => set("company")(e.target.value)} placeholder="Northwind Logistics" className="border-border" />
            </Field>
            <Field label="Value (USD)" htmlFor="p-value">
              <Input id="p-value" type="number" min="0" value={form.value} onChange={(e) => set("value")(e.target.value)} placeholder="12400" className="border-border" />
            </Field>
          </div>
          <Field label="Stage">
            <Select value={form.stage} onValueChange={set("stage")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Add deal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PipelinesScreen() {
  const [deals, setDeals] = useState(INITIAL_DEALS);
  const [pipeline, setPipeline] = useState(PIPELINES[0]);
  const [addOpen, setAddOpen] = useState(false);

  const byStage = useMemo(() => {
    const groups = Object.fromEntries(STAGES.map((s) => [s, []]));
    deals.forEach((d) => {
      if (groups[d.stage]) groups[d.stage].push(d);
    });
    return groups;
  }, [deals]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Pipelines"
        description="Visualize and move deals across your sales stages."
        actions={
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add deal</Button>
        }
      />

      <Toolbar>
        <Select value={pipeline} onValueChange={setPipeline}>
          <SelectTrigger size="sm" className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PIPELINES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </Toolbar>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const items = byStage[stage];
          const total = items.reduce((sum, d) => sum + (d.value || 0), 0);
          return (
            <SectionCard
              key={stage}
              title={
                <span className="flex items-center gap-2 text-sm">
                  {stage}
                  <Badge variant="neutral" className="tabular-nums">{items.length}</Badge>
                </span>
              }
              action={<span className="text-xs tabular-nums text-text-secondary">{fmt(total)}</span>}
              className="w-72 shrink-0"
              contentClassName="space-y-2 p-3"
            >
              {items.map((d) => (
                <div key={d.id} className="rounded-lg border border-border bg-surface-card p-3">
                  <p className="font-medium text-foreground">{d.name}</p>
                  <p className="text-xs text-text-secondary">{d.company}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm tabular-nums text-foreground">{fmt(d.value)}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-active py-0.5 pl-0.5 pr-2 text-xs text-muted-foreground">
                      <Avatar className="size-5">
                        <AvatarFallback className="bg-surface-strong text-[10px] font-semibold text-foreground">{initials(d.owner)}</AvatarFallback>
                      </Avatar>
                      {d.owner}
                    </span>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <EmptyState title="No deals" className="rounded-lg border border-dashed border-border py-8" />
              )}
            </SectionCard>
          );
        })}
      </div>

      <AddDealDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={(d) => setDeals((prev) => [{ id: Date.now(), ...d }, ...prev])}
      />
    </MainScreenWrapper>
  );
}

export default PipelinesScreen;
