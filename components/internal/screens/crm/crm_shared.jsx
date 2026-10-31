"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  CircleDot,
  Handshake,
  Loader2,
  Mail,
  MousePointerClick,
  Phone,
  Plus,
  Send,
  StickyNote,
  Trash2,
  Trophy,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import {
  ActionMenu,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  LoadingArea,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listMembers } from "@/lib/supabase/rbac";
import { getUser } from "@/lib/supabase/user";
import { createTask, listTasks, softDeleteTask, updateTask } from "@/lib/supabase/crm_tasks";
import { createActivity, listActivities, softDeleteActivity } from "@/lib/supabase/crm_activities";
import { ACTIVITY_KINDS, LOGGABLE_KINDS, LOST_REASONS, RELATED_TYPES, stageColor } from "@/lib/crm/constants";
import { dueState, formatDate, fromLocalInput, initials, relativeTime, toLocalInput } from "@/lib/crm/format";

// Building blocks shared by the CRM screens: people, record links and pickers, dialogs, and the
// per-record tasks / activity panels that deals and companies embed.

export const PRIMARY_BTN = "bg-primary text-primary-foreground hover:bg-primary/90";
export const OUTLINE_BTN = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const DANGER_BTN = "bg-red-500/90 text-white hover:bg-red-500";
const NONE = "__none__";

// People ------------------------------------------------------------------

// Project roster (owners / assignees / actors) plus the signed-in user.
export function useCrmPeople(projectId) {
  const [people, setPeople] = useState([]);
  const [me, setMe] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listMembers(projectId), getUser()]).then(([members, user]) => {
      if (!alive) return;
      setPeople(
        (members || [])
          .filter((m) => m.status === "active")
          .map((m) => ({ id: m.userId, name: m.name || m.email || "Teammate", email: m.email })),
      );
      setMe(user ? { id: user.id, name: user.name, email: user.email } : null);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  return { people, byId, me };
}

export function personName(byId, id, me) {
  if (!id) return "";
  if (me?.id === id) return byId.get(id)?.name || me.name || "You";
  return byId.get(id)?.name || "Former teammate";
}

export function PersonChip({ name, className }) {
  if (!name) return <span className={cn("text-text-tertiary", className)}>Unassigned</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Avatar className="size-5 shrink-0">
        <AvatarFallback className="bg-surface-strong text-[10px] font-semibold text-foreground">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function PersonSelect({ value, onChange, people, me, placeholder = "Unassigned", allowNone = true, disabled, size, className, id, ariaLabel }) {
  const options = useMemo(() => {
    const list = [...people];
    if (value && !list.some((p) => p.id === value)) list.push({ id: value, name: "Former teammate" });
    return list.sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.name.localeCompare(b.name)));
  }, [people, value, me]);
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} size={size} aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{placeholder}</SelectItem> : null}
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
            {p.id === me?.id ? " (you)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Records -----------------------------------------------------------------

const RECORD_ICON = { deal: Handshake, company: Building2, contact: UserRound };

// id -> { label, sub } lookups over the loaded deals / companies / contacts.
export function useRecordIndex({ deals = [], companies = [], contacts = [] }) {
  return useMemo(() => {
    const index = { deal: new Map(), company: new Map(), contact: new Map() };
    for (const d of deals) index.deal.set(d.id, { label: d.name, sub: "", record: d });
    for (const c of companies) index.company.set(c.id, { label: c.name, sub: c.domain, record: c });
    for (const c of contacts) index.contact.set(c.id, { label: c.name, sub: c.email || c.phone, record: c });
    for (const d of deals) {
      const company = d.companyId ? index.company.get(d.companyId) : null;
      if (company) index.deal.get(d.id).sub = company.label;
    }
    return index;
  }, [deals, companies, contacts]);
}

export function recordLabel(index, type, id) {
  if (!type || !id) return "";
  return index[type]?.get(id)?.label || `Deleted ${RELATED_TYPES[type]?.label.toLowerCase() || "record"}`;
}

// Opens the record in its own screen (contacts live under Audience).
export function RecordLink({ type, id, label, className }) {
  const { openRecordInTab } = useWorkspaceUrl();
  if (!type || !id) return <span className="text-text-tertiary">—</span>;
  const Icon = RECORD_ICON[type] || CircleDot;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openRecordInTab(id, RELATED_TYPES[type].tab);
      }}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md text-left text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
      <span className="truncate">{label}</span>
    </button>
  );
}

