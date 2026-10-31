"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
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
  Input,
  SearchInput,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { getUser } from "@/lib/supabase/user";
import { createSavedReply, softDeleteSavedReply, updateSavedReply } from "@/lib/supabase/saved_replies";
import { formatListTime } from "@/lib/inbox/format";
import { CHANNEL_OPTIONS, channelMeta } from "./constants";

// Saved replies: canned answers with merge tags, offered per channel and inserted by /shortcut.

const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const MERGE_TAGS = ["{{first_name|there}}", "{{last_name}}", "{{email}}", "{{agent_name}}"];
const EMPTY = { title: "", shortcut: "", body: "", channels: [], category: "" };

function ReplyDialog({ open, onOpenChange, initial, onSave }) {
  const [draft, setDraft] = useState(initial || EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleChannel = (value) =>
    setDraft((d) => ({ ...d, channels: d.channels.includes(value) ? d.channels.filter((c) => c !== value) : [...d.channels, value] }));

  const submit = async () => {
    if (!draft.title.trim()) return toast.error("Give the reply a title.");
    if (!draft.body.trim()) return toast.error("Write the reply text.");
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit saved reply" : "New saved reply"}</DialogTitle>
          <DialogDescription>Merge tags fill in from the contact when an agent inserts the reply.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="Title" htmlFor="sr-title">
              <Input id="sr-title" value={draft.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Shipping times" />
            </Field>
            <Field label="Shortcut" htmlFor="sr-shortcut" hint="Type /shortcut to insert.">
              <Input id="sr-shortcut" value={draft.shortcut} onChange={(e) => set("shortcut")(e.target.value)} placeholder="shipping" className="font-mono" />
            </Field>
          </div>
          <Field label="Reply" htmlFor="sr-body">
            <Textarea id="sr-body" rows={5} value={draft.body} onChange={(e) => set("body")(e.target.value)} placeholder="Hi {{first_name|there}}, orders ship within 2 business days…" />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {MERGE_TAGS.map((tag) => (
                <button key={tag} type="button" onClick={() => set("body")(`${draft.body}${draft.body && !draft.body.endsWith(" ") ? " " : ""}${tag}`)} className="rounded-md border border-border bg-surface-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-surface-hover hover:text-foreground">
                  {tag}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Channels" hint="Leave all unchecked to offer it everywhere.">
            <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
              {CHANNEL_OPTIONS.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={draft.channels.includes(c.value)} onCheckedChange={() => toggleChannel(c.value)} />
                  {c.label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Category" htmlFor="sr-category" hint="Optional — groups replies in the list.">
            <Input id="sr-category" value={draft.category} onChange={(e) => set("category")(e.target.value)} placeholder="e.g. Orders" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {initial?.id ? "Save reply" : "Create reply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SavedRepliesManager({ projectId, replies, setReplies, canEdit, now }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return replies.filter((r) => !q || `${r.title} ${r.shortcut} ${r.body} ${r.category}`.toLowerCase().includes(q));
  }, [replies, query]);
  const pager = usePagination(filtered, { resetKey: query });

  const save = async (input) => {
    const draft = { id: input.id, title: input.title, shortcut: input.shortcut, body: input.body, channels: input.channels, category: input.category };
    if (draft.id) {
      const prev = replies.find((r) => r.id === draft.id);
      setReplies((list) => list.map((r) => (r.id === draft.id ? { ...r, ...draft } : r)));
      const row = await updateSavedReply(draft.id, draft);
      if (!row) {
        setReplies((list) => list.map((r) => (r.id === draft.id ? prev : r)));
        toast.error("Couldn't save the reply — the shortcut may already be taken.");
        return false;
      }
      setReplies((list) => list.map((r) => (r.id === row.id ? row : r)));
      toast.success("Saved reply updated.");
      return true;
    }
    const user = await getUser();
    const optimistic = { ...draft, id: crypto.randomUUID(), usageCount: 0, lastUsedAt: null, createdBy: user?.id ?? null };
    setReplies((list) => [...list, optimistic]);
    const row = await createSavedReply(projectId, optimistic);
    if (!row) {
      setReplies((list) => list.filter((r) => r.id !== optimistic.id));
      toast.error("Couldn't create the reply — the shortcut may already be taken.");
      return false;
    }
    setReplies((list) => list.map((r) => (r.id === row.id ? row : r)));
    toast.success("Saved reply created.");
    return true;
  };

  const remove = async (reply) => {
    setDeleteTarget(null);
    setReplies((list) => list.filter((r) => r.id !== reply.id));
    if (!(await softDeleteSavedReply(reply.id))) {
      setReplies((list) => [...list, reply]);
      toast.error("Couldn't delete the reply.");
      return;
    }
    toast.success(`Deleted “${reply.title}”.`);
  };

  const columns = [
    {
      key: "title",
      header: "Reply",
      render: (r) => (
        <div className="min-w-0 max-w-md">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{r.title}</span>
            {r.shortcut ? <span className="shrink-0 font-mono text-[11px] text-text-tertiary">/{r.shortcut}</span> : null}
          </div>
          <p className="truncate text-xs text-text-secondary">{r.body}</p>
        </div>
      ),
    },
    {
      key: "channels",
      header: "Channels",
      render: (r) =>
        r.channels.length ? (
          <div className="flex flex-wrap gap-1">
            {r.channels.map((c) => (
              <Badge key={c} variant="outline">{channelMeta(c).label}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-text-secondary">All channels</span>
        ),
    },
    { key: "usage", header: "Used", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => r.usageCount.toLocaleString("en-US") },
    { key: "last", header: "Last used", className: "text-muted-foreground whitespace-nowrap", render: (r) => (r.lastUsedAt ? formatListTime(r.lastUsedAt, now) : "Never") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        canEdit ? (
          <ActionMenu
            label={`Actions for ${r.title}`}
            items={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(r) },
              { separator: true },
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(r) },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {canEdit ? "Agents insert these from the composer or by typing /shortcut." : "Your role can use saved replies but not change them."}
        </p>
        {canEdit ? (
          <Button onClick={() => setEditing(EMPTY)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New reply
          </Button>
        ) : null}
      </div>
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search saved replies…" />
      </Toolbar>
      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(r) => r.id}
          onRowClick={canEdit ? (r) => setEditing(r) : undefined}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Zap}
                title={query ? "No matching replies" : "No saved replies yet"}
                description={query ? "Try a different search." : "Save the answers your team types most, then insert them with /shortcut."}
                action={
                  query ? (
                    <Button variant="outline" className={OUTLINE} onClick={() => setQuery("")}>Clear search</Button>
                  ) : canEdit ? (
                    <Button onClick={() => setEditing(EMPTY)} className="bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> New reply</Button>
                  ) : null
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="replies" />
      </div>
      {editing ? <ReplyDialog key={editing.id || "new"} open onOpenChange={(o) => !o && setEditing(null)} initial={editing} onSave={save} /> : null}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete saved reply</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.title}</span>? Agents won&apos;t be able to insert it anymore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => remove(deleteTarget)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SavedRepliesDialog({ open, onOpenChange, ...props }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Saved replies</DialogTitle>
          <DialogDescription>Shared with everyone on the inbox. Insert one from the composer or type /shortcut.</DialogDescription>
        </DialogHeader>
        <SavedRepliesManager {...props} />
      </DialogContent>
    </Dialog>
  );
}
