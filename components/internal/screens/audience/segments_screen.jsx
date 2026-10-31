"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Filter, Pencil, RefreshCw, Copy, Trash2, FileText, ListFilter, Radio, Loader2, Users } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { apiPost } from "@/lib/api/client";
import { listAllContacts } from "@/lib/supabase/contacts";
import { listAllMemberships } from "@/lib/supabase/lists";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { createSegment, listSegments, softDeleteSegment, updateSegment } from "@/lib/supabase/segments";
import { buildSegmentFields, describeCondition, getField, isConditionComplete, newCondition } from "@/lib/audience/segment_rules";
import { buildContextIndex, filterBySegment } from "@/lib/audience/evaluate";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  LoadingArea,
  StatsBar,
  StatusPill,
  SectionCard,
  InlineTitleInput,
  Progress,
  cn,
} from "@geiger/ui";
import { ConditionBuilder } from "./condition_builder";
import { useAudienceCatalog } from "./use_audience_catalog";
import { CONTACT_STATUS_MAP, DESTRUCTIVE_BUTTON, DESTRUCTIVE_GHOST, DIALOG_BODY, DIALOG_SCROLL, OUTLINE_BUTTON, number, plural, timeAgo } from "./constants";

const MATCH_FILTER_OPTIONS = [
  { value: "all", label: "All match types" },
  { value: "match-all", label: "Match all" },
  { value: "match-any", label: "Match any" },
];

const SEGMENT_NAV = [
  { key: "conditions", label: "Conditions", icon: ListFilter, desc: "The rules contacts must meet, with a live preview." },
  { key: "reach", label: "Reach", icon: Radio, desc: "Who you can actually message per channel after consent and suppressions." },
  { key: "details", label: "Details", icon: FileText, desc: "Name the segment and describe who's in it." },
];

const PREVIEW_CONTACTS = 5000;
const PREVIEW_ACTIVITY = 5000;

const conditionSummary = (s, fields) => {
  const complete = s.conditions.filter(isConditionComplete);
  if (!complete.length) return "Everyone in the project";
  const first = describeCondition(complete[0], fields);
  return complete.length > 1 ? `${first} ${s.match === "any" ? "or" : "and"} ${complete.length - 1} more` : first;
};

// Contacts, memberships and recent activity loaded into the browser for live previews.
function usePreviewData(projectId, enabled) {
  const [state, setState] = useState({ key: null });
  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    let alive = true;
    Promise.all([
      listAllContacts(projectId, { max: PREVIEW_CONTACTS }),
      listAllMemberships(projectId),
      listDeliveries(projectId, { limit: PREVIEW_ACTIVITY }),
      listTrackedEvents(projectId, { limit: PREVIEW_ACTIVITY }),
    ]).then(([contacts, memberships, deliveries, events]) => {
      if (!alive) return;
      const c = contacts ?? [];
      const d = deliveries ?? [];
      const e = events ?? [];
      const loadedAt = Date.now();
      setState({
        key: projectId,
        contacts: c,
        partial: c.length >= PREVIEW_CONTACTS || d.length >= 1000 || e.length >= 1000,
        eventNames: [...new Set(e.map((x) => x.name))].sort(),
        contextFor: buildContextIndex({ listMembers: memberships ?? [], events: e, deliveries: d, now: loadedAt }),
      });
    });
    return () => {
      alive = false;
    };
  }, [projectId, enabled]);
  return state.key === projectId ? state : null;
}

function useLivePreview(preview, match, conditions) {
  return useMemo(() => {
    if (!preview) return null;
    const matched = filterBySegment(preview.contacts, { match, conditions }, preview.contextFor);
    return { count: matched.length, total: preview.contacts.length, sample: matched.slice(0, 8), partial: preview.partial };
  }, [preview, match, conditions]);
}

