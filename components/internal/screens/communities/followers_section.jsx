"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Loader2, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import {
  ActionMenu,
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  SectionCard,
  StatGrid,
  cn,
} from "@geiger/ui";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { updateCommunityChannel, normalizeCommunityChannel } from "@/lib/supabase/community_channels";
import { createMemberSnapshot, normalizeMemberSnapshot, softDeleteMemberSnapshot } from "@/lib/supabase/member_snapshots";
import { PLATFORMS, isTelegramPlatform } from "@/lib/communities/platforms";
import { DateTimeField, ListEmptyState, OUTLINE_BUTTON, PRIMARY_BUTTON, useNow } from "./communities_kit";
import { formatCompact, formatDateTime, formatNumber, fromLocalInput, toLocalInput } from "./constants";

const CHART_CONFIG = { count: { label: "Followers", color: "var(--chart-series-1)" } };
const TOOLTIP_CLASS = "bg-surface-subtle border-border text-foreground";
const DAY = 24 * 60 * 60 * 1000;

// The latest snapshot at or before `at` (snapshots sorted oldest first).
export function countAt(snapshots, at) {
  let value = null;
  for (const s of snapshots) {
    if (new Date(s.capturedAt).getTime() <= at) value = s.count;
    else break;
  }
  return value;
}

