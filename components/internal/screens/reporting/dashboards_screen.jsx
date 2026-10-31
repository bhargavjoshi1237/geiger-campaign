"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Star,
  Trash2,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { listMembers } from "@/lib/supabase/rbac";
import {
  createDashboard,
  listDashboards,
  setDefaultDashboard,
  softDeleteDashboard,
  updateDashboard,
} from "@/lib/supabase/dashboards";
import { formatDate } from "@/lib/reporting/format";
import { prepareSources, widgetTitle, WIDGET_TYPES } from "@/lib/reporting/query";
import { RANGE_OPTIONS, rangeLabel, widestRange } from "@/lib/reporting/ranges";
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
  EditorSectionHeader,
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
} from "@geiger/ui";
import { OUTLINE_BUTTON, RangeSelect, ReportFailed, TruncatedNote } from "./report_ui";
import { useReportSources } from "./use_report_sources";
import { DashboardWidget, WIDGET_GRID, WidgetDialog } from "./widgets";

// Starting layouts for a new dashboard (widget configuration, not data).
const w = (widget, metric, dimension, size) => ({ widget, metric, dimension, range: "dashboard", size });
const PRESETS = {
  overview: {
    label: "Campaign overview",
    layout: [
      w("kpi", "sends", "none", "sm"),
      w("kpi", "open_rate", "none", "sm"),
      w("kpi", "click_rate", "none", "sm"),
      w("kpi", "revenue", "none", "sm"),
      w("timeseries", "sends", "time", "md"),
      w("bar", "revenue", "campaign", "md"),
    ],
  },
  email: {
    label: "Email performance",
    layout: [
      w("kpi", "delivered", "none", "sm"),
      w("kpi", "open_rate", "none", "sm"),
      w("kpi", "click_rate", "none", "sm"),
      w("kpi", "unsubscribe_rate", "none", "sm"),
      w("timeseries", "open_rate", "time", "md"),
      w("bar", "open_rate", "provider", "md"),
      w("table", "click_rate", "campaign", "full"),
    ],
  },
  revenue: {
    label: "Revenue",
    layout: [
      w("kpi", "revenue", "none", "sm"),
      w("kpi", "conversions", "none", "sm"),
      w("kpi", "revenue_per_recipient", "none", "sm"),
      w("kpi", "total_revenue", "none", "sm"),
      w("timeseries", "revenue", "time", "md"),
      w("bar", "revenue", "channel", "md"),
      w("table", "revenue", "campaign", "full"),
    ],
  },
  deliverability: {
    label: "Deliverability",
    layout: [
      w("kpi", "delivery_rate", "none", "sm"),
      w("kpi", "bounce_rate", "none", "sm"),
      w("kpi", "complaint_rate", "none", "sm"),
      w("kpi", "unsubscribe_rate", "none", "sm"),
      w("timeseries", "bounce_rate", "time", "md"),
      w("table", "bounce_rate", "domain", "md"),
    ],
  },
  blank: { label: "Blank dashboard", layout: [] },
};

const withIds = (layout) => layout.map((x) => ({ ...x, id: crypto.randomUUID() }));

const VISIBILITY_FILTER_OPTIONS = [
  { value: "all", label: "All dashboards" },
  { value: "shared", label: "Shared" },
  { value: "private", label: "Private" },
];

const DASHBOARD_NAV = [
  { key: "view", label: "Dashboard", icon: LayoutDashboard, desc: "The dashboard's widgets over the selected date range.", ownHeader: true },
  { key: "widgets", label: "Widgets", icon: LayoutGrid, desc: "Add, edit, reorder or remove widgets." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "Name, description, default date range and who can see it." },
];

const widgetsLabel = (n) => `${n} ${n === 1 ? "widget" : "widgets"}`;
const widgetTypeLabel = (type) => WIDGET_TYPES.find((t) => t.value === type)?.label || type;

function VisibilityBadge({ shared }) {
  return <Badge variant={shared ? "info" : "neutral"}>{shared ? "Shared" : "Private"}</Badge>;
}

function CreateDashboardDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("overview");
  const [shared, setShared] = useState(true);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Give the dashboard a name first.");
      return;
    }
    onCreate({ name: name.trim(), description: "", layout: withIds(PRESETS[preset].layout), range: "30d", shared });
    setName("");
    setPreset("overview");
    setShared(true);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New dashboard</DialogTitle>
          <DialogDescription>Start from a preset, then add or remove widgets whenever you like.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Dashboard name" htmlFor="db-name">
            <Input
              id="db-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Black Friday tracker"
              autoFocus
            />
          </Field>
          <Field label="Start from" htmlFor="db-preset">
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger id="db-preset" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRESETS).map(([key, p]) => (
                  <SelectItem key={key} value={key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <SettingsList>
            <SettingRow
              title="Share with team"
              description="Everyone in this project can open it. Turn off to keep it private to you."
              checked={shared}
              onCheckedChange={setShared}
            />
          </SettingsList>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Create dashboard</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a dashboard row; compared against the row to derive dirty state.
const toDraft = (d) => ({ name: d.name, description: d.description, layout: d.layout, range: d.range, shared: d.shared });

// Renders its own section header so the refresh and add actions sit beside the title, not in the toolbar.
function DashboardView({ header, layout, viewRange, setViewRange, editable, onAdd, onEdit, onMove, onRemove }) {
  const ranges = [viewRange, ...layout.map((x) => x.range)];
  const needsSegments = layout.some((x) => x.dimension === "segment");
  const { loading, failed, truncated, sources, loadedAt, reload } = useReportSources({
    range: widestRange(ranges),
    include: ["campaigns", "deliveries", "events", "contacts", "lists", ...(needsSegments ? ["segments"] : [])],
  });
  const prepared = useMemo(() => (sources ? prepareSources(sources) : null), [sources]);

  return (
    <>
      <EditorSectionHeader
        title={header?.label}
        description={header?.desc}
        className="mb-5"
        action={
          <>
            <Button variant="outline" className={`h-9 ${OUTLINE_BUTTON}`} onClick={reload} disabled={loading} aria-label="Refresh data">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {editable ? (
              <Button className="h-9 bg-primary text-primary-foreground hover:bg-primary/90" onClick={onAdd}>
                <Plus className="h-4 w-4" /> Add widget
              </Button>
            ) : null}
          </>
        }
      />
      <div className="space-y-4">
        <Toolbar>
          <div className="flex items-center gap-2">
            <RangeSelect value={viewRange} onChange={setViewRange} />
            {loading && prepared ? <Loader2 className="h-4 w-4 animate-spin text-text-secondary" aria-label="Refreshing" /> : null}
          </div>
        </Toolbar>

        {failed && !loading ? <ReportFailed onRetry={reload} /> : null}

        {layout.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-subtle">
            <EmptyState
              icon={LayoutGrid}
              title="No widgets yet"
              description={editable ? "Add a KPI, time series, bar chart or table to start tracking performance." : "The owner hasn't added widgets to this dashboard yet."}
              action={
                editable ? (
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={onAdd}>
                    <Plus className="h-4 w-4" /> Add widget
                  </Button>
                ) : null
              }
            />
          </div>
        ) : !prepared ? (
          <LoadingArea panel size={48} label="Loading dashboard" />
        ) : (
          <>
            <div className={WIDGET_GRID}>
              {layout.map((widget, i) => (
                <DashboardWidget
                  key={widget.id}
                  widget={widget}
                  index={i}
                  count={layout.length}
                  prepared={prepared}
                  dashboardRange={viewRange}
                  now={loadedAt}
                  editable={editable}
                  onEdit={onEdit}
                  onMove={onMove}
                  onRemove={onRemove}
                />
              ))}
            </div>
            <TruncatedNote show={truncated} />
          </>
        )}
      </div>
    </>
  );
}

function DashboardEditor({ record, ownerLabel, editable, saving, onBack, onSave, onDelete, onSetDefault }) {
  const { setSection } = useWorkspaceUrl();
  const [draft, setDraft] = useState(() => toDraft(record));
  const [viewRange, setViewRange] = useState(record.range);
  const [widgetDialog, setWidgetDialog] = useState({ open: false, widget: null });
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));

  const upsertWidget = (widget) =>
    setDraft((d) => {
      const exists = d.layout.some((x) => x.id === widget.id);
      return { ...d, layout: exists ? d.layout.map((x) => (x.id === widget.id ? widget : x)) : [...d.layout, widget] };
    });
  const moveWidget = (index, dir) =>
    setDraft((d) => {
      const next = [...d.layout];
      const target = index + dir;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, layout: next };
    });
  const removeWidget = (widget) => setDraft((d) => ({ ...d, layout: d.layout.filter((x) => x.id !== widget.id) }));
  const openWidget = (widget = null) => setWidgetDialog({ open: true, widget });

  const save = () => onSave(record, { ...draft, name: draft.name.trim() || "Untitled dashboard", description: draft.description.trim() });

  return (
    <>
      <EditorShell
        back={{ label: "Back", onClick: onBack }}
        title={
          <InlineTitleInput
            value={draft.name}
            onChange={(e) => set("name")(e.target.value)}
            aria-label="Dashboard name"
            placeholder="Untitled dashboard"
            readOnly={!editable}
            className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          />
        }
        badges={
          <>
            <VisibilityBadge shared={draft.shared} />
            {record.isDefault ? <Badge variant="purple">Default</Badge> : null}
            <span className="text-xs text-text-tertiary">
              {widgetsLabel(draft.layout.length)} · Owned by {ownerLabel}
            </span>
          </>
        }
        actions={
          editable ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete dashboard"
                className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
                onClick={() => onDelete(record)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </Button>
            </>
          ) : null
        }
        nav={DASHBOARD_NAV}
        defaultSection="view"
      >
        {({ active, activeItem }) => (
          <>
            {active === "view" ? (
              <DashboardView
                header={activeItem}
                layout={draft.layout}
                viewRange={viewRange}
                setViewRange={setViewRange}
                editable={editable}
                onAdd={() => openWidget()}
                onEdit={openWidget}
                onMove={moveWidget}
                onRemove={removeWidget}
              />
            ) : null}

            {active === "widgets" ? (
              draft.layout.length ? (
                <SectionCard
                  bodyPadding={false}
                  title="Widget order"
                  description="Widgets render in this order, left to right."
                  action={
                    editable ? (
                      <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => openWidget()}>
                        <Plus className="h-4 w-4" /> Add widget
                      </Button>
                    ) : null
                  }
                >
                  <div className="divide-y divide-border">
                    {draft.layout.map((widget, i) => (
                      <div key={widget.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{widgetTitle(widget)}</p>
                          <p className="text-xs text-text-secondary">
                            {widgetTypeLabel(widget.widget)} · {widget.range === "dashboard" ? "Dashboard range" : rangeLabel(widget.range)}
                          </p>
                        </div>
                        {editable ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="icon-sm" aria-label="Move earlier" disabled={i === 0} onClick={() => moveWidget(i, -1)}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Move later" disabled={i === draft.layout.length - 1} onClick={() => moveWidget(i, 1)}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${widgetTitle(widget)}`} onClick={() => openWidget(widget)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${widgetTitle(widget)}`}
                              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
                              onClick={() => removeWidget(widget)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-surface-subtle">
                  <EmptyState
                    icon={LayoutGrid}
                    title="No widgets yet"
                    description="Widgets you add appear here so you can reorder or edit them."
                    action={
                      editable ? (
                        <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => openWidget()}>
                          <Plus className="h-4 w-4" /> Add widget
                        </Button>
                      ) : (
                        <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setSection("view")}>
                          Back to dashboard
                        </Button>
                      )
                    }
                  />
                </div>
              )
            ) : null}

            {active === "settings" ? (
              <SectionCard bare title="Name & sharing" description="What the dashboard is called, the range it opens on and who can see it." contentClassName="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Dashboard name" htmlFor="de-name">
                    <Input id="de-name" value={draft.name} disabled={!editable} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Campaign overview" />
                  </Field>
                  <Field label="Default date range" htmlFor="de-range" hint="The period every widget covers when the dashboard opens.">
                    <Select value={draft.range} onValueChange={set("range")} disabled={!editable}>
                      <SelectTrigger id="de-range" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Description" htmlFor="de-desc">
                  <Textarea id="de-desc" value={draft.description} disabled={!editable} onChange={(e) => set("description")(e.target.value)} placeholder="What this dashboard is for" rows={3} />
                </Field>
                <SettingsList>
                  <SettingRow
                    title="Share with team"
                    description={
                      record.isDefault
                        ? "The default dashboard is always shared."
                        : "Everyone in this project can open it. Private dashboards are visible only to you."
                    }
                    control={
                      <Switch
                        checked={draft.shared}
                        onCheckedChange={set("shared")}
                        disabled={!editable || record.isDefault}
                        aria-label="Share with team"
                      />
                    }
                  />
                  <SettingRow
                    title="Default dashboard"
                    description={record.isDefault ? "This is the dashboard the team opens first." : "Pin it to the top of the list for the whole team."}
                    control={
                      <Button
                        variant="outline"
                        size="sm"
                        className={OUTLINE_BUTTON}
                        disabled={!editable || record.isDefault || !draft.shared || dirty}
                        onClick={() => onSetDefault(record)}
                      >
                        <Star className="h-4 w-4" /> {record.isDefault ? "Default" : "Make default"}
                      </Button>
                    }
                  />
                </SettingsList>
              </SectionCard>
            ) : null}
          </>
        )}
      </EditorShell>
      <WidgetDialog
        open={widgetDialog.open}
        initial={widgetDialog.widget}
        onOpenChange={(open) => setWidgetDialog((s) => ({ ...s, open }))}
        onSubmit={upsertWidget}
      />
    </>
  );
}

export function DashboardsScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.report.edit");
  const [state, setState] = useState({ for: null, rows: [], failed: false });
  const [owners, setOwners] = useState(() => new Map());
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const dashboards = state.rows;
  const loading = state.for !== projectId;
  const setDashboards = (fn) => setState((s) => ({ ...s, rows: fn(s.rows) }));

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listDashboards(projectId).then((rows) => {
      if (!alive) return;
      setState({ for: projectId, rows: rows ?? [], failed: rows === null });
    });
    listMembers(projectId).then((rows) => alive && setOwners(new Map((rows || []).map((m) => [m.userId, m.name || m.email]))));
    getUser().then((u) => alive && setUserId(u?.id ?? null));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const ownerLabel = (d) => (d.createdBy && d.createdBy === userId ? "You" : owners.get(d.createdBy) || "A teammate");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dashboards
      .filter((d) => {
        if (visibilityFilter === "shared" && !d.shared) return false;
        if (visibilityFilter === "private" && d.shared) return false;
        if (q && !`${d.name} ${d.description}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }, [dashboards, query, visibilityFilter]);

  const stats = useMemo(() => {
    const shared = dashboards.filter((d) => d.shared).length;
    const widgets = dashboards.reduce((s, d) => s + d.layout.length, 0);
    return [
      { label: "Dashboards", value: dashboards.length.toLocaleString("en-US") },
      { label: "Shared with team", value: shared.toLocaleString("en-US") },
      { label: "Widgets", value: widgets.toLocaleString("en-US") },
    ];
  }, [dashboards]);

  const pager = usePagination(filtered, { resetKey: `${query}|${visibilityFilter}` });

  const persistCreate = async (input, successMessage) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const optimistic = { id, projectId, isDefault: false, createdBy: userId, createdAt: now, updatedAt: now, ...input };
    setDashboards((p) => [optimistic, ...p]);
    const user = await getUser();
    const created = await createDashboard(projectId, { ...input, id, createdBy: user?.id ?? null });
    if (created) {
      setDashboards((p) => p.map((d) => (d.id === id ? created : d)));
      toast.success(successMessage);
      return created;
    }
    setDashboards((p) => p.filter((d) => d.id !== id));
    toast.error("Couldn't save the dashboard. Try again.");
    return null;
  };

  const handleCreate = async (input) => {
    const created = await persistCreate(input, `Created "${input.name}".`);
    if (created) openRecord(created.id);
  };

  const handleDuplicate = (d) =>
    persistCreate(
      { name: `${d.name} (copy)`, description: d.description, layout: d.layout.map((x) => ({ ...x, id: crypto.randomUUID() })), range: d.range, shared: false },
      "Dashboard duplicated as a private copy.",
    );

  const handleSave = async (record, patch) => {
    setSavingId(record.id);
    setDashboards((p) => p.map((d) => (d.id === record.id ? { ...d, ...patch, shared: record.isDefault ? true : patch.shared } : d)));
    const saved = await updateDashboard(record.id, { ...patch, shared: record.isDefault ? true : patch.shared });
    setSavingId(null);
    if (saved) {
      setDashboards((p) => p.map((d) => (d.id === record.id ? saved : d)));
      toast.success("Dashboard saved.");
    } else {
      setDashboards((p) => p.map((d) => (d.id === record.id ? record : d)));
      toast.error("Couldn't save the dashboard. Your changes are still in the editor.");
    }
  };

  const handleSetDefault = async (record) => {
    const before = dashboards;
    setDashboards((p) => p.map((d) => ({ ...d, isDefault: d.id === record.id, shared: d.id === record.id ? true : d.shared })));
    const ok = await setDefaultDashboard(projectId, record.id);
    if (ok) toast.success(`"${record.name}" is now the default dashboard.`);
    else {
      setDashboards(() => before);
      toast.error("Couldn't change the default dashboard.");
    }
  };

  const handleDelete = async (d) => {
    setDeleteTarget(null);
    setDashboards((p) => p.filter((x) => x.id !== d.id));
    if (String(d.id) === recordId) closeRecord();
    const ok = await softDeleteDashboard(d.id);
    if (ok) toast.success(`Deleted "${d.name}".`);
    else {
      setDashboards((p) => [d, ...p]);
      toast.error("Couldn't delete the dashboard.");
    }
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete dashboard</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Anyone it&apos;s shared with loses access. The underlying data isn&apos;t affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = dashboards.find((d) => String(d.id) === recordId);
  if (open) {
    return (
      <>
        <DashboardEditor
          key={open.id}
          record={open}
          ownerLabel={ownerLabel(open)}
          editable={canEdit}
          saving={savingId === open.id}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onSetDefault={handleSetDefault}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || visibilityFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setVisibilityFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Dashboard",
      render: (d) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium text-foreground">
            {d.name}
            {d.isDefault ? <Badge variant="purple">Default</Badge> : null}
          </span>
          {d.description ? <span className="max-w-[360px] truncate text-xs text-text-secondary">{d.description}</span> : null}
        </div>
      ),
    },
    { key: "widgets", header: "Widgets", className: "tabular-nums text-muted-foreground", render: (d) => widgetsLabel(d.layout.length) },
    { key: "range", header: "Date range", className: "whitespace-nowrap text-muted-foreground", render: (d) => rangeLabel(d.range) },
    { key: "visibility", header: "Visibility", render: (d) => <VisibilityBadge shared={d.shared} /> },
    { key: "owner", header: "Owner", className: "text-muted-foreground", render: (d) => ownerLabel(d) },
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (d) => formatDate(d.updatedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (d) => (
        <ActionMenu
          label={`Actions for ${d.name}`}
          items={[
            { label: "Open dashboard", icon: Pencil, onSelect: () => openRecord(String(d.id)) },
            canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(d) },
            canEdit && !d.isDefault && d.shared && { label: "Make default", icon: Star, onSelect: () => handleSetDefault(d) },
            canEdit && { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(d) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Dashboards"
        description="At-a-glance views of campaign performance, built from widgets."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New dashboard
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} columns={3} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={visibilityFilter} onValueChange={setVisibilityFilter} options={VISIBILITY_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search dashboards…" />
      </Toolbar>

      {state.failed && !loading ? (
        <ReportFailed onRetry={() => listDashboards(projectId).then((rows) => setState({ for: projectId, rows: rows ?? [], failed: rows === null }))} />
      ) : null}

      {loading ? (
        <LoadingArea panel size={48} label="Loading dashboards" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(d) => d.id}
            onRowClick={(d) => openRecord(String(d.id))}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={LayoutDashboard}
                  title={filtersActive ? "No matches" : "No dashboards yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a dashboard to track the numbers your team cares about."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New dashboard
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="dashboards" />
        </div>
      )}

      <CreateDashboardDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default DashboardsScreen;
