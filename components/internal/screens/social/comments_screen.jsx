"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CornerDownRight, Eye, EyeOff, Inbox, Loader2, MessagesSquare, Reply, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  ActionMenu,
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  ScreenHeader,
  SearchInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatsBar,
  StatusPill,
  Textarea,
  Toolbar,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { listCommentThreads } from "@/lib/supabase/social_comments";
import { networkForChannel, networkLabel } from "@/lib/social/networks";
import { ConnectAccountsNotice, LoadingPanel, NetworkIcon, useNow, useSocialAccounts } from "./social_kit";
import { COMMENT_STATE_MAP, NETWORK_FILTER_OPTIONS, OUTLINE_BUTTON, excerpt, formatDateTime, formatNumber, formatRelative } from "./constants";

// Mirrors lib/social/comment_actions SUPPORTED_ACTIONS (server-only file): what each network's API allows.
const SUPPORTED = {
  instagram: ["hide", "unhide", "delete", "reply"],
  facebook: ["hide", "unhide", "delete", "reply"],
  telegram: ["delete", "reply"],
};
const REPLY_LIMIT = { instagram: 2200, facebook: 8000, telegram: 4096 };

const VIEWS = [
  { value: "reply", label: "Needs reply" },
  { value: "flagged", label: "Flagged" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All" },
];

const DONE_LABEL = { hide: "Hidden", unhide: "Unhidden", delete: "Deleted", reply: "Reply posted" };
const can = (network, action) => Boolean(SUPPORTED[network]?.includes(action));

// Inbound comments (one row each) with their thread, replies and visible moderation state.
function buildComments(conversations, messages) {
  const byThread = new Map(conversations.map((c) => [c.id, { thread: c, messages: [] }]));
  for (const m of messages) byThread.get(m.conversationId)?.messages.push(m);
  const rows = [];
  for (const { thread, messages: list } of byThread.values()) {
    const network = networkForChannel(thread.channel) || thread.channel;
    for (const m of list) {
      if (m.direction !== "inbound" || !m.externalId) continue;
      const replies = list.filter((r) => r.direction === "outbound" && (r.replyTo === m.externalId || new Date(r.sentAt) > new Date(m.sentAt)));
      rows.push({
        id: m.id,
        message: m,
        thread,
        network,
        author: m.senderName || m.senderHandle || thread.title || "Someone",
        handle: m.senderHandle || "",
        text: m.body,
        sentAt: m.sentAt,
        state: m.moderation?.state || "visible",
        moderationSource: m.moderation?.source || null,
        reason: m.moderation?.reason || "",
        isAd: Boolean(thread.isAd || m.adId),
        postId: m.postId || thread.postId || null,
        replies,
      });
    }
  }
  return rows.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
}

function ReplyDialog({ target, onOpenChange, onSend }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const limit = REPLY_LIMIT[target?.network] || 2200;
  const submit = async () => {
    if (!text.trim()) return toast.error("Write a reply first.");
    setPending(true);
    const ok = await onSend(target, text.trim());
    setPending(false);
    if (ok) {
      setText("");
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reply to {target?.author}</DialogTitle>
          <DialogDescription>
            Posted publicly under the comment on {networkLabel(target?.network)}. Everyone who can see the post sees the reply.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <blockquote className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-secondary">{excerpt(target?.text, 280)}</blockquote>
          <Field label="Reply" htmlFor="comment-reply" hint={`${text.length.toLocaleString("en-US")} / ${limit.toLocaleString("en-US")}`}>
            <Textarea id="comment-reply" rows={4} maxLength={limit} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="Thanks for asking — " />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !text.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Reply className="h-4 w-4" />} Post reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThreadSheet({ comment, accountName, onClose, onAction, onReply, busy, canModerate, canReply, onOpenInbox }) {
  return (
    <Sheet open={!!comment} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-border bg-background sm:max-w-lg">
        {comment ? (
          <>
            <SheetHeader>
              <SheetTitle>{comment.author}</SheetTitle>
              <SheetDescription>
                {networkLabel(comment.network)} · {accountName || "Disconnected account"}
                {comment.isAd ? " · on an ad" : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={comment.state} map={COMMENT_STATE_MAP} />
                {comment.moderationSource === "auto" ? <Badge variant="outline">By a moderation rule</Badge> : null}
                <span className="text-xs text-text-tertiary">{formatDateTime(comment.sentAt)}</span>
              </div>
              <div className="rounded-xl border border-border bg-surface-subtle p-3">
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{comment.text || <span className="text-text-tertiary">No text</span>}</p>
                {comment.reason ? <p className="mt-2 text-xs text-text-secondary">{comment.reason}</p> : null}
              </div>
              {comment.replies.length ? (
                <ol className="space-y-2">
                  {comment.replies.map((r) => (
                    <li key={r.id} className="flex gap-2 rounded-lg border border-border bg-surface-card px-3 py-2 text-sm">
                      <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="whitespace-pre-wrap break-words text-foreground">{r.body}</p>
                        <p className="mt-0.5 text-xs text-text-tertiary">{r.senderType === "bot" ? "Automation" : "Your team"} · {formatRelative(r.sentAt)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-text-secondary">No reply yet.</p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {canReply && can(comment.network, "reply") && comment.state !== "deleted" ? (
                  <Button onClick={() => onReply(comment)} disabled={Boolean(busy)}>
                    <Reply className="h-4 w-4" /> Reply
                  </Button>
                ) : null}
                {canModerate && can(comment.network, "hide") && comment.state !== "deleted" ? (
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onAction(comment.state === "hidden" ? "unhide" : "hide", [comment])} disabled={Boolean(busy)}>
                    {busy === `${comment.state === "hidden" ? "unhide" : "hide"}-${comment.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : comment.state === "hidden" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    {comment.state === "hidden" ? "Unhide" : "Hide"}
                  </Button>
                ) : null}
                {canModerate && can(comment.network, "delete") && comment.state !== "deleted" ? (
                  <Button variant="outline" className="border-border bg-transparent text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400" onClick={() => onAction("delete", [comment])} disabled={Boolean(busy)}>
                    {busy === `delete-${comment.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
                  </Button>
                ) : null}
                <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={() => onOpenInbox(comment)}>
                  <Inbox className="h-4 w-4" /> Open in inbox
                </Button>
              </div>
              {comment.network === "telegram" ? (
                <p className="text-xs text-text-tertiary">Telegram&apos;s Bot API can delete or reply to a message but can&apos;t hide it.</p>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function CommentsScreen() {
  const { projectId } = useProject();
  const { can: allowed } = useRbac();
  const canModerate = allowed("campaign.social.edit");
  const canReply = allowed("campaign.inbox.reply");
  const { recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();
  const { accounts, loading: accountsLoading } = useSocialAccounts(projectId);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("reply");
  const [network, setNetwork] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [replyTarget, setReplyTarget] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(null);
  const now = useNow();

  const load = async () => {
    const res = await listCommentThreads(projectId);
    if (res === null) toast.error("Couldn't load comments.");
    setComments(res ? buildComments(res.conversations, res.messages) : []);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    listCommentThreads(projectId).then((res) => {
      if (!alive) return;
      if (res === null) toast.error("Couldn't load comments.");
      setComments(res ? buildComments(res.conversations, res.messages) : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  const stats = useMemo(() => {
    const week = now - 7 * 86_400_000;
    const recent = comments.filter((c) => new Date(c.sentAt).getTime() >= week);
    return [
      { label: "Comments · 7 days", value: formatNumber(recent.length) },
      { label: "Needs reply", value: formatNumber(comments.filter((c) => !c.replies.length && ["visible", "flagged"].includes(c.state)).length) },
      { label: "Flagged", value: formatNumber(comments.filter((c) => c.state === "flagged").length) },
      { label: "Hidden or deleted by rules", value: formatNumber(recent.filter((c) => c.moderationSource === "auto" && ["hidden", "deleted"].includes(c.state)).length) },
    ];
  }, [comments, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comments.filter((c) => {
      if (view === "reply" && (c.replies.length || !["visible", "flagged"].includes(c.state))) return false;
      if (view === "flagged" && c.state !== "flagged") return false;
      if (view === "hidden" && !["hidden", "deleted"].includes(c.state)) return false;
      if (network !== "all" && c.network !== network) return false;
      if (q && !`${c.author} ${c.handle} ${c.text}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [comments, view, network, query]);

  const pager = usePagination(filtered, { resetKey: `${view}|${network}|${query}` });
  const pageIds = pager.pageItems.map((c) => c.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedRows = comments.filter((c) => selected.has(c.id));

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // Optimistic state change, then the platform call; failures roll back to the server's view.
  const runAction = async (action, rows, replyText = "") => {
    const eligible = rows.filter((r) => can(r.network, action));
    if (!eligible.length) {
      toast.error(`${networkLabel(rows[0]?.network)} doesn't support that through its API.`);
      return false;
    }
    const state = { hide: "hidden", unhide: "visible", delete: "deleted", reply: null }[action];
    const ids = new Set(eligible.map((r) => r.id));
    setBusy(eligible.length === 1 ? `${action}-${eligible[0].id}` : action);
    if (state) setComments((list) => list.map((c) => (ids.has(c.id) ? { ...c, state, moderationSource: "manual" } : c)));
    const res = await apiPost(`/api/projects/${projectId}/social/moderation/actions`, {
      action,
      items: eligible.map((r) => ({ messageId: r.id })),
      replyText,
    });
    setBusy(null);
    setSelected(new Set());
    if (!res.ok) {
      await load();
      toast.error(res.error || "Couldn't reach the network.");
      return false;
    }
    const { done = 0, failed = 0, results = [] } = res.data || {};
    if (failed || action === "reply") await load();
    if (failed) toast.error(`${failed} failed: ${results.find((r) => !r.ok)?.error || "the network refused it"}`);
    if (done) toast.success(eligible.length > 1 ? `${DONE_LABEL[action]}: ${done}` : DONE_LABEL[action]);
    if (eligible.length < rows.length) toast.warning(`${rows.length - eligible.length} skipped — their network doesn't support “${action}”.`);
    return done > 0;
  };

  const open = comments.find((c) => c.thread.id === recordId || c.id === recordId) || null;
  const noAccounts = !accountsLoading && !accounts.length;
  const filtersActive = Boolean(query) || network !== "all";

  const columns = [
    {
      key: "select",
      header: (
        <Checkbox
          aria-label="Select all on this page"
          checked={allOnPage}
          onCheckedChange={(v) => setSelected((s) => {
            const next = new Set(s);
            for (const id of pageIds) v ? next.add(id) : next.delete(id);
            return next;
          })}
        />
      ),
      className: "w-10",
      render: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox aria-label={`Select comment from ${c.author}`} checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
        </div>
      ),
    },
    {
      key: "comment",
      header: "Comment",
      className: "max-w-xl whitespace-normal",
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {c.author}
            {c.handle && c.handle !== c.author ? <span className="ml-1.5 font-normal text-text-tertiary">@{c.handle.replace(/^@/, "")}</span> : null}
          </p>
          <p className={cn("line-clamp-2 text-sm", c.state === "deleted" ? "text-text-tertiary line-through" : "text-text-secondary")}>{c.text || "No text"}</p>
        </div>
      ),
    },
    {
      key: "account",
      header: "Account",
      render: (c) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-text-secondary">
          <NetworkIcon network={c.network} className="h-3.5 w-3.5" />
          {accountName.get(c.thread.connectionId) || networkLabel(c.network)}
          {c.isAd ? <Badge variant="outline">Ad</Badge> : null}
        </span>
      ),
    },
    { key: "state", header: "State", render: (c) => <StatusPill status={c.state} map={COMMENT_STATE_MAP} /> },
    { key: "replies", header: "Replies", align: "right", className: "tabular-nums", render: (c) => formatNumber(c.replies.length) },
    { key: "when", header: "Received", className: "whitespace-nowrap text-sm text-text-secondary", render: (c) => formatRelative(c.sentAt, now) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for comment from ${c.author}`}
          items={[
            canReply && can(c.network, "reply") && c.state !== "deleted" && { label: "Reply", icon: Reply, onSelect: () => setReplyTarget(c) },
            canModerate && can(c.network, "hide") && c.state === "hidden" && { label: "Unhide", icon: Eye, onSelect: () => runAction("unhide", [c]) },
            canModerate && can(c.network, "hide") && !["hidden", "deleted"].includes(c.state) && { label: "Hide", icon: EyeOff, onSelect: () => runAction("hide", [c]) },
            { label: "Open in inbox", icon: Inbox, onSelect: () => openRecordInTab(c.thread.id, "Comment Inbox") },
            { separator: true },
            canModerate && can(c.network, "delete") && c.state !== "deleted" && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirmDelete([c]) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Comments"
        description="Comments on your posts and ads across connected accounts. Hide, delete or reply through each network's API."
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={view} onValueChange={setView} options={VIEWS} height="h-9" />
          <FilterDropdown value={network} onValueChange={setNetwork} options={NETWORK_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search comments…" />
      </Toolbar>

      {selectedRows.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3 py-2">
          <span className="text-sm text-foreground tabular-nums">{selectedRows.length} selected</span>
          {canModerate ? (
            <>
              <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => runAction("hide", selectedRows)} disabled={Boolean(busy)}>
                {busy === "hide" ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />} Hide
              </Button>
              <Button size="sm" variant="outline" className="border-border bg-transparent text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400" onClick={() => setConfirmDelete(selectedRows)} disabled={Boolean(busy)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      ) : null}

      {loading ? (
        <LoadingPanel label="Loading comments" />
      ) : noAccounts && !comments.length ? (
        <ConnectAccountsNotice description="Comments arrive through the Instagram, Facebook Page and Telegram webhooks once an account is connected in Social Accounts." />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecord(c.thread.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={MessagesSquare}
                  title={filtersActive ? "No matches" : comments.length ? "Nothing in this view" : "No comments yet"}
                  description={
                    filtersActive
                      ? "Try a different search or network."
                      : comments.length
                        ? view === "reply"
                          ? "Every visible comment has a reply."
                          : "Switch views to see other comments."
                        : "New comments on your posts and ads show up here as the networks deliver them."
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => { setQuery(""); setNetwork("all"); }}>
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="comments" />
        </div>
      )}

      <ThreadSheet
        comment={open}
        accountName={open ? accountName.get(open.thread.connectionId) : ""}
        busy={busy}
        canModerate={canModerate}
        canReply={canReply}
        onClose={closeRecord}
        onReply={setReplyTarget}
        onAction={(action, rows) => (action === "delete" ? setConfirmDelete(rows) : runAction(action, rows))}
        onOpenInbox={(c) => openRecordInTab(c.thread.id, "Comment Inbox")}
      />
      <ReplyDialog target={replyTarget} onOpenChange={(o) => !o && setReplyTarget(null)} onSend={(c, text) => runAction("reply", [c], text)} />
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.length === 1 ? "comment" : `${confirmDelete?.length} comments`}</DialogTitle>
            <DialogDescription>Deleting removes the comment from the network for everyone. It can&apos;t be undone — hide it instead if you might want it back.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              className="bg-red-500/90 text-white hover:bg-red-500"
              onClick={() => {
                const rows = confirmDelete;
                setConfirmDelete(null);
                runAction("delete", rows);
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default CommentsScreen;
