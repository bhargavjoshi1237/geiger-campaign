"use client";

import React, { useMemo, useState } from "react";
import { ExternalLink, Link2, Megaphone, Plus, RefreshCw, Settings2, TrendingUp, Unlink, Users } from "lucide-react";
import { toast } from "sonner";
import { ActionMenu, Badge, Button, DataTable, ScreenHeader, SearchInput, StatsBar, StatusPill, Toolbar } from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { normalizeCommunityChannel, softDeleteCommunityChannel } from "@/lib/supabase/community_channels";
import { openInAppUrl } from "@/lib/communities/platforms";
import { ConfirmDialog, ListEmptyState, LoadingBlock, Notice, OUTLINE_BUTTON, PRIMARY_BUTTON, useChannelData, useNow, useProjectMembers } from "./communities_kit";
import { BotCell, LinkTelegramDialog, TelegramSettingsSection, botLabel, useTelegramChats } from "./telegram_kit";
import { PostsSection } from "./posts_section";
import { JoinLinksSection } from "./join_links_section";
import { FollowersSection } from "./followers_section";
import { CHANNEL_STATUS_FILTER_OPTIONS, CHANNEL_STATUS_MAP, formatDateTime, formatNumber, formatRelative } from "./constants";

const PLATFORM = "telegram_channel";
const DAY = 24 * 60 * 60 * 1000;

const NAV = [
  { key: "posts", label: "Posts", icon: Megaphone, desc: "Compose, schedule and publish through your bot. Views and reactions land on each post." },
  { key: "links", label: "Join links", icon: Link2, desc: "Named invite links for emails, landing pages and link-in-bio, with clicks and joins attributed." },
  { key: "members", label: "Subscribers", icon: TrendingUp, desc: "Subscriber count over time, synced from Telegram daily." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "The bot's admin rights and posting defaults." },
];

function ChannelEditor({ projectId, channel, bot, members, canEdit, onBack, onChannelChange, onUnlinked, onPostsChange }) {
  const data = useChannelData(projectId, channel.id);
  const [composer, setComposer] = useState(null);
  const { section } = useWorkspaceUrl();
  const activeSection = NAV.some((n) => n.key === section) ? section : "posts";
  const setPosts = (updater) => {
    data.setPosts((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onPostsChange(channel.id, next);
      return next;
    });
  };
  const appUrl = openInAppUrl(channel);

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={channel.name}
      status={channel.status}
      statusMap={CHANNEL_STATUS_MAP}
      badges={
        <>
          <Badge variant="info">Telegram channel</Badge>
          {channel.handle ? <span className="text-xs text-text-tertiary">@{channel.handle}</span> : null}
          <span className="text-xs text-text-tertiary">{formatNumber(channel.followerCount)} subscribers · {botLabel(bot)}</span>
        </>
      }
      actions={
        appUrl ? (
          <Button variant="outline" className={OUTLINE_BUTTON} asChild>
            <a href={appUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Open in Telegram
            </a>
          </Button>
        ) : null
      }
      nav={NAV}
      defaultSection="posts"
      sectionAction={
        activeSection === "posts" && canEdit && !data.loading ? (
          <Button className={PRIMARY_BUTTON} onClick={() => setComposer({ post: null })}>
            <Plus className="h-4 w-4" /> New post
          </Button>
        ) : null
      }
    >
      {({ active }) =>
        data.loading && active !== "settings" ? (
          <LoadingBlock size={48} label="Loading channel" />
        ) : (
          <>
            {active === "posts" ? (
              <div className="space-y-5">
                {channel.status === "error" ? (
                  <Notice tone="warning" title="Scheduled posts can't go out">
                    {channel.settings?.statusReason || "The bot lost its admin rights."} Fix it in Telegram, then re-check under Settings.
                  </Notice>
                ) : null}
                <PostsSection projectId={projectId} channel={channel} posts={data.posts} setPosts={setPosts} members={members} canEdit={canEdit} composer={composer} setComposer={setComposer} />
              </div>
            ) : null}
            {active === "links" ? <JoinLinksSection projectId={projectId} channel={channel} links={data.links} setLinks={data.setLinks} canEdit={canEdit} /> : null}
            {active === "members" ? (
              <FollowersSection projectId={projectId} channel={channel} onChannelChange={onChannelChange} snapshots={data.snapshots} setSnapshots={data.setSnapshots} canEdit={canEdit} />
            ) : null}
            {active === "settings" ? (
              <TelegramSettingsSection projectId={projectId} channel={channel} bot={bot} canEdit={canEdit} onChannelChange={onChannelChange} onUnlinked={onUnlinked} />
            ) : null}
          </>
        )
      }
    </EditorShell>
  );
}

