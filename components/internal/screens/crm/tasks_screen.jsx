"use client";

import React, { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PRIORITY_TONE = { High: "red", Medium: "amber", Low: "zinc" };
const PRIORITIES = ["High", "Medium", "Low"];
const ASSIGNEES = ["Alex Rivera", "Priya Nair", "Marcus Cole", "Hana Sato"];

const INITIAL_TASKS = [
  { id: 1, title: "Send pricing proposal", related: "Annual platform license", priority: "High", due: "Jun 9, 2026", assignee: "Alex Rivera", done: false },
  { id: 2, title: "Follow up after demo", related: "Kaisho Industries", priority: "Medium", due: "Jun 10, 2026", assignee: "Hana Sato", done: false },
  { id: 3, title: "Schedule onboarding call", related: "Brightmail Co.", priority: "Medium", due: "Jun 11, 2026", assignee: "Priya Nair", done: false },
  { id: 4, title: "Confirm contract terms", related: "Multi-region SLA", priority: "High", due: "Jun 8, 2026", assignee: "Hana Sato", done: false },
  { id: 5, title: "Log meeting notes", related: "Lumen Analytics", priority: "Low", due: "Jun 6, 2026", assignee: "Marcus Cole", done: true },
  { id: 6, title: "Reply to support question", related: "Hverk GmbH", priority: "Low", due: "Jun 12, 2026", assignee: "Marcus Cole", done: false },
  { id: 7, title: "Prepare renewal quote", related: "Crestwood Bank", priority: "Medium", due: "Jun 15, 2026", assignee: "Priya Nair", done: false },
];

function AddTaskDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ title: "", related: "", priority: "Medium", due: "", assignee: ASSIGNEES[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.title.trim();

  const submit = () => {
    if (!valid) return;
    onCreate({
      title: form.title.trim(),
      related: form.related.trim() || "—",
      priority: form.priority,
      due: form.due || "—",
      assignee: form.assignee,
      done: false,
    });
    setForm({ title: "", related: "", priority: "Medium", due: "", assignee: ASSIGNEES[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add task</DialogTitle>
          <DialogDescription>Create a follow-up tied to a deal or contact.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Task title" htmlFor="t-title">
            <Input id="t-title" value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Send pricing proposal" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Related to" htmlFor="t-related" hint="Deal or contact name.">
            <Input id="t-related" value={form.related} onChange={(e) => set("related")(e.target.value)} placeholder="Annual platform license" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Select value={form.priority} onValueChange={set("priority")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date" htmlFor="t-due">
              <Input id="t-due" type="date" value={form.due} onChange={(e) => set("due")(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
          </div>
          <Field label="Assignee">
            <Select value={form.assignee} onValueChange={set("assignee")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!valid} className="bg-white text-black hover:bg-[#e5e5e5]">Add task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TasksScreen() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [addOpen, setAddOpen] = useState(false);

  const toggleDone = (id) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Tasks"
        description="Follow-ups and to-dos tied to your deals and contacts."
        actions={
          <Button onClick={() => setAddOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> Add task</Button>
        }
      />

      <TableShell className="mt-4">
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead className="w-10 pr-0" />
              <TableHead>Task</TableHead>
              <TableHead>Related to</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.id} className={cn("border-[#2a2a2a]", t.done && "opacity-50")}>
                <TableCell className="pr-0">
                  <Checkbox checked={t.done} onCheckedChange={() => toggleDone(t.id)} aria-label={`Complete ${t.title}`} />
                </TableCell>
                <TableCell>
                  <span className={cn("font-medium text-[#ededed]", t.done && "line-through")}>{t.title}</span>
                </TableCell>
                <TableCell className="text-[#a3a3a3]">{t.related}</TableCell>
                <TableCell><Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{t.due}</TableCell>
                <TableCell className="text-[#a3a3a3]">{t.assignee}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit task", icon: Pencil },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setTasks((p) => p.filter((x) => x.id !== t.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-sm text-[#737373]">No tasks found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={(t) => setTasks((prev) => [{ id: Date.now(), ...t }, ...prev])}
      />
    </MainScreenWrapper>
  );
}

export default TasksScreen;
