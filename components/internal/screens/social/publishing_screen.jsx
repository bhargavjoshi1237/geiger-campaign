"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarClock,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  ActionMenu,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ScreenHeader,
  SearchInput,
  SectionCard,
  StatsBar,
  StatusPill,
  Toolbar,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { createSocialPost, savePostTargets, softDeleteSocialPost } from "@/lib/supabase/social_posts";
import { FORMAT_LABELS, networkLabel } from "@/lib/social/networks";
import { LoadingPanel, MediaThumb, NetworkIcon, PostPreview, useNow, useSocialAccounts, useSocialPosts } from "./social_kit";
import {
  NETWORK_FILTER_OPTIONS,
  OUTLINE_BUTTON,
  POST_STATUS_MAP,
  TARGET_STATUS_MAP,
  excerpt,
  formatDateTime,
  formatNumber,
  formatRelative,
} from "./constants";

const VIEWS = [
  { value: "queue", label: "Queue" },
  { value: "attention", label: "Needs attention" },
  { value: "published", label: "Published" },
  { value: "all", label: "All" },
];

const VIEW_STATUSES = {
  queue: ["approved", "scheduled", "publishing"],
  attention: ["failed", "in_review"],
  published: ["published"],
};

const DOT = {
  pending: "bg-text-tertiary",
  publishing: "bg-sky-500",
  published: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-text-tertiary",
};

const DETAIL_NAV = [
  { key: "accounts", label: "Accounts", icon: Send, desc: "Per-account publish status, errors and retries." },
  { key: "content", label: "Content", icon: FileText, desc: "What was published, as each network shows it." },
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Latest insights pulled from each network." },
  { key: "approval", label: "Approval", icon: ShieldCheck, desc: "Who reviewed and approved the post." },
];

const postTime = (p) => p.publishedAt || p.scheduledAt || p.updatedAt || p.createdAt;

function TargetDots({ targets }) {
  if (!targets.length) return <span className="text-xs text-text-tertiary">No accounts</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {targets.map((t) => (
        <span key={t.id} title={`${networkLabel(t.network)} · ${TARGET_STATUS_MAP[t.status]?.label || t.status}${t.error ? ` — ${t.error}` : ""}`} className="relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-card text-muted-foreground">
          <NetworkIcon network={t.network} className="h-3.5 w-3.5" />
          <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-surface-subtle", DOT[t.status] || DOT.pending)} />
        </span>
      ))}
    </div>
  );
}

function whenLine(p) {
  if (p.status === "published") return `Published ${formatDateTime(p.publishedAt)}`;
  if (p.status === "scheduled") return `Scheduled ${formatDateTime(p.scheduledAt)}`;
  if (p.status === "publishing") return "Publishing now";
  if (p.scheduledAt) return `Planned ${formatDateTime(p.scheduledAt)}`;
  return `Updated ${formatRelative(p.updatedAt || p.createdAt)}`;
}

