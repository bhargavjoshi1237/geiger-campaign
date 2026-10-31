"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, FileText, History, Loader2, RotateCcw, StickyNote, Trash2, Trophy, XCircle } from "lucide-react";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import {
  Badge,
  Button,
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
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
} from "@geiger/ui";
import { listActivities } from "@/lib/supabase/crm_activities";
import { CURRENCIES, DEAL_STATUS_MAP } from "@/lib/crm/constants";
import { dealProbability, resolveStage, weightedValue } from "@/lib/crm/forecast";
import { daysBetween, formatDate, formatDateTime, formatDays, formatMoney } from "@/lib/crm/format";
import {
  OUTLINE_BTN,
  PRIMARY_BTN,
  PersonSelect,
  RecordActivity,
  RecordLink,
  RecordPicker,
  RelatedTasks,
  StageBadge,
  StageDot,
  personName,
  recordLabel,
} from "./crm_shared";

const NONE = "__none__";

const DEAL_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Value, stage, owner and the people and company behind the deal." },
  { key: "history", label: "Stage history", icon: History, desc: "Every stage move and status change, and how long each stage took." },
  { key: "tasks", label: "Tasks", icon: CheckSquare, desc: "Follow-ups that keep this deal moving." },
  { key: "notes", label: "Notes & calls", icon: StickyNote, desc: "Notes, calls and meetings logged against this deal." },
];

// Editable slice of a deal, as strings so the dirty check compares like with like.
const toDraft = (d) => ({
  name: d.name || "",
  value: String(d.value ?? 0),
  currency: d.currency || "USD",
  pipelineId: d.pipelineId || "",
  stageId: d.stageId || "",
  ownerId: d.ownerId || null,
  expectedCloseDate: d.expectedCloseDate || "",
  contactId: d.contactId || null,
  companyId: d.companyId || null,
  sourceCampaignId: d.sourceCampaignId || null,
});

