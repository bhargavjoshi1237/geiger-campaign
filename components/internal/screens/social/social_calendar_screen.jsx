"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { Button, ScreenHeader, SectionCard, StatusPill, cn } from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getUser } from "@/lib/supabase/user";
import { createSocialPost, updateSocialPost } from "@/lib/supabase/social_posts";
import { LoadingPanel, NetworkIcon, useNow, useSocialPosts } from "./social_kit";
import { NETWORK_FILTER_OPTIONS, OUTLINE_BUTTON, POST_STATUS_MAP, excerpt } from "./constants";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_HOUR = 10;

const VIEW_OPTIONS = [
  { value: "all", label: "All posts" },
  { value: "planned", label: "Drafts & review" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];
const VIEW_STATUSES = {
  planned: ["draft", "in_review", "approved"],
  scheduled: ["scheduled", "publishing"],
  published: ["published", "failed"],
};

const TONE = {
  draft: "border-dashed border-border-strong bg-surface-card text-foreground hover:bg-surface-hover",
  in_review: "border-dashed border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200",
  approved: "border-sky-500/40 bg-sky-500/10 text-sky-800 hover:bg-sky-500/20 dark:text-sky-200",
  scheduled: "border-violet-500/40 bg-violet-500/15 text-violet-800 hover:bg-violet-500/25 dark:text-violet-200",
  publishing: "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-200",
  published: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200",
  failed: "border-red-500/40 bg-red-500/10 text-red-800 hover:bg-red-500/20 dark:text-red-200",
};

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const placedAt = (p) => (p.status === "published" ? p.publishedAt || p.scheduledAt : p.scheduledAt);
const timeLabel = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function SocialCalendarScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.social.edit");
  const canPublish = can("campaign.social.publish");
  const { openRecordInTab, setTab } = useWorkspaceUrl();
  const { posts, setPosts, loading, reload } = useSocialPosts(projectId);
  const now = useNow();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [network, setNetwork] = useState("all");
  const [view, setView] = useState("all");
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);

  const visible = useMemo(
    () =>
      posts.filter((p) => {
        if (VIEW_STATUSES[view] && !VIEW_STATUSES[view].includes(p.status)) return false;
        if (network !== "all" && !p.targets.some((t) => t.network === network)) return false;
        return true;
      }),
    [posts, view, network],
  );

  const byDay = useMemo(() => {
    const map = new Map();
    for (const p of visible) {
      const at = placedAt(p);
      if (!at) continue;
      const key = dayKey(new Date(at));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(placedAt(a)) - new Date(placedAt(b)));
    return map;
  }, [visible]);

  const unscheduled = useMemo(() => visible.filter((p) => !placedAt(p) && ["draft", "in_review", "approved"].includes(p.status)), [visible]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < first.getDay(); i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(new Date(cursor.year, cursor.month, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const today = dayKey(new Date(now));
  const monthStats = useMemo(() => {
    const inMonth = visible.filter((p) => {
      const at = placedAt(p);
      if (!at) return false;
      const d = new Date(at);
      return d.getFullYear() === cursor.year && d.getMonth() === cursor.month;
    });
    return {
      total: inMonth.length,
      scheduled: inMonth.filter((p) => p.status === "scheduled").length,
      published: inMonth.filter((p) => p.status === "published").length,
    };
  }, [visible, cursor]);

  const shift = (delta) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const canMove = (p) => canEdit && !["published", "publishing"].includes(p.status) && (p.status !== "scheduled" || canPublish);

  const moveTo = async (postId, day) => {
    const post = posts.find((p) => p.id === postId);
    if (!post || !canMove(post)) return;
    const prev = post.scheduledAt ? new Date(post.scheduledAt) : null;
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), prev ? prev.getHours() : DEFAULT_HOUR, prev ? prev.getMinutes() : 0);
    if (post.status === "scheduled" && next.getTime() < Date.now() + 60_000) {
      toast.error("Scheduled posts can only move to a future time.");
      return;
    }
    if (prev && dayKey(prev) === dayKey(next)) return;
    const iso = next.toISOString();
    setPosts((list) => list.map((p) => (p.id === postId ? { ...p, scheduledAt: iso } : p)));
    const saved = await updateSocialPost(postId, { scheduledAt: iso });
    if (!saved) {
      setPosts((list) => list.map((p) => (p.id === postId ? { ...p, scheduledAt: post.scheduledAt } : p)));
      toast.error("Couldn't reschedule the post.");
      return;
    }
    toast.success(`Moved to ${next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${timeLabel(iso)}.`);
  };

  const createOnDay = async (day) => {
    const user = await getUser();
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DEFAULT_HOUR, 0);
    const id = crypto.randomUUID();
    const created = await createSocialPost(projectId, { id, title: "", body: "", status: "draft", scheduledAt: at.toISOString(), createdBy: user?.id || null });
    if (!created) {
      toast.error("Couldn't create the draft.");
      return;
    }
    await reload();
    openRecordInTab(id, "Post Composer");
  };

  const chip = (p, { compact = true } = {}) => {
    const movable = canMove(p);
    const at = placedAt(p);
    return (
      <button
        key={p.id}
        type="button"
        draggable={movable}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", p.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(p.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverDay(null);
        }}
        onClick={() => openRecordInTab(p.id, "Post Composer")}
        title={`${POST_STATUS_MAP[p.status]?.label || p.status}${at ? ` · ${timeLabel(at)}` : ""} · ${p.title || excerpt(p.body, 60) || "Untitled post"}${movable ? " — drag to reschedule" : ""}`}
        className={cn(
          "flex w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
          TONE[p.status] || TONE.draft,
          movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          dragId === p.id && "opacity-50",
        )}
      >
        {p.targets[0] ? <NetworkIcon network={p.targets[0].network} className="h-3 w-3 shrink-0" /> : null}
        {compact && at ? <span className="shrink-0 tabular-nums">{timeLabel(at)}</span> : null}
        <span className="truncate">{p.title || excerpt(p.body, 40) || "Untitled post"}</span>
        {p.targets.length > 1 ? <span className="ml-auto shrink-0 opacity-70">+{p.targets.length - 1}</span> : null}
      </button>
    );
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Social calendar"
        description="Plan the month across every connected account. Drag a post to another day to reschedule it."
        actions={
          canEdit ? (
            <Button onClick={() => setTab("Post Composer")}>
              <Plus className="h-4 w-4" /> New post
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="min-w-40 text-lg font-semibold text-foreground">
            {MONTHS[cursor.month]} {cursor.year}
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} className="bg-surface-card" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => shift(1)} className="bg-surface-card" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              const d = new Date(now);
              setCursor({ year: d.getFullYear(), month: d.getMonth() });
            }}
          >
            Today
          </Button>
          <span className="hidden text-xs text-text-secondary tabular-nums sm:inline">
            {monthStats.total} posts · {monthStats.scheduled} scheduled · {monthStats.published} published
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FilterDropdown value={view} onValueChange={setView} options={VIEW_OPTIONS} height="h-9" />
          <FilterDropdown value={network} onValueChange={setNetwork} options={NETWORK_FILTER_OPTIONS} height="h-9" />
        </div>
      </div>

      {loading ? (
        <LoadingPanel label="Loading calendar" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
          <SectionCard bodyPadding={false}>
            <div className="grid grid-cols-7 border-b border-border bg-surface-subtle">
              {WEEKDAYS.map((w) => (
                <div key={w} className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-text-secondary">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                const key = day ? dayKey(day) : `empty-${i}`;
                const items = day ? byDay.get(key) || [] : [];
                const past = day && new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime() <= now;
                return (
                  <div
                    key={key}
                    onDragOver={(e) => {
                      if (!day || !dragId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (overDay !== key) setOverDay(key);
                    }}
                    onDragLeave={() => overDay === key && setOverDay(null)}
                    onDrop={(e) => {
                      if (!day) return;
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain") || dragId;
                      setOverDay(null);
                      setDragId(null);
                      if (id) moveTo(id, day);
                    }}
                    className={cn(
                      "group min-h-[120px] border-b border-r border-surface-active p-1.5",
                      (i + 1) % 7 === 0 && "border-r-0",
                      !day && "bg-surface-card",
                      past && "bg-surface-card/40",
                      overDay === key && "bg-surface-hover",
                    )}
                  >
                    {day ? (
                      <>
                        <div className="flex items-center justify-between px-1">
                          <span className={cn("text-xs tabular-nums", key === today ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground" : "text-text-secondary")}>
                            {day.getDate()}
                          </span>
                          {canEdit && !past ? (
                            <button
                              type="button"
                              onClick={() => createOnDay(day)}
                              aria-label={`New post on ${day.toDateString()}`}
                              className="rounded p-0.5 text-text-tertiary opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-1 space-y-1">{items.map((p) => chip(p))}</div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Unscheduled" description="Drag onto a day to plan it.">
            {unscheduled.length ? (
              <ul className="space-y-2">
                {unscheduled.map((p) => (
                  <li key={p.id} className="flex items-center gap-1.5">
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">{chip(p, { compact: false })}</div>
                    <StatusPill status={p.status} map={POST_STATUS_MAP} className="shrink-0" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">Every draft has a date.</p>
                {canEdit ? (
                  <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setTab("Post Composer")}>
                    <Plus className="h-4 w-4" /> New post
                  </Button>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default SocialCalendarScreen;
