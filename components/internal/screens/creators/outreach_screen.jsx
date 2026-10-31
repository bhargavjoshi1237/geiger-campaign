"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Copy,
  FileText,
  ListOrdered,
  Loader2,
  Mail,
  MailX,
  Pause,
  Play,
  Plus,
  Reply,
  Send,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import {
  createOutreach,
  listOutreach,
  listOutreachLog,
  listOutreachRecipients,
  normalizeOutreach,
  softDeleteOutreach,
  updateOutreach,
  updateOutreachRecipient,
} from "@/lib/supabase/creator_outreach";
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
  Field,
  InlineTitleInput,
  Input,
  ScreenHeader,
  SearchInput,
  SectionCard,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import {
  LOG_EVENT_LABELS,
  OUTREACH_MERGE_TAGS,
  OUTREACH_STATUS_MAP,
  OUTREACH_STATUS_OPTIONS,
  RECIPIENT_STATUS_MAP,
  formatDate,
  formatDateTime,
  formatNumber,
} from "./constants";
import {
  CreatorCell,
  DeleteConfirmDialog,
  ListEmptyState,
  LoadingPanel,
  Notice,
  OUTLINE_BUTTON,
  useCanManageCreators,
  useCreatorDirectory,
} from "./creators_kit";

const OUTREACH_NAV = [
  { key: "steps", label: "Steps", icon: ListOrdered, desc: "The emails in this sequence and how long to wait between them." },
  { key: "creators", label: "Creators", icon: Users, desc: "Who receives the sequence and where each creator is in it." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "Sender details and when to stop." },
  { key: "activity", label: "Activity", icon: Activity, desc: "Every send, reply and opt-out." },
];

const newStep = (delayDays = 0) => ({ id: crypto.randomUUID(), delayDays, subject: "", body: "" });
const replyRate = (stats) => (stats.enrolled ? Math.round((stats.replied / stats.enrolled) * 100) : 0);

function CreateOutreachDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New outreach sequence</DialogTitle>
          <DialogDescription>A series of emails to creators that stops as soon as someone replies or opts out.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Sequence name" htmlFor="os-name">
            <Input id="os-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. Kestrel Aero launch — cyclists" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            Create sequence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (o) => ({
  name: o.name,
  steps: o.steps.map((s) => ({ ...s })),
  creatorIds: [...o.creatorIds],
  sender: { ...o.sender },
  stopOnReply: o.stopOnReply,
});