function StageSelect({ pipeline, value, onChange, disabled, id }) {
  const stages = pipeline?.stages || [];
  return (
    <Select value={stages.some((s) => s.id === value) ? value : stages[0]?.id || NONE} onValueChange={onChange} disabled={disabled || !stages.length}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="No stages" /></SelectTrigger>
      <SelectContent>
        {stages.length ? (
          stages.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              <span className="inline-flex items-center gap-2">
                <StageDot color={s.color} />
                {s.name}
                <span className="text-text-tertiary">{s.probability}%</span>
              </span>
            </SelectItem>
          ))
        ) : (
          <SelectItem value={NONE} disabled>No stages</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

// Shared fields for create + edit. `set(key)(value)` updates the draft.
function DealFields({ draft, set, pipelines, index, people, me, campaigns, disabled, idPrefix }) {
  const pipeline = pipelines.find((p) => p.id === draft.pipelineId) || null;
  const changePipeline = (id) => {
    set("pipelineId")(id);
    const next = pipelines.find((p) => p.id === id);
    set("stageId")(next?.stages?.[0]?.id || "");
  };
  const changeContact = (record) => {
    set("contactId")(record?.id || null);
    const contact = record?.id ? index.contact.get(record.id)?.record : null;
    if (contact?.companyId && !draft.companyId && index.company.has(contact.companyId)) set("companyId")(contact.companyId);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Value" htmlFor={`${idPrefix}-value`}>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-value`}
            type="number"
            min="0"
            step="100"
            value={draft.value}
            onChange={(e) => set("value")(e.target.value)}
            className="tabular-nums"
            disabled={disabled}
          />
          <Select value={draft.currency} onValueChange={set("currency")} disabled={disabled}>
            <SelectTrigger className="w-24 shrink-0" aria-label="Currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Field>
      <Field label="Expected close" htmlFor={`${idPrefix}-close`}>
        <Input id={`${idPrefix}-close`} type="date" value={draft.expectedCloseDate} onChange={(e) => set("expectedCloseDate")(e.target.value)} disabled={disabled} />
      </Field>
      <Field label="Pipeline">
        <Select value={draft.pipelineId || NONE} onValueChange={changePipeline} disabled={disabled}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose a pipeline" /></SelectTrigger>
          <SelectContent>
            {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Stage" htmlFor={`${idPrefix}-stage`}>
        <StageSelect id={`${idPrefix}-stage`} pipeline={pipeline} value={draft.stageId} onChange={set("stageId")} disabled={disabled} />
      </Field>
      <Field label="Company">
        <RecordPicker
          value={draft.companyId ? { type: "company", id: draft.companyId } : null}
          onChange={(r) => set("companyId")(r?.id || null)}
          index={index}
          types={["company"]}
          placeholder="No company"
          disabled={disabled}
          ariaLabel="Company"
        />
      </Field>
      <Field label="Primary contact">
        <RecordPicker
          value={draft.contactId ? { type: "contact", id: draft.contactId } : null}
          onChange={changeContact}
          index={index}
          types={["contact"]}
          placeholder="No contact"
          disabled={disabled}
          ariaLabel="Primary contact"
        />
      </Field>
      <Field label="Owner">
        <PersonSelect value={draft.ownerId} onChange={set("ownerId")} people={people} me={me} disabled={disabled} ariaLabel="Owner" />
      </Field>
      {campaigns ? (
        <Field label="Source campaign" hint="Credits the campaign with this deal's revenue when it's won.">
          <Select value={draft.sourceCampaignId || NONE} onValueChange={(v) => set("sourceCampaignId")(v === NONE ? null : v)} disabled={disabled}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </div>
  );
}

// New deal. defaults: { pipelineId, companyId, contactId }. onCreate(input) resolves truthy on success.
export function CreateDealDialog({ open, onOpenChange, onCreate, pipelines, index, people, me, campaigns, defaults = {} }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New deal</DialogTitle>
          <DialogDescription>Add an opportunity to a pipeline. You can change any of this later.</DialogDescription>
        </DialogHeader>
        <CreateDealForm
          onClose={() => onOpenChange(false)}
          onCreate={onCreate}
          pipelines={pipelines}
          index={index}
          people={people}
          me={me}
          campaigns={campaigns}
          defaults={defaults}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateDealForm({ onClose, onCreate, pipelines, index, people, me, campaigns, defaults }) {
  const [draft, setDraft] = useState(() => {
    const pipeline = pipelines.find((p) => p.id === defaults.pipelineId) || pipelines.find((p) => p.isDefault) || pipelines[0];
    return {
      ...toDraft({ value: "", currency: "USD", ownerId: me?.id || null, companyId: defaults.companyId, contactId: defaults.contactId }),
      value: "",
      pipelineId: pipeline?.id || "",
      stageId: pipeline?.stages?.[0]?.id || "",
    };
  });
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error("Give the deal a name.");
      return;
    }
    if (!draft.pipelineId) {
      toast.error("Choose a pipeline.");
      return;
    }
    setPending(true);
    const ok = await onCreate({ ...draft, name: draft.name.trim(), value: Number(draft.value) || 0, ownerId: draft.ownerId || me?.id || null });
    setPending(false);
    if (ok) onClose();
  };

  return (
    <>
      <div className="grid gap-4">
        <Field label="Deal name" htmlFor="nd-name">
          <Input id="nd-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Annual retainer renewal" autoFocus />
        </Field>
        <DealFields draft={draft} set={set} pipelines={pipelines} index={index} people={people} me={me} campaigns={campaigns} idPrefix="nd" />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button className={PRIMARY_BTN} disabled={pending} onClick={submit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create deal
        </Button>
      </DialogFooter>
    </>
  );
}

// Replays history rows in time order, labelling each and noting how long the deal sat in the stage it left.
function historyEntries(rows, pipelines) {
  const sorted = [...rows].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const stageName = (pipelineId, stageId, fallback) =>
    pipelines.find((p) => p.id === pipelineId)?.stages.find((s) => s.id === stageId)?.name || fallback || "a removed stage";
  const out = [];
  let since = null;
  let current = null;
  for (const a of sorted) {
    const spent = since ? daysBetween(since, a.occurredAt) : null;
    let label = a.subject;
    let stayed = null;
    if (a.event === "created") {
      current = stageName(a.pipelineId, a.toStageId, a.toStageName);
      label = `Created in ${current}`;
      since = a.occurredAt;
    } else if (a.event === "stage") {
      stayed = current ? { stage: current, days: spent } : null;
      current = stageName(a.pipelineId, a.toStageId, a.toStageName);
      label = `Moved to ${current}`;
      since = a.occurredAt;
    } else if (a.event === "status") {
      stayed = a.toStatus !== "open" && current ? { stage: current, days: spent } : null;
      if (a.toStatus === "open") since = a.occurredAt;
    }
    out.push({ ...a, label, stayed });
  }
  return out;
}

// Stage history replayed from the deal's stage_change / system activities.
function DealHistory({ projectId, deal, pipelines, byId, me }) {
  const [rows, setRows] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const key = `${deal.id}:${deal.updatedAt}`;

  useEffect(() => {
    let alive = true;
    listActivities(projectId, { relatedType: "deal", relatedId: deal.id, kinds: ["stage_change", "system"], limit: 500 }).then((list) => {
      if (!alive) return;
      setRows(list ?? []);
      setLoadedFor(`${deal.id}:${deal.updatedAt}`);
    });
    return () => {
      alive = false;
    };
  }, [projectId, deal.id, deal.updatedAt]);

  const entries = useMemo(() => historyEntries(rows, pipelines), [rows, pipelines]);

  if (loadedFor !== key) return <LoadingArea size={40} panel label="Loading stage history" />;
  if (!entries.length) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={History} title="No history yet" description="Stage moves and won / lost changes are recorded here automatically." />
      </div>
    );
  }

  return (
    <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-subtle">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              {e.toStatus === "won" ? <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : null}
              {e.toStatus === "lost" ? <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> : null}
              {e.label}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {e.stayed ? `${formatDays(e.stayed.days)} in ${e.stayed.stage}` : null}
              {e.stayed && e.actorId ? " · " : null}
              {e.actorId ? personName(byId, e.actorId, me) : null}
            </p>
            {e.toStatus === "lost" && e.body ? <p className="mt-1 text-xs text-text-secondary">Reason: {e.body}</p> : null}
          </div>
          <time dateTime={e.occurredAt} className="shrink-0 whitespace-nowrap text-xs tabular-nums text-text-secondary">{formatDateTime(e.occurredAt)}</time>
        </li>
      ))}
    </ol>
  );
}

