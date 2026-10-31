"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Hand,
  Lock,
  MessageSquareLock,
  RotateCcw,
  StickyNote,
  Tag,
  Timer,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  ActionMenu,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  LogoLoading,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatusPill,
  cn,
} from "@geiger/ui";
import { composerState } from "@/lib/inbox/composer";
import { slaState } from "@/lib/inbox/sla";
import { formatClock, formatDateTime, formatDayLabel, formatRelative } from "@/lib/inbox/format";
import {
  CONVERSATION_STATUS_MAP,
  KIND_LABEL,
  PRIORITY_MAP,
  PRIORITY_OPTIONS,
  channelMeta,
  initials,
  snoozeOptions,
} from "./constants";

// Thread surfaces: the header with every triage control, the messaging-window strip, the post context
// for comments and the message list with status ticks, attachments, notes and activity lines.

const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const MENU = "border-border bg-surface-subtle text-foreground";
const ITEM = "cursor-pointer text-sm focus:bg-surface-hover focus:text-foreground";

const TONE_TEXT = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  neutral: "text-text-secondary",
};

export function Avatar({ name, channel, size = "md", className }) {
  const Icon = channel ? channelMeta(channel).icon : null;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span className={cn("flex items-center justify-center rounded-full border border-border bg-surface-active font-medium text-muted-foreground", size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs")}>
        {initials(name)}
      </span>
      {Icon ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface-subtle text-text-secondary">
          <Icon className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}

export function SlaChip({ conversation, now, className }) {
  const sla = slaState(conversation, now);
  if (sla.state === "none" || sla.state === "met") return null;
  const variant = sla.state === "overdue" ? "danger" : sla.state === "due_soon" ? "warning" : "neutral";
  return (
    <Badge variant={variant} className={className} title={sla.dueAt ? `Due ${formatDateTime(sla.dueAt)}` : undefined}>
      <Timer aria-hidden="true" /> {sla.label}
    </Badge>
  );
}

function TagEditor({ tags, onChange, disabled }) {
  const [value, setValue] = useState("");
  const add = () => {
    const tag = value.trim().toLowerCase().slice(0, 40);
    if (!tag || tags.includes(tag)) return setValue("");
    onChange([...tags, tag]);
    setValue("");
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Edit tags" disabled={disabled} className={OUTLINE}>
          <Tag className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2 border-border bg-surface-subtle p-3">
        <p className="text-xs font-medium text-muted-foreground">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {tags.length ? (
            tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-card px-1.5 py-0.5 text-xs text-foreground">
                {t}
                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="text-text-tertiary hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-text-tertiary">No tags yet.</span>
          )}
        </div>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a tag and press Enter"
          aria-label="New tag"
          className="h-8 border-border bg-surface-card text-sm"
        />
      </PopoverContent>
    </Popover>
  );
}

// Header: who, where, and every triage control. `onAction(type, value)` is owned by the screen.
export function ThreadHeader({ conversation, contact, name, members, me, now, canReply, onAction, onBack, compact = false }) {
  const meta = channelMeta(conversation.channel);
  const assignee = members.find((m) => m.userId === conversation.assigneeId);
  const identity =
    conversation.kind === "comment"
      ? conversation.sender?.handle ? `@${conversation.sender.handle}` : KIND_LABEL.comment
      : conversation.channel === "email"
        ? contact?.email
        : ["sms", "whatsapp", "rcs"].includes(conversation.channel)
          ? contact?.phone
          : conversation.sender?.handle ? `@${conversation.sender.handle}` : contact?.email || "";
  const resolved = conversation.status === "resolved";
  const snoozed = conversation.status === "snoozed";

  return (
    <div className="space-y-3 border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {onBack ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Back to conversations" onClick={onBack} className="text-muted-foreground hover:bg-surface-active hover:text-foreground lg:hidden">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          {!compact ? <Avatar name={name} channel={conversation.channel} /> : null}
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{name}</h2>
            <p className="flex items-center gap-1.5 truncate text-xs text-text-secondary">
              <meta.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {meta.label}
              {conversation.kind === "comment" ? " comment" : ""}
              {identity ? <span className="truncate text-text-tertiary">· {identity}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={!canReply} className={cn("h-8 max-w-[180px]", OUTLINE)}>
                <UserPlus className="h-3.5 w-3.5" />
                <span className="truncate">{assignee ? assignee.name || assignee.email : "Assign"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn("w-56", MENU)}>
              {me?.id && conversation.assigneeId !== me.id ? (
                <DropdownMenuItem className={ITEM} onSelect={() => onAction("assign", me.id)}>Assign to me</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem className={ITEM} onSelect={() => onAction("auto_assign")}>Auto-assign by rules</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Teammates</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={conversation.assigneeId || ""} onValueChange={(v) => onAction("assign", v || null)}>
                {members.map((m) => (
                  <DropdownMenuRadioItem key={m.userId} value={m.userId} className={ITEM}>
                    <span className="truncate">{m.name || m.email}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {conversation.assigneeId ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={ITEM} onSelect={() => onAction("assign", null)}>Unassign</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" aria-label="Set priority" disabled={!canReply} className={OUTLINE}>
                <Flag className={cn("h-3.5 w-3.5", conversation.priority === "urgent" ? TONE_TEXT.danger : conversation.priority === "high" ? TONE_TEXT.warning : "")} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={MENU}>
              <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Priority</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={conversation.priority} onValueChange={(v) => onAction("priority", v)}>
                {PRIORITY_OPTIONS.map((p) => (
                  <DropdownMenuRadioItem key={p.value} value={p.value} className={ITEM}>{p.label}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" aria-label="Snooze" disabled={!canReply || resolved} className={OUTLINE}>
                <AlarmClock className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={MENU}>
              <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Snooze until</DropdownMenuLabel>
              {snoozeOptions(now).map((o) => (
                <DropdownMenuItem key={o.key} className={ITEM} onSelect={() => onAction("snooze", o.until)}>{o.label}</DropdownMenuItem>
              ))}
              {snoozed ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={ITEM} onSelect={() => onAction("reopen")}>Unsnooze now</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <TagEditor tags={conversation.tags} disabled={!canReply} onChange={(tags) => onAction("tags", tags)} />

          <Button type="button" variant="outline" size="sm" disabled={!canReply} onClick={() => onAction(resolved ? "reopen" : "resolve")} className={cn("h-8", OUTLINE)}>
            {resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {resolved ? "Reopen" : "Resolve"}
          </Button>

          <ActionMenu
            label="More conversation actions"
            items={[
              canReply && conversation.handledBy === "bot" && { label: "Take over from bot", icon: Hand, onSelect: () => onAction("handled_by", "human") },
              canReply && conversation.handledBy !== "bot" && { label: "Hand back to bot", icon: Bot, onSelect: () => onAction("handled_by", "bot") },
              canReply && { label: conversation.unreadCount ? "Mark as read" : "Mark as unread", icon: Eye, onSelect: () => onAction(conversation.unreadCount ? "mark_read" : "mark_unread") },
              conversation.contactId && { label: "Open contact", icon: ExternalLink, onSelect: () => onAction("open_contact") },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={conversation.status} map={CONVERSATION_STATUS_MAP} />
        {snoozed && conversation.snoozedUntil ? <Badge variant="purple">Until {formatDateTime(conversation.snoozedUntil)}</Badge> : null}
        {conversation.priority !== "normal" ? <StatusPill status={conversation.priority} map={PRIORITY_MAP} /> : null}
        <SlaChip conversation={conversation} now={now} />
        {conversation.handledBy === "bot" ? (
          <Badge variant="info">
            <Bot aria-hidden="true" /> Bot handling
          </Badge>
        ) : null}
        {conversation.tags.map((t) => (
          <Badge key={t} variant="outline">{t}</Badge>
        ))}
      </div>
    </div>
  );
}

const WINDOW_ICON = { free: Clock, human_tag: Hand, template: Lock, closed: Lock };

// The platform window indicator: "Window closes in 3h", "Template required", "Human agent tag — 5 days left".
export function WindowStrip({ conversation, name, now }) {
  const state = composerState(conversation, { now, contactName: name });
  if (!state.label) return null;
  const Icon = WINDOW_ICON[state.mode] || Clock;
  return (
    <div className="flex items-start gap-2.5 border-b border-border bg-surface-card px-4 py-2">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", TONE_TEXT[state.tone])} aria-hidden="true" />
      <p className="min-w-0 text-xs">
        <span className={cn("font-medium", TONE_TEXT[state.tone])}>{state.label}</span>
        <span className="text-text-secondary"> — {state.detail}</span>
      </p>
    </div>
  );
}

// Comment threads open with the post (or ad) they sit under.
export function PostContext({ conversation }) {
  const ctx = conversation.context || {};
  if (!ctx.postId && !ctx.caption && !ctx.permalink) return null;
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-surface-card p-3">
      {ctx.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ctx.mediaUrl} alt="" className="h-14 w-14 shrink-0 rounded-md border border-border object-cover" loading="lazy" />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={ctx.isAd ? "warning" : "neutral"}>{ctx.isAd ? "Ad comment" : "Organic post"}</Badge>
          {ctx.isAd && ctx.adName ? <span className="truncate text-xs text-text-secondary">{ctx.adName}</span> : null}
          {conversation.hidden ? (
            <Badge variant="outline">
              <EyeOff aria-hidden="true" /> Hidden
            </Badge>
          ) : null}
          {conversation.deletedAt ? <Badge variant="danger">Deleted on {conversation.channel === "instagram" ? "Instagram" : "Facebook"}</Badge> : null}
        </div>
        <p className="line-clamp-2 text-sm text-foreground">{ctx.caption || "Post without a caption"}</p>
        {ctx.permalink ? (
          <a href={ctx.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-foreground">
            View post <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

const TICK = {
  queued: { icon: Clock, label: "Queued" },
  sent: { icon: Check, label: "Sent" },
  delivered: { icon: CheckCheck, label: "Delivered" },
  read: { icon: CheckCheck, label: "Read", className: "text-sky-600 dark:text-sky-400" },
  failed: { icon: AlertCircle, label: "Not sent", className: "text-red-600 dark:text-red-400" },
};

function StatusTick({ status }) {
  const tick = TICK[status];
  if (!tick) return null;
  return (
    <span className={cn("inline-flex items-center", tick.className)} title={tick.label}>
      <tick.icon className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">{tick.label}</span>
    </span>
  );
}

function Attachments({ items }) {
  if (!items?.length) return null;
  const images = items.filter((a) => String(a.type || "").startsWith("image/") && a.url);
  const files = items.filter((a) => !images.includes(a));
  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length ? (
        <div className="flex flex-wrap gap-1.5">
          {images.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.name || "Image attachment"} className="max-h-48 max-w-[240px] object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}
      {files.map((a, i) => (
        <a key={a.url || i} href={a.url} target="_blank" rel="noreferrer" className="flex max-w-[260px] items-center gap-2 rounded-md border border-border bg-surface-card px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover">
          <FileText className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
          <span className="truncate">{a.name || "Attachment"}</span>
          {a.size ? <span className="shrink-0 text-text-tertiary">{Math.max(1, Math.round(a.size / 1024))} KB</span> : null}
        </a>
      ))}
    </div>
  );
}

function authorName(m, membersById, contactName) {
  if (m.direction === "inbound") return contactName;
  if (m.senderType === "bot") return "Bot";
  const member = membersById.get(m.senderId);
  return member?.name || m.senderName || "Teammate";
}

function MessageItem({ m, conversation, contactName, membersById, onRetry, onCommentAction, canReply }) {
  if (m.direction === "note" && m.senderType === "system") {
    const who = m.senderId ? membersById.get(m.senderId)?.name : null;
    const target = m.assigneeId ? membersById.get(m.assigneeId)?.name : null;
    const text = m.event === "assigned" && target ? `${m.body} to ${target}` : m.body;
    return (
      <div className="flex items-center gap-3 py-1 text-[11px] text-text-tertiary">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span>
          {text}
          {who ? ` by ${who}` : ""} · {formatClock(m.sentAt)}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
    );
  }
  if (m.direction === "note") {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          <StickyNote className="h-3 w-3" aria-hidden="true" /> Internal note · {authorName(m, membersById, contactName)} · {formatClock(m.sentAt)}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{m.body}</p>
      </div>
    );
  }
  const outbound = m.direction === "outbound";
  const bot = outbound && m.senderType === "bot";
  const isComment = conversation.kind === "comment";
  const kindLabel = m.kind === "private_reply" ? "Private reply" : m.kind === "public_reply" ? "Public reply" : null;
  return (
    <div className={cn("group flex flex-col gap-1", outbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
          outbound
            ? bot
              ? "rounded-br-md border border-border bg-surface-active text-foreground"
              : "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-surface-card text-foreground",
          (m.hidden || m.deletedAt) && "opacity-60",
          m.pending && "opacity-70",
        )}
      >
        {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
        <Attachments items={m.attachments} />
      </div>
      <span className="flex items-center gap-1.5 px-1 text-[11px] text-text-tertiary">
        {bot ? <Bot className="h-3 w-3" aria-hidden="true" /> : null}
        {kindLabel ? (
          <span className="inline-flex items-center gap-1">
            {m.kind === "private_reply" ? <MessageSquareLock className="h-3 w-3" aria-hidden="true" /> : null}
            {kindLabel} ·
          </span>
        ) : null}
        {m.template ? <span>Template “{m.template.name}” ·</span> : null}
        {m.tag ? <span>HUMAN_AGENT ·</span> : null}
        {authorName(m, membersById, contactName)} · {formatClock(m.sentAt)}
        {outbound ? <StatusTick status={m.status} /> : null}
        {m.hidden ? <span className="inline-flex items-center gap-1"><EyeOff className="h-3 w-3" /> Hidden</span> : null}
        {m.deletedAt ? <span className="text-red-600 dark:text-red-400">Deleted</span> : null}
        {isComment && !outbound && m.externalId && canReply && !m.deletedAt ? (
          <span className="ml-1 hidden items-center gap-0.5 group-focus-within:inline-flex group-hover:inline-flex">
            <button type="button" onClick={() => onCommentAction(m.hidden ? "unhide" : "hide", m)} className="rounded px-1 text-text-secondary hover:bg-surface-active hover:text-foreground">
              {m.hidden ? "Unhide" : "Hide"}
            </button>
            <button type="button" onClick={() => onCommentAction("delete", m)} className="inline-flex items-center gap-0.5 rounded px-1 text-red-600 hover:bg-red-500/10 dark:text-red-400">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </span>
        ) : null}
      </span>
      {m.status === "failed" && outbound ? (
        <span className="flex items-center gap-2 px-1 text-[11px] text-red-600 dark:text-red-400">
          {m.error || "This message wasn't sent."}
          {canReply && !m.template ? (
            <button type="button" onClick={() => onRetry(m)} className="font-medium underline-offset-2 hover:underline">
              Retry
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

// Day-grouped message list that keeps itself scrolled to the newest message.
export function MessageList({ messages, loading, conversation, contactName, membersById, now, canReply, onRetry, onCommentAction }) {
  const endRef = useRef(null);
  const count = messages.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count, conversation.id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <LogoLoading size={40} />
      </div>
    );
  }
  const days = messages.map((m) => formatDayLabel(m.sentAt, now));
  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
      {conversation.kind === "comment" ? <PostContext conversation={conversation} /> : null}
      {!count ? <p className="py-10 text-center text-sm text-text-secondary">No messages in this conversation yet.</p> : null}
      {messages.map((m, i) => (
        <React.Fragment key={m.id}>
          {days[i] !== days[i - 1] ? (
            <p className="pt-1 text-center text-[11px] font-medium uppercase tracking-wider text-text-tertiary" title={formatRelative(m.sentAt, now)}>
              {days[i]}
            </p>
          ) : null}
          <MessageItem
            m={m}
            conversation={conversation}
            contactName={contactName}
            membersById={membersById}
            canReply={canReply}
            onRetry={onRetry}
            onCommentAction={onCommentAction}
          />
        </React.Fragment>
      ))}
      <div ref={endRef} />
    </div>
  );
}
