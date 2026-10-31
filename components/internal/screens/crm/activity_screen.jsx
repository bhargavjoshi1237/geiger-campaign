"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, Clock, FileText, Loader2, Pencil, Plus, StickyNote, Trash2, UserRound } from "lucide-react";
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
  EmptyState,
  Field,
  InlineTitleInput,
  Input,
  LoadingArea,
  ScreenHeader,
  SearchInput,
  SectionCard,
  SegmentedTabs,
  SettingRow,
  SettingsList,
  StatsBar,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import { createActivity, listActivities, softDeleteActivity, updateActivity } from "@/lib/supabase/crm_activities";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { listDeals } from "@/lib/supabase/deals";
import { listCompanies } from "@/lib/supabase/companies";
import { listContacts } from "@/lib/supabase/contacts";
import { ACTIVITY_KINDS, LOGGABLE_KINDS } from "@/lib/crm/constants";
import { dayKey, dayLabel, formatDateTime, fromLocalInput, toLocalInput } from "@/lib/crm/format";
import { timelineItems } from "@/lib/crm/timeline";
import {
  DeleteDialog,
  FeedRow,
  LogActivityDialog,
  OUTLINE_BTN,
  PRIMARY_BTN,
  RecordLink,
  RecordPicker,
  personName,
  recordLabel,
  useCrmPeople,
  useRecordIndex,
} from "./crm_shared";

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All activity" },
  { value: "call", label: "Calls" },
  { value: "meeting", label: "Meetings" },
  { value: "note", label: "Notes" },
  { value: "email", label: "Logged emails" },
  { value: "deal", label: "Deal changes" },
  { value: "message", label: "Messages sent" },
  { value: "event", label: "Tracked events" },
];

const ACTIVITY_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "What happened, when, and which record it belongs to." },
  { key: "notes", label: "Notes", icon: StickyNote, desc: "Outcome, context and next steps." },
  { key: "record", label: "Record", icon: Clock, desc: "Who logged this entry and when." },
];

const KIND_TABS = LOGGABLE_KINDS.map((k) => ({ value: k, label: ACTIVITY_KINDS[k].label }));
const WEEK = 7 * 24 * 60 * 60 * 1000;

const matchesType = (item, type) => {
  if (type === "all") return true;
  if (type === "deal") return item.type === "stage_change" || item.type === "system";
  return item.type === type;
};

const toDraft = (a) => ({
  kind: a.kind,
  subject: a.subject || "",
  body: a.body || "",
  record: a.relatedType && a.relatedId ? { type: a.relatedType, id: a.relatedId } : null,
  when: toLocalInput(a.occurredAt),
});