export function TelegramChannelsScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.community.edit");
  const { recordId, openRecord, closeRecord, setTab } = useWorkspaceUrl();
  const { chats, setChats, upsert, bots, posts, setPosts, loading } = useTelegramChats(projectId, PLATFORM);
  const members = useProjectMembers(projectId);
  const now = useNow();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [unlinking, setUnlinking] = useState(false);

  const linked = useMemo(() => chats.filter((c) => c.status !== "pending"), [chats]);
  const detected = useMemo(() => chats.filter((c) => c.status === "pending"), [chats]);
  const botById = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);

  const postStats = useMemo(() => {
    const ids = new Set(linked.map((c) => c.id));
    const by = new Map();
    for (const p of posts) {
      if (!ids.has(p.channelId)) continue;
      const s = by.get(p.channelId) || { scheduled: 0, lastPostedAt: null, nextAt: null, recent: 0 };
      if (p.status === "scheduled") {
        s.scheduled += 1;
        if (!s.nextAt || p.scheduledAt < s.nextAt) s.nextAt = p.scheduledAt;
      }
      if (p.status === "posted") {
        if (!s.lastPostedAt || p.postedAt > s.lastPostedAt) s.lastPostedAt = p.postedAt;
        if (p.postedAt && new Date(p.postedAt).getTime() > now - 30 * DAY) s.recent += 1;
      }
      by.set(p.channelId, s);
    }
    return by;
  }, [posts, linked, now]);

  const stats = useMemo(() => {
    const all = [...postStats.values()];
    return [
      { label: "Channels", value: formatNumber(linked.length) },
      { label: "Subscribers", value: formatNumber(linked.reduce((s, c) => s + c.followerCount, 0)) },
      { label: "Scheduled posts", value: formatNumber(all.reduce((s, x) => s + x.scheduled, 0)) },
      { label: "Posts (30 days)", value: formatNumber(all.reduce((s, x) => s + x.recent, 0)) },
    ];
  }, [linked, postStats]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return linked.filter((c) => {
      if (q && !`${c.name} ${c.handle}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      return true;
    });
  }, [linked, query, statusFilter]);
  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}` });

  const onPostsChange = (channelId, next) => setPosts((prev) => [...prev.filter((p) => p.channelId !== channelId), ...next]);

  const verify = async (channel) => {
    const res = await apiPost(`/api/projects/${projectId}/communities/channels/${channel.id}/verify`);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    upsert(normalizeCommunityChannel(res.data.channel));
    if (res.data.warnings?.length) res.data.warnings.forEach((w) => toast.warning(w));
    else toast.success(`${channel.name}: the bot has everything it needs.`);
  };

  const unlink = async () => {
    const channel = unlinkTarget;
    setUnlinking(true);
    const ok = await softDeleteCommunityChannel(channel.id);
    setUnlinking(false);
    setUnlinkTarget(null);
    if (!ok) {
      toast.error("Couldn't unlink the channel.");
      return;
    }
    setChats((prev) => prev.filter((c) => c.id !== channel.id));
    toast.success(`${channel.name} unlinked.`);
  };

  if (loading) {
    return (
      <MainScreenWrapper>
        <LoadingBlock size={80} panel={false} label="Loading Telegram channels" />
      </MainScreenWrapper>
    );
  }

  const open = linked.find((c) => c.id === recordId);
  if (open) {
    return (
      <ChannelEditor
        key={open.id}
        projectId={projectId}
        channel={open}
        bot={botById.get(open.connectionId)}
        members={members}
        canEdit={canEdit}
        onBack={closeRecord}
        onChannelChange={upsert}
        onPostsChange={onPostsChange}
        onUnlinked={(c) => {
          setChats((prev) => prev.filter((x) => x.id !== c.id));
          closeRecord();
        }}
      />
    );
  }

  const filtersActive = Boolean(query) || statusFilter !== "all";
  const columns = [
    {
      key: "channel",
      header: "Channel",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{c.name}</span>
          <span className="truncate text-xs text-text-secondary">{c.handle ? `@${c.handle}` : "Private channel"}</span>
        </div>
      ),
    },
    { key: "bot", header: "Bot", render: (c) => <BotCell bot={botById.get(c.connectionId)} /> },
    { key: "subscribers", header: "Subscribers", align: "right", className: "tabular-nums font-medium text-foreground", render: (c) => formatNumber(c.followerCount) },
    {
      key: "next",
      header: "Next post",
      className: "whitespace-nowrap text-sm text-text-secondary",
      render: (c) => {
        const s = postStats.get(c.id);
        return s?.nextAt ? (
          <span>
            {formatDateTime(s.nextAt)}
            {s.scheduled > 1 ? <span className="text-text-tertiary"> · +{s.scheduled - 1}</span> : null}
          </span>
        ) : (
          "—"
        );
      },
    },
    { key: "last", header: "Last post", className: "whitespace-nowrap text-sm text-text-secondary", render: (c) => formatRelative(postStats.get(c.id)?.lastPostedAt) },
    { key: "status", header: "Status", render: (c) => <StatusPill status={c.status} map={CHANNEL_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: "Open", icon: Megaphone, onSelect: () => openRecord(c.id) },
            openInAppUrl(c) && { label: "Open in Telegram", icon: ExternalLink, href: openInAppUrl(c) },
            canEdit && { label: "Re-check bot", icon: RefreshCw, onSelect: () => verify(c) },
            canEdit && { separator: true },
            canEdit && { label: "Unlink", icon: Unlink, destructive: true, onSelect: () => setUnlinkTarget(c) },
          ]}
        />
      ),
    },
  ];

  const noBots = !bots.some((b) => b.status !== "disconnected");

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Telegram Channels"
        description="Broadcast channels run by your own bot: scheduled posts with media and buttons, join links and subscriber growth."
        actions={
          canEdit ? (
            <Button className={PRIMARY_BUTTON} onClick={() => setLinkOpen(true)}>
              <Plus className="h-4 w-4" /> Link channel
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      {detected.length && canEdit ? (
        <Notice
          title={`${detected.length} channel${detected.length === 1 ? "" : "s"} detected`}
          action={
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setLinkOpen(true)}>
              Review
            </Button>
          }
        >
          Your bot was added as an admin to {detected.map((d) => d.name || d.handle).join(", ")}. Link {detected.length === 1 ? "it" : "them"} to start posting.
        </Notice>
      ) : null}

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={CHANNEL_STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search channels…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(c) => c.id}
          onRowClick={(c) => openRecord(c.id)}
          empty={
            <ListEmptyState
              icon={Users}
              filtersActive={filtersActive}
              title={noBots ? "Connect a Telegram bot first" : "No channels linked"}
              description={
                noBots
                  ? "Channels are posted to by your own bot. Create one with @BotFather, connect it in Channels → Telegram, then add it to your channel as an admin."
                  : "Add your bot to a channel as an admin with “Post messages”, then link the channel here."
              }
              onClear={() => {
                setQuery("");
                setStatusFilter("all");
              }}
              action={
                noBots ? (
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setTab("Telegram")}>
                    Connect a bot
                  </Button>
                ) : canEdit ? (
                  <Button className={PRIMARY_BUTTON} onClick={() => setLinkOpen(true)}>
                    <Plus className="h-4 w-4" /> Link channel
                  </Button>
                ) : null
              }
            />
          }
        />
        <ListPagination {...pager} itemLabel="channels" />
      </div>

      {linkOpen ? (
        <LinkTelegramDialog
          open
          onOpenChange={setLinkOpen}
          projectId={projectId}
          platform={PLATFORM}
          bots={bots}
          detected={detected}
          onLinked={(c) => {
            upsert(c);
            openRecord(c.id);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!unlinkTarget}
        title={`Unlink ${unlinkTarget?.name || "channel"}`}
        description="Scheduled posts stop and join links stop redirecting. History stays in reporting. Remove the bot in Telegram to revoke its access."
        confirmLabel="Unlink"
        pending={unlinking}
        onCancel={() => setUnlinkTarget(null)}
        onConfirm={unlink}
      />
    </MainScreenWrapper>
  );
}

export default TelegramChannelsScreen;
