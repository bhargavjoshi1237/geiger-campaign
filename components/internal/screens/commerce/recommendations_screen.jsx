"use client";

import React, { useState } from "react";
import { Plus, Pencil, Copy, Trash2, Sparkles } from "lucide-react";
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

const STATUS_TONE = { Active: "success", Paused: "warning" };

const STRATEGY_TONE = {
  "Best sellers": "success",
  "Recently viewed": "info",
  "Cross-sell": "purple",
  "AI personalized": "warning",
  Trending: "neutral",
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
        <div className="space-y-4 py-4">
          <Field label="Block name" htmlFor="b-name">
            <Input id="b-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. You may also like" className="border-border" />
          </Field>
          <Field label="Strategy">
            <Select value={form.strategy} onValueChange={set("strategy")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Placement">
              <Select value={form.placement} onValueChange={set("placement")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Items shown">
              <Select value={form.items} onValueChange={set("items")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_COUNTS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create block</Button>
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

  const columns = [
    { key: "block", header: "Block", className: "font-medium text-foreground", render: (b) => b.name },
    { key: "strategy", header: "Strategy", render: (b) => <Badge variant={STRATEGY_TONE[b.strategy]}>{b.strategy}</Badge> },
    { key: "placement", header: "Placement", className: "text-muted-foreground", render: (b) => b.placement },
    { key: "items", header: "Items shown", className: "tabular-nums text-muted-foreground", render: (b) => b.items },
    { key: "status", header: "Status", render: (b) => <Badge variant={STATUS_TONE[b.status]}>{b.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (b) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Duplicate", icon: Copy, onSelect: () => duplicate(b) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setBlocks((prev) => prev.filter((x) => x.id !== b.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Recommendations"
        description="Personalized product blocks powered by shopper behavior."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New block
          </Button>
        }
      />

      <div>
        <SectionCard>
          <SettingsList>
            <SettingRow
              icon={Sparkles}
              title="AI personalized recommendations"
              description="Let Geiger tailor product picks per shopper using browse and purchase history."
              checked={aiEnabled}
              onCheckedChange={setAiEnabled}
            />
          </SettingsList>
        </SectionCard>
      </div>

      <h2 className="text-sm font-semibold text-foreground">Recommendation blocks</h2>

      <DataTable
        columns={columns}
        data={blocks}
        getRowKey={(b) => b.id}
        empty={
          <EmptyState
            icon={Sparkles}
            title="No recommendation blocks found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New block
              </Button>
            }
          />
        }
      />

      <NewBlockDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(b) => setBlocks((prev) => [{ id: Date.now(), ...b }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default RecommendationsScreen;
