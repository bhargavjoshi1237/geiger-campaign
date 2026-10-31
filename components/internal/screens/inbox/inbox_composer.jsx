"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, FileText, Hand, Loader2, Lock, MessageSquareLock, Paperclip, Reply, Send, StickyNote, X, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  LogoLoading,
} from "@geiger/ui";
import { apiGet } from "@/lib/api/client";
import { applyMergeTags, contactMergeData } from "@/lib/email/merge_tags";
import { draftFromTemplate, renderTemplatePreview, variableCount } from "@/lib/channels/whatsapp_templates";
import { uploadInboxAttachment } from "@/lib/supabase/conversations";
import { composerState } from "@/lib/inbox/composer";

// The reply box. Its mode follows the platform messaging window (lib/inbox/composer.js): free-form,
// HUMAN_AGENT-tagged, WhatsApp template only, closed, or comment (public / private reply). Notes are internal.

const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const ATTACH_CHANNELS = new Set(["email", "whatsapp", "messenger", "instagram", "sms", "chat", "telegram"]);
const GSM = /^[\n\r -_a-zA-Z0-9@£$¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

function smsSegments(text) {
  const length = [...text].length;
  if (!length) return 0;
  const gsm = GSM.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return length <= single ? 1 : Math.ceil(length / multi);
}

const firstName = (me) => String(me?.name || "").split(/\s+/)[0] || "";

// Saved replies offered on this channel, merge tags resolved for this contact and agent.
function useReplyOptions(savedReplies, channel) {
  return useMemo(
    () => (savedReplies || []).filter((r) => !r.channels?.length || r.channels.includes(channel)),
    [savedReplies, channel],
  );
}

function resolveReply(reply, contact, me) {
  return applyMergeTags(reply.body, { ...contactMergeData(contact || {}), agent_name: firstName(me), agent_full_name: me?.name || "" });
}

function SavedRepliesPicker({ replies, contact, me, onInsert, onManage, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = replies.filter((r) => !q || `${r.title} ${r.shortcut} ${r.body}`.toLowerCase().includes(q)).slice(0, 30);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Insert a saved reply" disabled={disabled} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 border-border bg-surface-subtle p-0">
        <div className="border-b border-border p-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved replies…" aria-label="Search saved replies" className="h-8 border-border bg-surface-card text-sm" />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {shown.length ? (
            shown.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onInsert(resolveReply(r, contact, me), r.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                  <span className="truncate">{r.title || "Untitled reply"}</span>
                  {r.shortcut ? <span className="shrink-0 font-mono text-[11px] text-text-tertiary">/{r.shortcut}</span> : null}
                </span>
                <span className="line-clamp-2 text-xs text-text-secondary">{resolveReply(r, contact, me)}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-sm text-text-secondary">{replies.length ? "No saved reply matches." : "No saved replies for this channel yet."}</p>
          )}
        </div>
        {onManage ? (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <BookmarkPlus className="h-3.5 w-3.5" /> Manage saved replies
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function AttachmentChips({ items, onRemove }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      {items.map((a) => (
        <span key={a.url} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-border bg-surface-card px-2 py-1 text-xs text-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
          <span className="truncate">{a.name}</span>
          <button type="button" aria-label={`Remove ${a.name}`} onClick={() => onRemove(a)} className="text-text-tertiary hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

// Free-form text box (reply, HUMAN_AGENT reply, note, comment reply) with saved replies, /shortcuts and attachments.
function TextBox({ projectId, channel, placeholder, sendLabel, replies, contact, me, onSubmit, allowAttachments, onManageReplies, note = false, disabled = false, footerHint }) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [savedReplyId, setSavedReplyId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const slash = /^\/(\S*)$/.exec(draft.trim());
  const suggestions = slash ? replies.filter((r) => r.shortcut && r.shortcut.startsWith(slash[1].toLowerCase())).slice(0, 5) : [];

  const insert = (text, id) => {
    setDraft((d) => (d.trim().startsWith("/") || !d.trim() ? text : `${d.trimEnd()}\n${text}`));
    setSavedReplyId(id || null);
  };

  const submit = async () => {
    const body = draft.trim();
    if ((!body && !attachments.length) || busy || disabled) return;
    setBusy(true);
    const ok = await onSubmit({ body, attachments, savedReplyId });
    setBusy(false);
    if (ok) {
      setDraft("");
      setAttachments([]);
      setSavedReplyId(null);
    }
  };

  const pickFiles = async (files) => {
    const list = Array.from(files || []).slice(0, 5);
    if (!list.length) return;
    setUploading(true);
    const uploaded = [];
    for (const file of list) {
      const out = await uploadInboxAttachment(projectId, file);
      if (out?.url) uploaded.push(out);
      else toast.error(`Couldn't upload ${file.name}.`);
    }
    setUploading(false);
    setAttachments((prev) => [...prev, ...uploaded]);
  };

  const segments = channel === "sms" && !note ? smsSegments(draft) : 0;

  return (
    <div className={cn("rounded-lg border bg-background", note ? "border-amber-500/30" : "border-border")}>
      {suggestions.length ? (
        <div className="border-b border-border p-1">
          {suggestions.map((r) => (
            <button key={r.id} type="button" onClick={() => insert(resolveReply(r, contact, me), r.id)} className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-hover">
              <span className="truncate text-foreground">{r.title}</span>
              <span className="font-mono text-[11px] text-text-tertiary">/{r.shortcut}</span>
            </button>
          ))}
        </div>
      ) : null}
      <AttachmentChips items={attachments} onRemove={(a) => setAttachments((prev) => prev.filter((x) => x.url !== a.url))} />
      <Textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (!e.target.value.trim()) setSavedReplyId(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          } else if ((e.key === "Tab" || e.key === "Enter") && suggestions.length && !e.shiftKey) {
            e.preventDefault();
            insert(resolveReply(suggestions[0], contact, me), suggestions[0].id);
          }
        }}
        rows={3}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={note ? "Internal note" : "Reply"}
        className="min-h-[76px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          {!note ? <SavedRepliesPicker replies={replies} contact={contact} me={me} onInsert={insert} onManage={onManageReplies} disabled={disabled} /> : null}
          {allowAttachments && !note ? (
            <>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
              <Button type="button" variant="ghost" size="icon" aria-label="Attach files" disabled={disabled || uploading} onClick={() => fileRef.current?.click()} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
            </>
          ) : null}
          <span className="pl-1.5 text-[11px] text-text-tertiary">
            {footerHint || (segments ? `${[...draft].length} chars · ${segments} SMS segment${segments === 1 ? "" : "s"}` : "Ctrl + Enter to send")}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={disabled || busy || (!draft.trim() && !attachments.length)}
          className={note ? "border border-amber-500/30 bg-amber-500/10 text-foreground hover:bg-amber-500/20" : "bg-primary text-primary-foreground hover:bg-primary/90"}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : note ? <StickyNote className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {sendLabel}
        </Button>
      </div>
    </div>
  );
}

// WhatsApp outside the 24h window: pick an approved template, fill its variables, preview, send.
function TemplateBox({ projectId, conversation, contact, onSubmit, disabled }) {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState({ header: [], body: [], buttons: {} });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const qs = conversation.connectionId ? `?connectionId=${conversation.connectionId}` : "";
    apiGet(`/api/projects/${projectId}/inbox/templates${qs}`).then((res) => {
      if (!alive) return;
      if (res.ok) setTemplates(res.data?.templates || []);
      else {
        setTemplates([]);
        setError(res.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [projectId, conversation.connectionId]);

  const template = templates?.find((t) => t.id === templateId) || null;
  const draft = useMemo(() => (template ? draftFromTemplate(template) : null), [template]);
  const headerCount = draft?.headerType === "text" ? variableCount(draft.headerText) : 0;
  const bodyCount = draft ? (draft.category === "authentication" ? 1 : variableCount(draft.body)) : 0;
  const urlButtons = (draft?.buttons || []).map((b, i) => (b.type === "url" && variableCount(b.url) ? i : null)).filter((i) => i != null);
  const preview = draft ? renderTemplatePreview({ ...draft, headerSamples: values.header, bodySamples: values.body }) : null;

  const choose = (id) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    const d = t ? draftFromTemplate(t) : null;
    const count = d ? variableCount(d.body) : 0;
    // {{1}} is almost always the first name — prefill it; the agent can change it.
    setValues({ header: [], body: count ? [contact?.firstName || "", ...Array(count - 1).fill("")] : [], buttons: {} });
  };
  const setValue = (part, index) => (e) =>
    setValues((v) => (part === "buttons" ? { ...v, buttons: { ...v.buttons, [index]: e.target.value } } : { ...v, [part]: Object.assign([...v[part]], { [index]: e.target.value }) }));
  const complete =
    template &&
    Array.from({ length: headerCount }).every((_, i) => String(values.header[i] || "").trim()) &&
    Array.from({ length: bodyCount }).every((_, i) => String(values.body[i] || "").trim()) &&
    urlButtons.every((i) => String(values.buttons[i] || "").trim());

  const submit = async () => {
    if (!complete || busy) return;
    setBusy(true);
    const ok = await onSubmit({ templateId, templateVariables: values });
    setBusy(false);
    if (ok) {
      setTemplateId("");
      setValues({ header: [], body: [], buttons: {} });
    }
  };

  if (templates === null) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-background py-6">
        <LogoLoading size={32} />
      </div>
    );
  }
  if (!templates.length) {
    return (
      <div className="rounded-lg border border-border bg-background px-4 py-4 text-sm">
        <p className="font-medium text-foreground">No approved templates for this number</p>
        <p className="mt-1 text-text-secondary">
          {error || "Create a template in Broadcasts → Message Templates and submit it to Meta. Once it's approved you can re-open this conversation from here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <Select value={templateId} onValueChange={choose} disabled={disabled}>
        <SelectTrigger className="w-full" aria-label="Approved template">
          <SelectValue placeholder="Choose an approved template" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name} · {t.language} · {t.category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {draft ? (
        <>
          {headerCount + bodyCount + urlButtons.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: headerCount }).map((_, i) => (
                <Input key={`h${i}`} value={values.header[i] || ""} onChange={setValue("header", i)} placeholder={draft.headerSamples[i] || `Header {{${i + 1}}}`} aria-label={`Header variable ${i + 1}`} className="h-8 border-border bg-surface-card text-sm" />
              ))}
              {Array.from({ length: bodyCount }).map((_, i) => (
                <Input key={`b${i}`} value={values.body[i] || ""} onChange={setValue("body", i)} placeholder={draft.bodySamples[i] || `Body {{${i + 1}}}`} aria-label={`Body variable ${i + 1}`} className="h-8 border-border bg-surface-card text-sm" />
              ))}
              {urlButtons.map((i) => (
                <Input key={`u${i}`} value={values.buttons[i] || ""} onChange={setValue("buttons", i)} placeholder={draft.buttons[i].urlSample || "Link suffix"} aria-label={`Button ${i + 1} link variable`} className="h-8 border-border bg-surface-card text-sm" />
              ))}
            </div>
          ) : null}
          <div className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-foreground">
            {preview.header ? <p className="mb-1 font-semibold">{preview.header}</p> : null}
            <p className="whitespace-pre-wrap break-words">{preview.body}</p>
            {preview.footer ? <p className="mt-1 text-xs text-text-tertiary">{preview.footer}</p> : null}
            {preview.buttons?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {preview.buttons.map((b, i) => (
                  <span key={i} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{b.text}</span>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-tertiary">
          {template ? `${template.category[0].toUpperCase()}${template.category.slice(1)} template — Meta bills each delivered template.` : "Free-form replies unlock when the customer writes back."}
        </span>
        <Button type="button" size="sm" onClick={submit} disabled={!complete || busy || disabled} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send template
        </Button>
      </div>
    </div>
  );
}

const ROOT_COMMENT = (c) => c.context?.commentId || c.externalThreadId;

function CommentBox({ conversation, replies, contact, me, now, onComment, disabled }) {
  const [mode, setMode] = useState("reply");
  const root = ROOT_COMMENT(conversation);
  const used = Boolean(conversation.privateReplies?.[root]);
  const commentedAt = new Date(conversation.lastInboundAt || conversation.createdAt || 0).getTime();
  const expired = now - commentedAt > 7 * 86_400_000;
  const privateBlocked = used ? "A private reply was already sent — Meta allows one per comment." : expired ? "Private replies close 7 days after the comment." : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Reply type">
        {[
          { value: "reply", label: "Public reply", icon: Reply },
          { value: "private_reply", label: "Private reply", icon: MessageSquareLock, blocked: privateBlocked },
        ].map((opt) => (
          <Button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={mode === opt.value}
            variant="ghost"
            size="sm"
            disabled={Boolean(opt.blocked)}
            title={opt.blocked || undefined}
            onClick={() => setMode(opt.value)}
            className={cn("h-7 gap-1.5 px-2.5 text-xs", mode === opt.value ? "bg-surface-hover text-foreground" : "text-text-secondary hover:text-foreground")}
          >
            <opt.icon className="h-3.5 w-3.5" /> {opt.label}
          </Button>
        ))}
        {privateBlocked ? <span className="ml-1 text-[11px] text-text-tertiary">{privateBlocked}</span> : null}
      </div>
      <TextBox
        channel={conversation.channel}
        placeholder={mode === "reply" ? "Reply publicly under this comment…" : "Send one private DM to this commenter…"}
        sendLabel={mode === "reply" ? "Reply" : "Send DM"}
        replies={replies}
        contact={contact}
        me={me}
        allowAttachments={false}
        disabled={disabled}
        footerHint={mode === "reply" ? "Visible to everyone on the post" : "Opens a DM thread with the commenter"}
        onSubmit={({ body }) => onComment(mode === "private_reply" && !privateBlocked ? "private_reply" : "reply", body)}
      />
    </div>
  );
}

export function Composer({ projectId, conversation, contact, name, me, savedReplies, now, canReply, onReply, onNote, onComment, onManageReplies, onTakeOver }) {
  const [tab, setTab] = useState("reply");
  const state = composerState(conversation, { now, contactName: name });
  const replies = useReplyOptions(savedReplies, conversation.channel);
  const blocked = !canReply;
  const tabs = [
    { value: "reply", label: "Reply" },
    { value: "note", label: "Internal note" },
  ];

  return (
    <div className="space-y-2 border-t border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="tablist" aria-label="Composer mode">
          {tabs.map((t) => (
            <Button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              variant="ghost"
              size="sm"
              onClick={() => setTab(t.value)}
              className={cn("h-7 px-2.5 text-xs", tab === t.value ? "bg-surface-hover text-foreground" : "text-text-secondary hover:text-foreground")}
            >
              {t.label}
            </Button>
          ))}
        </div>
        {conversation.handledBy === "bot" && tab === "reply" && canReply ? (
          <Button type="button" variant="outline" size="sm" onClick={onTakeOver} className={cn("h-7 text-xs", OUTLINE)}>
            <Hand className="h-3.5 w-3.5" /> Take over from bot
          </Button>
        ) : null}
      </div>

      {blocked ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-sm text-text-secondary">
          <Lock className="h-4 w-4 shrink-0" /> Your role can read this inbox but can&apos;t reply. Ask an admin for the “Reply to and assign conversations” permission.
        </div>
      ) : tab === "note" ? (
        <TextBox
          channel={conversation.channel}
          note
          placeholder="Write an internal note — only your team sees it. Use @name to mention a teammate."
          sendLabel="Add note"
          replies={[]}
          contact={contact}
          me={me}
          allowAttachments={false}
          footerHint="Never sent to the customer"
          onSubmit={({ body }) => onNote(body)}
        />
      ) : state.mode === "comment" ? (
        <CommentBox conversation={conversation} replies={replies} contact={contact} me={me} now={now} onComment={onComment} />
      ) : state.mode === "template" ? (
        <TemplateBox projectId={projectId} conversation={conversation} contact={contact} onSubmit={onReply} />
      ) : state.mode === "closed" ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-medium text-foreground">Replies are blocked on this channel</p>
            <p className="mt-0.5 text-text-secondary">{state.detail} Add an internal note instead, or reach them on another channel from the contact panel.</p>
          </div>
        </div>
      ) : (
        <>
          {state.mode === "human_tag" ? (
            <div className="flex items-center gap-2">
              <Badge variant="warning">HUMAN_AGENT tag</Badge>
              <span className="text-[11px] text-text-tertiary">Only type replies yourself — Meta forbids automated messages under this tag.</span>
            </div>
          ) : null}
          <TextBox
            projectId={projectId}
            channel={conversation.channel}
            placeholder={`Reply to ${name}…`}
            sendLabel="Send"
            replies={replies}
            contact={contact}
            me={me}
            allowAttachments={ATTACH_CHANNELS.has(conversation.channel)}
            onManageReplies={onManageReplies}
            onSubmit={onReply}
          />
        </>
      )}
    </div>
  );
}
