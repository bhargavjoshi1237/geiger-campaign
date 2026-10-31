"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { FollowerChart } from "@/components/internal/screens/communities/followers_section";
import {
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DataTable,
  ScreenHeader,
  SectionCard,
  StatsBar,
  Toolbar,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { apiPost } from "@/lib/api/client";
import { listMetricSnapshots } from "@/lib/supabase/social_metrics";
import { bestTimes, engagementOf, engagementRate, reachOf } from "@/lib/social/best_time";
import { networkLabel } from "@/lib/social/networks";
import { ConnectAccountsNotice, LoadingPanel, MediaThumb, NetworkIcon, useNow, useSocialAccounts, useSocialPosts } from "./social_kit";
import { OUTLINE_BUTTON, RANGE_OPTIONS, compactNumber, excerpt, formatDate, formatNumber, formatPercent, formatRelative } from "./constants";

const DAY = 86_400_000;
const REACH_CONFIG = { reach: { label: "Reach", color: "var(--chart-series-1)" } };
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";
const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);
const matches = (account, connectionId) => account === "all" || connectionId === account;
const dayLabel = (day) => new Date(`${day}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Last account snapshot per (connection, day): the daily figures the network reported that day.
function dailyAccountMetrics(snapshots, sinceMs) {
  const byKey = new Map();
  for (const s of snapshots) {
    const t = new Date(s.capturedAt).getTime();
    if (t < sinceMs || !s.connectionId) continue;
    const key = `${s.connectionId}|${dayKey(s.capturedAt)}`;
    const prev = byKey.get(key);
    if (!prev || new Date(prev.capturedAt) < new Date(s.capturedAt)) byKey.set(key, s);
  }
  return [...byKey.values()];
}

function Delta({ value }) {
  if (value == null) return <span className="text-text-tertiary">—</span>;
  const up = value >= 0;
  return (
    <span className={cn("tabular-nums", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {up ? "+" : "−"}
      {formatNumber(Math.abs(value))}
    </span>
  );
}

export function SocialAnalyticsScreen() {
  const { projectId } = useProject();
  const { accounts, loading: accountsLoading } = useSocialAccounts(projectId);
  const { posts, loading: postsLoading } = useSocialPosts(projectId);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");
  const [account, setAccount] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow();

  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - 95 * DAY).toISOString();
    listMetricSnapshots(projectId, { scope: "account", since }).then((rows) => {
      if (!alive) return;
      if (rows === null) toast.error("Couldn't load insights.");
      setSnapshots(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const sinceMs = now - Number(range) * DAY;
  const accountSnaps = useMemo(
    () => snapshots.filter((s) => matches(account, s.connectionId)).sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt)),
    [snapshots, account],
  );

  // Published targets in range, with their post attached.
  const published = useMemo(() => {
    const rows = [];
    for (const p of posts) {
      for (const t of p.targets) {
        if (t.status !== "published" || !t.publishedAt || !matches(account, t.connectionId)) continue;
        if (new Date(t.publishedAt).getTime() < sinceMs) continue;
        rows.push({ ...t, post: p, reach: reachOf(t.metrics), engagement: engagementOf(t.metrics), rate: engagementRate(t.metrics) });
      }
    }
    return rows.sort((a, b) => b.engagement - a.engagement || b.reach - a.reach);
  }, [posts, account, sinceMs]);

  const daily = useMemo(() => dailyAccountMetrics(accountSnaps, sinceMs), [accountSnaps, sinceMs]);

  // Followers per day summed across accounts, carrying each account's last known count forward.
  const followerSeries = useMemo(() => {
    const days = [...new Set(daily.map((s) => dayKey(s.capturedAt)))].sort();
    const last = new Map();
    const byDay = new Map(days.map((d) => [d, []]));
    for (const s of daily) byDay.get(dayKey(s.capturedAt)).push(s);
    return days
      .map((day) => {
        for (const s of byDay.get(day)) if (s.metrics.followers != null) last.set(s.connectionId, s.metrics.followers);
        return { day, label: dayLabel(day), count: [...last.values()].reduce((sum, n) => sum + n, 0) };
      })
      .filter((d) => d.count > 0);
  }, [daily]);

  const reachSeries = useMemo(() => {
    const byDay = new Map();
    for (const s of daily) if (s.metrics.reach != null) byDay.set(dayKey(s.capturedAt), (byDay.get(dayKey(s.capturedAt)) || 0) + s.metrics.reach);
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, reach]) => ({ day, label: dayLabel(day), reach }));
  }, [daily]);

  const perAccount = useMemo(() => {
    return accounts
      .filter((a) => matches(account, a.id))
      .map((a) => {
        const snaps = accountSnaps.filter((s) => s.connectionId === a.id && s.metrics.followers != null);
        const latest = snaps[snaps.length - 1] || null;
        const start = snaps.find((s) => new Date(s.capturedAt).getTime() >= sinceMs) || null;
        const days = daily.filter((s) => s.connectionId === a.id && s.metrics.reach != null);
        const own = published.filter((t) => t.connectionId === a.id);
        return {
          ...a,
          followers: latest?.metrics.followers ?? null,
          change: latest && start ? latest.metrics.followers - start.metrics.followers : null,
          avgReach: days.length ? Math.round(days.reduce((s, d) => s + d.metrics.reach, 0) / days.length) : null,
          posts: own.length,
          engagement: own.reduce((s, t) => s + t.engagement, 0),
          lastAt: latest?.capturedAt || null,
        };
      });
  }, [accounts, accountSnaps, daily, published, account, sinceMs]);

  const stats = useMemo(() => {
    const followers = perAccount.reduce((s, a) => s + (a.followers || 0), 0);
    const change = perAccount.some((a) => a.change != null) ? perAccount.reduce((s, a) => s + (a.change || 0), 0) : null;
    const reach = published.reduce((s, t) => s + t.reach, 0);
    const engagement = published.reduce((s, t) => s + t.engagement, 0);
    return [
      { label: "Followers", value: perAccount.some((a) => a.followers != null) ? formatNumber(followers) : "—", footer: change != null ? `${change >= 0 ? "+" : "−"}${formatNumber(Math.abs(change))} in range` : undefined },
      { label: "Posts published", value: formatNumber(published.length) },
      { label: "Post reach", value: formatNumber(reach) },
      { label: "Engagement rate", value: reach ? formatPercent(engagement / reach) : "—", footer: `${formatNumber(engagement)} interactions` },
    ];
  }, [perAccount, published]);

  const best = useMemo(() => bestTimes(published, { now }), [published, now]);
  const pager = usePagination(published, { resetKey: `${range}|${account}` });

  const refresh = async () => {
    setRefreshing(true);
    const res = await apiPost(`/api/projects/${projectId}/social/analytics/refresh`, account === "all" ? {} : { connectionId: account });
    const rows = await listMetricSnapshots(projectId, { scope: "account", since: new Date(Date.now() - 95 * DAY).toISOString() });
    if (rows) setSnapshots(rows);
    setRefreshing(false);
    if (!res.ok) return toast.error(res.error || "Couldn't refresh insights.");
    const { accounts: a = 0, posts: p = 0, errors = [] } = res.data || {};
    if (errors.length) toast.warning(errors[0]);
    toast.success(`Updated ${a} account${a === 1 ? "" : "s"} and ${p} post${p === 1 ? "" : "s"}. Post metrics refresh on the next page load.`);
  };

  const accountOptions = [{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))];

  if (loading || accountsLoading || postsLoading) {
    return (
      <MainScreenWrapper>
        <LoadingPanel label="Loading analytics" size={80} />
      </MainScreenWrapper>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Social Analytics"
        description="Followers, reach and engagement from each network's insights API, and how every published post performed."
        actions={
          accounts.length ? (
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={refresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh insights
            </Button>
          ) : null
        }
      />

      {!accounts.length ? (
        <ConnectAccountsNotice description="Insights come from each network's API once an Instagram business account, a Facebook Page or a Telegram channel is connected." />
      ) : (
        <>
          <StatsBar stats={stats} />

          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown value={range} onValueChange={setRange} options={RANGE_OPTIONS} height="h-9" />
              <FilterDropdown value={account} onValueChange={setAccount} options={accountOptions} height="h-9" />
            </div>
          </Toolbar>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Followers" description="Summed across accounts, from the daily insights pull.">
              {followerSeries.length > 1 ? (
                <FollowerChart data={followerSeries} height={220} />
              ) : (
                <p className="py-10 text-center text-sm text-text-secondary">Not enough snapshots yet — follower counts are captured a few times a day.</p>
              )}
            </SectionCard>
            <SectionCard title="Daily reach" description="Accounts reached per day, as Instagram and Facebook report it.">
              {reachSeries.length > 1 ? (
                <ChartContainer config={REACH_CONFIG} className="aspect-auto w-full" style={{ height: 220 }}>
                  <BarChart data={reachSeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} width={44} stroke="var(--muted-foreground)" tickFormatter={compactNumber} />
                    <ChartTooltip cursor={{ fill: "var(--chart-cursor)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
                    <Bar dataKey="reach" fill="var(--color-reach)" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={600} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="py-10 text-center text-sm text-text-secondary">No reach reported in this range. Telegram doesn&apos;t report reach to bots.</p>
              )}
            </SectionCard>
          </div>

          <DataTable
              data={perAccount}
              getRowKey={(a) => a.id}
              columns={[
                {
                  key: "account",
                  header: "Account",
                  render: (a) => (
                    <span className="inline-flex items-center gap-2 text-foreground">
                      <NetworkIcon network={a.network} className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{a.name}</span>
                      <span className="text-xs text-text-tertiary">{networkLabel(a.network)}</span>
                    </span>
                  ),
                },
                { key: "followers", header: "Followers", align: "right", className: "tabular-nums", render: (a) => formatNumber(a.followers) },
                { key: "change", header: "Change", align: "right", render: (a) => <Delta value={a.change} /> },
                { key: "reach", header: "Avg daily reach", align: "right", className: "tabular-nums", render: (a) => formatNumber(a.avgReach) },
                { key: "posts", header: "Posts", align: "right", className: "tabular-nums", render: (a) => formatNumber(a.posts) },
                { key: "engagement", header: "Engagement", align: "right", className: "tabular-nums", render: (a) => formatNumber(a.engagement) },
                { key: "updated", header: "Insights", align: "right", className: "whitespace-nowrap text-xs text-text-secondary", render: (a) => (a.lastAt ? formatRelative(a.lastAt, now) : "Not pulled yet") },
              ]}
            />

          <SectionCard title="Best times to post" description="From your own posts' engagement rate, by weekday and hour in your timezone.">
            {best.enough ? (
              <ol className="grid gap-2 sm:grid-cols-3">
                {best.slots.map((s, i) => (
                  <li key={s.label} className="rounded-lg border border-border bg-surface-card px-3 py-2.5">
                    <p className="text-sm font-medium text-foreground">{i + 1}. {s.label}</p>
                    <p className="text-xs text-text-secondary tabular-nums">
                      {s.avgRate != null ? `${formatPercent(s.avgRate)} avg rate` : `${formatNumber(Math.round(s.avgEngagement))} avg interactions`} · {s.posts} post{s.posts === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-text-secondary">Needs {best.needed} published posts with insights in this range — {best.sample} so far.</p>
            )}
          </SectionCard>

          <div className="space-y-5">
            <DataTable
              data={pager.pageItems}
              getRowKey={(t) => t.id}
              empty={
                <SectionCard>
                  <p className="flex items-center gap-2 text-sm text-text-secondary">
                    <BarChart3 className="h-4 w-4 text-text-tertiary" aria-hidden="true" /> No posts published in this range.
                  </p>
                </SectionCard>
              }
              columns={[
                {
                  key: "post",
                  header: "Post",
                  render: (t) => (
                    <div className="flex items-center gap-3">
                      <MediaThumb item={t.post.media[0]} className="h-10 w-10 shrink-0" />
                      <div className="min-w-0">
                        <p className="max-w-xs truncate font-medium text-foreground">{t.post.title || excerpt(t.variantText ?? t.post.body, 48) || "Untitled post"}</p>
                        <p className="inline-flex items-center gap-1 text-xs text-text-secondary">
                          <NetworkIcon network={t.network} className="h-3 w-3" /> {accounts.find((a) => a.id === t.connectionId)?.name || networkLabel(t.network)} · {formatDate(t.publishedAt)}
                        </p>
                      </div>
                    </div>
                  ),
                },
                { key: "reach", header: "Reach", align: "right", className: "tabular-nums", render: (t) => (t.reach ? formatNumber(t.reach) : "—") },
                { key: "likes", header: "Likes", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.likes) },
                { key: "comments", header: "Comments", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.comments) },
                { key: "shares", header: "Shares", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.shares) },
                { key: "saves", header: "Saves", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.saves) },
                { key: "rate", header: "Eng. rate", align: "right", className: "tabular-nums font-medium text-foreground", render: (t) => formatPercent(t.rate) },
                {
                  key: "link",
                  header: "",
                  align: "right",
                  render: (t) =>
                    t.permalink ? (
                      <Button asChild size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label="View on the network">
                        <a href={t.permalink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    ) : null,
                },
              ]}
            />
            <ListPagination {...pager} itemLabel="posts" />
          </div>
        </>
      )}
    </MainScreenWrapper>
  );
}

export default SocialAnalyticsScreen;
