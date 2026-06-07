"use client";

import React, { useMemo, useState } from "react";
import { Plus, Handshake, Pencil, MoveRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STAGE_TONE = {
  Lead: "zinc",
  Qualified: "blue",
  Proposal: "violet",
  Negotiation: "amber",
  Won: "green",
  Lost: "red",
};

const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const STAGE_FILTERS = ["All", ...STAGES];
const OWNERS = ["Alex Rivera", "Priya Nair", "Marcus Cole", "Hana Sato"];

const INITIAL_DEALS = [
  { id: 1, name: "Annual platform license", company: "Northwind Logistics", value: 48000, stage: "Negotiation", owner: "Alex Rivera", close: "Jun 30, 2026" },
  { id: 2, name: "Onboarding services package", company: "Brightmail Co.", value: 12400, stage: "Proposal", owner: "Priya Nair", close: "Jun 24, 2026" },
  { id: 3, name: "Team seats expansion", company: "Lumen Analytics", value: 8600, stage: "Qualified", owner: "Marcus Cole", close: "Jul 12, 2026" },
  { id: 4, name: "Enterprise rollout", company: "Kaisho Industries", value: 96000, stage: "Lead", owner: "Hana Sato", close: "Aug 5, 2026" },
  { id: 5, name: "Migration & integration", company: "Vela Studios", value: 21500, stage: "Won", owner: "Alex Rivera", close: "Jun 2, 2026" },
  { id: 6, name: "Pilot program", company: "Plinth Robotics", value: 5400, stage: "Lost", owner: "Priya Nair", close: "May 28, 2026" },
  { id: 7, name: "Premium support contract", company: "Hverk GmbH", value: 33200, stage: "Qualified", owner: "Marcus Cole", close: "Jul 1, 2026" },
];

const fmt = (n) => `$${Number(n || 0).toLocaleString("en-US")}`;

function CreateDealDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", company: "", value: "", stage: "Lead", owner: OWNERS[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.company.trim();

  const submit = () => {
    if (!valid) return;
    onCreate({
      name: form.name.trim(),
      company: form.company.trim(),
      value: Number(form.value) || 0,
      stage: form.stage,
      owner: form.owner,
      close: "—",
    });
    setForm({ name: "", company: "", value: "", stage: "Lead", owner: OWNERS[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create deal</DialogTitle>
          <DialogDescription>Add a new opportunity to your pipeline.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Deal name" htmlFor="d-name">
            <Input id="d-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Annual platform license" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company" htmlFor="d-company">
              <Input id="d-company" value={form.company} onChange={(e) => set("company")(e.target.value)} placeholder="Northwind Logistics" className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
            <Field label="Value (USD)" htmlFor="d-value">
              <Input id="d-value" type="number" min="0" value={form.value} onChange={(e) => set("value")(e.target.value)} placeholder="12400" className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <Select value={form.stage} onValueChange={set("stage")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Owner">
              <Select value={form.owner} onValueChange={set("owner")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!valid} className="bg-white text-black hover:bg-[#e5e5e5]">Create deal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DealsScreen() {
  const [deals, setDeals] = useState(INITIAL_DEALS);
  const [stageFilter, setStageFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () => deals.filter((d) => stageFilter === "All" || d.stage === stageFilter),
    [deals, stageFilter],
  );

  const moveStage = (id) =>
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const i = STAGES.indexOf(d.stage);
        return { ...d, stage: STAGES[Math.min(i + 1, STAGES.length - 1)] };
      }),
    );

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Deals"
        description="Track every opportunity from first touch to close."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> Create deal</Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-40">
              {stageFilter === "All" ? "All stages" : stageFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by stage</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {STAGE_FILTERS.map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => setStageFilter(s)}
                className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", stageFilter === s && "text-white")}
              >
                {s === "All" ? "All stages" : s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Deal</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Close date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((d) => (
              <TableRow key={d.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                      <Handshake className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{d.name}</span>
                      <span className="truncate text-xs text-[#737373]">{d.company}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-[#ededed]">{fmt(d.value)}</TableCell>
                <TableCell><Pill tone={STAGE_TONE[d.stage]}>{d.stage}</Pill></TableCell>
                <TableCell className="text-[#a3a3a3]">{d.owner}</TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{d.close}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit deal", icon: Pencil },
                      { label: "Move stage", icon: MoveRight, onSelect: () => moveStage(d.id) },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setDeals((p) => p.filter((x) => x.id !== d.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No deals found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <p className="text-xs text-[#737373]">Showing {filtered.length} of {deals.length} deals</p>

      <CreateDealDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(d) => setDeals((prev) => [{ id: Date.now(), ...d }, ...prev])}
      />
    </MainScreenWrapper>
  );
}

export default DealsScreen;
