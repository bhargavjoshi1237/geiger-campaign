"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, File, Film, Image as ImageIcon, Link2, Loader2, Plus, Save, Send, X } from "lucide-react";
import {
  Button,
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
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Textarea,
  cn,
} from "@geiger/ui";
import { listAssets } from "@/lib/supabase/assets";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { PLATFORMS, isTelegramPlatform } from "@/lib/communities/platforms";
import { PARSE_MODES, TELEGRAM_LIMITS, mediaTypeFor, validateTelegramPost } from "@/lib/communities/telegram_format";
import { DateTimeField, LoadingBlock, OUTLINE_BUTTON, PRIMARY_BUTTON, memberName } from "./communities_kit";
import { REMINDER_LEAD_OPTIONS, formatDateTime, fromLocalInput, toLocalInput } from "./constants";

const MEDIA_ICON = { photo: ImageIcon, animation: ImageIcon, video: Film, document: File };
const KIND_TABS = [
  { label: "All", value: "all" },
  { label: "Images", value: "image" },
  { label: "Videos", value: "video" },
  { label: "Documents", value: "document" },
];

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return n ? `${n} B` : "—";
}

// Picks a file from Content → Asset Library; the public URL is what Telegram downloads / the person attaches.
export function MediaPickerDialog({ open, onOpenChange, projectId, onPick }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const { setTab } = useWorkspaceUrl();

  useEffect(() => {
    if (!open || !projectId) return undefined;
    let alive = true;
    listAssets(projectId, { kinds: ["image", "video", "document"] }).then((rows) => {
      if (!alive) return;
      if (rows === null) toast.error("Couldn't load the asset library.");
      setAssets((rows ?? []).filter((a) => a.url));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => (kind === "all" || a.kind === kind) && (!q || a.name.toLowerCase().includes(q)));
  }, [assets, query, kind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add from asset library</DialogTitle>
          <DialogDescription>Files uploaded in Content → Asset Library. Their public URL is attached to the post.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedTabs tabs={KIND_TABS} value={kind} onChange={setKind} />
          <SearchInput value={query} onChange={setQuery} placeholder="Search files…" />
        </div>
        <div className="max-h-80 min-h-40 overflow-y-auto rounded-lg border border-border bg-surface-card">
          {loading ? (
            <LoadingBlock size={36} panel={false} label="Loading assets" />
          ) : filtered.length ? (
            <ul className="divide-y divide-border">
              {filtered.map((a) => {
                const Icon = MEDIA_ICON[mediaTypeFor(a.mime || a.kind)] || File;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(a);
                        onOpenChange(false);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.name}</span>
                      <span className="shrink-0 text-xs capitalize text-text-tertiary">{a.kind}</span>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text-tertiary">{formatSize(a.size)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ImageIcon}
              title={assets.length ? "No matches" : "No files yet"}
              description={assets.length ? "Try a different search or type." : "Upload images and videos in the asset library first."}
              action={
                assets.length ? null : (
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setTab("Asset Library")}>
                    Open asset library
                  </Button>
                )
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function emptyDraft(channel, post) {
  const defaults = channel.settings?.defaults || {};
  return {
    body: post?.body ?? "",
    media: post?.media ?? [],
    buttons: post?.buttons ?? [],
    parseMode: post?.options?.parseMode ?? defaults.parseMode ?? "none",
    silent: post?.options?.silent ?? Boolean(defaults.silent),
    protectContent: post?.options?.protectContent ?? Boolean(defaults.protectContent),
    disablePreview: post?.options?.disablePreview ?? Boolean(defaults.disablePreview),
    timing: post?.scheduledAt ? "schedule" : "draft",
    scheduledAt: post?.scheduledAt ? toLocalInput(post.scheduledAt) : "",
    assigneeId: post?.assigneeId ?? channel.settings?.assigneeId ?? "",
  };
}

/**
 * Compose or edit a channel post. Telegram posts are published by the bot (now or at a time); WhatsApp /
 * Instagram posts are manual-assist: the assignee is reminded when it's due and posts it in the app.
 * onSubmit(patch, intent) where intent is "draft" | "schedule" | "now"; resolves truthy on success.
 */
export function PostComposerDialog({ open, onOpenChange, channel, post, members = [], projectId, onSubmit }) {
  const telegram = isTelegramPlatform(channel.platform);
  const platform = PLATFORMS[channel.platform];
  const [draft, setDraft] = useState(() => emptyDraft(channel, post));
  const [urlInput, setUrlInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const timingTabs = telegram
    ? [
        { label: "Draft", value: "draft", icon: Save },
        { label: "Schedule", value: "schedule", icon: CalendarClock },
        { label: "Post now", value: "now", icon: Send },
      ]
    : [
        { label: "Draft", value: "draft", icon: Save },
        { label: "Schedule reminder", value: "schedule", icon: CalendarClock },
      ];

  const addMedia = (item) => setDraft((d) => ({ ...d, media: [...d.media, item] }));
  const addUrl = () => {
    const url = urlInput.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Use a public http(s) URL.");
      return;
    }
    const name = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "Linked file");
    addMedia({ url, type: mediaTypeFor(name.match(/\.(mp4|mov|webm)$/i) ? "video/mp4" : name.match(/\.(jpe?g|png|webp)$/i) ? "image/jpeg" : name.match(/\.gif$/i) ? "image/gif" : ""), name });
    setUrlInput("");
  };
  const setButton = (i, patch) => setDraft((d) => ({ ...d, buttons: d.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));

  const bodyLimit = telegram ? (draft.media.length ? TELEGRAM_LIMITS.caption : TELEGRAM_LIMITS.text) : null;
  const leadMinutes = Number(channel.settings?.reminderLeadMinutes) || 0;
  const remindAt = draft.scheduledAt ? new Date(new Date(fromLocalInput(draft.scheduledAt)).getTime() - leadMinutes * 60_000).toISOString() : null;

  const submit = async () => {
    const problem = telegram ? validateTelegramPost(draft) : !draft.body.trim() && !draft.media.length ? "Write the post or attach media." : null;
    if (problem && draft.timing !== "draft") {
      toast.error(problem);
      return;
    }
    if (!draft.body.trim() && !draft.media.length) {
      toast.error("Write something first.");
      return;
    }
    const scheduledAt = draft.timing === "schedule" ? fromLocalInput(draft.scheduledAt) : null;
    if (draft.timing === "schedule" && (!scheduledAt || new Date(scheduledAt).getTime() < Date.now() + 60_000)) {
      toast.error("Pick a time at least a minute from now.");
      return;
    }
    if (!telegram && draft.timing === "schedule" && !draft.assigneeId) {
      toast.error("Pick who should be reminded to post it.");
      return;
    }
    const patch = {
      body: draft.body,
      media: draft.media,
      buttons: telegram ? draft.buttons.filter((b) => b.text || b.url) : [],
      options: telegram
        ? { parseMode: draft.parseMode, silent: draft.silent, protectContent: draft.protectContent, disablePreview: draft.disablePreview }
        : {},
      mode: telegram ? "automated" : "manual_assist",
      assigneeId: telegram ? null : draft.assigneeId || null,
      scheduledAt,
      status: draft.timing === "schedule" ? "scheduled" : "draft",
      error: null,
    };
    setPending(true);
    const ok = await onSubmit(patch, draft.timing);
    setPending(false);
    if (ok) onOpenChange(false);
  };

  const primaryLabel = draft.timing === "now" ? "Post now" : draft.timing === "schedule" ? (telegram ? "Schedule post" : "Schedule reminder") : "Save draft";

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{post ? "Edit post" : "New post"}</DialogTitle>
          <DialogDescription>
            {telegram
              ? `Published to ${channel.name} by your bot.`
              : `${platform.appLabel} has no API for channel posts. Plan it here and the assignee gets a reminder with the copy when it's due.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field
            label="Message"
            htmlFor="cp-body"
            hint={bodyLimit ? `${draft.body.length.toLocaleString("en-US")} / ${bodyLimit.toLocaleString("en-US")} characters${draft.media.length ? " (caption)" : ""}` : `${draft.body.length.toLocaleString("en-US")} characters`}
          >
            <Textarea
              id="cp-body"
              rows={6}
              value={draft.body}
              onChange={(e) => set("body")(e.target.value)}
              placeholder={telegram ? "What's new? HTML or MarkdownV2 formatting is optional." : "The update exactly as it should appear in the channel."}
              className={cn(bodyLimit && draft.body.length > bodyLimit && "border-red-500/60")}
            />
          </Field>

          <Field label="Media" hint={telegram ? "One file can carry buttons; 2–10 photos/videos post as an album." : "Attach these in the app when you post."}>
            <div className="space-y-2">
              {draft.media.length ? (
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface-card">
                  {draft.media.map((m, i) => {
                    const Icon = MEDIA_ICON[mediaTypeFor(m.type)] || File;
                    return (
                      <li key={`${m.url}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                        <Icon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.name || m.url}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${m.name || "media"}`}
                          onClick={() => setDraft((d) => ({ ...d, media: d.media.filter((_, j) => j !== i) }))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className={OUTLINE_BUTTON} onClick={() => setPickerOpen(true)}>
                  <ImageIcon className="h-4 w-4" /> Asset library
                </Button>
                <div className="flex min-w-0 flex-1 gap-2">
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUrl())}
                    placeholder="or paste a public file URL"
                    aria-label="Media URL"
                  />
                  <Button type="button" variant="outline" className={OUTLINE_BUTTON} onClick={addUrl} disabled={!urlInput.trim()} aria-label="Add media URL">
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Field>

          {telegram ? (
            <Field label="Buttons" hint="Inline link buttons under the post, one per row.">
              <div className="space-y-2">
                {draft.buttons.map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                    <Input value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} placeholder="Label" aria-label={`Button ${i + 1} label`} maxLength={TELEGRAM_LIMITS.buttonText} />
                    <Input value={b.url} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://" aria-label={`Button ${i + 1} link`} />
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove button ${i + 1}`} onClick={() => setDraft((d) => ({ ...d, buttons: d.buttons.filter((_, j) => j !== i) }))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {draft.buttons.length < TELEGRAM_LIMITS.buttons ? (
                  <Button type="button" variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setDraft((d) => ({ ...d, buttons: [...d.buttons, { text: "", url: "" }] }))}>
                    <Plus className="h-3.5 w-3.5" /> Add button
                  </Button>
                ) : null}
              </div>
            </Field>
          ) : null}

          {telegram ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Formatting">
                <Select value={draft.parseMode} onValueChange={set("parseMode")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARSE_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3 sm:col-span-2">
                <SettingRow title="Send silently" description="Subscribers get the post without a notification sound." checked={draft.silent} onCheckedChange={set("silent")} />
                <SettingRow title="Protect content" description="Stops forwarding and saving of the post." checked={draft.protectContent} onCheckedChange={set("protectContent")} />
                {!draft.media.length ? (
                  <SettingRow title="No link preview" description="Don't expand the first link into a preview card." checked={draft.disablePreview} onCheckedChange={set("disablePreview")} />
                ) : null}
              </SettingsList>
            </div>
          ) : null}

          <Field label="Timing">
            <SegmentedTabs tabs={timingTabs} value={draft.timing} onChange={set("timing")} fullWidth />
          </Field>
          {draft.timing === "schedule" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={telegram ? "Publish at" : "Post at"} className="sm:col-span-2">
                <DateTimeField value={draft.scheduledAt} onChange={set("scheduledAt")} />
              </Field>
              {!telegram ? (
                <Field
                  label="Remind"
                  className="sm:col-span-2"
                  hint={
                    remindAt
                      ? `${memberName(members, draft.assigneeId)} gets an in-app notice and an email ${REMINDER_LEAD_OPTIONS.find((o) => Number(o.value) === leadMinutes)?.label.toLowerCase() || "at the scheduled time"} (${formatDateTime(remindAt)}).`
                      : "Pick a time to see when the reminder goes out."
                  }
                >
                  <Select value={draft.assigneeId || ""} onValueChange={set("assigneeId")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Who posts it?" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.name || m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {primaryLabel}
          </Button>
        </DialogFooter>

        <MediaPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          projectId={projectId}
          onPick={(asset) => addMedia({ url: asset.url, type: mediaTypeFor(asset.mime || asset.kind), name: asset.name, assetId: asset.id })}
        />
      </DialogContent>
    </Dialog>
  );
}
