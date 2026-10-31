"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, HeartPulse, Loader2, Sparkles } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorHeader } from "@/components/internal/shared/editor_shell";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  LogoLoading,
  Progress,
  ScreenHeader,
  SearchInput,
  SectionCard,
  StatsBar,
  Toolbar,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { HEALTH_WEIGHTS, LOW_CONFIDENCE_SENDS, computeHealth } from "@/lib/ai/health";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { getWorkspaceSettings } from "@/lib/supabase/workspace_settings";
import { OUTLINE_BUTTON, formatWhen, useAiStatus, useGenerations } from "./ai_shared";

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
const LABEL_FILTER_OPTIONS = [
  { value: "all", label: "All scores" },
  { value: "Healthy", label: "Healthy" },
  { value: "Fair", label: "Fair" },
  { value: "At risk", label: "At risk" },
];
const COMPONENTS = [
  { key: "deliverability", label: "Deliverability" },
  { key: "engagement", label: "Engagement" },
  { key: "conversion", label: "Conversion" },
  { key: "fatigue", label: "Fatigue" },
];
const SEVERITY = { high: "danger", medium: "warning", low: "neutral" };

const scoreText = (score) => (score == null ? "—" : String(score));

function scoreTone(score) {
  if (score == null) return "text-text-tertiary";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function ScoreSummary({ scope, sendsLabel }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-3">
        <span className={cn("text-4xl font-bold tabular-nums", scoreTone(scope.score))}>{scoreText(scope.score)}</span>
        <span className="text-lg text-text-secondary">/ 100</span>
        <Badge variant={scope.variant}>{scope.label}</Badge>
      </div>
      <p className="text-xs text-text-tertiary">
        {sendsLabel}
        {scope.confidence === "low" ? ` · fewer than ${LOW_CONFIDENCE_SENDS} sends, so treat the score as directional` : ""}
      </p>
    </div>
  );
}