function PreviewPanel({ live, className }) {
  if (!live) return <LoadingArea size={36} label="Loading preview" className="py-10" />;
  const share = live.total ? Math.round((live.count / live.total) * 100) : 0;
  return (
    <SectionCard
      className={className}
      title="Live preview"
      description={live.partial ? `Evaluated over the ${number(live.total)} most recent contacts and recent activity. Save to get the exact count.` : `Evaluated over all ${number(live.total)} contacts.`}
      bodyPadding={false}
    >
      <div className="flex items-end gap-2 border-b border-border px-5 py-4">
        <span className="text-2xl font-bold tabular-nums text-foreground">{number(live.count)}</span>
        <span className="mb-0.5 text-sm text-text-secondary">{live.count === 1 ? "contact matches" : "contacts match"} · {share}% of the audience</span>
      </div>
      {live.sample.length ? (
        <ul className="divide-y divide-border">
          {live.sample.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                <span className="block truncate text-xs text-text-secondary">{c.email || c.phone}</span>
              </span>
              <StatusPill status={c.status} map={CONTACT_STATUS_MAP} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-text-tertiary">No contacts match these conditions yet.</p>
      )}
    </SectionCard>
  );
}

// One-line match count with the share of the audience, shown under the create form.
function MatchMeter({ live, incomplete }) {
  const share = live?.total ? Math.round((live.count / live.total) * 100) : 0;
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-surface-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 text-text-secondary">
          <Users className="h-4 w-4" />
          {live ? (
            <span>
              <span className="font-semibold tabular-nums text-foreground">{number(live.count)}</span> of {number(live.total)} contacts match
              {live.partial ? " in the preview" : ""}
            </span>
          ) : (
            <span>Counting matches…</span>
          )}
        </span>
        {live ? <span className="text-xs tabular-nums text-text-tertiary">{share}% of the audience</span> : null}
      </div>
      <Progress value={live ? share : 0} className="h-1.5 bg-surface-hover" />
      {incomplete ? <p className="text-xs text-amber-600 dark:text-amber-400">Fill in the highlighted condition, or remove it, to create the segment.</p> : null}
    </div>
  );
}

function CreateSegmentDialog({ open, onOpenChange, fields, preview, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [match, setMatch] = useState("all");
  const [conditions, setConditions] = useState(() => [newCondition("leadScore", fields)]);
  const [saving, setSaving] = useState(false);
  const live = useLivePreview(open ? preview : null, match, conditions);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setDescription("");
      setMatch("all");
      setConditions([newCondition("leadScore", fields)]);
    }
  }

  const incomplete = conditions.some((c) => !isConditionComplete(c));
  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the segment a name first.");
      return;
    }
    if (incomplete) {
      toast.error("Finish or remove the incomplete condition.");
      return;
    }
    setSaving(true);
    const ok = await onCreate({ name: name.trim(), description: description.trim(), match, conditions, live });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-4xl", DIALOG_SCROLL)}>
        <DialogHeader>
          <DialogTitle>Create segment</DialogTitle>
          <DialogDescription>A segment is a saved rule. Contacts move in and out as their data and behaviour change.</DialogDescription>
        </DialogHeader>
        <div className={DIALOG_BODY}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Segment name" htmlFor="s-name">
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engaged in the last 30 days" autoFocus />
            </Field>
            <Field label="Description (optional)" htmlFor="s-desc">
              <Input id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who belongs in this segment?" />
            </Field>
          </div>
          <Field label="Conditions">
            <ConditionBuilder
              match={match}
              onMatchChange={setMatch}
              conditions={conditions}
              onConditionsChange={setConditions}
              fields={fields}
              eventNames={preview?.eventNames}
              showIncomplete={incomplete && Boolean(name.trim())}
            />
          </Field>
          <MatchMeter live={live} incomplete={incomplete && Boolean(name.trim())} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create segment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const REACH_CHANNELS = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
];

function ReachPanel({ projectId, segmentId, dirty }) {
  const [state, setState] = useState({ key: null, rows: [] });
  const [version, setVersion] = useState(0);
  const key = `${segmentId}|${version}`;
  useEffect(() => {
    let alive = true;
    Promise.all(
      REACH_CHANNELS.map((c) => apiPost(`/api/projects/${projectId}/audience/estimate`, { audience: { segmentIds: [segmentId] }, channel: c.key })),
    ).then((results) => alive && setState({ key, rows: REACH_CHANNELS.map((c, i) => ({ ...c, res: results[i] })) }));
    return () => {
      alive = false;
    };
  }, [projectId, segmentId, key]);

  if (state.key !== key) return <LoadingArea size={48} label="Estimating reach" panel />;
  const failed = state.rows.find((r) => !r.res.ok);
  return (
    <div className="space-y-3">
      {dirty ? <p className="text-sm text-text-secondary">Reach reflects the saved conditions — save to include your edits.</p> : null}
      {failed ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Radio} title="Reach isn't available" description={failed.res.error || "The estimate service didn't respond."} action={<Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setVersion((v) => v + 1)}>Try again</Button>} />
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "channel", header: "Channel", render: (r) => <span className="font-medium text-foreground">{r.label}</span> },
            { key: "reach", header: "Can be messaged", align: "right", className: "tabular-nums font-semibold text-foreground", render: (r) => number(r.res.data.recipients) },
            { key: "unsub", header: "Not subscribed", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => number(r.res.data.excluded.unsubscribed) },
            { key: "noaddr", header: "No address", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => number(r.res.data.excluded.noAddress) },
            { key: "consent", header: "No consent", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => number(r.res.data.excluded.noConsent) },
            { key: "supp", header: "Suppressed", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => number(r.res.data.excluded.suppressed) },
          ]}
          data={state.rows}
          getRowKey={(r) => r.key}
        />
      )}
    </div>
  );
}

