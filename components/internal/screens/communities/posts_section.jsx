"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  CopyPlus,
  ExternalLink,
  Eye,
  File,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  SmilePlus,
  Trash2,
} from "lucide-react";
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
  Field,
  Input,
  SearchInput,
  SectionCard,
  StatusPill,
  Toolbar,
} from "@geiger/ui";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import {
  createCommunityPost,
  mergeCommunityPostMeta,
  normalizeCommunityPost,
  softDeleteCommunityPost,
  updateCommunityPost,
} from "@/lib/supabase/community_posts";
import { PLATFORMS, isTelegramPlatform, openInAppUrl } from "@/lib/communities/platforms";
import { ConfirmDialog, DateTimeField, ListEmptyState, OUTLINE_BUTTON, PRIMARY_BUTTON, copyText, memberName, useNow } from "./communities_kit";
import { PostComposerDialog } from "./post_composer";
import { POST_STATUS_FILTER_OPTIONS, POST_STATUS_MAP, formatDateTime, formatNumber, formatRelative, fromLocalInput, toLocalInput } from "./constants";

const UPCOMING = new Set(["scheduled", "reminder_sent"]);

function excerpt(text, max = 110) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean || "(media only)";
}

// Records that a manual-assist post went live (and its stats), or updates a Telegram post's stats.
function PostedDialog({ post, telegram, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    postedAt: toLocalInput(post?.postedAt || new Date().toISOString()),
    postUrl: post?.postUrl || "",
    views: post?.views ? String(post.views) : "",
    reactions: post?.reactions ? String(post.reactions) : "",
  }));
  const [pending, setPending] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const already = post?.status === "posted";

  const save = async () => {
    setPending(true);
    const ok = await onSave(post, {
      postedAt: fromLocalInput(form.postedAt) || new Date().toISOString(),
      postUrl: form.postUrl.trim(),
      views: form.views,
      reactions: form.reactions,
    });
    setPending(false);
    if (ok) onCancel();
  };

  return (
    <Dialog open={!!post} onOpenChange={(o) => !o && !pending && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{already ? "Update post stats" : "Mark as posted"}</DialogTitle>
          <DialogDescription>
            {telegram
              ? "Telegram's Bot API doesn't report view counts. Copy them from the post's statistics in Telegram."
              : "Record when it went live. Views and reactions are optional — copy them from the channel later to keep reporting honest."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {!telegram ? (
            <>
              <Field label="Posted at">
                <DateTimeField value={form.postedAt} onChange={set("postedAt")} />
              </Field>
              <Field label="Link to the post" hint="Optional — a share link to the update.">
                <Input value={form.postUrl} onChange={(e) => set("postUrl")(e.target.value)} placeholder="https://" />
              </Field>
            </>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Views" htmlFor="pd-views">
              <Input id="pd-views" type="number" min={0} inputMode="numeric" value={form.views} onChange={(e) => set("views")(e.target.value)} className="tabular-nums" />
            </Field>
            <Field label="Reactions" htmlFor="pd-reactions" hint={telegram ? "Synced automatically when the bot receives reaction updates." : undefined}>
              <Input id="pd-reactions" type="number" min={0} inputMode="numeric" value={form.reactions} onChange={(e) => set("reactions")(e.target.value)} className="tabular-nums" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button className={PRIMARY_BUTTON} onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {already ? "Save stats" : "Mark as posted"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Manual-assist posts whose reminder went out (or are past due): copy, open the app, mark as posted.
function ReadyToPost({ posts, channel, members, onCopy, onMarkPosted, canEdit }) {
  const platform = PLATFORMS[channel.platform];
  const appUrl = openInAppUrl(channel);
  if (!posts.length) return null;
  return (
    <SectionCard
      title="Ready to post"
      description={`${platform.appLabel} has no API for channel posts — copy each one and publish it in the app. ${platform.postHint || ""}`}
      bodyPadding={false}
    >
      <ul className="divide-y divide-border">
        {posts.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="whitespace-pre-line text-sm text-foreground">{p.body || "(media only)"}</p>
              <p className="text-xs text-text-tertiary">
                Due {formatDateTime(p.scheduledAt)} · {memberName(members, p.assigneeId)}
                {p.media.length ? ` · ${p.media.length} file${p.media.length === 1 ? "" : "s"} to attach` : ""}
                {p.reminderSentAt ? ` · reminded ${formatRelative(p.reminderSentAt)}` : ""}
              </p>
              {p.media.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {p.media.map((m, i) => (
                    <a
                      key={`${m.url}-${i}`}
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-card px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {m.type === "document" ? <File className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                      {m.name || "File"}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => onCopy(p)}>
                <Copy className="h-3.5 w-3.5" /> Copy text
              </Button>
              {appUrl ? (
                <Button variant="outline" size="sm" className={OUTLINE_BUTTON} asChild>
                  <a href={appUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Open {platform.appLabel}
                  </a>
                </Button>
              ) : null}
              {canEdit ? (
                <Button size="sm" className={PRIMARY_BUTTON} onClick={() => onMarkPosted(p)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark as posted
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/**
 * The channel's post planner + history. Telegram posts publish through the bot; WhatsApp / Instagram
 * posts are manual-assist (reminder, copy, open app, mark as posted).
 */
// `composer` is owned by the editor so its section header can open a new post.
export function PostsSection({ projectId, channel, posts, setPosts, members, canEdit, composer, setComposer }) {
  const telegram = isTelegramPlatform(channel.platform);
  const platform = PLATFORMS[channel.platform];
  const now = useNow();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [postedTarget, setPostedTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(null);

  const ready = useMemo(
    () =>
      telegram
        ? []
        : posts
            .filter((p) => p.status === "reminder_sent" || (p.status === "scheduled" && p.scheduledAt && new Date(p.scheduledAt).getTime() <= now))
            .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt))),
    [posts, telegram, now],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = posts.filter((p) => {
      if (q && !p.body.toLowerCase().includes(q)) return false;
      if (statusFilter === "upcoming") return UPCOMING.has(p.status);
      if (statusFilter !== "all") return p.status === statusFilter;
      return true;
    });
    // Upcoming first (soonest first), then everything else newest first.
    const key = (p) => p.postedAt || p.scheduledAt || p.createdAt || "";
    return rows.sort((a, b) => {
      const au = UPCOMING.has(a.status) || a.status === "draft";
      const bu = UPCOMING.has(b.status) || b.status === "draft";
      if (au !== bu) return au ? -1 : 1;
      if (au) return String(a.scheduledAt || "9999").localeCompare(String(b.scheduledAt || "9999"));
      return String(key(b)).localeCompare(String(key(a)));
    });
  }, [posts, query, statusFilter]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}` });
  const filtersActive = Boolean(query) || statusFilter !== "all";

  const replace = (row) => setPosts((prev) => prev.map((p) => (p.id === row.id ? row : p)));

  const publishNow = async (post) => {
    setPublishing(post.id);
    const res = await apiPost(`/api/projects/${projectId}/communities/posts/${post.id}/publish`);
    setPublishing(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (res.data?.post) replace(normalizeCommunityPost(res.data.post));
    if (res.data?.ok) toast.success(`Posted to ${channel.name}.`);
    else toast.error(res.data?.error || "Telegram rejected the post.");
    return Boolean(res.data?.ok);
  };

  const submit = async (patch, intent) => {
    const existing = composer?.post;
    if (existing) {
      const previous = existing;
      replace({ ...existing, ...patch });
      const saved = await updateCommunityPost(existing.id, patch);
      if (!saved) {
        replace(previous);
        toast.error("Couldn't save the post.");
        return false;
      }
      replace(saved);
      if (intent === "now") return publishNow(saved);
      toast.success(intent === "schedule" ? (telegram ? "Post scheduled." : "Reminder scheduled.") : "Draft saved.");
      return true;
    }
    const user = await getUser();
    const id = crypto.randomUUID();
    const optimistic = normalizeCommunityPost({
      id,
      project_id: projectId,
      channel_id: channel.id,
      body: patch.body,
      media: patch.media,
      buttons: patch.buttons,
      options: patch.options,
      status: patch.status,
      mode: patch.mode,
      scheduled_at: patch.scheduledAt,
      assignee_id: patch.assigneeId,
      created_at: new Date().toISOString(),
    });
    setPosts((prev) => [optimistic, ...prev]);
    const created = await createCommunityPost(projectId, { id, channelId: channel.id, createdBy: user?.id ?? null, ...patch });
    if (!created) {
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast.error("Couldn't save the post.");
      return false;
    }
    replace(created);
    if (intent === "now") return publishNow(created);
    toast.success(intent === "schedule" ? (telegram ? "Post scheduled." : "Reminder scheduled.") : "Draft saved.");
    return true;
  };

  const duplicate = async (post) => {
    const id = crypto.randomUUID();
    const user = await getUser();
    const copy = { body: post.body, media: post.media, buttons: post.buttons, options: post.options, mode: post.mode, assigneeId: post.assigneeId, status: "draft", scheduledAt: null };
    setPosts((prev) => [{ ...post, ...copy, id, views: 0, reactions: 0, postedAt: null, externalMessageId: null, error: null }, ...prev]);
    const created = await createCommunityPost(projectId, { id, channelId: channel.id, createdBy: user?.id ?? null, ...copy });
    if (!created) {
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast.error("Couldn't duplicate the post.");
      return;
    }
    replace(created);
    toast.success("Copied to a new draft.");
  };

  const saveStats = async (post, { postedAt, postUrl, views, reactions }) => {
    const patch = telegram
      ? { views, reactions }
      : { status: "posted", postedAt: post.status === "posted" ? post.postedAt || postedAt : postedAt, views, reactions, error: null };
    replace({ ...post, ...patch, views: Number(views) || 0, reactions: Number(reactions) || 0, postUrl: postUrl || post.postUrl });
    const saved = await updateCommunityPost(post.id, patch);
    if (!saved) {
      replace(post);
      toast.error("Couldn't save the post.");
      return false;
    }
    if (!telegram && postUrl !== (post.postUrl || "")) await mergeCommunityPostMeta(post.id, { postUrl });
    replace({ ...saved, postUrl: postUrl || saved.postUrl });
    toast.success(post.status === "posted" ? "Stats saved." : "Marked as posted.");
    return true;
  };

  const remove = async () => {
    const post = deleteTarget;
    setDeleting(true);
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    const ok = await softDeleteCommunityPost(post.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      setPosts((prev) => [post, ...prev]);
      toast.error("Couldn't delete the post.");
      return;
    }
    toast.success("Post deleted.");
  };

  const appUrl = openInAppUrl(channel);
  const columns = [
    {
      key: "post",
      header: "Post",
      render: (p) => (
        <div className="flex min-w-0 max-w-xl flex-col">
          <span className="truncate text-sm text-foreground">{excerpt(p.body)}</span>
          <span className="truncate text-xs text-text-secondary">
            {[
              p.media.length ? `${p.media.length} file${p.media.length === 1 ? "" : "s"}` : null,
              p.buttons.length ? `${p.buttons.length} button${p.buttons.length === 1 ? "" : "s"}` : null,
              !telegram ? memberName(members, p.assigneeId) : null,
            ]
              .filter(Boolean)
              .join(" · ") || (telegram ? "Text post" : "No assignee")}
          </span>
          {p.status === "failed" && p.error ? <span className="mt-0.5 text-xs text-red-600 dark:text-red-400">{p.error}</span> : null}
        </div>
      ),
    },
    { key: "status", header: "Status", render: (p) => <StatusPill status={p.status} map={POST_STATUS_MAP} /> },
    {
      key: "when",
      header: "When",
      className: "whitespace-nowrap text-sm text-text-secondary tabular-nums",
      render: (p) => (p.status === "posted" ? formatDateTime(p.postedAt) : p.scheduledAt ? formatDateTime(p.scheduledAt) : "—"),
    },
    {
      key: "views",
      header: "Views",
      align: "right",
      className: "tabular-nums text-sm text-foreground",
      render: (p) => (p.status === "posted" ? (p.views ? formatNumber(p.views) : "—") : ""),
    },
    {
      key: "reactions",
      header: "Reactions",
      align: "right",
      className: "tabular-nums text-sm text-foreground",
      render: (p) => (p.status === "posted" ? (p.reactions ? formatNumber(p.reactions) : "—") : ""),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <ActionMenu
          label="Post actions"
          items={[
            canEdit && p.status !== "posted" && { label: "Edit", icon: Pencil, onSelect: () => setComposer({ post: p }) },
            canEdit && telegram && p.status !== "posted" && {
              label: p.status === "failed" ? "Retry now" : "Post now",
              icon: p.status === "failed" ? RotateCcw : Send,
              spin: publishing === p.id,
              disabled: publishing === p.id,
              onSelect: () => publishNow(p),
            },
            canEdit && !telegram && p.status !== "posted" && { label: "Mark as posted", icon: CheckCircle2, onSelect: () => setPostedTarget(p) },
            canEdit && p.status === "posted" && { label: telegram ? "Enter views" : "Update stats", icon: Eye, onSelect: () => setPostedTarget(p) },
            { label: "Copy text", icon: Copy, onSelect: () => copyText(p.body, "Post text copied.") },
            p.postUrl && { label: "Open post", icon: ExternalLink, href: p.postUrl },
            !p.postUrl && appUrl && { label: `Open ${platform.appLabel}`, icon: ExternalLink, href: appUrl },
            canEdit && { label: "Duplicate", icon: CopyPlus, onSelect: () => duplicate(p) },
            canEdit && { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(p) },
          ]}
        />
      ),
    },
  ];

  const postedCount = posts.filter((p) => p.status === "posted").length;
  const totalViews = posts.reduce((s, p) => s + (p.status === "posted" ? p.views : 0), 0);
  const totalReactions = posts.reduce((s, p) => s + (p.status === "posted" ? p.reactions : 0), 0);

  return (
    <div className="space-y-5">
      <ReadyToPost
        posts={ready}
        channel={channel}
        members={members}
        canEdit={canEdit}
        onCopy={(p) => copyText(p.body, "Post text copied — paste it into the channel.")}
        onMarkPosted={setPostedTarget}
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={POST_STATUS_FILTER_OPTIONS} height="h-9" />
          <span className="hidden items-center gap-3 pl-2 text-xs text-text-tertiary tabular-nums sm:inline-flex">
            <span className="inline-flex items-center gap-1">
              <Send className="h-3 w-3" aria-hidden="true" /> {formatNumber(postedCount)} posted
            </span>
            {totalViews ? (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" aria-hidden="true" /> {formatNumber(totalViews)} views
              </span>
            ) : null}
            {totalReactions ? (
              <span className="inline-flex items-center gap-1">
                <SmilePlus className="h-3 w-3" aria-hidden="true" /> {formatNumber(totalReactions)}
              </span>
            ) : null}
          </span>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search posts…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(p) => p.id}
        onRowClick={canEdit ? (p) => (p.status === "posted" ? setPostedTarget(p) : setComposer({ post: p })) : undefined}
        empty={
          <ListEmptyState
            icon={MousePointerClick}
            filtersActive={filtersActive}
            title="No posts yet"
            description={telegram ? "Write the first post — publish it now or schedule it, and the bot posts it on time." : "Plan the first update. Whoever you assign gets a reminder with the copy when it's due."}
            onClear={() => {
              setQuery("");
              setStatusFilter("all");
            }}
            action={
              canEdit ? (
                <Button className={PRIMARY_BUTTON} onClick={() => setComposer({ post: null })}>
                  <Plus className="h-4 w-4" /> New post
                </Button>
              ) : null
            }
          />
        }
      />
      <ListPagination {...pager} itemLabel="posts" />

      {composer ? (
        <PostComposerDialog
          key={composer.post?.id || "new"}
          open
          onOpenChange={(o) => !o && setComposer(null)}
          channel={channel}
          post={composer.post}
          members={members}
          projectId={projectId}
          onSubmit={submit}
        />
      ) : null}
      {postedTarget ? (
        <PostedDialog key={postedTarget.id} post={postedTarget} telegram={telegram} onCancel={() => setPostedTarget(null)} onSave={saveStats} />
      ) : null}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete post"
        description={
          deleteTarget?.status === "posted"
            ? `This removes it from Geiger's history only — it stays live in ${platform.appLabel}.`
            : "The post and its schedule are removed. This can't be undone."
        }
        pending={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
