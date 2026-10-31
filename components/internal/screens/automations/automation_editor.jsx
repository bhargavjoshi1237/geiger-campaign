"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, CircleAlert, CircleCheck, FileText, FlaskConical, Gauge, Loader2, LogIn, Pause, Play, Trash2, TriangleAlert } from "lucide-react";
import {
  Button,
  Field,
  Input,
  InlineTitleInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from "@geiger/ui";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorHeader, EditorSections } from "@/components/internal/shared/editor_shell";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import { updateAutomation } from "@/lib/supabase/automations";
import { getAutomationStats, pauseAutomation, publishAutomation } from "@/lib/automations/client";
import { channelsUsed, getNode, sanitizeGraph, stepCount, triggerFromGraph } from "@/lib/automations/graph";
import { describeTrigger } from "@/lib/automations/triggers";
import { validateAutomation } from "@/lib/automations/validation";
import { normalizeSettings } from "@/lib/automations/model";
import { AutomationCanvas } from "./canvas/automation_canvas";
import { NodePanel } from "./canvas/node_panel";
import { nodeTitle } from "./canvas/automation_nodes";
import { ActivityPanel, EnrollmentsPanel, TestEnrollDialog } from "./run_panels";
import { useAutomationRefs } from "./use_automation_refs";
import { AUTOMATION_STATUS_MAP, CHANNEL_META, DESTRUCTIVE_ICON_BUTTON, KIND_COPY, OUTLINE_BUTTON, formatDate, formatNumber, formatPercent } from "./constants";

const TABS = ["builder", "enrollments", "activity", "settings"];

const SETTINGS_NAV = [
  {
    group: null,
    items: [
      { key: "general", label: "General", icon: FileText, desc: "Name, description and where this automation lives." },
      { key: "entry", label: "Entry & goal", icon: LogIn, desc: "Who can enter again, and what happens when a contact converts." },
      { key: "limits", label: "Sending limits", icon: Gauge, desc: "Quiet hours and how often one contact can be messaged." },
    ],
  },
  { group: "Danger zone", items: [{ key: "danger", label: "Archive & delete", icon: Trash2, desc: "Retire this automation or remove it for good." }] },
];

const toDraft = (a) => ({ name: a.name, description: a.description, kind: a.kind, graph: a.graph, settings: normalizeSettings(a.settings) });

const comparable = (d) => JSON.stringify({ name: d.name.trim(), description: d.description, kind: d.kind, graph: sanitizeGraph(d.graph), settings: normalizeSettings(d.settings) });

// Node id -> live counts for the canvas, from the stats route rollup.
function nodeCounts(stats, graph) {
  if (!stats) return null;
  const out = {};
  for (const n of graph?.nodes || []) {
    if (n.type === "trigger") out[n.id] = { ok: stats.totals?.enrolled || 0 };
    else out[n.id] = { current: stats.current?.[n.id] || 0, ok: stats.processed?.[n.id]?.ok || 0, failed: stats.processed?.[n.id]?.failed || 0 };
  }
  return out;
}

