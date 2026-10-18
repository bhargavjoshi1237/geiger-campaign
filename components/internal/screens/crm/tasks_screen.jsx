"use client";

import React, { useState } from "react";
import { Plus, Pencil, Trash2, ListTodo } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  Checkbox,
  ScreenHeader,
  SectionCard,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const PRIORITY_TONE = { High: "danger", Medium: "warning", Low: "neutral" };
const PRIORITIES = ["High", "Medium", "Low"];
const ASSIGNEES = ["Alex Rivera", "Priya Nair", "Noor Haddad", "Maya Chen"];

const INITIAL_TASKS = [
  { id: 1, title: "Send pricing proposal", related: "Annual platform license", priority: "High", due: "Jun 9, 2026", assignee: "Alex Rivera", done: false },
  { id: 2, title: "Follow up after demo", related: "Kaisho Industries", priority: "Medium", due: "Jun 10, 2026", assignee: "Maya Chen", done: false },
  { id: 3, title: "Schedule onboarding call", related: "Brightmail Co.", priority: "Medium", due: "Jun 11, 2026", assignee: "Priya Nair", done: false },
  { id: 4, title: "Confirm contract terms", related: "Multi-region SLA", priority: "High", due: "Jun 8, 2026", assignee: "Maya Chen", done: false },
  { id: 5, title: "Log meeting notes", related: "Lumen Analytics", priority: "Low", due: "Jun 6, 2026", assignee: "Noor Haddad", done: true },
  { id: 6, title: "Reply to support question", related: "Hverk GmbH", priority: "Low", due: "Jun 12, 2026", assignee: "Noor Haddad", done: false },
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
        <div className="space-y-4 py-4">
          <Field label="Task title" htmlFor="t-title">
            <Input id="t-title" value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Send pricing proposal" className="border-border" />
          </Field>
          <Field label="Related to" htmlFor="t-related" hint="Deal or contact name.">
            <Input id="t-related" value={form.related} onChange={(e) => set("related")(e.target.value)} placeholder="Annual platform license" className="border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Select value={form.priority} onValueChange={set("priority")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date" htmlFor="t-due">
              <Input id="t-due" type="date" value={form.due} onChange={(e) => set("due")(e.target.value)} className="border-border" />
            </Field>
          </div>
          <Field label="Assignee">
            <Select value={form.assignee} onValueChange={set("assignee")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Add task</Button>
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
    <MainScreenWrapper>
      <ScreenHeader
        title="Tasks"
        description="Follow-ups and to-dos tied to your deals and contacts."
        actions={
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add task</Button>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks found"
          className="rounded-xl border border-border bg-surface-subtle"
          action={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add task</Button>}
        />
      ) : (
        <SectionCard bodyPadding={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
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
                <TableRow key={t.id} className={cn("border-border", t.done && "opacity-50")}>
                  <TableCell className="pr-0">
                    <Checkbox checked={t.done} onCheckedChange={() => toggleDone(t.id)} aria-label={`Complete ${t.title}`} />
                  </TableCell>
                  <TableCell>
                    <span className={cn("font-medium text-foreground", t.done && "line-through")}>{t.title}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.related}</TableCell>
                  <TableCell><Badge variant={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{t.due}</TableCell>
                  <TableCell className="text-muted-foreground">{t.assignee}</TableCell>
                  <TableCell className="text-right">
                    <ActionMenu
                      items={[
                        { label: "Edit task", icon: Pencil },
                        { separator: true },
                        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setTasks((p) => p.filter((x) => x.id !== t.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={(t) => setTasks((prev) => [{ id: Date.now(), ...t }, ...prev])}
      />
    </MainScreenWrapper>
  );
}

export default TasksScreen;