function StepCard({ step, index, count, locked, onChange, onMove, onRemove }) {
  const set = (key) => (e) => onChange({ ...step, [key]: e.target.value });
  const insertTag = (tag) => onChange({ ...step, body: `${step.body}${step.body && !step.body.endsWith(" ") ? " " : ""}${tag}` });
  return (
    <SectionCard
      bare
      title={`Step ${index + 1}`}
      description={
        Number(step.delayDays) > 0
          ? `Sends ${step.delayDays} day${Number(step.delayDays) === 1 ? "" : "s"} after ${index === 0 ? "the sequence starts" : "the previous email"}`
          : index === 0
            ? "Sends as soon as the sequence starts"
            : "Sends right after the previous email"
      }
      action={
        locked ? null : (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Move step up" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Move step down" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Remove step" disabled={count === 1} className="hover:text-red-600 dark:hover:text-red-400" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label={index === 0 ? "Wait (days)" : "Wait after previous"} htmlFor={`st-d-${step.id}`}>
          <Input id={`st-d-${step.id}`} type="number" min="0" max="60" value={step.delayDays} onChange={set("delayDays")} disabled={locked} />
        </Field>
        <Field label="Subject" htmlFor={`st-s-${step.id}`}>
          <Input id={`st-s-${step.id}`} value={step.subject} onChange={set("subject")} disabled={locked} placeholder={index === 0 ? "Collab idea for {{first_name}}" : "Re: Collab idea for {{first_name}}"} />
        </Field>
        <Field label="Message" htmlFor={`st-b-${step.id}`} className="sm:col-span-2" hint="Blank lines start new paragraphs. An opt-out link is added to every email.">
          <Textarea id={`st-b-${step.id}`} rows={7} value={step.body} onChange={set("body")} disabled={locked} placeholder={"Hi {{first_name}},\n\nWe love your work and…"} />
        </Field>
      </div>
      {!locked ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-tertiary">Insert</span>
          {OUTREACH_MERGE_TAGS.map((t) => (
            <Button key={t.tag} type="button" variant="outline" size="sm" className={`h-7 px-2 text-xs ${OUTLINE_BUTTON}`} onClick={() => insertTag(t.tag)} title={t.label}>
              {t.tag}
            </Button>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function OutreachEditor({ record, projectId, creators, canManage, onBack, onSave, onStart, onStop, onDelete, starting }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [recipients, setRecipients] = useState(null);
  const [log, setLog] = useState(null);
  const [creatorQuery, setCreatorQuery] = useState("");
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const locked = !canManage || record.status === "active";
  const creatorById = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);

  useEffect(() => {
    let alive = true;
    Promise.all([listOutreachRecipients(projectId, { outreachId: record.id }), listOutreachLog(projectId, { outreachId: record.id })]).then(([r, l]) => {
      if (!alive) return;
      setRecipients(r ?? []);
      setLog(l ?? []);
    });
    return () => {
      alive = false;
    };
  }, [projectId, record.id, record.updatedAt]);

  const recipientByCreator = useMemo(() => new Map((recipients || []).map((r) => [r.creatorId, r])), [recipients]);
  const pendingEnrol = draft.creatorIds.filter((id) => !recipientByCreator.has(id) && creatorById.get(id)?.email).length;

  const setStep = (i, step) => setDraft((d) => ({ ...d, steps: d.steps.map((s, idx) => (idx === i ? step : s)) }));
  const moveStep = (i, dir) =>
    setDraft((d) => {
      const steps = [...d.steps];
      const [s] = steps.splice(i, 1);
      steps.splice(i + dir, 0, s);
      return { ...d, steps };
    });
  const toggleCreator = (id) =>
    setDraft((d) => ({ ...d, creatorIds: d.creatorIds.includes(id) ? d.creatorIds.filter((x) => x !== id) : [...d.creatorIds, id] }));

  const save = () => onSave(record.id, { ...draft, steps: draft.steps.map((s) => ({ ...s, delayDays: Number(s.delayDays) || 0 })) });

  const changeRecipient = async (recipient, status, reason) => {
    setRecipients((prev) => prev.map((r) => (r.id === recipient.id ? { ...r, status } : r)));
    const saved = await updateOutreachRecipient(projectId, recipient, { status, reason });
    if (!saved) {
      toast.error("Couldn't update this creator.");
      setRecipients((prev) => prev.map((r) => (r.id === recipient.id ? recipient : r)));
      return;
    }
    setRecipients((prev) => prev.map((r) => (r.id === recipient.id ? saved : r)));
    listOutreachLog(projectId, { outreachId: record.id }).then((l) => l && setLog(l));
    toast.success(status === "replied" ? "Marked as replied — no more emails to this creator." : status === "stopped" ? "Stopped for this creator." : "Resumed for this creator.");
  };

  const start = async () => {
    if (dirty) await save();
    onStart(record);
  };

  const filteredCreators = useMemo(() => {
    const q = creatorQuery.trim().toLowerCase();
    const list = q ? creators.filter((c) => `${c.name} ${c.email} ${Object.values(c.handles).join(" ")}`.toLowerCase().includes(q)) : creators;
    return [...list].sort((a, b) => Number(draft.creatorIds.includes(b.id)) - Number(draft.creatorIds.includes(a.id)));
  }, [creators, creatorQuery, draft.creatorIds]);

  const primary =
    record.status === "active" ? (
      <Button variant="outline" className={OUTLINE_BUTTON} disabled={!canManage || starting} onClick={() => onStop(record)}>
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Pause
      </Button>
    ) : (
      <Button disabled={!canManage || starting || !draft.creatorIds.length} onClick={start}>
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {record.status === "draft" ? "Start sequence" : record.status === "completed" ? "Enrol new creators" : "Resume"}
      </Button>
    );

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Sequence name"
          placeholder="Untitled sequence"
          disabled={!canManage}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={OUTREACH_STATUS_MAP}
      badges={
        <span className="text-xs text-text-tertiary">
          {record.steps.length} step{record.steps.length === 1 ? "" : "s"} · {formatNumber(record.stats.enrolled)} enrolled · {formatNumber(record.stats.sent)} sent · {formatNumber(record.stats.replied)} replied
        </span>
      }
      actions={
        <>
          {canManage ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete sequence"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(record)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
              Save
            </Button>
          ) : null}
          {primary}
        </>
      }
      beforeBody={
        record.pausedReason && record.status === "paused" ? (
          <Notice icon={MailX} title="Paused automatically">
            {record.pausedReason}
          </Notice>
        ) : null
      }
      nav={OUTREACH_NAV}
      defaultSection="steps"
    >
      {({ active }) => (
        <>
          {active === "steps" ? (
            <div className="space-y-6">
              {record.status === "active" ? (
                <Notice icon={Pause} title="This sequence is sending">
                  Pause it to edit steps. Creators keep their place and continue when you resume.
                </Notice>
              ) : null}
              {draft.steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={i}
                  count={draft.steps.length}
                  locked={locked}
                  onChange={(s) => setStep(i, s)}
                  onMove={(dir) => moveStep(i, dir)}
                  onRemove={() => setDraft((d) => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }))}
                />
              ))}
              {!locked ? (
                <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, newStep(3)] }))}>
                  <Plus className="h-4 w-4" /> Add follow-up
                </Button>
              ) : null}
            </div>
          ) : null}

          {active === "creators" ? (
            <div className="space-y-5">
              {pendingEnrol && record.status !== "draft" ? (
                <Notice
                  icon={Users}
                  title={`${pendingEnrol} selected creator${pendingEnrol === 1 ? " isn't" : "s aren't"} enrolled yet`}
                  action={
                    canManage ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} disabled={starting} onClick={start}>
                        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enrol now
                      </Button>
                    ) : null
                  }
                >
                  They start at step 1 when you enrol them.
                </Notice>
              ) : null}
              <Toolbar>
                <p className="text-sm text-text-secondary">
                  {draft.creatorIds.length} of {creators.length} creators selected. Creators without an email can&apos;t be added.
                </p>
                <SearchInput value={creatorQuery} onChange={setCreatorQuery} placeholder="Search creators…" />
              </Toolbar>
              {recipients === null ? (
                <LoadingPanel label="Loading creators" size={40} />
              ) : (
                <DataTable
                  columns={[
                    {
                      key: "pick",
                      header: "",
                      className: "w-10",
                      render: (c) => (
                        <Checkbox
                          checked={draft.creatorIds.includes(c.id)}
                          disabled={!canManage || !c.email || recipientByCreator.has(c.id)}
                          onCheckedChange={() => toggleCreator(c.id)}
                          aria-label={`Include ${c.name}`}
                        />
                      ),
                    },
                    { key: "creator", header: "Creator", render: (c) => <CreatorCell creator={c} meta={c.email || "No email"} /> },
                    {
                      key: "status",
                      header: "Status",
                      render: (c) => {
                        const r = recipientByCreator.get(c.id);
                        if (r) return <StatusPill status={r.status} map={RECIPIENT_STATUS_MAP} />;
                        return draft.creatorIds.includes(c.id) ? <StatusPill status="not_started" map={RECIPIENT_STATUS_MAP} /> : <span className="text-text-tertiary">—</span>;
                      },
                    },
                    {
                      key: "progress",
                      header: "Progress",
                      className: "text-sm text-text-secondary",
                      render: (c) => {
                        const r = recipientByCreator.get(c.id);
                        if (!r) return "—";
                        const sent = Math.min(r.nextStep, record.steps.length);
                        return (
                          <span>
                            {sent} of {record.steps.length} sent
                            {r.status === "active" && r.nextDueAt ? <span className="block text-xs text-text-tertiary">Next {formatDateTime(r.nextDueAt)}</span> : null}
                            {r.status === "replied" && r.repliedAt ? <span className="block text-xs text-text-tertiary">Replied {formatDate(r.repliedAt)}</span> : null}
                          </span>
                        );
                      },
                    },
                    {
                      key: "actions",
                      header: "",
                      align: "right",
                      render: (c) => {
                        const r = recipientByCreator.get(c.id);
                        if (!r || !canManage) return null;
                        return (
                          <ActionMenu
                            label={`Outreach actions for ${c.name}`}
                            items={[
                              r.status === "active" && { label: "Mark as replied", icon: Reply, onSelect: () => changeRecipient(r, "replied", "manual") },
                              r.status === "active" && { label: "Stop for this creator", icon: Pause, onSelect: () => changeRecipient(r, "stopped", "manual") },
                              r.status === "stopped" && r.nextStep < record.steps.length && { label: "Resume", icon: Play, onSelect: () => changeRecipient(r, "active", null) },
                            ]}
                          />
                        );
                      },
                    },
                  ]}
                  data={filteredCreators}
                  getRowKey={(c) => c.id}
                  empty={
                    <ListEmptyState icon={Users} filtersActive={Boolean(creatorQuery)} title="No creators yet" description="Add creators in Creator Discovery first." onClear={() => setCreatorQuery("")} />
                  }
                />
              )}
            </div>
          ) : null}

          {active === "settings" ? (
            <div className="space-y-6">
              <SectionCard bare title="Sender details" description="Who the emails come from and where creators' replies land.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Sender name" htmlFor="os-from-name" hint="Defaults to your workspace sending name.">
                    <Input id="os-from-name" value={draft.sender.fromName} onChange={(e) => set("sender")({ ...draft.sender, fromName: e.target.value })} disabled={!canManage} placeholder="e.g. Priya at Halcyon" />
                  </Field>
                  <Field label="Sender email" htmlFor="os-from-email" hint="Must be on a verified sending domain.">
                    <Input id="os-from-email" type="email" value={draft.sender.fromEmail} onChange={(e) => set("sender")({ ...draft.sender, fromEmail: e.target.value })} disabled={!canManage} placeholder="partnerships@yourbrand.com" />
                  </Field>
                  <Field label="Reply-to" htmlFor="os-reply" className="sm:col-span-2" hint="Where creators' replies land. Route it into Inbox to detect replies automatically.">
                    <Input id="os-reply" type="email" value={draft.sender.replyTo} onChange={(e) => set("sender")({ ...draft.sender, replyTo: e.target.value })} disabled={!canManage} placeholder="partnerships@yourbrand.com" />
                  </Field>
                </div>
              </SectionCard>
              <SectionCard bare title="When to stop" description="End the sequence for a creator once they reply or opt out.">
                <SettingsList>
                  <SettingRow
                    title="Stop when a creator replies"
                    description="Before every send, Geiger checks Inbox for a message from the creator's contact since the last email. You can also mark replies by hand."
                    checked={draft.stopOnReply}
                    onCheckedChange={canManage ? set("stopOnReply") : undefined}
                  />
                  <SettingRow
                    title="Stop when a creator opts out"
                    description="Always on. Every email carries an opt-out link; unsubscribed contacts are never emailed."
                    control={<Badge variant="success">Always</Badge>}
                  />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}

          {active === "activity" ? (
            log === null ? (
              <LoadingPanel label="Loading activity" size={40} />
            ) : (
              <DataTable
                columns={[
                  { key: "at", header: "When", className: "text-sm text-text-secondary whitespace-nowrap", render: (e) => formatDateTime(e.occurredAt) },
                  { key: "creator", header: "Creator", render: (e) => <CreatorCell creator={creatorById.get(e.creatorId)} /> },
                  { key: "step", header: "Step", className: "tabular-nums text-sm", render: (e) => `Step ${e.stepIndex + 1}` },
                  {
                    key: "event",
                    header: "Event",
                    render: (e) => (
                      <Badge variant={e.event === "sent" ? "info" : e.event === "replied" ? "success" : ["failed", "not_sent", "opted_out"].includes(e.event) ? "danger" : "neutral"}>
                        {LOG_EVENT_LABELS[e.event] || e.event}
                      </Badge>
                    ),
                  },
                  {
                    key: "detail",
                    header: "Detail",
                    className: "text-sm text-text-secondary",
                    render: (e) => <span className="line-clamp-2">{e.error || e.subject || (e.manual ? "Marked by a teammate" : "—")}</span>,
                  },
                ]}
                data={log}
                getRowKey={(e) => e.id}
                empty={<ListEmptyState icon={Mail} title="Nothing sent yet" description="Sends, replies and opt-outs show up here once the sequence starts." />}
              />
            )
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function OutreachScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canManage = useCanManageCreators();
  const { creators } = useCreatorDirectory(projectId);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listOutreach(projectId), getUser()]).then(([rows, user]) => {
      if (!alive) return;
      setSequences(rows ?? []);
      setUserId(user?.id || null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const reload = () => listOutreach(projectId).then((rows) => rows && setSequences(rows));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sequences.filter((s) => (status === "all" || s.status === status) && (!q || s.name.toLowerCase().includes(q)));
  }, [sequences, query, status]);

  const stats = useMemo(() => {
    const sum = (key) => sequences.reduce((s, x) => s + x.stats[key], 0);
    const enrolled = sum("enrolled");
    return [
      { label: "Sending now", value: formatNumber(sequences.filter((s) => s.status === "active").length), footer: `${sequences.length} sequences` },
      { label: "Creators in sequences", value: formatNumber(sum("active")), footer: `${formatNumber(enrolled)} enrolled overall` },
      { label: "Emails sent", value: formatNumber(sum("sent")), footer: `${formatNumber(sum("failed"))} failed` },
      { label: "Reply rate", value: enrolled ? `${Math.round((sum("replied") / enrolled) * 100)}%` : "—", footer: `${formatNumber(sum("replied"))} replied · ${formatNumber(sum("optedOut"))} opted out` },
    ];
  }, [sequences]);

  const pager = usePagination(filtered, { resetKey: `${query}|${status}` });

  const handleCreate = async (name, from = null) => {
    const id = crypto.randomUUID();
    const input = from
      ? { name, steps: from.steps.map((s) => ({ ...s, id: crypto.randomUUID() })), creatorIds: [], sender: from.sender, stopOnReply: from.stopOnReply }
      : { name, steps: [newStep(0)], creatorIds: [], sender: {}, stopOnReply: true };
    const optimistic = normalizeOutreach({
      id,
      project_id: projectId,
      name,
      status: "draft",
      steps: input.steps,
      creator_ids: [],
      sender: input.sender,
      stop_on_reply: input.stopOnReply,
      created_at: new Date().toISOString(),
    });
    setSequences((prev) => [optimistic, ...prev]);
    if (!from) openRecord(id);
    const saved = await createOutreach(projectId, { ...input, id, status: "draft", createdBy: userId });
    if (saved) {
      setSequences((prev) => prev.map((s) => (s.id === id ? saved : s)));
      toast.success(from ? `Duplicated "${from.name}".` : `Created "${name}".`);
    } else {
      setSequences((prev) => prev.filter((s) => s.id !== id));
      closeRecord();
      toast.error("Couldn't create the sequence.");
    }
  };

  const handleSave = async (id, patch) => {
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const saved = await updateOutreach(id, patch);
    if (saved) {
      setSequences((prev) => prev.map((s) => (s.id === id ? saved : s)));
      toast.success("Sequence saved.");
    } else {
      toast.error("Couldn't save the sequence.");
      reload();
    }
    return saved;
  };

  const handleStart = async (seq) => {
    setBusyId(seq.id);
    const res = await apiPost(`/api/projects/${projectId}/creators/outreach/${seq.id}/start`);
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't start the sequence.");
      return;
    }
    if (res.data?.outreach) setSequences((prev) => prev.map((s) => (s.id === seq.id ? normalizeOutreach(res.data.outreach) : s)));
    const { enrolled = 0, skipped = {}, processed = {} } = res.data || {};
    const skippedCount = (skipped.noEmail || 0) + (skipped.optedOut || 0) + (skipped.declined || 0);
    toast.success(
      `${enrolled ? `${enrolled} creator${enrolled === 1 ? "" : "s"} enrolled` : "Sequence resumed"}${processed.sent ? `, ${processed.sent} email${processed.sent === 1 ? "" : "s"} sent` : ""}.${skippedCount ? ` ${skippedCount} skipped (no email, opted out or declined).` : ""}`,
    );
  };

  const handleStop = async (seq) => {
    setBusyId(seq.id);
    const res = await apiPost(`/api/projects/${projectId}/creators/outreach/${seq.id}/stop`);
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't pause the sequence.");
      return;
    }
    if (res.data?.outreach) setSequences((prev) => prev.map((s) => (s.id === seq.id ? normalizeOutreach(res.data.outreach) : s)));
    toast.success("Sequence paused.");
  };

  const handleDelete = async (seq) => {
    setDeleteTarget(null);
    setSequences((prev) => prev.filter((s) => s.id !== seq.id));
    if (seq.id === recordId) closeRecord();
    const ok = await softDeleteOutreach(seq.id);
    if (ok) toast.success(`Deleted "${seq.name}".`);
    else {
      toast.error("Couldn't delete the sequence.");
      reload();
    }
  };

  const deleteDialog = (
    <DeleteConfirmDialog
      target={deleteTarget}
      title="Delete sequence"
      name={deleteTarget?.name}
      description="No further emails will be sent. The send history stays in Message logs."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = sequences.find((s) => s.id === recordId);
  if (open) {
    return (
      <>
        <OutreachEditor
          key={open.id}
          record={open}
          projectId={projectId}
          creators={creators}
          canManage={canManage}
          starting={busyId === open.id}
          onBack={closeRecord}
          onSave={handleSave}
          onStart={handleStart}
          onStop={handleStop}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = Boolean(query) || status !== "all";

  const columns = [
    {
      key: "name",
      header: "Sequence",
      render: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{s.name}</span>
          <span className="text-xs text-text-secondary">
            {s.steps.length} step{s.steps.length === 1 ? "" : "s"} · {s.startedAt ? `Started ${formatDate(s.startedAt)}` : `Created ${formatDate(s.createdAt)}`}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (s) => <StatusPill status={s.status} map={OUTREACH_STATUS_MAP} /> },
    { key: "creators", header: "Creators", align: "right", className: "tabular-nums", render: (s) => formatNumber(s.stats.enrolled || s.creatorIds.length) },
    { key: "sent", header: "Sent", align: "right", className: "tabular-nums", render: (s) => formatNumber(s.stats.sent) },
    {
      key: "replied",
      header: "Replied",
      align: "right",
      className: "tabular-nums",
      render: (s) => (
        <span>
          {formatNumber(s.stats.replied)}
          {s.stats.enrolled ? <span className="ml-1 text-xs text-text-tertiary">{replyRate(s.stats)}%</span> : null}
        </span>
      ),
    },
    { key: "opted", header: "Opted out", align: "right", className: "tabular-nums text-text-secondary", render: (s) => formatNumber(s.stats.optedOut) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <ActionMenu
          label={`Actions for ${s.name}`}
          items={[
            { label: "Open", icon: FileText, onSelect: () => openRecord(s.id) },
            canManage && s.status === "active" && { label: "Pause", icon: Pause, onSelect: () => handleStop(s) },
            canManage && s.status === "paused" && { label: "Resume", icon: Play, onSelect: () => handleStart(s) },
            canManage && { label: "Duplicate", icon: Copy, onSelect: () => handleCreate(`${s.name} (copy)`, s) },
            canManage && { separator: true },
            canManage && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(s) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Outreach"
        description="Multi-step email sequences to creators that stop on reply or opt-out."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New sequence
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={OUTREACH_STATUS_OPTIONS} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search sequences…" />
      </Toolbar>

      {loading ? (
        <LoadingPanel label="Loading sequences" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(s) => s.id}
            onRowClick={(s) => openRecord(s.id)}
            empty={
              <ListEmptyState
                icon={Send}
                filtersActive={filtersActive}
                title="No sequences yet"
                description="Write a short sequence — an intro and one or two follow-ups — and send it to the creators you want to work with."
                onClear={() => {
                  setQuery("");
                  setStatus("all");
                }}
                action={
                  canManage ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> New sequence
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="sequences" />
        </div>
      )}

      <CreateOutreachDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(name) => handleCreate(name)} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default OutreachScreen;
