"use client";

import React, { useState } from "react";
import { Plus, Pencil, Copy, Trash2, Sparkles } from "lucide-react";
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

const STATUS_TONE = { Active: "green", Paused: "amber" };

const STRATEGY_TONE = {
  "Best sellers": "green",
  "Recently viewed": "blue",
  "Cross-sell": "violet",
  "AI personalized": "amber",
  Trending: "zinc",
};

const STRATEGIES = ["Best sellers", "Recently viewed", "Cross-sell", "AI personalized", "Trending"];
const PLACEMENTS = ["Cart email", "Post-purchase", "Homepage", "Product page", "Abandoned cart email"];
const ITEM_COUNTS = ["3", "4", "6"];

const INITIAL = [
  { id: 1, name: "You may also like", strategy: "Cross-sell", placement: "Product page", items: 4, status: "Active" },
  { id: 2, name: "Trending this week", strategy: "Trending", placement: "Homepage", items: 6, status: "Active" },
  { id: 3, name: "Picked for you", strategy: "AI personalized", placement: "Cart email", items: 3, status: "Active" },
  { id: 4, name: "Customers also bought", strategy: "Best sellers", placement: "Post-purchase", items: 4, status: "Paused" },
  { id: 5, name: "Back where you left off", strategy: "Recently viewed", placement: "Abandoned cart email", items: 3, status: "Active" },
  { id: 6, name: "Top sellers carousel", strategy: "Best sellers", placement: "Homepage", items: 6, status: "Paused" },
];

function NewBlockDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", strategy: STRATEGIES[0], placement: PLACEMENTS[0], items: "4" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      strategy: form.strategy,
      placement: form.placement,
      items: parseInt(form.items, 10),
      status: "Active",
    });
    setForm({ name: "", strategy: STRATEGIES[0], placement: PLACEMENTS[0], items: "4" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New recommendation block</DialogTitle>
          <DialogDescription>Choose a strategy and where the block appears for shoppers.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Block name" htmlFor="b-name">
            <Input id="b-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. You may also like" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Strategy">
            <Select value={form.strategy} onValueChange={set("strategy")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Placement">
              <Select value={form.placement} onValueChange={set("placement")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Items shown">
              <Select value={form.items} onValueChange={set("items")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_COUNTS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create block</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecommendationsScreen() {
  const [blocks, setBlocks] = useState(INITIAL);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const duplicate = (b) =>
    setBlocks((prev) => [{ ...b, id: Date.now(), name: `${b.name} (Copy)` }, ...prev]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Recommendations"
        description="Personalized product blocks powered by shopper behavior."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New block
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-400"><Sparkles className="h-4 w-4" /></span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">AI personalized recommendations</p>
              <p className="text-xs text-[#737373]">Let Geiger tailor product picks per shopper using browse and purchase history.</p>
            </div>
          </div>
          <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
        </div>
      </div>

      <h2 className="text-sm font-semibold text-[#ededed]">Recommendation blocks</h2>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Block</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Items shown</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocks.map((b) => (
              <TableRow key={b.id} className="border-[#2a2a2a]">
                <TableCell className="font-medium text-[#ededed]">{b.name}</TableCell>
                <TableCell><Pill tone={STRATEGY_TONE[b.strategy]}>{b.strategy}</Pill></TableCell>
                <TableCell className="text-[#a3a3a3]">{b.placement}</TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{b.items}</TableCell>
                <TableCell><Pill tone={STATUS_TONE[b.status]}>{b.status}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Duplicate", icon: Copy, onSelect: () => duplicate(b) },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setBlocks((prev) => prev.filter((x) => x.id !== b.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {blocks.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No recommendation blocks found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <NewBlockDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(b) => setBlocks((prev) => [{ id: Date.now(), ...b }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default RecommendationsScreen;