const toDraft = (s) => ({ name: s.name, description: s.description, match: s.match, conditions: s.conditions });

function SegmentEditor({ projectId, record, fields, preview, canEdit, canDelete, now, onBack, onSave, onDelete, onEvaluate, evaluating }) {
  const [draft, setDraft] = useState(() => ({ ...toDraft(record), conditions: record.conditions.length ? record.conditions : [newCondition("leadScore", fields)] }));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const live = useLivePreview(preview, draft.match, draft.conditions);
  const incomplete = draft.conditions.some((c) => !isConditionComplete(c));

  const save = async () => {
    if (incomplete) {
      toast.error("Finish or remove the incomplete condition.");
      return;
    }
    setSaving(true);
    await onSave(record.id, { ...draft, name: draft.name.trim() || "Untitled segment", description: draft.description.trim() }, live);
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Segments", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Segment name"
          placeholder="Untitled segment"
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant={draft.match === "all" ? "info" : "warning"}>Match {draft.match}</Badge>
          <span className="text-xs text-text-tertiary">
            {plural(record.contactCount, "contact")} · {record.computedAt ? `evaluated ${timeAgo(record.computedAt, now)}` : "not evaluated yet"}
          </span>
        </>
      }
      actions={
        <>
          {canDelete ? (
            <Button variant="ghost" size="icon" aria-label="Delete segment" className={DESTRUCTIVE_GHOST} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={evaluating} onClick={() => onEvaluate(record)}>
              {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-evaluate
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving || incomplete} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
        </>
      }
      nav={SEGMENT_NAV}
      defaultSection="conditions"
    >
      {({ active }) => (
        <>
          {active === "conditions" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <ConditionBuilder
                match={draft.match}
                onMatchChange={set("match")}
                conditions={draft.conditions}
                onConditionsChange={set("conditions")}
                fields={fields}
                eventNames={preview?.eventNames}
                className="self-start"
              />
              <PreviewPanel live={live} className="self-start" />
            </div>
          ) : null}
          {active === "reach" ? <ReachPanel projectId={projectId} segmentId={record.id} dirty={dirty} /> : null}
          {active === "details" ? (
            <SectionCard bare title="Segment details" description="The name and description your team sees when targeting this segment.">
              <div className="grid gap-4">
                <Field label="Segment name" htmlFor="se-name">
                  <Input id="se-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} />
                </Field>
                <Field label="Description" htmlFor="se-desc">
                  <Textarea id="se-desc" value={draft.description} disabled={!canEdit} onChange={(e) => set("description")(e.target.value)} placeholder="Who belongs in this segment?" />
                </Field>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function SegmentsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.contact.edit");
  const canDelete = can("campaign.contact.delete");
  const catalog = useAudienceCatalog(projectId);
  const [data, setData] = useState({ key: null, segments: [] });
  const [query, setQuery] = useState("");
  const [matchFilter, setMatchFilter] = useState("all");
  const [fieldFilter, setFieldFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [evaluating, setEvaluating] = useState(() => new Set());
  const [now, setNow] = useState(0);
  const autoEvaluated = useRef(new Set());
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const fields = useMemo(
    () => buildSegmentFields({ customFields: catalog.customFields, lists: catalog.lists, tags: catalog.tags }),
    [catalog.customFields, catalog.lists, catalog.tags],
  );
  const preview = usePreviewData(projectId, createOpen || Boolean(recordId));

  useEffect(() => {
    let alive = true;
    listSegments(projectId).then((rows) => {
      if (!alive) return;
      if (!rows) toast.error("Couldn't load segments.");
      setData({ key: projectId, segments: rows ?? [] });
      setNow(Date.now());
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const evaluate = useCallback(
    async (segment, { quiet = false } = {}) => {
      setEvaluating((prev) => new Set(prev).add(segment.id));
      const res = await apiPost(`/api/projects/${projectId}/audience/segments/${segment.id}/evaluate`, {});
      setEvaluating((prev) => {
        const next = new Set(prev);
        next.delete(segment.id);
        return next;
      });
      setNow(Date.now());
      if (!res.ok) {
        if (!quiet) toast.error(res.error || "Couldn't re-evaluate the segment.");
        return;
      }
      setData((d) => ({
        ...d,
        segments: d.segments.map((s) => (s.id === segment.id ? { ...s, contactCount: res.data.count, computedAt: res.data.computedAt } : s)),
      }));
      if (!quiet) toast.success(`"${segment.name}" has ${plural(res.data.count, "contact")}.`);
    },
    [projectId],
  );

  // Counts that were never computed are evaluated once in the background.
  useEffect(() => {
    if (data.key !== projectId || !canEdit) return;
    const stale = data.segments.filter((s) => !s.computedAt && !autoEvaluated.current.has(s.id));
    if (!stale.length) return;
    stale.forEach((s) => autoEvaluated.current.add(s.id));
    (async () => {
      for (const s of stale) await evaluate(s, { quiet: true });
    })();
  }, [data, projectId, canEdit, evaluate]);

  const loading = data.key !== projectId;
  const segments = data.segments;

  const fieldFilterOptions = useMemo(() => {
    const used = [...new Set(segments.flatMap((s) => s.conditions.map((c) => c.field)))];
    return [{ value: "all", label: "All fields" }, ...used.map((key) => ({ value: key, label: getField(key, fields)?.label || key }))];
  }, [segments, fields]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return segments.filter((s) => {
      if (matchFilter !== "all" && `match-${s.match}` !== matchFilter) return false;
      if (fieldFilter !== "all" && !s.conditions.some((c) => c.field === fieldFilter)) return false;
      if (q && !`${s.name} ${s.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [segments, query, matchFilter, fieldFilter]);

  const stats = useMemo(() => {
    const counted = segments.filter((s) => s.computedAt);
    const largest = counted.reduce((m, s) => (s.contactCount > (m?.contactCount ?? -1) ? s : m), null);
    const avg = counted.length ? Math.round(counted.reduce((sum, s) => sum + s.contactCount, 0) / counted.length) : 0;
    return [
      { label: "Segments", value: loading ? "" : number(segments.length), footer: `${segments.filter((s) => s.match === "any").length} match any` },
      { label: "Largest segment", value: loading ? "" : number(largest?.contactCount ?? 0), footer: largest?.name || "Not evaluated yet" },
      { label: "Avg. segment size", value: loading ? "" : number(avg), footer: "Contacts per segment" },
      { label: "Engagement rules", value: loading ? "" : number(segments.filter((s) => s.conditions.some((c) => getField(c.field)?.type === "event")).length), footer: "Segments using behaviour" },
    ];
  }, [segments, loading]);

  const pager = usePagination(filtered, { resetKey: `${query}|${matchFilter}|${fieldFilter}` });

  const handleCreate = async ({ name, description, match, conditions, live }) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const exact = live && !live.partial;
    const created = await createSegment(projectId, {
      id,
      name,
      description,
      match,
      conditions,
      createdBy: user?.id ?? null,
      ...(exact ? { contactCount: live.count, computedAt: new Date().toISOString() } : {}),
    });
    if (!created) {
      toast.error("Couldn't create the segment.");
      return false;
    }
    setData((d) => ({ ...d, segments: [created, ...d.segments] }));
    toast.success(`Created "${created.name}".`);
    openRecord(id);
    if (!exact) evaluate(created, { quiet: true });
    return true;
  };

  const handleSave = async (id, patch, live) => {
    const before = segments.find((s) => s.id === id);
    const exact = live && !live.partial;
    const full = { ...patch, ...(exact ? { contactCount: live.count, computedAt: new Date().toISOString() } : {}) };
    setData((d) => ({ ...d, segments: d.segments.map((s) => (s.id === id ? { ...s, ...full } : s)) }));
    const saved = await updateSegment(id, full);
    if (!saved) {
      setData((d) => ({ ...d, segments: d.segments.map((s) => (s.id === id ? before : s)) }));
      toast.error("Couldn't save the segment.");
      return;
    }
    setData((d) => ({ ...d, segments: d.segments.map((s) => (s.id === id ? saved : s)) }));
    toast.success("Segment saved.");
    if (!exact) evaluate(saved, { quiet: true });
  };

  const handleDuplicate = async (s) => {
    const user = await getUser();
    const created = await createSegment(projectId, {
      id: crypto.randomUUID(),
      name: `${s.name} (copy)`,
      description: s.description,
      match: s.match,
      conditions: s.conditions.map((c) => ({ ...c, id: crypto.randomUUID() })),
      contactCount: s.contactCount,
      computedAt: s.computedAt,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't duplicate the segment.");
      return;
    }
    setData((d) => ({ ...d, segments: [created, ...d.segments] }));
    toast.success("Segment duplicated.");
  };

  const handleDelete = async (s) => {
    setDeleteTarget(null);
    setData((d) => ({ ...d, segments: d.segments.filter((x) => x.id !== s.id) }));
    if (s.id === recordId) closeRecord();
    const ok = await softDeleteSegment(s.id);
    if (!ok) {
      setData((d) => ({ ...d, segments: [s, ...d.segments] }));
      toast.error("Couldn't delete the segment.");
      return;
    }
    toast.success(`Deleted "${s.name}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete segment</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Contacts stay in your audience; campaigns and automations targeting it stop matching anyone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DESTRUCTIVE_BUTTON} onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = segments.find((s) => s.id === recordId);
  if (open && !catalog.loading) {
    return (
      <>
        <SegmentEditor
          key={open.id}
          projectId={projectId}
          record={open}
          fields={fields}
          preview={preview}
          canEdit={canEdit}
          canDelete={canDelete}
          now={now}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onEvaluate={(s) => evaluate(s)}
          evaluating={evaluating.has(open.id)}
        />
        {deleteDialog}
      </>
    );
  }
  if (recordId && (loading || catalog.loading)) return <LoadingArea size={88} label="Loading segment" className="min-h-[60vh]" />;

  const filtersActive = query || matchFilter !== "all" || fieldFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setMatchFilter("all");
    setFieldFilter("all");
  };

  const columns = [
    {
      key: "segment",
      header: "Segment",
      render: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{s.name}</span>
          <span className="truncate text-xs text-text-secondary">{s.description || conditionSummary(s, fields)}</span>
        </div>
      ),
    },
    { key: "match", header: "Match", render: (s) => <Badge variant={s.match === "all" ? "info" : "warning"}>Match {s.match}</Badge> },
    { key: "conditions", header: "Conditions", align: "right", className: "tabular-nums text-muted-foreground", render: (s) => s.conditions.length },
    {
      key: "contacts",
      header: "Contacts",
      align: "right",
      render: (s) =>
        evaluating.has(s.id) ? (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-text-secondary" />
        ) : (
          <div className="flex flex-col items-end">
            <span className="font-medium tabular-nums text-foreground">{s.computedAt ? number(s.contactCount) : "—"}</span>
            <span className="text-[11px] text-text-tertiary">{s.computedAt ? timeAgo(s.computedAt, now) : "Not evaluated"}</span>
          </div>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <ActionMenu
          label={`Actions for ${s.name}`}
          items={[
            { label: canEdit ? "Edit conditions" : "View", icon: Pencil, onSelect: () => openRecord(s.id) },
            canEdit ? { label: "Re-evaluate", icon: RefreshCw, onSelect: () => evaluate(s) } : null,
            canEdit ? { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(s) } : null,
            canDelete ? { separator: true } : null,
            canDelete ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(s) } : null,
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Segments"
        description="Saved rules over contact data, tags, lists and behaviour — contacts move in and out automatically."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)} disabled={catalog.loading}>
              <Plus className="h-4 w-4" /> Create segment
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={matchFilter} onValueChange={setMatchFilter} options={MATCH_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={fieldFilter} onValueChange={setFieldFilter} options={fieldFilterOptions} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search segments…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading segments" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(s) => s.id}
            onRowClick={(s) => openRecord(s.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Filter}
                  title={filtersActive ? "No matches" : "No segments yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a segment to target contacts by data, tags, lists or engagement."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> Create segment
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="segments" />
        </div>
      )}

      <CreateSegmentDialog open={createOpen} onOpenChange={setCreateOpen} fields={fields} preview={preview} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default SegmentsScreen;
