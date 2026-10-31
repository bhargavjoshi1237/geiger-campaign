"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, FileText, ListTodo, Loader2, Pencil, Plus, RotateCcw, Trash2, UserCheck } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import {
  ActionMenu,
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  InlineTitleInput,
  Input,
  LoadingArea,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  Switch,
  Textarea,
  Toolbar,
  cn,
} from "@geiger/ui";
import { createTask, listTasks, softDeleteTask, updateTask } from "@/lib/supabase/crm_tasks";
import { listDeals } from "@/lib/supabase/deals";
import { listCompanies } from "@/lib/supabase/companies";
import { listContacts } from "@/lib/supabase/contacts";
import { TASK_PRIORITIES, TASK_PRIORITY_MAP, TASK_STATUS_MAP } from "@/lib/crm/constants";
import { dueState, formatDateTime, fromLocalInput, toLocalInput } from "@/lib/crm/format";
import {
  DeleteDialog,
  OUTLINE_BTN,
  PRIMARY_BTN,
  PersonChip,
  PersonSelect,
  RecordLink,
  RecordPicker,
  personName,
  recordLabel,
  useCrmPeople,
  useRecordIndex,
} from "./crm_shared";

const SCOPE_OPTIONS = [
  { value: "mine", label: "My tasks" },
  { value: "all", label: "All tasks" },
];

const DUE_FILTER_OPTIONS = [
  { value: "all", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "none", label: "No due date" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "all", label: "All statuses" },
];

const PRIORITY_FILTER_OPTIONS = [{ value: "all", label: "All priorities" }, ...TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_MAP[p].label }))];

const TASK_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "What needs doing and the record it's for." },
  { key: "assignment", label: "Assignment", icon: UserCheck, desc: "Who owns it, when it's due, and whether it's done." },
];

const WEEK = 7 * 24 * 60 * 60 * 1000;

