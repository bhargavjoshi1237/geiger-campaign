"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, CheckCircle2, ListChecks, Loader2, MessagesSquare, Tag, Trash2, X, Zap } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  LogoLoading,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScreenHeader,
  SearchInput,
  StatsBar,
  Toolbar,
  cn,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { composerState } from "@/lib/inbox/composer";
import { slaState } from "@/lib/inbox/sla";
import { formatDuration, formatListTime } from "@/lib/inbox/format";
import {
  addNote,
  addSystemEvent,
  normalizeConversation,
  normalizeMessage,
  updateConversation,
} from "@/lib/supabase/conversations";
import { useInboxData, useNow, useThread } from "./inbox_hooks";
import { Avatar, MessageList, SlaChip, ThreadHeader, WindowStrip } from "./inbox_thread";
import { Composer } from "./inbox_composer";
import { ContactPanel } from "./inbox_contact_panel";
import { SavedRepliesDialog } from "./saved_replies_manager";
import { CHANNELS, PRIORITY_OPTIONS, STATUS_TABS, channelMeta, conversationName } from "./constants";

// The inbox kit: one workspace (filters, thread list, thread pane, contact panel, bulk actions) that every
// channel screen configures — Conversations (all), SMS, WhatsApp, Instagram DM, Messenger, Comment Inbox —
// plus the thread pane and conversation actions Live Chat and Assignments reuse.

export { useInboxData, useNow } from "./inbox_hooks";
export { ContactPanel } from "./inbox_contact_panel";
export { Avatar, SlaChip } from "./inbox_thread";

const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const MENU = "border-border bg-surface-subtle text-foreground";
const ITEM = "cursor-pointer text-sm focus:bg-surface-hover focus:text-foreground";
const REVERT_KEYS = ["status", "priority", "assigneeId", "handledBy", "tags", "snoozedUntil", "resolvedAt", "slaDueAt", "unreadCount"];

// Triage actions on one conversation, optimistic + persisted + toasted. Shared by every inbox surface.
export function useConversationActions({ projectId, me, membersById, patchLocal, replaceLocal, refresh }) {
  const { openRecordInTab } = useWorkspaceUrl();

  const update = useCallback(
    async (conversation, patch, success) => {
      const before = Object.fromEntries(REVERT_KEYS.filter((k) => k in patch).map((k) => [k, conversation[k]]));
      patchLocal(conversation.id, patch);
      const row = await updateConversation(conversation.id, patch);
      if (!row) {
        patchLocal(conversation.id, before);
        toast.error("Couldn't update the conversation.");
        return false;
      }
      replaceLocal(row);
      if (success) toast.success(success);
      return true;
    },
    [patchLocal, replaceLocal],
  );

  return useCallback(
    async (conversation, type, value) => {
      if (!conversation) return false;
      const memberName = (id) => membersById.get(id)?.name || membersById.get(id)?.email || "teammate";
      switch (type) {
        case "assign": {
          const before = conversation.assigneeId;
          patchLocal(conversation.id, { assigneeId: value });
          const res = await apiPost(`/api/projects/${projectId}/inbox/assign`, { conversationIds: [conversation.id], mode: "manual", assigneeId: value });
          if (!res.ok) {
            patchLocal(conversation.id, { assigneeId: before });
            toast.error(res.error);
            return false;
          }
          toast.success(value ? (value === me?.id ? "Assigned to you." : `Assigned to ${memberName(value)}.`) : "Unassigned.");
          return true;
        }
        case "auto_assign": {
          const res = await apiPost(`/api/projects/${projectId}/inbox/assign`, { conversationIds: [conversation.id], mode: "auto", force: true });
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          const hit = res.data?.assigned?.[0];
          if (hit) {
            patchLocal(conversation.id, { assigneeId: hit.assigneeId });
            toast.success(`Routed to ${memberName(hit.assigneeId)} by “${hit.ruleName}”.`);
          } else {
            toast.error(res.data?.skipped?.[0]?.reason || "No routing rule matched.");
          }
          refresh?.();
          return Boolean(hit);
        }
        case "priority":
          return update(conversation, { priority: value }, `Priority set to ${value}.`);
        case "snooze":
          return update(conversation, { status: "snoozed", snoozedUntil: value }, "Snoozed.");
        case "resolve":
          return update(conversation, { status: "resolved", resolvedAt: new Date().toISOString(), slaDueAt: null, snoozedUntil: null, unreadCount: 0 }, "Conversation resolved.");
        case "reopen":
          return update(conversation, { status: "open", resolvedAt: null, snoozedUntil: null }, "Conversation reopened.");
        case "tags":
          return update(conversation, { tags: value });
        case "mark_read":
          return update(conversation, { unreadCount: 0 });
        case "mark_unread":
          return update(conversation, { unreadCount: Math.max(1, conversation.unreadCount) }, "Marked as unread.");
        case "handled_by": {
          const ok = await update(conversation, { handledBy: value }, value === "human" ? "You took over from the bot." : "Handed back to the bot.");
          if (ok) {
            await addSystemEvent(projectId, conversation.id, {
              body: value === "human" ? "Took over from the bot" : "Handed back to the bot",
              senderId: me?.id ?? null,
              event: "handover",
            });
          }
          return ok;
        }
        case "open_contact":
          if (conversation.contactId) openRecordInTab(conversation.contactId, "Contacts");
          return true;
        default:
          return false;
      }
    },
    [projectId, me, membersById, patchLocal, refresh, update, openRecordInTab],
  );
}