function PostDetail({ post, accounts, onBack, onEdit, onRetry, onPublish, onDelete, busy, canPublish }) {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const failed = post.targets.filter((t) => t.status === "failed");
  const history = post.approval?.history || [];

  return (
    <EditorShell
      back={{ label: "Publishing", onClick: onBack }}
      title={post.title || excerpt(post.body, 60) || "Untitled post"}
      status={post.status}
      statusMap={POST_STATUS_MAP}
      badges={<span className="text-xs text-text-tertiary">{whenLine(post)}</span>}
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete post" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(post)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          {post.status !== "published" && post.status !== "publishing" ? (
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onEdit(post)}>
              <Pencil className="h-4 w-4" /> Edit in composer
            </Button>
          ) : null}
          {failed.length && canPublish ? (
            <Button onClick={() => onRetry(post, failed.map((t) => t.id))} disabled={Boolean(busy)}>
              {busy === `retry-${post.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry failed
            </Button>
          ) : null}
          {canPublish && ["approved", "scheduled"].includes(post.status) ? (
            <Button onClick={() => onPublish(post)} disabled={Boolean(busy)}>
              {busy === `publish-${post.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish now
            </Button>
          ) : null}
        </>
      }
      nav={DETAIL_NAV}
      defaultSection="accounts"
    >
      {({ active }) => (
        <>
          {active === "accounts" ? (
            <DataTable
              data={post.targets}
              getRowKey={(t) => t.id}
              empty={<SectionCard><p className="text-sm text-text-secondary">No accounts selected for this post.</p></SectionCard>}
              columns={[
                {
                  key: "account",
                  header: "Account",
                  render: (t) => {
                    const account = accountById.get(t.connectionId);
                    return (
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                          <NetworkIcon network={t.network} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{account?.name || "Disconnected account"}</p>
                          <p className="text-xs text-text-secondary">{networkLabel(t.network)} · {FORMAT_LABELS[t.format] || t.format}</p>
                        </div>
                      </div>
                    );
                  },
                },
                { key: "status", header: "Status", render: (t) => <StatusPill status={t.status} map={TARGET_STATUS_MAP} /> },
                {
                  key: "detail",
                  header: "Detail",
                  className: "max-w-sm whitespace-normal",
                  render: (t) =>
                    t.error ? (
                      <span className="text-xs text-red-600 dark:text-red-400">{t.error}</span>
                    ) : t.status === "published" ? (
                      <span className="text-xs text-text-secondary">
                        {formatDateTime(t.publishedAt)}
                        {t.firstComment?.status === "failed" ? ` · first comment failed: ${t.firstComment.error}` : t.firstComment?.status === "posted" ? " · first comment posted" : ""}
                      </span>
                    ) : t.status === "publishing" && t.resume ? (
                      <span className="text-xs text-text-secondary">Instagram is processing the media — finishes on the next worker run.</span>
                    ) : (
                      <span className="text-xs text-text-tertiary">{t.attempts ? `${t.attempts} attempt${t.attempts === 1 ? "" : "s"}` : "Not attempted"}</span>
                    ),
                },
                {
                  key: "actions",
                  header: "",
                  align: "right",
                  render: (t) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {t.permalink ? (
                        <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
                          <a href={t.permalink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" /> View
                          </a>
                        </Button>
                      ) : null}
                      {t.status === "failed" && canPublish ? (
                        <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => onRetry(post, [t.id])} disabled={Boolean(busy)}>
                          <RefreshCw className="h-4 w-4" /> Retry
                        </Button>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          ) : null}

          {active === "content" ? (
            <div className="grid gap-4 md:grid-cols-2">
              {(post.targets.length ? post.targets : [{ id: "default", network: "instagram", format: "feed", variantText: null }]).map((t) => (
                <div key={t.id} className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                    <NetworkIcon network={t.network} className="h-3.5 w-3.5" /> {accountById.get(t.connectionId)?.name || networkLabel(t.network)}
                  </p>
                  <PostPreview network={t.network} account={accountById.get(t.connectionId)} text={t.variantText ?? post.body} media={post.media} format={t.format} firstComment={post.firstComment} />
                </div>
              ))}
            </div>
          ) : null}

          {active === "performance" ? (
            post.targets.some((t) => Object.keys(t.metrics || {}).length) ? (
              <DataTable
                data={post.targets.filter((t) => t.status === "published")}
                getRowKey={(t) => t.id}
                columns={[
                  { key: "account", header: "Account", render: (t) => <span className="inline-flex items-center gap-1.5 text-foreground"><NetworkIcon network={t.network} className="h-3.5 w-3.5" /> {accountById.get(t.connectionId)?.name || networkLabel(t.network)}</span> },
                  { key: "reach", header: "Reach", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.reach) },
                  { key: "views", header: "Views", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.views) },
                  { key: "likes", header: "Likes", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.likes) },
                  { key: "comments", header: "Comments", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.comments) },
                  { key: "shares", header: "Shares", align: "right", className: "tabular-nums", render: (t) => formatNumber(t.metrics.shares) },
                  { key: "updated", header: "Updated", align: "right", className: "text-xs text-text-secondary", render: (t) => formatRelative(t.lastInsightsAt) },
                ]}
              />
            ) : (
              <SectionCard>
                <p className="text-sm text-text-secondary">No insights yet. They&apos;re pulled from Instagram and Facebook every few hours after publishing; Telegram doesn&apos;t report per-post metrics to bots.</p>
              </SectionCard>
            )
          ) : null}

          {active === "approval" ? (
            <SectionCard>
              {history.length ? (
                <ol className="space-y-2.5">
                  {history.map((h, i) => (
                    <li key={i} className="text-sm text-foreground">
                      <span className="capitalize">{h.action}</span> <span className="text-text-secondary">· {formatDateTime(h.at)}</span>
                      {h.note ? <span className="block text-xs text-text-secondary">{h.note}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-text-secondary">No review activity recorded for this post.</p>
              )}
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function PublishingScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canPublish = can("campaign.social.publish");
  const canEdit = can("campaign.social.edit");
  const { recordId, openRecord, closeRecord, openRecordInTab, setTab } = useWorkspaceUrl();
  const { posts, setPosts, setTargets, loading, reload } = useSocialPosts(projectId);
  const { accounts } = useSocialAccounts(projectId);
  const [view, setView] = useState("queue");
  const [network, setNetwork] = useState("all");
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(null);

  const now = useNow();
  const stats = useMemo(() => {
    const monthAgo = now - 30 * 86_400_000;
    const targets = posts.flatMap((p) => p.targets);
    return [
      { label: "Scheduled", value: posts.filter((p) => p.status === "scheduled").length.toLocaleString("en-US") },
      { label: "Published · 30 days", value: posts.filter((p) => p.status === "published" && new Date(p.publishedAt).getTime() >= monthAgo).length.toLocaleString("en-US") },
      { label: "In review", value: posts.filter((p) => p.status === "in_review").length.toLocaleString("en-US") },
      { label: "Failed accounts", value: targets.filter((t) => t.status === "failed").length.toLocaleString("en-US") },
    ];
  }, [posts, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statuses = VIEW_STATUSES[view];
    const rows = posts.filter((p) => {
      if (statuses && !statuses.includes(p.status)) return false;
      if (network !== "all" && !p.targets.some((t) => t.network === network)) return false;
      if (q && !`${p.title} ${p.body}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const time = (p) => new Date(postTime(p)).getTime() || 0;
    return view === "queue" ? rows.sort((a, b) => time(a) - time(b)) : rows.sort((a, b) => time(b) - time(a));
  }, [posts, view, network, query]);

  const pager = usePagination(filtered, { resetKey: `${view}|${network}|${query}` });

  const publishRequest = async (post, targetIds, label) => {
    setBusy(label);
    const res = await apiPost(`/api/projects/${projectId}/social/publishing/posts/${post.id}/publish`, targetIds ? { targetIds } : {});
    await reload();
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't publish.");
      return;
    }
    const results = res.data?.results || [];
    const failed = results.filter((r) => r.status === "failed");
    if (failed.length) toast.error(`${failed.length} account${failed.length === 1 ? "" : "s"} failed: ${failed[0].error}`);
    else if (results.some((r) => r.status === "publishing")) toast.success("Publishing — Instagram is still processing the media.");
    else toast.success(targetIds ? "Retried — published." : "Published.");
  };

  const handleDuplicate = async (post) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const copy = { ...post, id, title: `${post.title || "Untitled post"} (copy)`, status: "draft", scheduledAt: null, publishedAt: null, approval: { history: [] }, targets: [] };
    setPosts((p) => [copy, ...p]);
    const created = await createSocialPost(projectId, {
      id,
      title: copy.title,
      body: post.body,
      media: post.media,
      firstComment: post.firstComment,
      hashtagSetId: post.hashtagSetId,
      status: "draft",
      createdBy: user?.id || null,
      metadata: { hashtagPlacement: post.hashtagPlacement },
    });
    if (!created) {
      setPosts((p) => p.filter((x) => x.id !== id));
      toast.error("Couldn't duplicate the post.");
      return;
    }
    const targets = await savePostTargets(
      projectId,
      id,
      post.targets.filter((t) => t.connectionId).map((t) => ({ connectionId: t.connectionId, network: t.network, format: t.format, variantText: t.variantText })),
    );
    if (targets) setTargets((list) => [...list, ...targets]);
    setPosts((p) => p.map((x) => (x.id === id ? created : x)));
    toast.success("Duplicated as a draft.");
  };

  const handleDelete = async (post) => {
    setDeleteTarget(null);
    setPosts((p) => p.filter((x) => x.id !== post.id));
    if (post.id === recordId) closeRecord();
    const ok = await softDeleteSocialPost(post.id);
    if (!ok) {
      await reload();
      toast.error("Couldn't delete the post.");
      return;
    }
    toast.success("Post deleted.");
  };

  const editInComposer = (post) => openRecordInTab(post.id, "Post Composer");

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete post</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.title || "this post"}</span>? It comes off the queue and won&apos;t publish. Anything already published stays on the networks.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = posts.find((p) => p.id === recordId);
  if (open) {
    return (
      <>
        <PostDetail
          key={open.id}
          post={open}
          accounts={accounts}
          busy={busy}
          canPublish={canPublish}
          onBack={closeRecord}
          onEdit={editInComposer}
          onRetry={(post, ids) => publishRequest(post, ids, `retry-${post.id}`)}
          onPublish={(post) => publishRequest(post, null, `publish-${post.id}`)}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || network !== "all";

  const columns = [
    {
      key: "post",
      header: "Post",
      render: (p) => (
        <div className="flex items-center gap-3">
          <MediaThumb item={p.media[0]} className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{p.title || excerpt(p.body, 48) || "Untitled post"}</p>
            <p className="max-w-md truncate text-xs text-text-secondary">{excerpt(p.body, 80) || "No text"}</p>
          </div>
        </div>
      ),
    },
    { key: "accounts", header: "Accounts", render: (p) => <TargetDots targets={p.targets} /> },
    { key: "status", header: "Status", render: (p) => <StatusPill status={p.status} map={POST_STATUS_MAP} /> },
    {
      key: "when",
      header: "When",
      render: (p) => (
        <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
          <CalendarClock className="h-3 w-3" /> {whenLine(p)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <ActionMenu
          label="Post actions"
          items={[
            p.status !== "published" && p.status !== "publishing" && { label: "Edit in composer", icon: Pencil, onSelect: () => editInComposer(p) },
            canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(p) },
            canPublish && p.targets.some((t) => t.status === "failed") && { label: "Retry failed", icon: RefreshCw, onSelect: () => publishRequest(p, p.targets.filter((t) => t.status === "failed").map((t) => t.id), `retry-${p.id}`) },
            { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(p) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Publishing"
        description="Every social post and where it stands on each connected account."
        actions={
          canEdit ? (
            <Button onClick={() => setTab("Post Composer")}>
              <Plus className="h-4 w-4" /> New post
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={view} onValueChange={setView} options={VIEWS} height="h-9" />
          <FilterDropdown value={network} onValueChange={setNetwork} options={NETWORK_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search posts…" />
      </Toolbar>

      {loading ? (
        <LoadingPanel label="Loading posts" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(p) => p.id}
            onRowClick={(p) => openRecord(p.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Send}
                  title={filtersActive ? "No matches" : posts.length ? "Nothing in this view" : "No posts yet"}
                  description={
                    filtersActive
                      ? "Try a different search or network."
                      : posts.length
                        ? "Switch views to see other posts."
                        : "Write your first post in the composer — schedule it or publish it straight away."
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => { setQuery(""); setNetwork("all"); }}>
                        Clear filters
                      </Button>
                    ) : !posts.length && canEdit ? (
                      <Button onClick={() => setTab("Post Composer")}>
                        <Plus className="h-4 w-4" /> New post
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="posts" />
        </div>
      )}
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default PublishingScreen;