export function DealEditor({
  projectId,
  deal,
  pipelines,
  index,
  people,
  byId,
  me,
  campaigns,
  canEdit,
  onBack,
  onSave,
  onSetStatus,
  onDelete,
}) {
  const [draft, setDraft] = useState(() => toDraft(deal));
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(deal));

  const pipeline = pipelines.find((p) => p.id === deal.pipelineId) || null;
  const stage = resolveStage(pipeline, deal.stageId);
  const probability = dealProbability(deal, pipeline);

  const save = async () => {
    setSaving(true);
    const patch = { ...draft, name: draft.name.trim() || "Untitled deal", value: Math.max(0, Number(draft.value) || 0) };
    const ok = await onSave(deal.id, patch);
    setSaving(false);
    if (ok) setDraft(toDraft({ ...deal, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Deals", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Deal name"
          placeholder="Untitled deal"
          readOnly={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={deal.status}
      statusMap={DEAL_STATUS_MAP}
      badges={
        <>
          {deal.status === "open" ? <StageBadge stage={stage} /> : null}
          <span className="text-xs tabular-nums text-text-secondary">{formatMoney(deal.value, deal.currency)}</span>
          {deal.status === "open" ? (
            <span className="text-xs tabular-nums text-text-tertiary">
              {probability}% · {formatMoney(weightedValue(deal, pipeline), deal.currency)} weighted
            </span>
          ) : null}
          {deal.status === "won" ? <span className="text-xs text-text-tertiary">Won {formatDate(deal.wonAt)}</span> : null}
          {deal.status === "lost" ? (
            <span className="text-xs text-text-tertiary">
              Lost {formatDate(deal.lostAt)}
              {deal.lostReason ? ` · ${deal.lostReason}` : ""}
            </span>
          ) : null}
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete deal"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(deal)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BTN} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
            {deal.status === "open" ? (
              <>
                <Button variant="outline" className={OUTLINE_BTN} onClick={() => onSetStatus(deal, "lost")}>
                  <XCircle className="h-4 w-4" /> Mark lost
                </Button>
                <Button className={PRIMARY_BTN} onClick={() => onSetStatus(deal, "won")}>
                  <Trophy className="h-4 w-4" /> Mark won
                </Button>
              </>
            ) : (
              <Button variant="outline" className={OUTLINE_BTN} onClick={() => onSetStatus(deal, "open")}>
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
            )}
          </>
        ) : null
      }
      nav={DEAL_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <div className="space-y-6">
              <SectionCard bare title="Deal details" description="The deal's value, where it sits in the pipeline, who owns it and who it's with.">
                <DealFields
                  draft={draft}
                  set={set}
                  pipelines={pipelines}
                  index={index}
                  people={people}
                  me={me}
                  campaigns={campaigns}
                  disabled={!canEdit}
                  idPrefix="de"
                />
              </SectionCard>
              <SectionCard bare title="Linked records" description="The company and contact behind this deal.">
                <SettingsList>
                  <SettingRow
                    title="Company"
                    description="Open the company record."
                    control={<RecordLink type="company" id={deal.companyId} label={recordLabel(index, "company", deal.companyId)} />}
                  />
                  <SettingRow
                    title="Primary contact"
                    description="Open the contact in Audience."
                    control={<RecordLink type="contact" id={deal.contactId} label={recordLabel(index, "contact", deal.contactId)} />}
                  />
                  <SettingRow
                    title="Created"
                    description="When the deal entered the pipeline."
                    control={<span className="text-sm tabular-nums text-foreground">{formatDate(deal.createdAt)}</span>}
                  />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}

          {active === "history" ? <DealHistory projectId={projectId} deal={deal} pipelines={pipelines} byId={byId} me={me} /> : null}

          {active === "tasks" ? (
            <RelatedTasks projectId={projectId} relatedType="deal" relatedId={deal.id} people={people} byId={byId} me={me} canEdit={canEdit} />
          ) : null}

          {active === "notes" ? (
            <RecordActivity
              projectId={projectId}
              relatedType="deal"
              relatedId={deal.id}
              contactId={deal.contactId}
              index={index}
              byId={byId}
              me={me}
              canEdit={canEdit}
            />
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function DealStatusBadge({ deal, pipeline }) {
  if (deal.status === "open") return <StageBadge stage={resolveStage(pipeline, deal.stageId)} />;
  return <Badge variant={DEAL_STATUS_MAP[deal.status].variant}>{DEAL_STATUS_MAP[deal.status].label}</Badge>;
}