function PrioritySelect({ value, onChange, disabled, id }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{TASK_PRIORITY_MAP[p].label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DueLabel({ task, now }) {
  if (!task.dueAt) return <span className="text-text-tertiary">—</span>;
  const state = task.status === "open" ? dueState(task.dueAt, new Date(now)) : "none";
  return (
    <span className={cn(state === "overdue" && "text-red-600 dark:text-red-400", state === "today" && "text-amber-600 dark:text-amber-400")}>
      {state === "overdue" ? "Overdue · " : state === "today" ? "Today · " : ""}
      {formatDateTime(task.dueAt)}
    </span>
  );
}

function AddTaskDialog({ open, onOpenChange, onCreate, index, people, me }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>A follow-up tied to a deal, company or contact.</DialogDescription>
        </DialogHeader>
        <AddTaskForm onClose={() => onOpenChange(false)} onCreate={onCreate} index={index} people={people} me={me} />
      </DialogContent>
    </Dialog>
  );
}

function AddTaskForm({ onClose, onCreate, index, people, me }) {
  const [form, setForm] = useState({ title: "", notes: "", record: null, priority: "medium", due: "", assigneeId: me?.id || null });
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Give the task a title.");
      return;
    }
    setPending(true);
    const ok = await onCreate({
      title: form.title.trim(),
      notes: form.notes.trim(),
      relatedType: form.record?.type || null,
      relatedId: form.record?.id || null,
      priority: form.priority,
      dueAt: fromLocalInput(form.due),
      assigneeId: form.assigneeId,
    });
    setPending(false);
    if (ok) onClose();
  };

  return (
    <>
      <div className="grid gap-4">
        <Field label="Task" htmlFor="t-title">
          <Input
            id="t-title"
            value={form.title}
            onChange={(e) => set("title")(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Send the revised proposal"
            autoFocus
          />
        </Field>
        <Field label="Related to">
          <RecordPicker value={form.record} onChange={set("record")} index={index} ariaLabel="Related record" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due" htmlFor="t-due">
            <Input id="t-due" type="datetime-local" value={form.due} onChange={(e) => set("due")(e.target.value)} />
          </Field>
          <Field label="Priority" htmlFor="t-priority">
            <PrioritySelect id="t-priority" value={form.priority} onChange={set("priority")} />
          </Field>
        </div>
        <Field label="Assignee">
          <PersonSelect value={form.assigneeId} onChange={set("assigneeId")} people={people} me={me} ariaLabel="Assignee" />
        </Field>
        <Field label="Notes" htmlFor="t-notes">
          <Textarea id="t-notes" value={form.notes} onChange={(e) => set("notes")(e.target.value)} placeholder="Context for whoever picks this up" />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button className={PRIMARY_BTN} disabled={pending} onClick={submit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add task
        </Button>
      </DialogFooter>
    </>
  );
}

const toDraft = (t) => ({
  title: t.title || "",
  notes: t.notes || "",
  record: t.relatedType && t.relatedId ? { type: t.relatedType, id: t.relatedId } : null,
  priority: t.priority,
  due: toLocalInput(t.dueAt),
  assigneeId: t.assigneeId || null,
  done: t.status === "done",
});

function TaskEditor({ task, index, people, byId, me, canEdit, now, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(task));
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(task));

  const save = async () => {
    setSaving(true);
    const patch = {
      title: draft.title.trim() || "Untitled task",
      notes: draft.notes.trim(),
      relatedType: draft.record?.type || null,
      relatedId: draft.record?.id || null,
      priority: draft.priority,
      dueAt: fromLocalInput(draft.due),
      assigneeId: draft.assigneeId,
      status: draft.done ? "done" : "open",
    };
    const ok = await onSave(task, patch);
    setSaving(false);
    if (ok) setDraft(toDraft({ ...task, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Tasks", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.title}
          onChange={(e) => set("title")(e.target.value)}
          aria-label="Task title"
          placeholder="Untitled task"
          readOnly={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={task.status}
      statusMap={TASK_STATUS_MAP}
      badges={
        <>
          <Badge variant={TASK_PRIORITY_MAP[task.priority].variant}>{TASK_PRIORITY_MAP[task.priority].label}</Badge>
          <span className="text-xs tabular-nums text-text-secondary">
            <DueLabel task={task} now={now} />
          </span>
          <PersonChip name={personName(byId, task.assigneeId, me)} className="text-xs text-text-secondary" />
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete task"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(task)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BTN} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={TASK_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Task details" description="What needs doing, the record it's for and any context for whoever picks it up.">
              <div className="grid gap-4">
                <Field label="Task" htmlFor="te-title">
                  <Input id="te-title" value={draft.title} onChange={(e) => set("title")(e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Related to" hint={draft.record ? undefined : "Link the deal, company or contact this is for."}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <RecordPicker value={draft.record} onChange={set("record")} index={index} disabled={!canEdit} ariaLabel="Related record" className="sm:max-w-sm" />
                    {task.relatedId ? <RecordLink type={task.relatedType} id={task.relatedId} label={`Open ${recordLabel(index, task.relatedType, task.relatedId)}`} /> : null}
                  </div>
                </Field>
                <Field label="Notes" htmlFor="te-notes">
                  <Textarea id="te-notes" value={draft.notes} onChange={(e) => set("notes")(e.target.value)} placeholder="Context for whoever picks this up" className="min-h-28" disabled={!canEdit} />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "assignment" ? (
            <SectionCard bare title="Owner & due date" description="Who's responsible, how urgent it is and when it's due.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Assignee">
                  <PersonSelect value={draft.assigneeId} onChange={set("assigneeId")} people={people} me={me} disabled={!canEdit} ariaLabel="Assignee" />
                </Field>
                <Field label="Priority" htmlFor="te-priority">
                  <PrioritySelect id="te-priority" value={draft.priority} onChange={set("priority")} disabled={!canEdit} />
                </Field>
                <Field label="Due" htmlFor="te-due">
                  <Input id="te-due" type="datetime-local" value={draft.due} onChange={(e) => set("due")(e.target.value)} disabled={!canEdit} />
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Completed"
                  description={task.completedAt ? `Completed ${formatDateTime(task.completedAt)}.` : "Done tasks drop out of the open count."}
                  control={<Switch checked={draft.done} disabled={!canEdit} onCheckedChange={set("done")} aria-label="Completed" />}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function TasksScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.crm.edit");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const { people, byId, me } = useCrmPeople(projectId);

  const [tasks, setTasks] = useState([]);
  const [deals, setDeals] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [now] = useState(() => Date.now());

  const [scope, setScope] = useState("mine");
  const [query, setQuery] = useState("");
  const [dueFilter, setDueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listTasks(projectId), listDeals(projectId), listCompanies(projectId), listContacts(projectId)]).then(
      ([taskRows, dealRows, companyRows, contactRows]) => {
        if (!alive) return;
        if (taskRows === null) toast.error("Couldn't load tasks.");
        setTasks(taskRows ?? []);
        setDeals(dealRows ?? []);
        setCompanies(companyRows ?? []);
        setContacts(contactRows ?? []);
        setLoadedFor(projectId);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = loadedFor !== projectId;
  const index = useRecordIndex({ deals, companies, contacts });
  const today = useMemo(() => new Date(now), [now]);

  const scoped = useMemo(() => {
    if (scope === "mine") return tasks.filter((t) => t.assigneeId && t.assigneeId === me?.id);
    if (assigneeFilter === "none") return tasks.filter((t) => !t.assigneeId);
    if (assigneeFilter !== "all") return tasks.filter((t) => t.assigneeId === assigneeFilter);
    return tasks;
  }, [tasks, scope, assigneeFilter, me]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
        if (dueFilter !== "all" && dueState(t.dueAt, today) !== dueFilter) return false;
        if (q && !`${t.title} ${t.notes} ${recordLabel(index, t.relatedType, t.relatedId)}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        return (a.dueAt || "9999").localeCompare(b.dueAt || "9999");
      });
  }, [scoped, query, statusFilter, priorityFilter, dueFilter, today, index]);

  const stats = useMemo(() => {
    const open = scoped.filter((t) => t.status === "open");
    const overdue = open.filter((t) => dueState(t.dueAt, today) === "overdue").length;
    const dueToday = open.filter((t) => dueState(t.dueAt, today) === "today").length;
    const doneWeek = scoped.filter((t) => t.status === "done" && t.completedAt && now - new Date(t.completedAt).getTime() < WEEK).length;
    return [
      { label: "Open tasks", value: open.length.toLocaleString("en-US"), footer: `${open.filter((t) => t.priority === "high").length} high priority` },
      { label: "Overdue", value: overdue.toLocaleString("en-US"), footer: "Past their due date" },
      { label: "Due today", value: dueToday.toLocaleString("en-US"), footer: today.toLocaleDateString("en-US", { weekday: "long" }) },
      { label: "Completed", value: doneWeek.toLocaleString("en-US"), footer: "In the last 7 days" },
    ];
  }, [scoped, today, now]);

  const pager = usePagination(filtered, { resetKey: `${scope}|${query}|${dueFilter}|${statusFilter}|${priorityFilter}|${assigneeFilter}` });

  const assigneeOptions = useMemo(
    () => [
      { value: "all", label: "All assignees" },
      { value: "none", label: "Unassigned" },
      ...people.map((p) => ({ value: p.id, label: p.id === me?.id ? `${p.name} (you)` : p.name })),
    ],
    [people, me],
  );

  // Mutations ----------------------------------------------------------------

  const patchLocal = (id, patch) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const handleCreate = async (input) => {
    const task = { id: crypto.randomUUID(), status: "open", createdBy: me?.id || null, ...input };
    setTasks((prev) => [{ ...task, completedAt: null, createdAt: new Date().toISOString() }, ...prev]);
    const saved = await createTask(projectId, task);
    if (!saved) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.error("Couldn't add the task.");
      return false;
    }
    patchLocal(saved.id, saved);
    toast.success("Task added.");
    return true;
  };

  const handleSave = async (task, patch) => {
    patchLocal(task.id, patch);
    const saved = await updateTask(task.id, patch);
    if (!saved) {
      patchLocal(task.id, task);
      toast.error("Couldn't save the task.");
      return false;
    }
    patchLocal(task.id, saved);
    toast.success("Task saved.");
    return true;
  };

  const setDone = async (task, done) => {
    const status = done ? "done" : "open";
    patchLocal(task.id, { status, completedAt: done ? new Date().toISOString() : null });
    const saved = await updateTask(task.id, { status });
    if (!saved) {
      patchLocal(task.id, task);
      toast.error("Couldn't update the task.");
      return;
    }
    patchLocal(task.id, saved);
    toast.success(done ? `Completed "${task.title}".` : `Reopened "${task.title}".`);
  };

  const assign = async (task, assigneeId) => {
    if (assigneeId === task.assigneeId) return;
    patchLocal(task.id, { assigneeId });
    const saved = await updateTask(task.id, { assigneeId });
    if (!saved) {
      patchLocal(task.id, task);
      toast.error("Couldn't reassign the task.");
      return;
    }
    patchLocal(task.id, saved);
    toast.success(assigneeId ? `Assigned to ${personName(byId, assigneeId, me)}.` : "Task unassigned.");
  };

  const handleDuplicate = async (task) => {
    await handleCreate({
      title: `${task.title} (copy)`,
      notes: task.notes,
      relatedType: task.relatedType,
      relatedId: task.relatedId,
      priority: task.priority,
      dueAt: task.dueAt,
      assigneeId: task.assigneeId,
    });
  };

  const handleDelete = async (task) => {
    setDeleteTarget(null);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (recordId === task.id) closeRecord();
    if (!(await softDeleteTask(task.id))) {
      setTasks((prev) => [task, ...prev]);
      toast.error("Couldn't delete the task.");
      return;
    }
    toast.success(`Deleted "${task.title}".`);
  };

  const deleteDialog = (
    <DeleteDialog
      open={!!deleteTarget}
      title="Delete task"
      name={deleteTarget?.title}
      description="This can't be undone."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const open = !loading && recordId ? tasks.find((t) => t.id === recordId) : null;
  if (open) {
    return (
      <>
        <TaskEditor
          key={open.id}
          task={open}
          index={index}
          people={people}
          byId={byId}
          me={me}
          canEdit={canEdit}
          now={now}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || dueFilter !== "all" || statusFilter !== "open" || priorityFilter !== "all" || (scope === "all" && assigneeFilter !== "all");
  const clearFilters = () => {
    setQuery("");
    setDueFilter("all");
    setStatusFilter("open");
    setPriorityFilter("all");
    setAssigneeFilter("all");
  };

  const columns = [
    {
      key: "done",
      header: "",
      headClassName: "w-10 pr-0",
      className: "w-10 pr-0",
      render: (t) => (
        <div onClick={(e) => e.stopPropagation()} className="flex">
          <Checkbox
            checked={t.status === "done"}
            disabled={!canEdit}
            onCheckedChange={() => setDone(t, t.status !== "done")}
            aria-label={t.status === "done" ? `Reopen ${t.title}` : `Complete ${t.title}`}
          />
        </div>
      ),
    },
    {
      key: "title",
      header: "Task",
      render: (t) => (
        <div className="flex min-w-0 max-w-md flex-col">
          <span className={cn("truncate font-medium", t.status === "done" ? "text-text-tertiary line-through" : "text-foreground")}>{t.title}</span>
          {t.notes ? <span className="truncate text-xs text-text-secondary">{t.notes}</span> : null}
        </div>
      ),
    },
    {
      key: "related",
      header: "Related to",
      className: "max-w-[14rem]",
      render: (t) => <RecordLink type={t.relatedType} id={t.relatedId} label={recordLabel(index, t.relatedType, t.relatedId)} />,
    },
    { key: "priority", header: "Priority", render: (t) => <Badge variant={TASK_PRIORITY_MAP[t.priority].variant}>{TASK_PRIORITY_MAP[t.priority].label}</Badge> },
    { key: "due", header: "Due", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (t) => <DueLabel task={t} now={now} /> },
    {
      key: "assignee",
      header: "Assignee",
      className: "w-48 text-muted-foreground",
      render: (t) =>
        canEdit ? (
          <div onClick={(e) => e.stopPropagation()}>
            <PersonSelect value={t.assigneeId} onChange={(v) => assign(t, v)} people={people} me={me} size="sm" ariaLabel={`Assignee for ${t.title}`} className="h-8 border-transparent bg-transparent hover:bg-surface-hover" />
          </div>
        ) : (
          <PersonChip name={personName(byId, t.assigneeId, me)} />
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.title}`}
          items={[
            { label: canEdit ? "Edit task" : "Open", icon: Pencil, onSelect: () => openRecord(t.id) },
            canEdit
              ? t.status === "done"
                ? { label: "Reopen", icon: RotateCcw, onSelect: () => setDone(t, false) }
                : { label: "Mark complete", icon: CheckCircle2, onSelect: () => setDone(t, true) }
              : null,
            canEdit ? { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(t) } : null,
            canEdit ? { separator: true } : null,
            canEdit ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(t) } : null,
          ]}
        />
      ),
    },
  ];

  const addButton = canEdit ? (
    <Button className={PRIMARY_BTN} onClick={() => setAddOpen(true)}>
      <Plus className="h-4 w-4" /> Add task
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Tasks" description="Follow-ups on your deals, companies and contacts." actions={addButton} />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={scope} onValueChange={setScope} options={SCOPE_OPTIONS} height="h-9" />
          <FilterDropdown value={dueFilter} onValueChange={setDueFilter} options={DUE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={priorityFilter} onValueChange={setPriorityFilter} options={PRIORITY_FILTER_OPTIONS} height="h-9" />
          {scope === "all" ? <FilterDropdown value={assigneeFilter} onValueChange={setAssigneeFilter} options={assigneeOptions} height="h-9" /> : null}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search tasks…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={56} panel label="Loading tasks" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(t) => t.id}
            onRowClick={(t) => openRecord(t.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ListTodo}
                  title={filtersActive ? "No matches" : scope === "mine" ? "Nothing assigned to you" : "No tasks yet"}
                  description={
                    filtersActive
                      ? "Try a different search or filter."
                      : scope === "mine"
                        ? "Tasks assigned to you show up here. Switch to All tasks to see the team's."
                        : "Add a task so follow-ups on deals and contacts don't slip."
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BTN} onClick={clearFilters}>Clear filters</Button>
                    ) : (
                      addButton
                    )
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="tasks" />
        </div>
      )}

      {canEdit ? <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} onCreate={handleCreate} index={index} people={people} me={me} /> : null}
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default TasksScreen;