function Checklist({ validation, graph, onSelect, kind }) {
  const channels = channelsUsed(graph);
  const ready = !validation.errors;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {ready ? <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <CircleAlert className="h-4 w-4 text-red-600 dark:text-red-400" />}
          <p className="text-sm font-medium text-foreground">
            {ready ? "Ready to publish" : `${validation.errors} ${validation.errors === 1 ? "issue" : "issues"} to fix`}
          </p>
        </div>
        <p className="mt-0.5 text-xs text-text-secondary">
          {stepCount(graph)} {stepCount(graph) === 1 ? "step" : "steps"}
          {channels.length ? ` · ${channels.map((c) => CHANNEL_META[c].label).join(", ")}` : ""}
        </p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {validation.issues.length ? (
          <ul className="space-y-1">
            {validation.issues.map((i) => {
              const node = i.nodeId ? getNode(graph, i.nodeId) : null;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => node && onSelect(node.id)}
                    disabled={!node}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover disabled:hover:bg-transparent"
                  >
                    {i.severity === "error" ? (
                      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                    ) : (
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="min-w-0 text-xs">
                      {node ? <span className="block font-medium text-foreground">{nodeTitle(node)}</span> : null}
                      <span className="text-text-secondary">{i.message}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-text-secondary">Every step is configured and connected to the trigger.</p>
        )}
        <div className="space-y-1.5 border-t border-border pt-4 text-xs text-text-secondary">
          <p>Drag a step from the palette, or click it to add after the selected step.</p>
          <p>Connect a step&apos;s bottom handle to the next step. Branching steps have one handle per path.</p>
          <p>Select a step to configure it; Delete removes it.</p>
          {kind === "journey" ? <p>Mix email, SMS, WhatsApp and push — each send respects that channel&apos;s consent.</p> : null}
        </div>
      </div>
    </div>
  );
}

function TimeInput({ value, onChange, disabled, ...props }) {
  return <Input type="time" value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-32" {...props} />;
}

function SettingsTab({ draft, set, setSettings, record, canEdit, busy, onArchive, onRestore, onDelete }) {
  const s = draft.settings;
  const copy = KIND_COPY[draft.kind];
  return (
    <EditorSections nav={SETTINGS_NAV} syncToUrl={false} defaultSection="general">
      {({ active }) => (
        <>
          {active === "general" ? (
            <div className="grid gap-4">
              <Field label="Name" htmlFor="ae-name">
                <Input id="ae-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Description" htmlFor="ae-desc">
                <Textarea id="ae-desc" value={draft.description} onChange={(e) => set("description")(e.target.value)} rows={3} placeholder={`What does this ${copy.singular} do?`} disabled={!canEdit} />
              </Field>
              <Field label="Type" hint="Journeys and workflows run on the same engine; journeys are listed for cross-channel paths.">
                <Select value={draft.kind} onValueChange={set("kind")} disabled={!canEdit}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workflow">Workflow</SelectItem>
                    <SelectItem value="journey">Journey</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}

          {active === "entry" ? (
            <SettingsList>
              <SettingRow
                title="Allow re-entry"
                description="A contact can enter again after their previous run finishes. Off: each contact enters once, ever."
                control={<SwitchControl checked={s.reentry} onChange={(v) => setSettings({ reentry: v })} disabled={!canEdit} label="Allow re-entry" />}
              />
              <SettingRow
                title="Exit on goal"
                description="Checked before every step: a contact who reaches any goal step's condition converts and leaves immediately. Off: they jump to the goal step and continue from there."
                control={<SwitchControl checked={s.exitOnGoal} onChange={(v) => setSettings({ exitOnGoal: v })} disabled={!canEdit} label="Exit on goal" />}
              />
            </SettingsList>
          ) : null}

          {active === "limits" ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <SettingRow
                  title="Quiet hours"
                  description="Messages due inside this window wait until it ends. Waits, branches and contact updates still run."
                  control={<SwitchControl checked={s.quietHours.enabled} onChange={(v) => setSettings({ quietHours: { ...s.quietHours, enabled: v } })} disabled={!canEdit} label="Quiet hours" />}
                />
                {s.quietHours.enabled ? (
                  <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-card p-3">
                    <Field label="From">
                      <TimeInput value={s.quietHours.start} onChange={(v) => setSettings({ quietHours: { ...s.quietHours, start: v } })} disabled={!canEdit} aria-label="Quiet hours start" />
                    </Field>
                    <Field label="Until">
                      <TimeInput value={s.quietHours.end} onChange={(v) => setSettings({ quietHours: { ...s.quietHours, end: v } })} disabled={!canEdit} aria-label="Quiet hours end" />
                    </Field>
                    <Field label="In">
                      <Select value={s.quietHours.timezone || "contact"} onValueChange={(v) => setSettings({ quietHours: { ...s.quietHours, timezone: v } })} disabled={!canEdit}>
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contact">Contact&apos;s time zone</SelectItem>
                          <SelectItem value="workspace">Workspace time zone</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                ) : null}
              </div>
              <div className="space-y-3 border-t border-border pt-5">
                <SettingRow
                  title="Frequency cap"
                  description="Skip a message when the contact already got this many from this automation in the period."
                  control={<SwitchControl checked={s.frequencyCap.enabled} onChange={(v) => setSettings({ frequencyCap: { ...s.frequencyCap, enabled: v } })} disabled={!canEdit} label="Frequency cap" />}
                />
                {s.frequencyCap.enabled ? (
                  <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-card p-3">
                    <Field label="At most">
                      <Input type="number" min={1} value={s.frequencyCap.max} onChange={(e) => setSettings({ frequencyCap: { ...s.frequencyCap, max: Number(e.target.value) || 1 } })} className="w-24 tabular-nums" disabled={!canEdit} />
                    </Field>
                    <span className="pb-2 text-sm text-text-secondary">messages every</span>
                    <Field label="Days">
                      <Input type="number" min={1} value={s.frequencyCap.periodDays} onChange={(e) => setSettings({ frequencyCap: { ...s.frequencyCap, periodDays: Number(e.target.value) || 1 } })} className="w-24 tabular-nums" disabled={!canEdit} />
                    </Field>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {active === "danger" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-subtle p-5">
                <div>
                  <p className="text-sm font-medium text-foreground">{record.status === "archived" ? "Restore this automation" : "Archive this automation"}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {record.status === "archived"
                      ? "Brings it back as a draft. Publish it again to start enrolling."
                      : record.status === "active"
                        ? "Pause it first. Archiving stops it for good and removes contacts still in it."
                        : "Stops it for good and removes contacts still in it. You can restore it as a draft."}
                  </p>
                </div>
                {record.status === "archived" ? (
                  <Button variant="outline" className={cn("shrink-0", OUTLINE_BUTTON)} onClick={onRestore} disabled={!canEdit || busy}>
                    <ArchiveRestore className="h-4 w-4" /> Restore
                  </Button>
                ) : (
                  <Button variant="outline" className={cn("shrink-0", OUTLINE_BUTTON)} onClick={onArchive} disabled={!canEdit || busy || record.status === "active"}>
                    <Archive className="h-4 w-4" /> Archive
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                <div>
                  <p className="text-sm font-medium text-foreground">Delete this automation</p>
                  <p className="mt-0.5 text-xs text-text-secondary">Contacts still in it stop where they are. This can&apos;t be undone.</p>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0 border-red-500/30 bg-transparent text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 dark:hover:text-red-300"
                  onClick={onDelete}
                  disabled={!canEdit}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </EditorSections>
  );
}

// SettingRow's built-in Switch has no disabled/aria-label wiring, so rows pass this as their control.
function SwitchControl({ checked, onChange, disabled, label }) {
  return <Switch checked={Boolean(checked)} onCheckedChange={onChange} disabled={disabled} aria-label={label} />;
}

// The automation editor: header with test / publish / save, then Builder (canvas + step panel),
// Enrollments, Activity and Settings tabs. The open tab lives in the URL (?section=).
export function AutomationEditor({ record, onBack, onSaved, onDelete }) {
  const { projectId, section, setSection, openRecordInTab } = useWorkspaceUrl();
  const canEdit = useCan("campaign.automation.edit");
  const canPublish = useCan("campaign.automation.publish");
  const refs = useAutomationRefs(projectId);

  const [draft, setDraft] = useState(() => toDraft(record));
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [runKey, setRunKey] = useState(0);

  const tab = TABS.includes(section) ? section : "builder";
  const copy = KIND_COPY[record.kind];
  const dirty = comparable(draft) !== comparable(toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setSettings = (patch) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setGraph = useCallback((graph) => setDraft((d) => ({ ...d, graph })), []);

  useEffect(() => {
    let alive = true;
    getAutomationStats(projectId, record.id).then((res) => {
      if (alive && res.ok) setStats(res.data);
    });
    return () => {
      alive = false;
    };
  }, [projectId, record.id, record.status, runKey]);

  const refSets = useMemo(
    () => (refs.loaded ? { campaignIds: new Set(refs.campaigns.map((c) => c.id)), listIds: new Set(refs.lists.map((l) => l.id)), conditionSetIds: new Set(refs.conditionSets.map((c) => c.id)), goalIds: new Set(refs.goals.map((g) => g.id)) } : {}),
    [refs],
  );
  const validation = useMemo(() => validateAutomation({ graph: draft.graph, settings: draft.settings }, refSets), [draft.graph, draft.settings, refSets]);
  const counts = useMemo(() => (stats && (record.status !== "draft" || stats.totals?.enrolled) ? nodeCounts(stats, draft.graph) : null), [stats, draft.graph, record.status]);
  const canvasRefs = useMemo(() => ({ ...refs, nodes: draft.graph.nodes }), [refs, draft.graph.nodes]);
  const trigger = triggerFromGraph(draft.graph);
  const triggerSummary = describeTrigger(trigger, refs);
  const selected = selectedId ? getNode(draft.graph, selectedId) : null;

  const persist = async (patch, { quiet = false } = {}) => {
    const previous = record;
    onSaved({ ...record, ...patch });
    setSaving(true);
    const saved = await updateAutomation(record.id, patch);
    setSaving(false);
    if (!saved) {
      onSaved(previous);
      toast.error("Couldn't save the automation.");
      return null;
    }
    onSaved(saved);
    if (!quiet) toast.success("Saved.");
    return saved;
  };

  const save = async () => {
    const patch = { name: draft.name.trim() || `Untitled ${copy.singular}`, description: draft.description, kind: draft.kind, graph: sanitizeGraph(draft.graph), settings: draft.settings };
    const saved = await persist(patch);
    if (saved && saved.kind !== record.kind) {
      toast.success(`Moved to ${KIND_COPY[saved.kind].title}.`);
      openRecordInTab(saved.id, KIND_COPY[saved.kind].title);
    }
    return saved;
  };

  const publish = async () => {
    if (validation.errors) {
      toast.error(`Fix ${validation.errors} ${validation.errors === 1 ? "issue" : "issues"} before publishing.`);
      setSection("builder");
      const first = validation.issues.find((i) => i.severity === "error" && i.nodeId);
      if (first) setSelectedId(first.nodeId);
      return;
    }
    if (dirty && !(await save())) return;
    setPublishing(true);
    const res = await publishAutomation(projectId, record.id);
    setPublishing(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't publish.");
      return;
    }
    onSaved({ ...record, status: res.data.status, publishedAt: res.data.publishedAt });
    toast.success(`“${record.name}” is live. New contacts that match the trigger enter from now on.`);
  };

  const pause = async () => {
    setPublishing(true);
    const res = await pauseAutomation(projectId, record.id);
    setPublishing(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't pause.");
      return;
    }
    onSaved({ ...record, status: res.data.status });
    toast.success("Paused. Contacts already in it stay where they are.");
  };

  const archive = async () => {
    if (await persist({ status: "archived" }, { quiet: true })) toast.success("Archived.");
  };
  const restore = async () => {
    if (await persist({ status: "draft" }, { quiet: true })) toast.success("Restored as a draft.");
  };

  const updateSelectedConfig = (config) =>
    setGraph({ ...draft.graph, nodes: draft.graph.nodes.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, config } } : n)) });

  const deleteSelected = () => {
    if (!selected || selected.type === "trigger") return;
    setGraph({
      ...draft.graph,
      nodes: draft.graph.nodes.filter((n) => n.id !== selected.id),
      edges: draft.graph.edges.filter((e) => e.source !== selected.id && e.target !== selected.id),
    });
    setSelectedId(null);
  };

  const live = record.status === "active";
  const totals = stats?.totals;
  const meta = [
    triggerSummary,
    `${stepCount(draft.graph)} ${stepCount(draft.graph) === 1 ? "step" : "steps"}`,
    totals?.enrolled ? `${formatNumber(totals.enrolled)} enrolled · ${formatPercent(totals.enrolled ? totals.converted / totals.enrolled : null)} converted` : null,
    record.publishedAt && record.status !== "draft" ? `Published ${formatDate(record.publishedAt)}` : null,
  ].filter(Boolean);

  return (
    <MainScreenWrapper>
      <EditorHeader
        back={{ label: copy.title, onClick: onBack }}
        title={
          <InlineTitleInput
            value={draft.name}
            onChange={(e) => set("name")(e.target.value)}
            aria-label={`${copy.singular} name`}
            placeholder={`Untitled ${copy.singular}`}
            className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
            disabled={!canEdit}
          />
        }
        status={record.status}
        statusMap={AUTOMATION_STATUS_MAP}
        meta={meta.join(" · ")}
        actions={
          <>
            {canEdit && record.status !== "archived" ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setTestOpen(true)}>
                <FlaskConical className="h-4 w-4" /> Test
              </Button>
            ) : null}
            {canPublish && record.status !== "archived" ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={live ? pause : publish} disabled={publishing || saving}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : live ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {live ? "Pause" : record.status === "paused" ? "Resume" : "Publish"}
              </Button>
            ) : null}
            {canEdit ? (
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Save"}
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="ghost" size="icon" aria-label={`Delete ${copy.singular}`} className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onDelete(record)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setSection(v === "builder" ? null : v)}>
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments{totals?.enrolled ? <span className="ml-1.5 tabular-nums text-text-tertiary">{formatNumber(totals.enrolled)}</span> : null}</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <AutomationCanvas
              graph={draft.graph}
              onGraphChange={setGraph}
              selectedId={selectedId}
              onSelect={setSelectedId}
              issuesByNode={validation.byNode}
              counts={counts}
              refs={canvasRefs}
              triggerSummary={triggerSummary}
              active={live}
              readOnly={!canEdit || record.status === "archived"}
            />
            <aside className="h-[70vh] min-h-[480px] overflow-hidden rounded-xl border border-border bg-surface-subtle">
              {selected ? (
                <NodePanel
                  key={selected.id}
                  node={selected}
                  graph={draft.graph}
                  refs={canvasRefs}
                  issues={validation.byNode[selected.id] || []}
                  counts={counts?.[selected.id]}
                  readOnly={!canEdit || record.status === "archived"}
                  onConfigChange={updateSelectedConfig}
                  onDelete={deleteSelected}
                />
              ) : (
                <Checklist validation={validation} graph={draft.graph} onSelect={setSelectedId} kind={draft.kind} />
              )}
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="enrollments" className="mt-6">
          {tab === "enrollments" ? (
            <EnrollmentsPanel
              projectId={projectId}
              automation={record}
              graph={draft.graph}
              canEdit={canEdit}
              onTest={() => setTestOpen(true)}
              refreshKey={runKey}
              onChanged={() => setRunKey((n) => n + 1)}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          {tab === "activity" ? <ActivityPanel projectId={projectId} automation={record} graph={draft.graph} refreshKey={runKey} /> : null}
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <SettingsTab
            draft={draft}
            set={set}
            setSettings={setSettings}
            record={record}
            canEdit={canEdit}
            busy={saving}
            onArchive={archive}
            onRestore={restore}
            onDelete={() => onDelete(record)}
          />
        </TabsContent>
      </Tabs>

      <TestEnrollDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        projectId={projectId}
        automation={record}
        graph={draft.graph}
        dirty={dirty}
        onDone={() => setRunKey((n) => n + 1)}
      />
    </MainScreenWrapper>
  );
}

export default AutomationEditor;