function Breakdown({ components }) {
  return (
    <div className="divide-y divide-border">
      {COMPONENTS.map(({ key, label }) => {
        const c = components[key];
        const notTracked = key === "conversion" && c?.tracked === false;
        return (
          <div key={key} className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[180px_1fr] md:gap-6">
            <div>
              <div className="flex items-baseline justify-between gap-2 md:block">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className={cn("text-sm font-semibold tabular-nums", scoreTone(c?.score))}>
                  {notTracked ? "Not tracked" : c?.score == null ? "No data" : `${c.score} / 100`}
                </p>
              </div>
              <p className="text-xs text-text-tertiary">{Math.round(HEALTH_WEIGHTS[key] * 100)}% of the score</p>
            </div>
            <div className="space-y-2">
              {c?.score != null ? <Progress value={c.score} className="h-1.5 bg-surface-hover" /> : null}
              {c?.metrics?.length ? (
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {c.metrics.map((m) => (
                    <li key={m.key} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-text-secondary">{m.label}</span>
                      <span className="tabular-nums text-foreground">
                        {m.display} <span className="text-text-tertiary">· {m.target}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-tertiary">
                  {notTracked
                    ? "No conversion events (orders, sign-ups, form submissions) are attributed to campaigns yet; this component is left out of the score."
                    : "Nothing to measure in this window."}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Fixes({ fixes, onFix }) {
  if (!fixes.length) {
    return <p className="text-sm text-text-secondary">Every measured metric is inside its healthy range.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {fixes.map((f) => (
        <li key={f.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{f.title}</p>
              <Badge variant={SEVERITY[f.severity]}>{f.severity}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-text-secondary">{f.detail}</p>
          </div>
          <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onFix(f.destination)}>
            {f.destination} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Explanation({ latest, pending, onExplain, ai, canUse }) {
  const blocked = !canUse ? "Your role can't run the AI assistant." : !ai.configured && !ai.sample ? "AI isn't configured on this deployment (CAMPAIGN_LLM_* env)." : null;
  return (
    <SectionCard
      title="AI explanation"
      description="A plain-language read of the score above. The score itself never comes from the model."
      action={
        <Button size="sm" variant="outline" className={OUTLINE_BUTTON} disabled={Boolean(blocked) || pending || ai.loading} onClick={onExplain}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {latest ? "Explain again" : "Explain"}
        </Button>
      }
    >
      {blocked ? <p className="mb-3 text-xs text-text-tertiary">{blocked}</p> : null}
      {latest ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">{latest.output.explanation?.summary}</p>
          {latest.output.explanation?.priorities?.length ? (
            <ol className="space-y-2">
              {latest.output.explanation.priorities.map((p, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium text-foreground">
                    {i + 1}. {p.title}
                  </span>
                  {p.why ? <span className="text-text-secondary"> — {p.why}</span> : null}
                  {p.action ? <p className="mt-0.5 text-text-secondary">{p.action}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
          <p className="text-xs text-text-tertiary">
            Explained {formatWhen(latest.createdAt)} when the score was {scoreText(latest.output.score)}
            {ai.sample ? " · sample output" : latest.model ? ` · ${latest.model}` : ""}
          </p>
        </div>
      ) : !blocked ? (
        <p className="text-sm text-text-secondary">Ask for an explanation to get the score&apos;s drivers in plain language.</p>
      ) : null}
    </SectionCard>
  );
}

export function CampaignHealthScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { setTab, recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const ai = useAiStatus(projectId);
  const explanations = useGenerations(projectId, "health_explain");
  const canUse = can("campaign.ai.use");

  const [windowDays, setWindowDays] = useState("30");
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("all");
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    // Fatigue looks back 30 days from the earliest campaign in the window.
    const since = new Date(Date.now() - (Number(windowDays) + 37) * DAY).toISOString();
    Promise.all([
      listCampaigns(projectId),
      listDeliveries(projectId, { since, limit: 20000 }),
      listTrackedEvents(projectId, { since, limit: 20000 }),
      getWorkspaceSettings(projectId),
    ]).then(([campaigns, deliveries, events, settings]) => {
      if (!alive) return;
      setData({
        campaigns: campaigns ?? [],
        deliveries: deliveries ?? [],
        events: events ?? [],
        frequencyCap: settings?.sending?.weeklyFrequencyCap ?? null,
        loadedAt: Date.now(),
        windowDays,
      });
    });
    return () => {
      alive = false;
    };
  }, [projectId, windowDays]);

  const loading = !data || data.windowDays !== windowDays;
  const health = useMemo(
    () =>
      data
        ? computeHealth({
            deliveries: data.deliveries,
            events: data.events,
            campaigns: data.campaigns,
            now: new Date(data.loadedAt),
            windowDays: Number(data.windowDays),
            frequencyCap: data.frequencyCap,
          })
        : null,
    [data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (health?.campaigns || []).filter((c) => {
      if (labelFilter !== "all" && c.label !== labelFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [health, search, labelFilter]);
  const pager = usePagination(filtered, { resetKey: `${search}|${labelFilter}|${windowDays}` });

  const stats = useMemo(() => {
    if (!health) return [];
    const ws = health.workspace;
    const atRisk = health.campaigns.filter((c) => c.label === "At risk").length;
    return [
      { label: "Workspace score", value: scoreText(ws.score), footer: ws.label },
      { label: "Campaigns scored", value: health.campaigns.length.toLocaleString() },
      { label: "At risk", value: atRisk.toLocaleString() },
      { label: "Marketing sends", value: ws.totals.sent.toLocaleString() },
    ];
  }, [health]);

  const latestFor = (campaignId) =>
    explanations.items.find((g) => (g.input?.campaignId ?? null) === (campaignId ?? null) && String(g.input?.windowDays ?? 30) === windowDays) ?? null;

  const explain = async (campaignId = null) => {
    setExplaining(true);
    const res = await apiPost(`/api/projects/${projectId}/ai/health-explain`, { campaignId, windowDays: Number(windowDays) });
    setExplaining(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't explain the score.");
      return;
    }
    if (res.data.generation) explanations.add(res.data.generation);
    else toast.warning("Explained, but the explanation couldn't be saved.");
  };

  const windowLabel = WINDOW_OPTIONS.find((o) => o.value === windowDays)?.label.toLowerCase();
  const header = (
    <ScreenHeader
      title="Campaign Health"
      description="A 0–100 score from your real sends: deliverability, engagement, conversion and fatigue."
      actions={<FilterDropdown value={windowDays} onValueChange={setWindowDays} options={WINDOW_OPTIONS} height="h-9" />}
    />
  );

  if (loading) {
    return (
      <MainScreenWrapper>
        {header}
        <div className="flex min-h-80 items-center justify-center">
          <LogoLoading size={56} aria-label="Scoring campaign health" />
        </div>
      </MainScreenWrapper>
    );
  }

  const open = recordId ? health.campaigns.find((c) => c.campaignId === recordId) : null;
  if (open) {
    return (
      <MainScreenWrapper>
        <EditorHeader
          back={{ label: "Campaign health", onClick: closeRecord }}
          title={open.name}
          badges={
            <>
              <Badge variant={open.variant}>{open.label}</Badge>
              <span className="text-xs text-text-tertiary">{open.sentAt ? `Sent ${formatWhen(open.sentAt)}` : "Sending"}</span>
            </>
          }
          actions={
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setTab("All Campaigns")}>
              All campaigns
            </Button>
          }
        />
        <SectionCard>
          <ScoreSummary scope={open} sendsLabel={`${open.totals.sent.toLocaleString()} sends · engagement and conversion compared with your ${windowLabel} average`} />
        </SectionCard>
        <SectionCard title="Breakdown">
          <Breakdown components={open.components} />
        </SectionCard>
        <SectionCard title="Prioritized fixes">
          <Fixes fixes={open.fixes} onFix={setTab} />
        </SectionCard>
        <Explanation latest={latestFor(open.campaignId)} pending={explaining} onExplain={() => explain(open.campaignId)} ai={ai} canUse={canUse} />
      </MainScreenWrapper>
    );
  }

  const ws = health.workspace;
  if (!ws.totals.sent) {
    return (
      <MainScreenWrapper>
        {header}
        <EmptyState
          icon={HeartPulse}
          title={`No marketing sends in the ${windowLabel}`}
          description="Health is scored from real deliveries — it appears once campaigns, automations or broadcasts have gone out."
          action={
            <Button onClick={() => setTab("All Campaigns")} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Go to campaigns
            </Button>
          }
          className="rounded-xl border border-dashed border-border bg-surface-subtle"
        />
      </MainScreenWrapper>
    );
  }

  const filtersActive = search || labelFilter !== "all";
  const columns = [
    {
      key: "name",
      header: "Campaign",
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{c.name}</p>
          <p className="text-xs text-text-tertiary">{c.sentAt ? formatWhen(c.sentAt) : "Sending"}</p>
        </div>
      ),
    },
    {
      key: "score",
      header: "Score",
      className: "whitespace-nowrap",
      render: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className={cn("font-semibold tabular-nums", scoreTone(c.score))}>{scoreText(c.score)}</span>
          <Badge variant={c.variant}>{c.label}</Badge>
        </span>
      ),
    },
    ...COMPONENTS.map(({ key, label }) => ({
      key,
      header: label,
      align: "right",
      className: "tabular-nums text-muted-foreground",
      render: (c) => (key === "conversion" && c.components.conversion?.tracked === false ? "—" : scoreText(c.components[key]?.score)),
    })),
    { key: "sends", header: "Sends", align: "right", className: "tabular-nums text-muted-foreground", render: (c) => c.totals.sent.toLocaleString() },
  ];

  return (
    <MainScreenWrapper>
      {header}
      <StatsBar stats={stats} />

      <SectionCard title="Workspace health" description={`All marketing sends in the ${windowLabel}, scored against fixed industry bands.`}>
        <div className="space-y-5">
          <ScoreSummary scope={ws} sendsLabel={`${ws.totals.sent.toLocaleString()} sends · ${ws.totals.delivered.toLocaleString()} delivered`} />
          <div className="border-t border-border pt-4">
            <Breakdown components={ws.components} />
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SectionCard title="Prioritized fixes" description="Ordered by how many points each would recover.">
          <Fixes fixes={ws.fixes} onFix={setTab} />
        </SectionCard>
        <Explanation latest={latestFor(null)} pending={explaining} onExplain={() => explain(null)} ai={ai} canUse={canUse} />
      </div>

      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Campaigns</h2>
        <Toolbar>
          <div className="flex items-center gap-2">
            <FilterDropdown value={labelFilter} onValueChange={setLabelFilter} options={LABEL_FILTER_OPTIONS} height="h-9" />
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Search campaigns…" />
        </Toolbar>
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(c) => c.campaignId}
          onRowClick={(c) => openRecord(c.campaignId)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={HeartPulse}
                title={filtersActive ? "No matches" : "No campaigns in this window"}
                description={filtersActive ? "Try a different search or filter." : "Sends from automations and broadcasts still count toward the workspace score."}
                action={
                  filtersActive ? (
                    <Button
                      variant="outline"
                      className={OUTLINE_BUTTON}
                      onClick={() => {
                        setSearch("");
                        setLabelFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="campaigns" />
      </div>
    </MainScreenWrapper>
  );
}

export default CampaignHealthScreen;