// Searchable picker over deals / companies / contacts. value = { type, id } | null.
export function RecordPicker({
  value,
  onChange,
  index,
  types = ["deal", "company", "contact"],
  placeholder = "Link a record",
  disabled,
  allowClear = true,
  className,
  id,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Only search while open; the closed trigger just needs the selected label.
  const groups = (open ? types : []).map((type) => {
    const rows = [...index[type].entries()]
      .map(([rid, info]) => ({ id: rid, ...info }))
      .filter((r) => !q || `${r.label} ${r.sub || ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { type, rows: rows.slice(0, 8), more: Math.max(0, rows.length - 8) };
  });

  const selected = value?.type && value?.id ? { ...value, label: recordLabel(index, value.type, value.id) } : null;
  const SelectedIcon = selected ? RECORD_ICON[selected.type] : null;

  const choose = (next) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn("w-full justify-between border-border bg-surface-card font-normal text-foreground hover:bg-surface-hover", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0 text-text-tertiary" /> : null}
            <span className={cn("truncate", !selected && "text-text-tertiary")}>{selected ? selected.label : placeholder}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-tertiary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 border-border bg-surface-subtle p-0">
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${types.map((t) => RELATED_TYPES[t].plural.toLowerCase()).join(", ")}…`}
            aria-label="Search records"
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {allowClear && selected ? (
            <button
              type="button"
              onClick={() => choose(null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          ) : null}
          {groups.map((g) =>
            g.rows.length ? (
              <div key={g.type} className="py-1">
                {types.length > 1 ? (
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{RELATED_TYPES[g.type].plural}</p>
                ) : null}
                {g.rows.map((r) => {
                  const Icon = RECORD_ICON[g.type];
                  const active = selected?.type === g.type && selected?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => choose({ type: g.type, id: r.id })}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-hover"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                      <span className="min-w-0 flex-1 truncate">
                        {r.label}
                        {r.sub ? <span className="ml-1.5 text-xs text-text-tertiary">{r.sub}</span> : null}
                      </span>
                      {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  );
                })}
                {g.more ? <p className="px-2 py-1 text-xs text-text-tertiary">{g.more} more — keep typing to narrow down.</p> : null}
              </div>
            ) : null,
          )}
          {groups.every((g) => !g.rows.length) ? (
            <p className="px-2 py-6 text-center text-sm text-text-tertiary">{q ? "No matches." : "Nothing to link yet."}</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Pipeline stage + status --------------------------------------------------

export function StageBadge({ stage, className }) {
  if (!stage) return <Badge variant="neutral" className={className}>No stage</Badge>;
  const color = stageColor(stage.color);
  return (
    <Badge variant={color.variant} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", color.dot)} />
      {stage.name}
    </Badge>
  );
}

export function StageDot({ color, className }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", stageColor(color).dot, className)} />;
}

// Dialogs -----------------------------------------------------------------

export function DeleteDialog({ open, title, name, description, onCancel, onConfirm, pending = false }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{name}</span>? {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button className={DANGER_BTN} disabled={pending} onClick={onConfirm}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const OTHER_REASON = "__other__";

export function LostReasonDialog({ open, dealName, onCancel, onConfirm, pending = false }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as lost</DialogTitle>
          <DialogDescription>
            Record why <span className="font-medium text-foreground">{dealName}</span> didn&apos;t close. Reasons roll up in pipeline reporting.
          </DialogDescription>
        </DialogHeader>
        <LostReasonForm onCancel={onCancel} onConfirm={onConfirm} pending={pending} />
      </DialogContent>
    </Dialog>
  );
}

// Mounted per open, so every dialog starts from a clean reason.
function LostReasonForm({ onCancel, onConfirm, pending }) {
  const [preset, setPreset] = useState(LOST_REASONS[0]);
  const [detail, setDetail] = useState("");
  const reason = preset === OTHER_REASON ? detail.trim() : [preset, detail.trim()].filter(Boolean).join(" — ");

  const submit = () => {
    if (!reason) {
      toast.error("Say why the deal was lost.");
      return;
    }
    onConfirm(reason);
  };

  return (
    <>
      <div className="grid gap-4">
        <Field label="Reason">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              <SelectItem value={OTHER_REASON}>Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={preset === OTHER_REASON ? "What happened" : "Details (optional)"} htmlFor="lost-detail">
          <Textarea id="lost-detail" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Chose a cheaper annual plan elsewhere" />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button className={DANGER_BTN} disabled={pending} onClick={submit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Mark lost
        </Button>
      </DialogFooter>
    </>
  );
}

const KIND_TABS = LOGGABLE_KINDS.map((k) => ({ value: k, label: ACTIVITY_KINDS[k].label }));

// Log a call / meeting / note / email. onSubmit(input) resolves truthy on success.
export function LogActivityDialog({ open, onOpenChange, onSubmit, index, defaultRecord = null, lockRecord = false, defaultKind = "call" }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log activity</DialogTitle>
          <DialogDescription>Record a conversation or note on the CRM timeline.</DialogDescription>
        </DialogHeader>
        <LogActivityForm
          onClose={() => onOpenChange(false)}
          onSubmit={onSubmit}
          index={index}
          defaultRecord={defaultRecord}
          lockRecord={lockRecord}
          defaultKind={defaultKind}
        />
      </DialogContent>
    </Dialog>
  );
}

// Mounted per open, so the draft and its "when" default to now each time.
function LogActivityForm({ onClose, onSubmit, index, defaultRecord, lockRecord, defaultKind }) {
  const [draft, setDraft] = useState(() => ({
    kind: defaultKind,
    subject: "",
    body: "",
    record: defaultRecord,
    when: toLocalInput(new Date().toISOString()),
  }));
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.subject.trim() && !draft.body.trim()) {
      toast.error(draft.kind === "note" ? "Write the note first." : "Add a summary of what happened.");
      return;
    }
    setPending(true);
    const ok = await onSubmit({
      kind: draft.kind,
      subject: draft.subject.trim() || ACTIVITY_KINDS[draft.kind].label,
      body: draft.body.trim(),
      relatedType: draft.record?.type || null,
      relatedId: draft.record?.id || null,
      occurredAt: fromLocalInput(draft.when) || new Date().toISOString(),
    });
    setPending(false);
    if (ok) onClose();
  };

  const placeholder = {
    call: "e.g. Discovery call with procurement",
    meeting: "e.g. Proposal walkthrough",
    email: "e.g. Sent the revised quote",
    note: "Optional title",
  }[draft.kind];

  return (
    <>
      <div className="grid gap-4">
        <SegmentedTabs tabs={KIND_TABS} value={draft.kind} onChange={set("kind")} fullWidth />
        <Field label="Summary" htmlFor="la-subject">
          <Input id="la-subject" value={draft.subject} onChange={(e) => set("subject")(e.target.value)} placeholder={placeholder} />
        </Field>
        <Field label="Notes" htmlFor="la-body">
          <Textarea id="la-body" value={draft.body} onChange={(e) => set("body")(e.target.value)} placeholder="Outcome, next steps, who was there…" className="min-h-24" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Related to">
            <RecordPicker value={draft.record} onChange={set("record")} index={index} disabled={lockRecord} ariaLabel="Related record" />
          </Field>
          <Field label="When" htmlFor="la-when">
            <Input id="la-when" type="datetime-local" value={draft.when} onChange={(e) => set("when")(e.target.value)} />
          </Field>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button className={PRIMARY_BTN} disabled={pending} onClick={submit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Log activity
        </Button>
      </DialogFooter>
    </>
  );
}

// Timeline rows -----------------------------------------------------------

export const FEED_ICON = {
  call: Phone,
  meeting: CalendarDays,
  note: StickyNote,
  email: Mail,
  stage_change: ArrowRightLeft,
  system: CircleDot,
  message: Send,
  event: MousePointerClick,
};

function feedTone(item) {
  if (item.source === "crm" && item.record?.toStatus === "won") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (item.source === "crm" && item.record?.toStatus === "lost") return "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400";
  return "border-border bg-surface-card text-muted-foreground";
}

// One timeline entry. `item` comes from lib/crm/timeline (or wraps one activity via activityItem()).
export function FeedRow({ item, actor, context, now, onOpen, actions }) {
  const Icon = item.source === "crm" && item.record?.toStatus === "won" ? Trophy : FEED_ICON[item.type] || CircleDot;
  const clickable = Boolean(onOpen);
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
              e.preventDefault();
              onOpen();
            }
          : undefined
      }
      className={cn(
        "flex gap-3 rounded-lg px-2 py-3",
        clickable && "cursor-pointer transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      )}
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", feedTone(item))}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">
            {actor ? <span className="font-semibold">{actor} </span> : null}
            <span className={actor ? "text-muted-foreground" : "font-medium"}>{item.title || ACTIVITY_KINDS[item.type]?.label || "Activity"}</span>
          </p>
          {item.detail ? <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-text-secondary">{item.detail}</p> : null}
          {context ? <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">{context}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <time dateTime={item.at} title={new Date(item.at).toLocaleString()} className="whitespace-nowrap text-xs tabular-nums text-text-secondary">
            {relativeTime(item.at, now)}
          </time>
          {actions}
        </div>
      </div>
    </div>
  );
}

export function activityItem(a) {
  return {
    key: `crm:${a.id}`,
    source: "crm",
    type: a.kind,
    at: a.occurredAt,
    actorId: a.actorId,
    contactId: a.contactId,
    relatedType: a.relatedType,
    relatedId: a.relatedId,
    title: a.subject,
    detail: a.body,
    record: a,
  };
}

// Per-record panels ----------------------------------------------------------

// Tasks for one deal / company / contact: list, complete, inline add.
export function RelatedTasks({ projectId, relatedType, relatedId, people, byId, me, canEdit }) {
  const [tasks, setTasks] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [now] = useState(() => Date.now());
  const [draft, setDraft] = useState({ title: "", due: "", assigneeId: null });
  const [adding, setAdding] = useState(false);
  const key = `${relatedType}:${relatedId}`;

  useEffect(() => {
    let alive = true;
    listTasks(projectId, { relatedType, relatedId }).then((rows) => {
      if (!alive) return;
      setTasks(rows ?? []);
      setLoadedFor(`${relatedType}:${relatedId}`);
    });
    return () => {
      alive = false;
    };
  }, [projectId, relatedType, relatedId]);

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        return (a.dueAt || "9999").localeCompare(b.dueAt || "9999");
      }),
    [tasks],
  );

  const add = async () => {
    const title = draft.title.trim();
    if (!title) {
      toast.error("Give the task a title.");
      return;
    }
    setAdding(true);
    const task = {
      id: crypto.randomUUID(),
      title,
      dueAt: draft.due ? fromLocalInput(`${draft.due}T09:00`) : null,
      assigneeId: draft.assigneeId || me?.id || null,
      relatedType,
      relatedId,
      status: "open",
      priority: "medium",
      createdBy: me?.id || null,
    };
    setTasks((prev) => [{ ...task, notes: "", completedAt: null }, ...prev]);
    const saved = await createTask(projectId, task);
    setAdding(false);
    if (!saved) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.error("Couldn't add the task.");
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
    setDraft({ title: "", due: "", assigneeId: draft.assigneeId });
    toast.success("Task added.");
  };

  const toggle = async (task) => {
    const status = task.status === "done" ? "open" : "done";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    const saved = await updateTask(task.id, { status });
    if (!saved) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      toast.error("Couldn't update the task.");
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
  };

  const remove = async (task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (!(await softDeleteTask(task.id))) {
      setTasks((prev) => [task, ...prev]);
      toast.error("Couldn't delete the task.");
      return;
    }
    toast.success("Task deleted.");
  };

  if (loadedFor !== key) return <LoadingArea size={40} panel label="Loading tasks" />;

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="grid gap-2 rounded-xl border border-border bg-surface-subtle p-3 sm:grid-cols-[1fr_9.5rem_11rem_auto]">
          <Input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a follow-up…"
            aria-label="New task title"
          />
          <Input type="date" value={draft.due} onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))} aria-label="Due date" />
          <PersonSelect value={draft.assigneeId || me?.id || null} onChange={(v) => setDraft((d) => ({ ...d, assigneeId: v }))} people={people} me={me} ariaLabel="Assignee" />
          <Button className={PRIMARY_BTN} disabled={adding} onClick={add}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </Button>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState title="No tasks" description="Follow-ups for this record show up here." className="py-10" />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-subtle">
          {sorted.map((t) => {
            const due = t.status === "open" ? dueState(t.dueAt, new Date(now)) : "none";
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  checked={t.status === "done"}
                  disabled={!canEdit}
                  onCheckedChange={() => toggle(t)}
                  aria-label={t.status === "done" ? `Reopen ${t.title}` : `Complete ${t.title}`}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", t.status === "done" ? "text-text-tertiary line-through" : "text-foreground")}>{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-secondary">
                    <span
                      className={cn(
                        "tabular-nums",
                        due === "overdue" && "text-red-600 dark:text-red-400",
                        due === "today" && "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {t.dueAt ? `${due === "overdue" ? "Overdue · " : due === "today" ? "Today · " : ""}${formatDate(t.dueAt)}` : "No due date"}
                    </span>
                    <PersonChip name={personName(byId, t.assigneeId, me)} />
                  </p>
                </div>
                {canEdit ? (
                  <ActionMenu
                    label={`Actions for ${t.title}`}
                    items={[{ label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(t) }]}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Notes, calls and history for one record (optionally widened to its deals via extraIds).
export function RecordActivity({ projectId, relatedType, relatedId, contactId = null, extraIds = [], index, byId, me, canEdit }) {
  const [rows, setRows] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const extraKey = extraIds.join(",");
  const key = `${relatedType}:${relatedId}:${extraKey}`;

  useEffect(() => {
    let alive = true;
    const ids = [relatedId, ...(extraKey ? extraKey.split(",") : [])];
    listActivities(projectId, { relatedIds: ids, limit: 500 }).then((list) => {
      if (!alive) return;
      setRows(list ?? []);
      setLoadedFor(`${relatedType}:${relatedId}:${extraKey}`);
    });
    return () => {
      alive = false;
    };
  }, [projectId, relatedType, relatedId, extraKey]);

  const log = async (input) => {
    const activity = { id: crypto.randomUUID(), contactId, actorId: me?.id || null, createdBy: me?.id || null, ...input };
    if (!activity.relatedId) {
      activity.relatedType = relatedType;
      activity.relatedId = relatedId;
    }
    setRows((prev) => [{ ...activity, occurredAt: activity.occurredAt || new Date().toISOString() }, ...prev]);
    const saved = await createActivity(projectId, activity);
    if (!saved) {
      setRows((prev) => prev.filter((a) => a.id !== activity.id));
      toast.error("Couldn't save that activity.");
      return false;
    }
    setRows((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    toast.success(input.kind === "note" ? "Note added." : "Activity logged.");
    return true;
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    const ok = await log({ kind: "note", subject: "Note", body: note.trim(), relatedType, relatedId, occurredAt: new Date().toISOString() });
    setSaving(false);
    if (ok) setNote("");
  };

  const remove = async (a) => {
    setRows((prev) => prev.filter((x) => x.id !== a.id));
    if (!(await softDeleteActivity(a.id))) {
      setRows((prev) => [a, ...prev]);
      toast.error("Couldn't delete that entry.");
      return;
    }
    toast.success("Entry deleted.");
  };

  if (loadedFor !== key) return <LoadingArea size={40} panel label="Loading activity" />;

  const sorted = [...rows].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface-subtle p-3">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" aria-label="New note" className="min-h-20 bg-surface-card" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" className={OUTLINE_BTN} onClick={() => setLogOpen(true)}>
              <Phone className="h-4 w-4" /> Log call or meeting
            </Button>
            <Button className={PRIMARY_BTN} disabled={!note.trim() || saving} onClick={addNote}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />} Add note
            </Button>
          </div>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState title="Nothing logged yet" description="Notes, calls, meetings and stage changes for this record appear here." className="py-10" />
        </div>
      ) : (
        <ol className="rounded-xl border border-border bg-surface-subtle px-2 py-1">
          {sorted.map((a) => {
            const item = activityItem(a);
            const manual = LOGGABLE_KINDS.includes(a.kind);
            const showRecord = a.relatedId && a.relatedId !== relatedId;
            return (
              <li key={a.id}>
                <FeedRow
                  item={item}
                  actor={a.actorId ? personName(byId, a.actorId, me) : null}
                  now={now}
                  context={showRecord ? <RecordLink type={a.relatedType} id={a.relatedId} label={recordLabel(index, a.relatedType, a.relatedId)} className="text-xs" /> : null}
                  actions={
                    canEdit && manual ? (
                      <ActionMenu label="Entry actions" items={[{ label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(a) }]} />
                    ) : null
                  }
                />
              </li>
            );
          })}
        </ol>
      )}

      <LogActivityDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        onSubmit={log}
        index={index}
        defaultRecord={{ type: relatedType, id: relatedId }}
        lockRecord
      />
    </div>
  );
}
