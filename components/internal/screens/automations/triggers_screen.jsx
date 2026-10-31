"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, Code, FileText, Loader2, MousePointerClick, Plus, Workflow } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { listContacts } from "@/lib/supabase/contacts";
import { listLists } from "@/lib/supabase/lists";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { createAutomation, getAutomationCursor, listAutomations, listRecentEnrollments } from "@/lib/supabase/automations";
import { emptyGraph } from "@/lib/automations/graph";
import { CATALOG_EVENT_NAMES, TRIGGER_CATALOG, TRIGGER_CATEGORIES, defaultTrigger, triggerCatalogEntry } from "@/lib/automations/triggers";
import {
  Badge,
  Button,
  ScreenHeader,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  LogoLoading,
  StatsBar,
  SectionCard,
  StatusPill,
} from "@geiger/ui";
import { AUTOMATION_STATUS_MAP, KIND_COPY, OUTLINE_BUTTON, TRIGGER_ICONS, formatNumber, formatRelative } from "./constants";

const DAY = 86_400_000;

const CATEGORY_TONE = {
  Subscription: "info",
  Forms: "info",
  Engagement: "purple",
  "E-commerce": "success",
  Lifecycle: "warning",
  Custom: "neutral",
};

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "All categories" },
  ...TRIGGER_CATEGORIES.map((t) => ({ value: t, label: t })),
];

const TRIGGER_NAV = [
  { key: "overview", label: "Overview", icon: FileText, desc: "What starts this trigger and how contacts are matched." },
  { key: "activity", label: "Activity", icon: Activity, desc: "The most recent events and enrollments it saw." },
  { key: "automations", label: "Automations", icon: Workflow, desc: "Workflows and journeys that start from it." },
];

const automationsLabel = (n) => `${n} ${n === 1 ? "automation" : "automations"}`;

const MATCHING_COPY = {
  event: (name) =>
    `Every new tracked event named ${name || "…"} starts each active automation using this trigger for that event's contact, when its filters match. Events without a known contact, and events from before an automation was published, don't enroll anyone.`,
  date: () =>
    "Scanned hourly. Contacts whose date field falls on today — shifted by the automation's offset — enter from the configured time, once per year.",
  inactivity: () =>
    "Scanned hourly. Subscribed contacts with no tracked activity for the configured number of days enter once per quiet spell; new activity resets it.",
  manual: () => "Never fires on its own. Contacts enter through Test in the editor or through the API.",
};

// Which trigger row an automation starts from: its catalog key, or `event:<name>` for custom events.
function rowIdFor(trigger) {
  const entry = triggerCatalogEntry(trigger);
  if (!entry) return null;
  if (entry.key === "custom_event") return trigger?.event ? `event:${trigger.event}` : "custom_event";
  return entry.key;
}

function triggerFor(row) {
  if (row.custom) return { key: "custom_event", type: "event", event: row.event, filters: [] };
  return defaultTrigger(row.key);
}

// Readable property summary for an event row ("list: Newsletter · source: form").
function propertySummary(event, listNames) {
  return Object.entries(event.properties || {})
    .filter(([, v]) => v != null && v !== "" && typeof v !== "object")
    .slice(0, 3)
    .map(([k, v]) => (k === "list_id" && listNames.get(v) ? `list: ${listNames.get(v)}` : `${k}: ${String(v).slice(0, 40)}`))
    .join(" · ");
}

function OverviewItem({ label, children, mono = false }) {
  return (
    <div className="rounded-lg border border-border bg-surface-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className={mono ? "mt-1.5 font-mono text-xs text-foreground" : "mt-1.5 text-sm text-foreground"}>{children}</p>
    </div>
  );
}