function Change({ value }) {
  if (value == null) return <span className="text-text-tertiary">—</span>;
  const up = value >= 0;
  return (
    <span className={cn("tabular-nums", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      {up ? "+" : "−"}
      {formatNumber(Math.abs(value))}
    </span>
  );
}

// Daily series (one point per day with a snapshot) for the chart.
export function dailySeries(snapshots, sinceMs) {
  const byDay = new Map();
  for (const s of snapshots) {
    const t = new Date(s.capturedAt).getTime();
    if (t < sinceMs) continue;
    byDay.set(new Date(t).toISOString().slice(0, 10), s.count);
  }
  return [...byDay.entries()].map(([day, count]) => ({
    day,
    label: new Date(`${day}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    count,
  }));
}

export function FollowerChart({ data, height = 240 }) {
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto w-full" style={{ height }}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} stroke="var(--muted-foreground)" />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          stroke="var(--muted-foreground)"
          domain={[(min) => Math.max(0, Math.floor(min * 0.95)), (max) => Math.ceil(max * 1.02)]}
          tickFormatter={formatCompact}
        />
        <ChartTooltip cursor={{ stroke: "var(--chart-cursor)" }} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
        <Area dataKey="count" type="monotone" stroke="var(--color-count)" strokeWidth={2} fill="var(--color-count)" fillOpacity={0.08} isAnimationActive animationDuration={600} />
      </AreaChart>
    </ChartContainer>
  );
}

function RecordDialog({ open, onOpenChange, channel, onSave }) {
  const [form, setForm] = useState(() => ({ count: channel.followerCount ? String(channel.followerCount) : "", capturedAt: toLocalInput(new Date().toISOString()), note: "" }));
  const [pending, setPending] = useState(false);
  const app = PLATFORMS[channel.platform].appLabel;
  const submit = async () => {
    const count = Number(form.count);
    if (!Number.isFinite(count) || count < 0) {
      toast.error("Enter the follower count shown in the app.");
      return;
    }
    setPending(true);
    const ok = await onSave({ count: Math.round(count), capturedAt: fromLocalInput(form.capturedAt) || new Date().toISOString(), note: form.note });
    setPending(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record follower count</DialogTitle>
          <DialogDescription>{app} doesn&apos;t expose channel follower counts through an API. Copy the number from the channel&apos;s info screen — a weekly snapshot is enough for a growth trend.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Followers" htmlFor="rs-count">
            <Input id="rs-count" type="number" min={0} inputMode="numeric" value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} className="tabular-nums" autoFocus />
          </Field>
          <Field label="Counted at">
            <DateTimeField value={form.capturedAt} onChange={(v) => setForm((f) => ({ ...f, capturedAt: v }))} />
          </Field>
          <Field label="Note" htmlFor="rs-note" hint="Optional, e.g. what drove a jump.">
            <Input id="rs-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Featured in the Atlas newsletter" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Follower / member history: Telegram counts are synced by the bot, WhatsApp / Instagram counts entered by hand. */
export function FollowersSection({ projectId, channel, onChannelChange, snapshots, setSnapshots, canEdit }) {
  const telegram = isTelegramPlatform(channel.platform);
  const now = useNow();
  const [recordOpen, setRecordOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const sorted = useMemo(() => [...snapshots].sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt))), [snapshots]);
  const series = useMemo(() => dailySeries(sorted, now - 90 * DAY), [sorted, now]);
  const stats = useMemo(() => {
    const latest = sorted[sorted.length - 1]?.count ?? channel.followerCount;
    const d7 = countAt(sorted, now - 7 * DAY);
    const d30 = countAt(sorted, now - 30 * DAY);
    return [
      { label: telegram ? "Members" : "Followers", value: formatNumber(latest), hint: sorted.length ? `Counted ${formatDateTime(sorted[sorted.length - 1].capturedAt)}` : "No counts yet" },
      { label: "7-day change", value: d7 == null ? "—" : `${latest - d7 >= 0 ? "+" : "−"}${formatNumber(Math.abs(latest - d7))}`, hint: d7 == null ? "Needs a count from a week ago" : `From ${formatNumber(d7)}` },
      { label: "30-day change", value: d30 == null ? "—" : `${latest - d30 >= 0 ? "+" : "−"}${formatNumber(Math.abs(latest - d30))}`, hint: d30 == null ? "Needs a count from 30 days ago" : `From ${formatNumber(d30)}` },
    ];
  }, [sorted, now, channel.followerCount, telegram]);

  const history = useMemo(() => {
    const rows = [...sorted].reverse();
    return rows.map((s, i) => ({ ...s, change: rows[i + 1] ? s.count - rows[i + 1].count : null }));
  }, [sorted]);
  const pager = usePagination(history);

  const sync = async () => {
    setSyncing(true);
    const res = await apiPost(`/api/projects/${projectId}/communities/channels/${channel.id}/sync`);
    setSyncing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.data?.snapshot) setSnapshots((prev) => [...prev, normalizeMemberSnapshot(res.data.snapshot)]);
    if (res.data?.channel) onChannelChange(normalizeCommunityChannel(res.data.channel));
    toast.success("Member count synced from Telegram.");
  };

  const record = async ({ count, capturedAt, note }) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    setSnapshots((prev) => [...prev, { id, channelId: channel.id, count, capturedAt, source: "manual", note }]);
    const created = await createMemberSnapshot(projectId, { id, channelId: channel.id, count, capturedAt, note, createdBy: user?.id ?? null });
    if (!created) {
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      toast.error("Couldn't save the count.");
      return false;
    }
    setSnapshots((prev) => prev.map((s) => (s.id === id ? created : s)));
    const isLatest = !sorted.length || capturedAt >= sorted[sorted.length - 1].capturedAt;
    if (isLatest) {
      onChannelChange({ ...channel, followerCount: count });
      await updateCommunityChannel(channel.id, { followerCount: count });
    }
    toast.success("Follower count saved.");
    return true;
  };

  const removeSnapshot = async (snap) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== snap.id));
    if (!(await softDeleteMemberSnapshot(snap.id))) {
      setSnapshots((prev) => [...prev, snap]);
      toast.error("Couldn't delete the count.");
    }
  };

  const columns = [
    { key: "at", header: "Counted", className: "whitespace-nowrap text-sm text-foreground", render: (s) => formatDateTime(s.capturedAt) },
    { key: "count", header: telegram ? "Members" : "Followers", align: "right", className: "tabular-nums text-sm font-medium text-foreground", render: (s) => formatNumber(s.count) },
    { key: "change", header: "Change", align: "right", className: "text-sm", render: (s) => <Change value={s.change} /> },
    { key: "source", header: "Source", className: "text-sm text-text-secondary", render: (s) => (s.source === "telegram_api" ? "Telegram API" : "Entered by hand") },
    { key: "note", header: "Note", className: "max-w-xs truncate text-sm text-text-secondary", render: (s) => s.note || "" },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) =>
        canEdit && s.source === "manual" ? (
          <ActionMenu label="Snapshot actions" items={[{ label: "Delete", icon: Trash2, destructive: true, onSelect: () => removeSnapshot(s) }]} />
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <StatGrid stats={stats} columns={3} />
      <SectionCard
        title={telegram ? "Members over time" : "Followers over time"}
        description={telegram ? "Synced from Telegram once a day." : "From the counts you record. Gaps are drawn straight through."}
        bodyPadding={false}
        action={
          canEdit ? (
            telegram ? (
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={sync} disabled={syncing}>
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now
              </Button>
            ) : (
              <Button size="sm" className={PRIMARY_BUTTON} onClick={() => setRecordOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Record count
              </Button>
            )
          ) : null
        }
      >
        <div className="px-3 pb-3 pt-4">
          {series.length > 1 ? (
            <FollowerChart data={series} />
          ) : (
            <p className="px-2 py-10 text-center text-sm text-text-secondary">
              {telegram ? "The chart fills in as daily counts arrive." : "Record at least two counts to see a trend."}
            </p>
          )}
        </div>
      </SectionCard>
      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(s) => s.id}
          empty={
            <ListEmptyState
              icon={TrendingUp}
              title="No counts yet"
              description={telegram ? "The bot records the member count daily. Sync now to take the first one." : "Record today's follower count to start the history."}
            />
          }
        />
        <ListPagination {...pager} itemLabel="counts" />
      </div>
      {recordOpen ? <RecordDialog open onOpenChange={setRecordOpen} channel={channel} onSave={record} /> : null}
    </div>
  );
}