const MENTION = /@([\p{L}][\p{L}'-]*)/gu;

// Thread pane: header, window strip, messages, composer — with replies through the reply route.
export function ThreadPane({
  projectId,
  conversation,
  contact,
  members,
  membersById,
  me,
  savedReplies,
  now,
  canReply,
  onAction,
  onConversation,
  onPreview,
  onBack,
  onManageReplies,
  header = true,
  className,
}) {
  const name = conversationName(conversation, contact);
  const { messages, loading, setMessages } = useThread(projectId, conversation.id);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const unread = conversation.unreadCount;
  const markedRef = useRef("");

  // Reading a thread clears its unread count — once per (thread, count) so a failed write never loops.
  useEffect(() => {
    const key = `${conversation.id}:${unread}`;
    if (unread > 0 && canReply && markedRef.current !== key) {
      markedRef.current = key;
      onAction(conversation, "mark_read");
    }
  }, [conversation, unread, canReply, onAction]);

  const sendReply = async (input) => {
    const id = crypto.randomUUID();
    const optimistic = {
      id,
      conversationId: conversation.id,
      direction: "outbound",
      senderType: "agent",
      senderId: me?.id ?? null,
      body: input.templateId ? "Sending template…" : input.body,
      attachments: input.attachments || [],
      status: "queued",
      sentAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    const res = await apiPost(`/api/projects/${projectId}/inbox/conversations/${conversation.id}/reply`, { ...input, clientMessageId: id });
    if (!res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast.error(res.error);
      return false;
    }
    const saved = normalizeMessage(res.data.message);
    setMessages((prev) => prev.map((m) => (m.id === id ? saved : m)));
    if (res.data.conversation) onConversation?.(normalizeConversation(res.data.conversation));
    onPreview?.(saved);
    if (saved.status === "failed") toast.error(saved.error || "The message wasn't sent.");
    return true;
  };

  const sendNote = async (body) => {
    const mentions = [...body.matchAll(MENTION)]
      .map(([, first]) => members.find((m) => String(m.name || "").split(/\s+/)[0].toLowerCase() === first.toLowerCase())?.userId)
      .filter(Boolean);
    const id = crypto.randomUUID();
    const optimistic = { id, conversationId: conversation.id, direction: "note", senderType: "agent", senderId: me?.id ?? null, body, attachments: [], status: "sent", sentAt: new Date().toISOString(), pending: true };
    setMessages((prev) => [...prev, optimistic]);
    const saved = await addNote(projectId, conversation.id, { id, body, senderId: me?.id ?? null, mentions });
    if (!saved) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast.error("Couldn't add the note.");
      return false;
    }
    setMessages((prev) => prev.map((m) => (m.id === id ? saved : m)));
    return true;
  };

  const runComment = async (action, body, target) => {
    const id = crypto.randomUUID();
    if (action === "reply" || action === "private_reply") {
      setMessages((prev) => [
        ...prev,
        { id, conversationId: conversation.id, direction: "outbound", senderType: "agent", senderId: me?.id ?? null, body, attachments: [], status: "queued", sentAt: new Date().toISOString(), kind: action === "reply" ? "public_reply" : "private_reply", pending: true },
      ]);
    }
    const res = await apiPost(`/api/projects/${projectId}/inbox/conversations/${conversation.id}/comment`, { action, body, commentId: target?.externalId || undefined });
    if (!res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast.error(res.error);
      return false;
    }
    if (res.data.message) {
      const saved = normalizeMessage(res.data.message);
      setMessages((prev) => prev.map((m) => (m.id === id ? saved : m)));
      onPreview?.(saved);
    }
    if (target && (action === "hide" || action === "unhide" || action === "delete")) {
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, ...(action === "delete" ? { deletedAt: new Date().toISOString() } : { hidden: action === "hide" }) } : m)));
    }
    if (res.data.conversation) onConversation?.(normalizeConversation(res.data.conversation));
    toast.success(
      { reply: "Reply posted publicly.", private_reply: "Private reply sent.", hide: "Comment hidden.", unhide: "Comment visible again.", delete: "Comment deleted." }[action],
    );
    return true;
  };

  const commentAction = (action, message) => {
    if (action === "delete") setConfirmDelete(message);
    else runComment(action, "", message);
  };

  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-subtle", className)} aria-label={`Conversation with ${name}`}>
      {header ? (
        <ThreadHeader
          conversation={conversation}
          contact={contact}
          name={name}
          members={members}
          me={me}
          now={now}
          canReply={canReply}
          onBack={onBack}
          onAction={(type, value) => onAction(conversation, type, value)}
        />
      ) : null}
      <WindowStrip conversation={conversation} name={name} now={now} />
      <MessageList
        messages={messages}
        loading={loading}
        conversation={conversation}
        contactName={name}
        membersById={membersById}
        now={now}
        canReply={canReply}
        onRetry={(m) => sendReply({ body: m.body, attachments: m.attachments })}
        onCommentAction={commentAction}
      />
      <Composer
        projectId={projectId}
        conversation={conversation}
        contact={contact}
        name={name}
        me={me}
        savedReplies={savedReplies}
        now={now}
        canReply={canReply}
        onReply={sendReply}
        onNote={sendNote}
        onComment={(action, body) => runComment(action, body)}
        onManageReplies={onManageReplies}
        onTakeOver={() => onAction(conversation, "handled_by", "human")}
      />
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete comment</DialogTitle>
            <DialogDescription>
              This removes the comment from {conversation.channel === "instagram" ? "Instagram" : "Facebook"} for everyone. It can&apos;t be undone — hide it instead if you only want it out of sight.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              className="bg-red-500/90 text-white hover:bg-red-500"
              onClick={() => {
                const target = confirmDelete;
                setConfirmDelete(null);
                runComment("delete", "", target);
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ThreadRow({ conversation, name, preview, assignee, selected, selecting, checked, onToggle, onOpen, now, isMine }) {
  const unread = conversation.unreadCount > 0;
  const win = composerState(conversation, { now });
  const ctx = conversation.context || {};
  const text = preview
    ? `${preview.direction === "outbound" ? (preview.senderType === "bot" ? "Bot: " : "You: ") : ""}${preview.body}`
    : conversation.preview || "No messages yet";
  return (
    <div className={cn("flex items-start gap-2 border-b border-border px-3 py-3 last:border-b-0", selected ? "bg-surface-card" : "hover:bg-surface-hover")}>
      {selecting ? <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Select conversation with ${name}`} className="mt-2.5" /> : null}
      <button type="button" onClick={onOpen} aria-current={selected ? "true" : undefined} className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        <Avatar name={name} channel={conversation.channel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm text-foreground", unread ? "font-semibold" : "font-medium")}>{name}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="text-[11px] text-text-tertiary">{formatListTime(conversation.lastMessageAt || conversation.createdAt, now)}</span>
              {unread ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground" aria-label={`${conversation.unreadCount} unread`}>
                  {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                </span>
              ) : null}
            </span>
          </div>
          <p className={cn("mt-0.5 truncate text-xs", unread ? "text-foreground" : "text-text-secondary")}>{text}</p>
          {conversation.kind === "comment" && (ctx.caption || ctx.isAd) ? (
            <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
              {ctx.isAd ? "Ad · " : "On: "}
              {ctx.adName || ctx.caption || "post"}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <SlaChip conversation={conversation} now={now} />
            {conversation.priority === "urgent" || conversation.priority === "high" ? (
              <Badge variant={conversation.priority === "urgent" ? "danger" : "warning"}>{conversation.priority === "urgent" ? "Urgent" : "High"}</Badge>
            ) : null}
            {conversation.handledBy === "bot" ? (
              <Badge variant="info">
                <Bot aria-hidden="true" /> Bot
              </Badge>
            ) : null}
            {win.mode === "template" || win.mode === "closed" ? <Badge variant="outline">{win.label}</Badge> : null}
            {win.mode === "human_tag" ? <Badge variant="outline">Human agent tag</Badge> : null}
            {conversation.hidden ? <Badge variant="outline">Hidden</Badge> : null}
            <span className="text-[11px] text-text-tertiary">{assignee ? (isMine ? "You" : assignee.name || assignee.email) : "Unassigned"}</span>
          </div>
        </div>
      </button>
    </div>
  );
}

function BulkBar({ count, members, onAction, onClear, busy }) {
  const [tag, setTag] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-card px-3 py-2">
      <span className="mr-1 text-xs font-medium text-foreground">{count} selected</span>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onAction("resolve")} className={cn("h-7 text-xs", OUTLINE)}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={busy} className={cn("h-7 text-xs", OUTLINE)}>Assign</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={cn("w-52", MENU)}>
          <DropdownMenuItem className={ITEM} onSelect={() => onAction("auto_assign")}>Auto-assign by rules</DropdownMenuItem>
          {members.map((m) => (
            <DropdownMenuItem key={m.userId} className={ITEM} onSelect={() => onAction("assign", m.userId)}>{m.name || m.email}</DropdownMenuItem>
          ))}
          <DropdownMenuItem className={ITEM} onSelect={() => onAction("unassign")}>Unassign</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={busy} className={cn("h-7 text-xs", OUTLINE)}>Priority</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={MENU}>
          {PRIORITY_OPTIONS.map((p) => (
            <DropdownMenuItem key={p.value} className={ITEM} onSelect={() => onAction("priority", p.value)}>{p.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={busy} className={cn("h-7 text-xs", OUTLINE)}>
            <Tag className="h-3.5 w-3.5" /> Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 space-y-2 border-border bg-surface-subtle p-3">
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag name" aria-label="Tag name" className="h-8 border-border bg-surface-card text-sm" />
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" disabled={!tag.trim()} onClick={() => onAction("untag", tag)} className="h-7 text-xs">Remove</Button>
            <Button type="button" size="sm" disabled={!tag.trim()} onClick={() => onAction("tag", tag)} className="h-7 bg-primary text-xs text-primary-foreground hover:bg-primary/90">Add tag</Button>
          </div>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onAction("mark_read")} className={cn("h-7 text-xs", OUTLINE)}>Mark read</Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Clear selection" onClick={onClear} className="ml-auto text-muted-foreground hover:bg-surface-active hover:text-foreground">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest activity" },
  { value: "waiting", label: "Waiting longest" },
  { value: "sla", label: "SLA due first" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "Organic & ads" },
  { value: "organic", label: "Organic posts" },
  { value: "ad", label: "Ad comments" },
];

/**
 * A configured inbox screen.
 *   channels   which channels it shows (null = every channel, with a channel filter)
 *   kind       "dm" | "comment" | null — comment inboxes get post context, source + post filters
 */
export function InboxWorkspace({ title, description, channels = null, kind = null, emptyTitle, emptyDescription }) {
  const { projectId } = useProject();
  const canReply = useCan("campaign.inbox.reply");
  const { recordId, openRecord, openRecordInTab, closeRecord } = useWorkspaceUrl();
  const now = useNow(30_000);
  const data = useInboxData({ projectId, channels, kind });
  const { conversations, contactsById, members, membersById, me, messageIndex } = data;
  const act = useConversationActions({ projectId, me, membersById, patchLocal: data.patchLocal, replaceLocal: data.replaceLocal, refresh: data.refresh });

  const [status, setStatus] = useState("open");
  const [channel, setChannel] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [tag, setTag] = useState("all");
  const [source, setSource] = useState("all");
  const [post, setPost] = useState("all");
  const [sort, setSort] = useState("newest");
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);

  const isComment = kind === "comment";
  const multiChannel = !channels || channels.length > 1;

  const scoped = useMemo(() => conversations.filter((c) => (isComment ? c.kind === "comment" : kind === "dm" ? c.kind !== "comment" : true)), [conversations, isComment, kind]);

  const tagOptions = useMemo(() => {
    const tags = [...new Set(scoped.flatMap((c) => c.tags))].sort();
    return [{ value: "all", label: "All tags" }, ...tags.map((t) => ({ value: t, label: t }))];
  }, [scoped]);
  const channelOptions = useMemo(() => {
    const present = [...new Set(scoped.map((c) => c.channel))];
    return [{ value: "all", label: "All channels" }, ...present.map((c) => ({ value: c, label: channelMeta(c).label }))];
  }, [scoped]);
  const assigneeOptions = useMemo(
    () => [
      { value: "all", label: "Everyone" },
      { value: "mine", label: "Assigned to me" },
      { value: "unassigned", label: "Unassigned" },
      ...members.filter((m) => m.userId !== me?.id).map((m) => ({ value: m.userId, label: m.name || m.email })),
    ],
    [members, me],
  );
  const postOptions = useMemo(() => {
    if (!isComment) return [];
    const posts = new Map();
    for (const c of scoped) {
      const ctx = c.context || {};
      if (ctx.postId && !posts.has(ctx.postId)) posts.set(ctx.postId, (ctx.adName || ctx.caption || "Post").slice(0, 48));
    }
    return [{ value: "all", label: "All posts" }, ...[...posts].map(([value, label]) => ({ value, label }))];
  }, [scoped, isComment]);

  // Everything but the status tab, so the tab counts reflect the other filters.
  const filteredAnyStatus = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((c) => {
      if (channel !== "all" && c.channel !== channel) return false;
      if (assignee === "mine" && c.assigneeId !== me?.id) return false;
      if (assignee === "unassigned" && c.assigneeId) return false;
      if (!["all", "mine", "unassigned"].includes(assignee) && c.assigneeId !== assignee) return false;
      if (tag !== "all" && !c.tags.includes(tag)) return false;
      if (isComment && source !== "all" && Boolean(c.context?.isAd) !== (source === "ad")) return false;
      if (isComment && post !== "all" && c.context?.postId !== post) return false;
      if (q) {
        const contact = contactsById.get(c.contactId);
        const hay = `${conversationName(c, contact)} ${contact?.email || ""} ${contact?.phone || ""} ${c.title} ${c.tags.join(" ")} ${c.context?.caption || ""} ${messageIndex.get(c.id)?.text || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scoped, channel, assignee, tag, source, post, query, isComment, me, contactsById, messageIndex]);

  const visible = useMemo(() => {
    const rows = filteredAnyStatus.filter((c) => status === "all" || c.status === status);
    const at = (c) => c.lastMessageAt || c.createdAt || "";
    if (sort === "waiting") return [...rows].sort((a, b) => String(a.lastInboundAt || at(a)).localeCompare(String(b.lastInboundAt || at(b))));
    if (sort === "sla") {
      const due = (c) => slaState(c, now).dueAt || "9999";
      return [...rows].sort((a, b) => String(due(a)).localeCompare(String(due(b))));
    }
    return [...rows].sort((a, b) => String(at(b)).localeCompare(String(at(a))));
  }, [filteredAnyStatus, status, sort, now]);

  const statusOptions = useMemo(
    () =>
      STATUS_TABS.map((t) => {
        const n = t.value === "all" ? filteredAnyStatus.length : filteredAnyStatus.filter((c) => c.status === t.value).length;
        return { value: t.value, label: n ? `${t.label} ${n}` : t.label };
      }),
    [filteredAnyStatus],
  );

  const stats = useMemo(() => {
    const active = scoped.filter((c) => c.status === "open" || c.status === "pending");
    const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
    const answered = scoped.filter((c) => c.firstResponseAt && (c.createdAt || "") >= weekAgo);
    const avg = answered.length
      ? answered.reduce((sum, c) => sum + Math.max(0, new Date(c.firstResponseAt) - new Date(c.createdAt)), 0) / answered.length
      : null;
    return [
      { label: "Open", value: active.length.toLocaleString("en-US"), footer: `${scoped.filter((c) => c.unreadCount > 0).length} unread` },
      { label: "Unassigned", value: active.filter((c) => !c.assigneeId).length.toLocaleString("en-US") },
      { label: "SLA overdue", value: active.filter((c) => slaState(c, now).state === "overdue").length.toLocaleString("en-US") },
      { label: "Avg first reply · 7d", value: avg == null ? "—" : formatDuration(avg) },
    ];
  }, [scoped, now]);

  const open = conversations.find((c) => c.id === recordId) || null;
  const filtersActive = query || channel !== "all" || assignee !== "all" || tag !== "all" || source !== "all" || post !== "all";
  const clearFilters = () => {
    setQuery("");
    setChannel("all");
    setAssignee("all");
    setTag("all");
    setSource("all");
    setPost("all");
  };

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allChecked = visible.length > 0 && visible.every((c) => selected.has(c.id));

  const runBulk = async (action, value) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    const res =
      action === "auto_assign"
        ? await apiPost(`/api/projects/${projectId}/inbox/assign`, { conversationIds: ids, mode: "auto" })
        : await apiPost(`/api/projects/${projectId}/inbox/bulk`, { conversationIds: ids, action, value });
    setBulkBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (action === "auto_assign") {
      const assigned = res.data?.assigned?.length || 0;
      toast.success(assigned ? `Routed ${assigned} of ${ids.length} conversation${ids.length === 1 ? "" : "s"}.` : res.data?.skipped?.[0]?.reason || "Nothing to route.");
    } else {
      toast.success(`Updated ${ids.length} conversation${ids.length === 1 ? "" : "s"}.`);
    }
    setSelected(new Set());
    setSelecting(false);
    data.refresh();
  };

  const listPane = (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-subtle", open ? "hidden lg:flex" : "flex")}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        {selecting ? (
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox checked={allChecked} onCheckedChange={() => setSelected(allChecked ? new Set() : new Set(visible.map((c) => c.id)))} aria-label="Select all visible conversations" />
            Select all
          </label>
        ) : (
          <span className="text-xs font-medium text-text-secondary">
            {visible.length.toLocaleString("en-US")} conversation{visible.length === 1 ? "" : "s"}
          </span>
        )}
        <div className="flex items-center gap-1">
          <FilterDropdown value={sort} onValueChange={setSort} options={SORT_OPTIONS} height="h-7" />
          {canReply ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelecting((s) => !s);
                setSelected(new Set());
              }}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:bg-surface-active hover:text-foreground"
            >
              <ListChecks className="h-3.5 w-3.5" /> {selecting ? "Done" : "Select"}
            </Button>
          ) : null}
        </div>
      </div>
      {selecting && selected.size ? (
        <BulkBar count={selected.size} members={members} busy={bulkBusy} onAction={runBulk} onClear={() => setSelected(new Set())} />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length ? (
          visible.map((c) => {
            const contact = contactsById.get(c.contactId);
            return (
              <ThreadRow
                key={c.id}
                conversation={c}
                name={conversationName(c, contact)}
                preview={messageIndex.get(c.id)?.preview}
                assignee={membersById.get(c.assigneeId)}
                isMine={Boolean(me?.id) && c.assigneeId === me.id}
                selected={c.id === recordId}
                selecting={selecting}
                checked={selected.has(c.id)}
                onToggle={() => toggle(c.id)}
                onOpen={() => openRecord(c.id)}
                now={now}
              />
            );
          })
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title={filtersActive ? "No matches" : status === "all" ? emptyTitle : `Nothing ${STATUS_TABS.find((t) => t.value === status)?.label.toLowerCase()}`}
            description={filtersActive ? "Try a different search or filter." : status === "all" ? emptyDescription : "Pick another status to see other conversations."}
            action={filtersActive ? <Button variant="outline" className={OUTLINE} onClick={clearFilters}>Clear filters</Button> : null}
          />
        )}
      </div>
    </div>
  );

  const openContact = open ? contactsById.get(open.contactId) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={title}
        description={description}
        actions={
          <Button variant="outline" className={OUTLINE} onClick={() => setRepliesOpen(true)}>
            <Zap className="h-4 w-4" /> Saved replies
          </Button>
        }
      />

      <StatsBar stats={stats} columns={4} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={statusOptions} height="h-9" />
          {multiChannel ? <FilterDropdown value={channel} onValueChange={setChannel} options={channelOptions} height="h-9" /> : null}
          <FilterDropdown value={assignee} onValueChange={setAssignee} options={assigneeOptions} height="h-9" />
          {tagOptions.length > 1 ? <FilterDropdown value={tag} onValueChange={setTag} options={tagOptions} height="h-9" /> : null}
          {isComment ? <FilterDropdown value={source} onValueChange={setSource} options={SOURCE_OPTIONS} height="h-9" /> : null}
          {isComment && postOptions.length > 2 ? <FilterDropdown value={post} onValueChange={setPost} options={postOptions} height="h-9" /> : null}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search people and messages…" />
      </Toolbar>

      {data.loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle py-24">
          <LogoLoading size={56} />
        </div>
      ) : !scoped.length ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={MessagesSquare} title={emptyTitle} description={data.failed ? "Couldn't load conversations — check your connection and refresh." : emptyDescription} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-15rem)] lg:min-h-[560px] lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_300px]">
          {listPane}
          {open ? (
            <ThreadPane
              key={open.id}
              projectId={projectId}
              conversation={open}
              contact={openContact}
              members={members}
              membersById={membersById}
              me={me}
              savedReplies={data.savedReplies}
              now={now}
              canReply={canReply}
              onAction={act}
              onConversation={data.replaceLocal}
              onPreview={data.notePreview}
              onBack={closeRecord}
              onManageReplies={() => setRepliesOpen(true)}
              className="min-h-[560px] lg:min-h-0"
            />
          ) : (
            <div className="hidden min-h-0 items-center justify-center rounded-xl border border-border bg-surface-subtle lg:flex">
              <EmptyState icon={MessagesSquare} title="Select a conversation" description="Pick a thread on the left to read and reply." />
            </div>
          )}
          {open ? (
            <div className="hidden min-h-0 2xl:flex 2xl:flex-col">
              <ContactPanel
                projectId={projectId}
                conversation={open}
                contact={openContact}
                name={conversationName(open, openContact)}
                now={now}
                onOpenContact={() => act(open, "open_contact")}
                onOpenConversation={(t) => (scoped.some((c) => c.id === t.id) ? openRecord(t.id) : openRecordInTab(t.id, "Conversations"))}
              />
            </div>
          ) : (
            <div className="hidden 2xl:block" />
          )}
        </div>
      )}

      {repliesOpen ? (
        <SavedRepliesDialog
          open
          onOpenChange={setRepliesOpen}
          projectId={projectId}
          replies={data.savedReplies}
          setReplies={data.setSavedReplies}
          canEdit={canReply}
          now={now}
        />
      ) : null}
    </MainScreenWrapper>
  );
}

export { CHANNELS };