function TriggerOverview({ row, cursor, loadedAt }) {
  const matching = (MATCHING_COPY[row.type] || MATCHING_COPY.manual)(row.event);
  return (
    <SectionCard bare title="At a glance" description={row.description} contentClassName="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <OverviewItem label="Event" mono={row.type === "event"}>
          {row.type === "event" ? row.event || "Any name you choose" : row.type === "manual" ? "None — manual" : "Scheduled scan"}
        </OverviewItem>
        <OverviewItem label="Category">{row.category}</OverviewItem>
        <OverviewItem label="Last processed">
          {row.type === "event" ? (cursor?.lastEventAt ? formatRelative(cursor.lastEventAt, loadedAt) : "The scheduler hasn't run yet") : cursor?.lastScanAt ? formatRelative(cursor.lastScanAt, loadedAt) : "Not scanned yet"}
        </OverviewItem>
      </div>
      {row.params?.length ? (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-medium text-text-secondary">Settings each automation can narrow it by</p>
          <ul className="space-y-1.5">
            {row.params.map((p) => (
              <li key={p.property} className="flex items-center gap-2 text-sm">
                <span className="text-foreground">{p.label}</span>
                <span className="font-mono text-xs text-text-tertiary">{p.property}</span>
                {p.optional ? <Badge variant="outline">Optional</Badge> : <Badge variant="neutral">Required</Badge>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="border-t border-border pt-4">
        <p className="text-xs font-medium text-text-secondary">How matching works</p>
        <p className="mt-1.5 text-sm text-foreground">{matching}</p>
      </div>
    </SectionCard>
  );
}

function TriggerActivity({ row, events, enrollments, automations, contactsById, listNames, loadedAt }) {
  const scheduled = row.type !== "event";
  const automationNames = useMemo(() => new Map(automations.map((a) => [a.id, a.name])), [automations]);
  const items = scheduled ? enrollments : events;
  const pager = usePagination(items, { pageSize: 10, resetKey: row.id });

  const contactCell = (contactId) => {
    const c = contactId ? contactsById.get(contactId) : null;
    if (!contactId) return <span className="text-sm text-text-tertiary">Anonymous visitor</span>;
    return (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{c?.name || "Unknown contact"}</span>
        {c?.email ? <span className="truncate text-xs text-text-secondary">{c.email}</span> : null}
      </div>
    );
  };

  const eventColumns = [
    { key: "contact", header: "Contact", render: (e) => contactCell(e.contactId) },
    {
      key: "details",
      header: "Details",
      render: (e) => <span className="block max-w-sm truncate font-mono text-xs text-muted-foreground">{propertySummary(e, listNames) || "—"}</span>,
    },
    { key: "source", header: "Source", className: "capitalize text-muted-foreground", render: (e) => e.source || "—" },
    { key: "when", header: "When", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (e) => formatRelative(e.occurredAt, loadedAt) },
  ];

  const enrollmentColumns = [
    { key: "contact", header: "Contact", render: (e) => contactCell(e.contactId) },
    { key: "automation", header: "Automation", className: "text-muted-foreground", render: (e) => automationNames.get(e.automationId) || "Deleted automation" },
    { key: "when", header: "Entered", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (e) => formatRelative(e.enteredAt, loadedAt) },
  ];

  return (
    <div className="space-y-5">
      <DataTable
        columns={scheduled ? enrollmentColumns : eventColumns}
        data={pager.pageItems}
        getRowKey={(e) => e.id}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={Activity}
              title={scheduled ? "No one has entered in the last 30 days" : "No events in the last 30 days"}
              description={
                scheduled
                  ? "Contacts appear here once an active automation's hourly scan enrolls them."
                  : row.event
                    ? `Events named ${row.event} arrive from the tracking snippet, forms, stores, connected channels or the API — or from contact and list changes.`
                    : "Pick an event name in an automation; matching events from the tracking snippet, forms, stores or the API show up here."
              }
            />
          </div>
        }
      />
      <ListPagination {...pager} itemLabel={scheduled ? "enrollments" : "events"} />
    </div>
  );
}

function TriggerAutomations({ automations, onOpen, onUse, canEdit, creating }) {
  const columns = [
    {
      key: "name",
      header: "Automation",
      render: (a) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{a.name}</span>
          {a.description ? <span className="max-w-md truncate text-xs text-text-secondary">{a.description}</span> : null}
        </div>
      ),
    },
    { key: "kind", header: "Type", className: "text-muted-foreground", render: (a) => (a.kind === "journey" ? "Journey" : "Workflow") },
    { key: "status", header: "Status", render: (a) => <StatusPill status={a.status} map={AUTOMATION_STATUS_MAP} /> },
    { key: "enrolled", header: "Enrolled", className: "tabular-nums text-muted-foreground", render: (a) => formatNumber(a.stats?.enrolled) },
  ];
  return (
    <DataTable
      columns={columns}
      data={automations}
      getRowKey={(a) => a.id}
      onRowClick={onOpen}
      empty={
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Workflow}
            title="Nothing starts from it yet"
            description="Create a workflow with this trigger to start enrolling contacts."
            action={
              canEdit ? (
                <Button onClick={onUse} disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Use in a workflow
                </Button>
              ) : null
            }
          />
        </div>
      }
    />
  );
}

function TriggerDetail({ row, data, onBack, onOpenAutomation, onUse, canEdit, creating }) {
  const Icon = (row.custom ? Code : TRIGGER_ICONS[row.key]) || MousePointerClick;
  const usedIn = row.automations.length;
  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{row.label}</h1>
        </div>
      }
      badges={
        <>
          <Badge variant={CATEGORY_TONE[row.category]}>{row.category}</Badge>
          <span className="text-xs text-text-tertiary">Used in {automationsLabel(usedIn)}</span>
          {row.type === "event" ? <span className="text-xs text-text-tertiary">· {formatNumber(row.events.length)} events in 30 days</span> : null}
        </>
      }
      actions={
        canEdit ? (
          <Button onClick={onUse} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Use in a workflow
          </Button>
        ) : null
      }
      nav={TRIGGER_NAV}
      defaultSection="overview"
    >
      {({ active }) => (
        <>
          {active === "overview" ? <TriggerOverview row={row} cursor={data.cursor} loadedAt={data.loadedAt} /> : null}
          {active === "activity" ? (
            <TriggerActivity
              row={row}
              events={row.events}
              enrollments={row.enrollments}
              automations={data.automations}
              contactsById={data.contactsById}
              listNames={data.listNames}
              loadedAt={data.loadedAt}
            />
          ) : null}
          {active === "automations" ? (
            <TriggerAutomations automations={row.automations} onOpen={onOpenAutomation} onUse={onUse} canEdit={canEdit} creating={creating} />
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

const EMPTY_DATA = { automations: [], events: [], enrollments: [], contacts: [], lists: [], cursor: null, loadedAt: 0 };

export function TriggersScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.automation.edit");
  const { recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();
  const [raw, setRaw] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    Promise.all([
      listAutomations(projectId),
      listTrackedEvents(projectId, { since, limit: 2000 }),
      listRecentEnrollments(projectId, { since }),
      getAutomationCursor(projectId),
      listContacts(projectId, { limit: 1000 }),
      listLists(projectId),
    ]).then(([automations, events, enrollments, cursor, contacts, lists]) => {
      if (!alive) return;
      if (automations === null || events === null) toast.error("Couldn't load trigger activity.");
      setRaw({
        automations: automations ?? [],
        events: events ?? [],
        enrollments: (enrollments ?? []).filter((e) => !e.test),
        contacts: contacts ?? [],
        lists: lists ?? [],
        cursor,
        loadedAt: Date.now(),
      });
      setLoading(false);
    });
    getUser().then((u) => alive && setUserId(u?.id ?? null));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const data = useMemo(
    () => ({
      ...raw,
      contactsById: new Map(raw.contacts.map((c) => [c.id, c])),
      listNames: new Map(raw.lists.map((l) => [l.id, l.name])),
    }),
    [raw],
  );

  // Catalog rows plus every custom event name seen in tracking or used by an automation.
  const rows = useMemo(() => {
    const live = raw.automations.filter((a) => a.status !== "archived");
    const customNames = new Set();
    for (const e of raw.events) if (e.name && !CATALOG_EVENT_NAMES.has(e.name)) customNames.add(e.name);
    for (const a of live) {
      const entry = triggerCatalogEntry(a.trigger);
      if (entry?.key === "custom_event" && a.trigger?.event) customNames.add(a.trigger.event);
    }
    const base = [
      ...TRIGGER_CATALOG.map((entry) => ({ ...entry, id: entry.key, custom: false })),
      ...[...customNames].sort().map((name) => ({
        id: `event:${name}`,
        key: "custom_event",
        label: name,
        category: "Custom",
        type: "event",
        event: name,
        custom: true,
        params: [],
        description: "A custom event sent from your site, app, a connected channel or the API.",
      })),
    ];
    const byRow = new Map(base.map((r) => [r.id, []]));
    for (const a of live) {
      const id = rowIdFor(a.trigger);
      if (id && byRow.has(id)) byRow.get(id).push(a);
    }
    return base.map((r) => {
      const automations = byRow.get(r.id) || [];
      const ids = new Set(automations.map((a) => a.id));
      const events = r.type === "event" && r.event ? raw.events.filter((e) => e.name === r.event) : [];
      const enrollments = raw.enrollments.filter((e) => ids.has(e.automationId));
      return { ...r, automations, events, enrollments, lastSeen: events[0]?.occurredAt ?? (r.type !== "event" ? enrollments[0]?.enteredAt : null) ?? null };
    });
  }, [raw]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (q && !`${r.label} ${r.event || ""} ${r.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, categoryFilter]);

  const stats = useMemo(() => {
    const inUse = rows.filter((r) => r.automations.length > 0).length;
    const listening = raw.automations.filter((a) => a.status === "active").length;
    const eventTypes = new Set(raw.events.map((e) => e.name)).size;
    return [
      { label: "Triggers in use", value: formatNumber(inUse), footer: `${listening} active ${listening === 1 ? "automation" : "automations"} listening` },
      { label: "Events (30 days)", value: raw.events.length >= 2000 ? "2,000+" : formatNumber(raw.events.length), footer: `Across ${eventTypes} event ${eventTypes === 1 ? "type" : "types"}` },
      { label: "Enrollments (30 days)", value: formatNumber(raw.enrollments.length), footer: "Contacts that entered an automation" },
      {
        label: "Last processed",
        value: raw.cursor?.lastEventAt ? formatRelative(raw.cursor.lastEventAt, raw.loadedAt) : "Not yet",
        footer: raw.cursor ? "Newest event the scheduler matched" : "The scheduler hasn't run yet",
      },
    ];
  }, [rows, raw]);

  const pager = usePagination(filtered, { resetKey: `${query}|${categoryFilter}` });

  const openAutomation = (a) => openRecordInTab(a.id, KIND_COPY[a.kind]?.title || "Workflows");

  const startWorkflow = async (row) => {
    if (!canEdit || creating) return;
    setCreating(true);
    const id = crypto.randomUUID();
    const saved = await createAutomation(projectId, {
      id,
      kind: "workflow",
      name: `${row.label} workflow`,
      description: "",
      graph: emptyGraph(triggerFor(row)),
      createdBy: userId,
    });
    setCreating(false);
    if (!saved) {
      toast.error("Couldn't create the workflow.");
      return;
    }
    toast.success(`“${saved.name}” created as a draft.`);
    openRecordInTab(saved.id, "Workflows");
  };

  const open = !loading ? rows.find((r) => r.id === recordId) : null;
  if (open) {
    return (
      <TriggerDetail
        key={open.id}
        row={open}
        data={data}
        onBack={closeRecord}
        onOpenAutomation={openAutomation}
        onUse={() => startWorkflow(open)}
        canEdit={canEdit}
        creating={creating}
      />
    );
  }

  const filtersActive = query || categoryFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setCategoryFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Trigger",
      render: (r) => {
        const Icon = (r.custom ? Code : TRIGGER_ICONS[r.key]) || MousePointerClick;
        return (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="font-medium text-foreground">{r.label}</span>
              <span className="truncate font-mono text-xs text-text-secondary">
                {r.type === "event" ? r.event || "any event name" : r.type === "manual" ? "manual" : "scheduled scan"}
              </span>
            </div>
          </div>
        );
      },
    },
    { key: "type", header: "Category", render: (r) => <Badge variant={CATEGORY_TONE[r.category]}>{r.category}</Badge> },
    {
      key: "events",
      header: "Events (30d)",
      className: "tabular-nums text-muted-foreground",
      render: (r) => (r.type === "event" ? formatNumber(r.events.length) : <span className="text-text-tertiary">—</span>),
    },
    { key: "enrollments", header: "Enrollments (30d)", className: "tabular-nums text-muted-foreground", render: (r) => formatNumber(r.enrollments.length) },
    { key: "lastSeen", header: "Last seen", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (r) => formatRelative(r.lastSeen, raw.loadedAt) },
    {
      key: "usedIn",
      header: "Used in",
      className: "tabular-nums text-muted-foreground",
      render: (r) => (r.automations.length ? automationsLabel(r.automations.length) : <span className="text-text-tertiary">Not used</span>),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Triggers" description="The events and schedules that start workflows and journeys, with what each one has seen lately." />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={categoryFilter} onValueChange={setCategoryFilter} options={CATEGORY_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search triggers…" />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading triggers" />
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(r) => r.id}
            onRowClick={(r) => openRecord(r.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={MousePointerClick}
                  title="No matches"
                  description={filtersActive ? "Try a different search or category." : "No triggers to show."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="triggers" />
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default TriggersScreen;
