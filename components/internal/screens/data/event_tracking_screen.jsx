"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Code2, Pencil, Trash2, FileText, Activity, Braces, Ban, CircleCheck, Loader2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { apiPost } from "@/lib/api/client";
import { listApiKeys, normalizeApiKey } from "@/lib/supabase/api_keys";
import {
  countEventsSince,
  countTrackingIdentities,
  createEventDefinition,
  listEventDefinitions,
  softDeleteEventDefinition,
  updateEventDefinition,
} from "@/lib/supabase/event_definitions";
import { InstallCard } from "./tracking/install_card";
import { LiveStream } from "./tracking/live_stream";
import { TrackingDebugger } from "./tracking/debugger";
import { DANGER_BUTTON, DANGER_ICON_BUTTON, formatDateTime, formatNumber, OUTLINE_BUTTON, relativeTime } from "./shared/format";
import {
  ActionMenu,
  Badge,
  Button,
  DataTable,
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
  ScreenHeader,
  SearchInput,
  SectionCard,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
  Switch,
  Textarea,
  Toolbar,
} from "@geiger/ui";

const STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  waiting: { label: "No data yet", variant: "neutral" },
  blocked: { label: "Blocked", variant: "danger" },
};

const SOURCES = ["web", "api", "email", "form", "commerce", "social", "system"];
const SOURCE_FILTER_OPTIONS = [{ value: "all", label: "All sources" }, ...SOURCES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))];
const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_MAP).map(([value, m]) => ({ value, label: m.label }))];

const VIEWS = [
  { value: "events", label: "Events" },
  { value: "live", label: "Live stream" },
  { value: "debugger", label: "Debugger" },
];

const EVENT_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "What the event means and whether it's accepted." },
  { key: "properties", label: "Properties", icon: Braces, desc: "Property keys seen on this event and their JSON types." },
  { key: "activity", label: "Activity", icon: Activity, desc: "Volume and the most recent occurrences." },
];

const MANAGE = "campaign.data.manage";
const EVENT_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/;

const stateOf = (d) => (d.status === "blocked" ? "blocked" : d.totalCount > 0 ? "active" : "waiting");

