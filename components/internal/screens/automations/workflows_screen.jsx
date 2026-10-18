"use client";

import React, { useMemo, useState } from "react";
import { Plus, Workflow, Pencil, Copy, BarChart3, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  SectionCard,
  EmptyState,
} from "@geiger/ui";

const TRIGGERS = ["Joins a list", "Submits a form", "Abandons cart", "Tag added", "Birthday", "Makes a purchase", "Becomes inactive"];

const INITIAL = [
  { id: 1, name: "Welcome series", description: "3-email onboarding for new subscribers", trigger: "Joins a list", steps: 5, enrolled: 1240, conversion: 28, status: "Active" },
  { id: 2, name: "Abandoned cart recovery", description: "Reminder sequence with discount escalation", trigger: "Abandons cart", steps: 3, enrolled: 860, conversion: 41, status: "Active" },
  { id: 3, name: "Post-purchase nurture", description: "Cross-sell and review request", trigger: "Makes a purchase", steps: 4, enrolled: 2110, conversion: 19, status: "Active" },
  { id: 4, name: "Win-back", description: "Re-engage contacts inactive 60+ days", trigger: "Becomes inactive", steps: 3, enrolled: 540, conversion: 9, status: "Paused" },
  { id: 5, name: "Birthday reward", description: "Annual coupon on the contact's birthday", trigger: "Birthday", steps: 2, enrolled: 0, conversion: 0, status: "Draft" },
];

const STATUS_TONE = { Active: "success", Paused: "warning", Draft: "neutral" };

function CreateWorkflowDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", trigger: TRIGGERS[0], goal: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), description: form.goal.trim() || `Triggered when a contact ${form.trigger.toLowerCase()}`, trigger: form.trigger, steps: 1, enrolled: 0, conversion: 0, status: "Draft" });
    setForm({ name: "", trigger: TRIGGERS[0], goal: "" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workflow</DialogTitle>
          <DialogDescription>Pick a trigger to start — you'll build the steps on the canvas next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Workflow name" htmlFor="wf-name">
            <Input id="wf-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Welcome series" />
          </Field>
          <Field label="Entry trigger">
            <Select value={form.trigger} onValueChange={set("trigger")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Goal" htmlFor="wf-goal" hint="Optional — what should a contact do to count as converted?">
            <Input id="wf-goal" value={form.goal} onChange={(e) => set("goal")(e.target.value)} placeholder="e.g. Completes a purchase" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create workflow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowsScreen() {
  const [workflows, setWorkflows] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workflows.filter((w) => (statusFilter === "All" || w.status === statusFilter) && (!q || w.name.toLowerCase().includes(q)));
  }, [workflows, query, statusFilter]);

  const toggle = (id) => setWorkflows((p) => p.map((w) => (w.id === id ? { ...w, status: w.status === "Active" ? "Paused" : "Active" } : w)));

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Workflows"
        description="Automated, multi-step sequences that run when a contact meets a trigger."
        actions={
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create workflow</Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 justify-between bg-surface-card sm:w-40">
                {statusFilter === "All" ? "All statuses" : statusFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              <DropdownMenuLabel className="text-text-secondary">Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["All", "Active", "Paused", "Draft"].map((s) => (
                <DropdownMenuItem key={s} onSelect={() => setStatusFilter(s)} className={cn("cursor-pointer", statusFilter === s && "font-medium")}>
                  {s === "All" ? "All statuses" : s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search workflows…" />
      </Toolbar>

      {/* Table keeps shadcn Table for the per-row inactive dimming */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No workflows found"
          description="No workflows match your filters."
          className="rounded-xl border border-border bg-surface-subtle"
          action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create workflow</Button>}
        />
      ) : (
        <SectionCard bodyPadding={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Workflow</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Conversion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w) => (
                <TableRow key={w.id} className={cn("border-border", w.status !== "Active" && "opacity-70")}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                        <Workflow className="h-4 w-4" />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium text-foreground">{w.name}</span>
                        <span className="truncate text-xs text-text-secondary">{w.description}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{w.trigger}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{w.steps}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{w.enrolled.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums font-medium text-foreground">{w.conversion}%</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={w.status === "Active"} onCheckedChange={() => toggle(w.id)} disabled={w.status === "Draft"} aria-label={`Toggle ${w.name}`} />
                      <Badge variant={STATUS_TONE[w.status]}>{w.status}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionMenu
                      label={`Actions for ${w.name}`}
                      items={[
                        { label: "Edit workflow", icon: Pencil },
                        { label: "Duplicate", icon: Copy },
                        { label: "View report", icon: BarChart3 },
                        { separator: true },
                        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setWorkflows((p) => p.filter((x) => x.id !== w.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      <CreateWorkflowDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(w) => setWorkflows((p) => [{ id: Date.now(), ...w }, ...p])} />
    </MainScreenWrapper>
  );
}

export default WorkflowsScreen;
