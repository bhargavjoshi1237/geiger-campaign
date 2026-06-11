"use client";

import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PIPELINES = ["Sales pipeline", "Onboarding"];
const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won"];

const INITIAL_DEALS = [
  { id: 1, name: "Enterprise rollout", company: "Kaisho Industries", value: 96000, stage: "Lead", owner: "Hana Sato" },
  { id: 2, name: "Team seats expansion", company: "Lumen Analytics", value: 8600, stage: "Lead", owner: "Marcus Cole" },
  { id: 3, name: "Premium support contract", company: "Hverk GmbH", value: 33200, stage: "Qualified", owner: "Marcus Cole" },
  { id: 4, name: "Pilot program", company: "Plinth Robotics", value: 5400, stage: "Qualified", owner: "Priya Nair" },
  { id: 5, name: "Onboarding services package", company: "Brightmail Co.", value: 12400, stage: "Proposal", owner: "Priya Nair" },
  { id: 6, name: "Data warehouse add-on", company: "Vela Studios", value: 18900, stage: "Proposal", owner: "Alex Rivera" },
  { id: 7, name: "Annual platform license", company: "Northwind Logistics", value: 48000, stage: "Negotiation", owner: "Alex Rivera" },
  { id: 8, name: "Multi-region SLA", company: "Aria Telecom", value: 64000, stage: "Negotiation", owner: "Hana Sato" },
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Deal name" htmlFor="p-name">
            <Input id="p-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Annual platform license" className="bg-background border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company" htmlFor="p-company">
              <Input id="p-company" value={form.company} onChange={(e) => set("company")(e.target.value)} placeholder="Northwind Logistics" className="bg-background border-border" />
            </Field>
            <Field label="Value (USD)" htmlFor="p-value">
              <Input id="p-value" type="number" min="0" value={form.value} onChange={(e) => set("value")(e.target.value)} placeholder="12400" className="bg-background border-border" />
            </Field>
          </div>
          <Field label="Stage">
            <Select value={form.stage} onValueChange={set("stage")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!valid} className="bg-white text-black hover:bg-[#e5e5e5]">Add deal</Button>
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
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Pipelines"
        description="Visualize and move deals across your sales stages."
        actions={
          <Button onClick={() => setAddOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> Add deal</Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <Select value={pipeline} onValueChange={setPipeline}>
          <SelectTrigger size="sm" className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PIPELINES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const items = byStage[stage];
          const total = items.reduce((sum, d) => sum + (d.value || 0), 0);
          return (
            <div key={stage} className="w-72 shrink-0 rounded-xl border border-border bg-surface-subtle p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{stage}</span>
                  <span className="rounded-md border border-border bg-surface-active px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{items.length}</span>
                </div>
                <span className="text-xs tabular-nums text-text-secondary">{fmt(total)}</span>
              </div>
              <div className="space-y-2">
                {items.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border bg-surface-card p-3">
                    <p className="font-medium text-foreground">{d.name}</p>
                    <p className="text-xs text-text-secondary">{d.company}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm tabular-nums text-foreground">{fmt(d.value)}</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-active py-0.5 pl-0.5 pr-2 text-xs text-muted-foreground">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2f2f2f] text-[10px] font-semibold text-foreground">{initials(d.owner)}</span>
                        {d.owner}
                      </span>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-text-secondary">No deals</div>
                )}
              </div>
            </div>
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