function CreateEventDialog({ open, onOpenChange, onCreate, taken }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const reset = () => {
    setName("");
    setDescription("");
  };
  const submit = () => {
    const n = name.trim();
    if (!EVENT_NAME.test(n)) {
      toast.error("Use letters, numbers and underscores, starting with a letter — e.g. product_viewed.");
      return;
    }
    if (taken.has(n)) {
      toast.error(`${n} is already in the catalog.`);
      return;
    }
    onCreate({ name: n, description: description.trim() });
    reset();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register an event</DialogTitle>
          <DialogDescription>Document an event before you send it. Events you send without registering appear here automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Event name" htmlFor="e-name" hint="Must match what your code sends, e.g. product_viewed.">
            <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} placeholder="e.g. product_viewed" className="font-mono" autoFocus />
          </Field>
          <Field label="Description" htmlFor="e-desc">
            <Input id="e-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this event represent?" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Register event</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventEditor({ record, counts24, counts7d, projectId, canEdit, onBack, onSave, onDelete }) {
  const [description, setDescription] = useState(record.description);
  const [saving, setSaving] = useState(false);
  const dirty = description !== record.description;
  const blocked = record.status === "blocked";
  const properties = Object.entries(record.properties).sort(([a], [b]) => a.localeCompare(b));

  const save = async () => {
    setSaving(true);
    await onSave(record.id, { description: description.trim() });
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={<h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{record.name}</h1>}
      status={stateOf(record)}
      statusMap={STATUS_MAP}
      badges={
        <>
          {record.sources.map((s) => <Badge key={s} variant="neutral">{s}</Badge>)}
          <span className="text-xs text-text-tertiary">Last seen {relativeTime(record.lastSeenAt)}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Remove from catalog" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </>
        ) : null
      }
      nav={EVENT_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Meaning & ingest" description="Explain what the event represents and choose whether new ones are accepted.">
              <div className="grid gap-4">
                <Field label="Description" htmlFor="ee-desc" hint="Shown to anyone building segments and automations on this event.">
                  <Textarea id="ee-desc" value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What does this event represent?" />
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Accept this event"
                  description={blocked ? "Blocked: new events with this name are dropped at ingest." : "Turn off to drop new events with this name at ingest (stored events stay)."}
                  control={<Switch checked={!blocked} disabled={!canEdit} aria-label="Accept this event" onCheckedChange={(on) => onSave(record.id, { status: on ? "active" : "blocked" })} />}
                />
                <SettingRow title="First seen" description="The first time this event arrived." control={<span className="text-sm text-muted-foreground">{formatDateTime(record.firstSeenAt, "Never")}</span>} />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "properties" ? (
            properties.length ? (
              <SectionCard bodyPadding={false}>
                <div className="divide-y divide-border">
                  {properties.map(([key, type]) => (
                    <div key={key} className="flex items-center justify-between gap-3 px-5 py-3">
                      <code className="font-mono text-sm text-foreground">{key}</code>
                      <Badge variant="neutral" className="font-mono">{type}</Badge>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : (
              <EmptyState icon={Braces} title="No properties seen" description="Property keys appear here as events with properties arrive." className="rounded-xl border border-border bg-surface-subtle" />
            )
          ) : null}

          {active === "activity" ? (
            <div className="space-y-4">
              <StatsBar
                columns={3}
                stats={[
                  { label: "Last 24 hours", value: formatNumber(counts24[record.name]?.events) },
                  { label: "Last 7 days", value: formatNumber(counts7d[record.name]?.events), footer: `${formatNumber(counts7d[record.name]?.contacts)} contacts` },
                  { label: "All time", value: formatNumber(record.totalCount) },
                ]}
              />
              <LiveStream projectId={projectId} name={record.name} compact />
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function EventTrackingScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can(MANAGE);
  const canManageKeys = can("campaign.integration.manage");
  const [definitions, setDefinitions] = useState([]);
  const [counts24, setCounts24] = useState({});
  const [counts7d, setCounts7d] = useState({});
  const [identified, setIdentified] = useState(null);
  const [publicKeys, setPublicKeys] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [view, setView] = useState("events");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const fetchAll = useCallback(async () => {
    const now = Date.now();
    const [defs, c24, c7, ids, keys] = await Promise.all([
      listEventDefinitions(projectId),
      countEventsSince(projectId, new Date(now - 86_400_000).toISOString()),
      countEventsSince(projectId, new Date(now - 7 * 86_400_000).toISOString()),
      countTrackingIdentities(projectId),
      listApiKeys(projectId),
    ]);
    return { defs: defs ?? [], c24: c24 ?? {}, c7: c7 ?? {}, ids, keys: (keys ?? []).filter((k) => k.kind === "public" && k.status === "active") };
  }, [projectId]);

  const apply = (out) => {
    setDefinitions(out.defs);
    setCounts24(out.c24);
    setCounts7d(out.c7);
    setIdentified(out.ids);
    setPublicKeys(out.keys);
  };

  useEffect(() => {
    let alive = true;
    fetchAll().then((out) => {
      if (!alive) return;
      apply(out);
      setLoading(false);
    });
    getUser().then((u) => alive && setUserId(u?.id || null));
    return () => {
      alive = false;
    };
  }, [fetchAll]);

  const reload = async () => apply(await fetchAll());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return definitions.filter((d) => {
      if (sourceFilter !== "all" && !d.sources.includes(sourceFilter)) return false;
      if (statusFilter !== "all" && stateOf(d) !== statusFilter) return false;
      if (q && !`${d.name} ${d.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [definitions, query, sourceFilter, statusFilter]);

  const stats = useMemo(
    () => [
      { label: "Event types", value: formatNumber(definitions.length), footer: `${formatNumber(definitions.filter((d) => stateOf(d) === "active").length)} receiving data` },
      { label: "Events · 24h", value: formatNumber(Object.values(counts24).reduce((s, c) => s + c.events, 0)) },
      { label: "Events · all time", value: formatNumber(definitions.reduce((s, d) => s + d.totalCount, 0)) },
      { label: "Identified visitors", value: identified == null ? "—" : formatNumber(identified), footer: "Browsers linked to a contact" },
    ],
    [definitions, counts24, identified],
  );

  const pager = usePagination(filtered, { resetKey: `${query}|${sourceFilter}|${statusFilter}` });
  const taken = useMemo(() => new Set(definitions.map((d) => d.name)), [definitions]);
  const activeKey = publicKeys.find((k) => k.id === selectedKeyId) || publicKeys[0] || null;

  const handleCreate = async ({ name, description }) => {
    const id = crypto.randomUUID();
    const optimistic = { id, projectId, name, description, status: "active", properties: {}, sources: [], totalCount: 0, firstSeenAt: null, lastSeenAt: null };
    setDefinitions((p) => [optimistic, ...p]);
    const created = await createEventDefinition(projectId, { id, name, description, createdBy: userId });
    if (!created) {
      setDefinitions((p) => p.filter((d) => d.id !== id));
      toast.error("Couldn't register the event.");
      return;
    }
    setDefinitions((p) => p.map((d) => (d.id === id ? created : d)));
    toast.success(`Registered ${name}.`);
  };

  const handleSave = async (id, patch) => {
    const previous = definitions;
    setDefinitions((p) => p.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    const saved = await updateEventDefinition(id, patch);
    if (!saved) {
      setDefinitions(previous);
      toast.error("Couldn't save the event.");
      return;
    }
    setDefinitions((p) => p.map((d) => (d.id === id ? saved : d)));
    toast.success(patch.status ? (patch.status === "blocked" ? `Blocked ${saved.name}.` : `Accepting ${saved.name} again.`) : "Event saved.");
  };

  const handleDelete = async (d) => {
    setDeleteTarget(null);
    setDefinitions((p) => p.filter((x) => x.id !== d.id));
    if (d.id === recordId) closeRecord();
    if (await softDeleteEventDefinition(d.id)) {
      toast.success(`Removed ${d.name} from the catalog.`);
    } else {
      toast.error("Couldn't remove the event.");
      reload();
    }
  };

  const createPublicKey = async () => {
    setCreatingKey(true);
    const res = await apiPost(`/api/projects/${projectId}/integrations/api-keys`, { name: "Website tracking", kind: "public", expiry: "never" });
    setCreatingKey(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't create a public key.");
      return;
    }
    const key = normalizeApiKey(res.data.apiKey);
    setPublicKeys((p) => [{ ...key, displayKey: key.displayKey || res.data.key }, ...p]);
    setSelectedKeyId(key.id);
    toast.success("Public key created. Paste the snippet on your site.");
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove from catalog</DialogTitle>
          <DialogDescription>
            Remove <span className="font-mono font-medium text-foreground">{deleteTarget?.name}</span> from the catalog? Stored events stay, and it reappears if the event arrives again. To stop accepting it, block it instead.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DANGER_BUTTON} onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = !loading ? definitions.find((d) => d.id === recordId) : null;
  if (open) {
    return (
      <>
        <EventEditor key={open.id} record={open} counts24={counts24} counts7d={counts7d} projectId={projectId} canEdit={canEdit} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || sourceFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setSourceFilter("all");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Event",
      render: (d) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-foreground">{d.name}</span>
          {d.description ? <span className="truncate text-xs text-text-secondary">{d.description}</span> : null}
        </div>
      ),
    },
    { key: "sources", header: "Sources", render: (d) => (d.sources.length ? <div className="flex flex-wrap gap-1">{d.sources.map((s) => <Badge key={s} variant="neutral">{s}</Badge>)}</div> : <span className="text-text-tertiary">—</span>) },
    { key: "last24h", header: "Last 24h", className: "tabular-nums text-muted-foreground", render: (d) => formatNumber(counts24[d.name]?.events) },
    { key: "total", header: "Total", className: "tabular-nums text-muted-foreground", render: (d) => formatNumber(d.totalCount) },
    { key: "lastSeen", header: "Last seen", className: "whitespace-nowrap text-muted-foreground", render: (d) => relativeTime(d.lastSeenAt) },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (d) => <StatusPill status={stateOf(d)} map={STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (d) => (
        <ActionMenu
          label={`Actions for ${d.name}`}
          items={[
            { label: canEdit ? "Edit event" : "View event", icon: Pencil, onSelect: () => openRecord(d.id) },
            canEdit && (d.status === "blocked"
              ? { label: "Accept again", icon: CircleCheck, onSelect: () => handleSave(d.id, { status: "active" }) }
              : { label: "Block", icon: Ban, onSelect: () => handleSave(d.id, { status: "blocked" }) }),
            canEdit && { separator: true },
            canEdit && { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(d) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Event Tracking"
        description="Behaviour from your site, app and servers — the input for segments, automations and attribution."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Register event
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <InstallCard
        publicKeys={publicKeys}
        selectedKeyId={activeKey?.id}
        onSelectKey={setSelectedKeyId}
        onCreateKey={createPublicKey}
        creatingKey={creatingKey}
        canCreateKey={canManageKeys}
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={view} onValueChange={setView} options={VIEWS} height="h-9" />
          {view === "events" ? (
            <>
              <FilterDropdown value={sourceFilter} onValueChange={setSourceFilter} options={SOURCE_FILTER_OPTIONS} height="h-9" />
              <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
            </>
          ) : null}
        </div>
        {view === "events" ? <SearchInput value={query} onChange={setQuery} placeholder="Search events…" /> : null}
      </Toolbar>

      {view === "events" ? (
        loading ? (
          <LoadingArea size={48} panel label="Loading events" />
        ) : (
          <div className="space-y-5">
            <DataTable
              columns={columns}
              data={pager.pageItems}
              getRowKey={(d) => d.id}
              onRowClick={(d) => openRecord(d.id)}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState
                    icon={Code2}
                    title={filtersActive ? "No matches" : "No events yet"}
                    description={filtersActive ? "Try a different search or filter." : "Install the snippet or send an event from the debugger. Every new event name shows up here."}
                    action={
                      filtersActive ? (
                        <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                      ) : (
                        <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setView("debugger")}>Open debugger</Button>
                      )
                    }
                  />
                </div>
              }
            />
            <ListPagination {...pager} itemLabel="events" />
          </div>
        )
      ) : null}

      {view === "live" ? <LiveStream projectId={projectId} /> : null}
      {view === "debugger" ? <TrackingDebugger publicKey={activeKey?.displayKey || null} /> : null}

      <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} taken={taken} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default EventTrackingScreen;