function ActivityEditor({ activity, index, byId, me, canEdit, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(activity));
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(activity));

  const save = async () => {
    setSaving(true);
    const patch = {
      kind: draft.kind,
      subject: draft.subject.trim() || ACTIVITY_KINDS[draft.kind].label,
      body: draft.body.trim(),
      relatedType: draft.record?.type || null,
      relatedId: draft.record?.id || null,
      occurredAt: fromLocalInput(draft.when) || activity.occurredAt,
    };
    const ok = await onSave(activity, patch);
    setSaving(false);
    if (ok) setDraft(toDraft({ ...activity, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Activity", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.subject}
          onChange={(e) => set("subject")(e.target.value)}
          aria-label="Activity summary"
          placeholder={ACTIVITY_KINDS[draft.kind].label}
          readOnly={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant="neutral">{ACTIVITY_KINDS[activity.kind].label}</Badge>
          <span className="text-xs text-text-secondary">
            {activity.actorId ? `${personName(byId, activity.actorId, me)} · ` : ""}
            {formatDateTime(activity.occurredAt)}
          </span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete activity"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(activity)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BTN} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={ACTIVITY_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="What happened" description="The kind of activity, the record it belongs to and when it took place.">
              <div className="grid gap-4">
                <Field label="Type">
                  {canEdit ? <SegmentedTabs tabs={KIND_TABS} value={draft.kind} onChange={set("kind")} className="sm:w-fit" /> : <span className="text-sm text-foreground">{ACTIVITY_KINDS[draft.kind].label}</span>}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Related to">
                    <RecordPicker value={draft.record} onChange={set("record")} index={index} disabled={!canEdit} ariaLabel="Related record" />
                  </Field>
                  <Field label="When" htmlFor="ae-when">
                    <Input id="ae-when" type="datetime-local" value={draft.when} onChange={(e) => set("when")(e.target.value)} disabled={!canEdit} />
                  </Field>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {active === "notes" ? (
            <SectionCard bare title="Outcome" description="What was discussed, how it went and what happens next.">
              <Field label="Notes" htmlFor="ae-body">
                <Textarea id="ae-body" value={draft.body} onChange={(e) => set("body")(e.target.value)} placeholder="Outcome, context and next steps…" className="min-h-40" disabled={!canEdit} />
              </Field>
            </SectionCard>
          ) : null}

          {active === "record" ? (
            <SectionCard bare title="Entry history" description="Who logged this activity and when it was added.">
              <SettingsList>
                <SettingRow
                  icon={UserRound}
                  title="Logged by"
                  description="The teammate who recorded this entry."
                  control={<span className="text-sm font-medium text-foreground">{activity.actorId ? personName(byId, activity.actorId, me) : "—"}</span>}
                />
                <SettingRow
                  icon={Clock}
                  title="Added"
                  description="When it reached the timeline."
                  control={<span className="text-sm tabular-nums text-foreground">{formatDateTime(activity.createdAt || activity.occurredAt)}</span>}
                />
                {activity.contactId ? (
                  <SettingRow
                    icon={UserRound}
                    title="Contact"
                    description="The person this conversation was with."
                    control={<RecordLink type="contact" id={activity.contactId} label={recordLabel(index, "contact", activity.contactId)} />}
                  />
                ) : null}
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function ActivityScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.crm.edit");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const { people, byId, me } = useCrmPeople(projectId);

  const [activities, setActivities] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [events, setEvents] = useState([]);
  const [deals, setDeals] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [now] = useState(() => Date.now());

  const [typeFilter, setTypeFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [recordFilter, setRecordFilter] = useState(null);
  const [query, setQuery] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listActivities(projectId, { limit: 1000 }),
      listDeliveries(projectId, { limit: 300 }),
      listTrackedEvents(projectId, { limit: 300 }),
      listDeals(projectId),
      listCompanies(projectId),
      listContacts(projectId),
    ]).then(([activityRows, deliveryRows, eventRows, dealRows, companyRows, contactRows]) => {
      if (!alive) return;
      if (activityRows === null) toast.error("Couldn't load activity.");
      setActivities(activityRows ?? []);
      setDeliveries(deliveryRows ?? []);
      setEvents(eventRows ?? []);
      setDeals(dealRows ?? []);
      setCompanies(companyRows ?? []);
      setContacts(contactRows ?? []);
      setLoadedFor(projectId);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = loadedFor !== projectId;
  const index = useRecordIndex({ deals, companies, contacts });
  const items = useMemo(() => timelineItems({ activities, deliveries, events }), [activities, deliveries, events]);

  const links = useMemo(
    () => ({
      dealCompany: new Map(deals.map((d) => [d.id, d.companyId])),
      dealContact: new Map(deals.map((d) => [d.id, d.contactId])),
      contactCompany: new Map(contacts.map((c) => [c.id, c.companyId])),
    }),
    [deals, contacts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rec = recordFilter;
    const onRecord = (i) => {
      if (!rec) return true;
      if (rec.type === "deal") return i.relatedType === "deal" && i.relatedId === rec.id;
      if (rec.type === "contact") {
        return i.contactId === rec.id || (i.relatedType === "contact" && i.relatedId === rec.id) || (i.relatedType === "deal" && links.dealContact.get(i.relatedId) === rec.id);
      }
      return (
        (i.relatedType === "company" && i.relatedId === rec.id) ||
        (i.relatedType === "deal" && links.dealCompany.get(i.relatedId) === rec.id) ||
        (i.contactId && links.contactCompany.get(i.contactId) === rec.id)
      );
    };
    return items.filter((i) => {
      if (!matchesType(i, typeFilter)) return false;
      if (personFilter === "me" && i.actorId !== me?.id) return false;
      if (personFilter !== "all" && personFilter !== "me" && i.actorId !== personFilter) return false;
      if (!onRecord(i)) return false;
      if (q && !`${i.title} ${i.detail}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, typeFilter, personFilter, recordFilter, query, links, me]);

  const stats = useMemo(() => {
    const recent = (at) => at && now - new Date(at).getTime() < WEEK;
    const week = activities.filter((a) => recent(a.occurredAt));
    const conversations = week.filter((a) => a.kind === "call" || a.kind === "meeting").length;
    const notes = week.filter((a) => a.kind === "note" || a.kind === "email").length;
    const won = week.filter((a) => a.event === "status" && a.toStatus === "won").length;
    const sent = deliveries.filter((d) => recent(d.sentAt || d.createdAt) && d.status !== "queued" && d.status !== "failed" && d.status !== "not_sent").length;
    return [
      { label: "Calls & meetings", value: conversations.toLocaleString("en-US"), footer: "Logged in the last 7 days" },
      { label: "Notes & emails", value: notes.toLocaleString("en-US"), footer: "Logged in the last 7 days" },
      { label: "Messages sent", value: sent.toLocaleString("en-US"), footer: "All channels, last 7 days" },
      { label: "Deals won", value: won.toLocaleString("en-US"), footer: "In the last 7 days" },
    ];
  }, [activities, deliveries, now]);

  const pager = usePagination(filtered, { resetKey: `${typeFilter}|${personFilter}|${recordFilter?.id}|${query}` });

  const groups = useMemo(() => {
    const out = [];
    for (const item of pager.pageItems) {
      const key = dayKey(item.at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(item);
      else out.push({ key, items: [item] });
    }
    return out;
  }, [pager.pageItems]);

  const personOptions = useMemo(
    () => [
      { value: "all", label: "Anyone" },
      { value: "me", label: "Logged by me" },
      ...people.filter((p) => p.id !== me?.id).map((p) => ({ value: p.id, label: p.name })),
    ],
    [people, me],
  );

  // Mutations ----------------------------------------------------------------

  const contactFor = (type, id) => {
    if (type === "contact") return id;
    if (type === "deal") return links.dealContact.get(id) || null;
    return null;
  };

  const handleLog = async (input) => {
    const activity = {
      id: crypto.randomUUID(),
      actorId: me?.id || null,
      createdBy: me?.id || null,
      contactId: contactFor(input.relatedType, input.relatedId),
      ...input,
    };
    setActivities((prev) => [{ ...activity, createdAt: new Date().toISOString() }, ...prev]);
    const saved = await createActivity(projectId, activity);
    if (!saved) {
      setActivities((prev) => prev.filter((a) => a.id !== activity.id));
      toast.error("Couldn't log that activity.");
      return false;
    }
    setActivities((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    toast.success("Activity logged.");
    return true;
  };

  const handleSave = async (activity, patch) => {
    const full = { ...patch, contactId: contactFor(patch.relatedType, patch.relatedId) ?? activity.contactId };
    setActivities((prev) => prev.map((a) => (a.id === activity.id ? { ...a, ...full } : a)));
    const saved = await updateActivity(activity.id, full);
    if (!saved) {
      setActivities((prev) => prev.map((a) => (a.id === activity.id ? activity : a)));
      toast.error("Couldn't save the activity.");
      return false;
    }
    setActivities((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    toast.success("Activity saved.");
    return true;
  };

  const handleDelete = async (activity) => {
    setDeleteTarget(null);
    setActivities((prev) => prev.filter((a) => a.id !== activity.id));
    if (recordId === activity.id) closeRecord();
    if (!(await softDeleteActivity(activity.id))) {
      setActivities((prev) => [activity, ...prev]);
      toast.error("Couldn't delete the activity.");
      return;
    }
    toast.success("Activity deleted.");
  };

  const deleteDialog = (
    <DeleteDialog
      open={!!deleteTarget}
      title="Delete activity"
      name={deleteTarget?.subject || "this entry"}
      description="It's removed from every timeline it appears on."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const openActivity = !loading && recordId ? activities.find((a) => a.id === recordId && LOGGABLE_KINDS.includes(a.kind)) : null;
  if (openActivity) {
    return (
      <>
        <ActivityEditor
          key={openActivity.id}
          activity={openActivity}
          index={index}
          byId={byId}
          me={me}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = typeFilter !== "all" || personFilter !== "all" || Boolean(recordFilter) || Boolean(query);
  const clearFilters = () => {
    setTypeFilter("all");
    setPersonFilter("all");
    setRecordFilter(null);
    setQuery("");
  };

  const context = (item) => {
    const parts = [];
    if (item.relatedType && item.relatedId) {
      parts.push(<RecordLink key="rec" type={item.relatedType} id={item.relatedId} label={recordLabel(index, item.relatedType, item.relatedId)} className="text-xs" />);
    }
    if (item.contactId && !(item.relatedType === "contact" && item.relatedId === item.contactId)) {
      parts.push(<RecordLink key="contact" type="contact" id={item.contactId} label={recordLabel(index, "contact", item.contactId)} className="text-xs" />);
    }
    return parts.length ? parts : null;
  };

  const logButton = canEdit ? (
    <Button className={PRIMARY_BTN} onClick={() => setLogOpen(true)}>
      <Plus className="h-4 w-4" /> Log activity
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Activity"
        description="Calls, meetings, notes, deal changes, messages and tracked behaviour in one timeline."
        actions={logButton}
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={personFilter} onValueChange={setPersonFilter} options={personOptions} height="h-9" />
          <div className="w-56">
            <RecordPicker value={recordFilter} onChange={setRecordFilter} index={index} placeholder="Any record" ariaLabel="Filter by record" className="h-9 text-xs font-medium" />
          </div>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search activity…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={56} panel label="Loading activity" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Activity}
            title={filtersActive ? "Nothing matches" : "No activity yet"}
            description={
              filtersActive
                ? "Try another type, person or record."
                : "Log a call, meeting or note, move a deal, or send a campaign — it all lands here."
            }
            action={
              filtersActive ? (
                <Button variant="outline" className={OUTLINE_BTN} onClick={clearFilters}>Clear filters</Button>
              ) : (
                logButton
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} aria-label={dayLabel(g.key, new Date(now))}>
              <h2 className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-text-secondary">{dayLabel(g.key, new Date(now))}</h2>
              <ol className="rounded-xl border border-border bg-surface-subtle px-2 py-1">
                {g.items.map((item) => {
                  const manual = item.source === "crm" && LOGGABLE_KINDS.includes(item.type);
                  return (
                    <li key={item.key}>
                      <FeedRow
                        item={item}
                        actor={item.actorId ? personName(byId, item.actorId, me) : null}
                        now={now}
                        context={context(item)}
                        onOpen={manual ? () => openRecord(item.record.id) : undefined}
                        actions={
                          manual && canEdit ? (
                            <ActionMenu
                              label={`Actions for ${item.title || "activity"}`}
                              items={[
                                { label: "Edit", icon: Pencil, onSelect: () => openRecord(item.record.id) },
                                { separator: true },
                                { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(item.record) },
                              ]}
                            />
                          ) : null
                        }
                      />
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          <ListPagination {...pager} itemLabel="entries" />
        </div>
      )}

      {canEdit ? <LogActivityDialog open={logOpen} onOpenChange={setLogOpen} onSubmit={handleLog} index={index} /> : null}
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ActivityScreen;
