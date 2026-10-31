"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, Check, Copy, ImageOff, Loader2, MessageSquareReply, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, ShieldCheck, Tags, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  InlineTitleInput,
  Input,
  ScreenHeader,
  SearchInput,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
  Switch,
  Textarea,
  Toolbar,
  cn,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getUser } from "@/lib/supabase/user";
import { listContactsByIds } from "@/lib/supabase/contacts";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import {
  createChatAutomation,
  listChatAutomations,
  listChatOutbox,
  normalizeChatAutomation,
  softDeleteChatAutomation,
  updateChatAutomation,
} from "@/lib/supabase/chat_automations";
import { listConnectionPosts } from "@/lib/chat/api";
import { KIND_CHANNELS, MAX_REPLY_OPTIONS, normalizeRef } from "@/lib/chat/rules";
import {
  ButtonsEditor,
  ChannelBadges,
  ChannelPicker,
  ConnectionNotice,
  DeleteDialog,
  DmPreview,
  EmptyPanel,
  FieldsEditor,
  FunnelBars,
  GuardrailsPanel,
  KeywordEditor,
  LoadingPanel,
  Notice,
  OUTLINE_BUTTON,
  PRIMARY_BUTTON,
  DANGER_ICON_BUTTON,
  ReplyVariantsEditor,
  StatusActions,
  TagInput,
  useChatConnections,
  useChatEdit,
  useStatusChange,
} from "./chat_kit";
import { useChatRefs } from "./chat_refs";
import {
  CHAT_STATUS_MAP,
  KIND_META,
  STATUS_FILTER_OPTIONS,
  blockReason,
  channelFilterOptions,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
  sinceIso,
} from "./constants";

// Shared list + editor for one-trigger chat automations (comment-to-DM, keyword, story, welcome, default
// reply, referral). Each screen passes the kinds it owns; rows live in campaign.chat_automations.

const quoteList = (items = [], max = 3) => {
  const shown = items.slice(0, max).map((k) => `“${k}”`).join(", ");
  return items.length > max ? `${shown} +${items.length - max}` : shown;
};

export function summarizeAutomation(a) {
  const t = a.trigger || {};
  switch (a.kind) {
    case "comment_to_dm": {
      const scope = t.allPosts ? "any post" : t.postIds.length ? `${t.postIds.length} ${t.postIds.length === 1 ? "post" : "posts"}` : "no posts chosen";
      const ads = t.includeAds ? (t.adIds.length ? ` and ${t.adIds.length} ${t.adIds.length === 1 ? "ad" : "ads"}` : " and ads") : "";
      const words = t.match === "any" ? "Any comment" : t.keywords.length ? `Comments with ${quoteList(t.keywords)}` : "No keywords yet";
      return `${words} on ${scope}${ads}`;
    }
    case "keyword":
      return t.keywords.length ? `${t.match === "exact" ? "Message is" : "Message contains"} ${quoteList(t.keywords)}` : "No keywords yet";
    case "story_reply":
      return t.match === "any" || !t.keywords.length ? "Any reply to your story" : `Story replies with ${quoteList(t.keywords)}`;
    case "story_mention":
      return "Any story that mentions you";
    case "welcome":
      return "First message from someone new";
    case "default_reply":
      return `Unmatched messages, once every ${Number(a.guardrails?.cooldownHours ?? 24)}h per person`;
    case "referral":
      return t.refs.length ? `Arrives with ref ${quoteList(t.refs)}` : "No ref values yet";
    default:
      return KIND_META[a.kind]?.label || a.kind;
  }
}

function defaultsFor(kind) {
  const trigger = { match: kind === "story_reply" ? "any" : "contains", keywords: [], allPosts: false, postIds: [], posts: [], includeAds: false, adIds: [], refs: [] };
  return {
    trigger,
    actions: { publicReplies: [], dm: { text: "", buttons: [], flowId: null }, tags: [], removeTags: [], fields: [], sequenceId: null },
    guardrails: { quietHours: { enabled: false, start: "21:00", end: "08:00", timezone: "UTC", behavior: "queue" }, oncePerPost: true, cooldownHours: 24 },
  };
}

const toDraft = (a) => ({
  name: a.name,
  description: a.description,
  channels: a.channels,
  priority: a.priority,
  trigger: a.trigger,
  actions: a.actions,
  guardrails: a.guardrails,
});

const replyLimit = (channels) => (channels.length ? Math.min(...channels.map((c) => MAX_REPLY_OPTIONS[c] ?? 12)) : 12);

function CreateDialog({ open, onOpenChange, kinds, connectedChannels, onCreate, creating }) {
  const [kind, setKind] = useState(kinds[0]);
  const [name, setName] = useState("");
  const [channels, setChannels] = useState([]);
  const allowed = KIND_CHANNELS[kind] || [];
  const reset = () => {
    setKind(kinds[0]);
    setName("");
    setChannels([]);
  };
  const submit = async () => {
    if (!name.trim()) return toast.error("Give the automation a name.");
    if (!channels.length) return toast.error("Choose at least one channel.");
    const ok = await onCreate({ kind, name: name.trim(), channels });
    if (ok) reset();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : (reset(), onOpenChange(false)))}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New {kinds.length === 1 ? KIND_META[kinds[0]].label.toLowerCase() : "automation"}</DialogTitle>
          <DialogDescription>It starts as a draft. Nothing is sent until you publish it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {kinds.length > 1 ? (
            <Field label="Type" hint={KIND_META[kind]?.description}>
              <Select
                value={kind}
                onValueChange={(k) => {
                  setKind(k);
                  setChannels((c) => c.filter((x) => (KIND_CHANNELS[k] || []).includes(x)));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_META[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Name" htmlFor="ca-name">
            <Input id="ca-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring guide giveaway" autoFocus />
          </Field>
          <Field label="Channels">
            <ChannelPicker value={channels} onChange={setChannels} allowed={allowed} connectedChannels={connectedChannels} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Live posts from the connected account (Graph API); ids can always be entered by hand instead.
function PostPickerDialog({ open, onOpenChange, connections, selected = [], onSave }) {
  const { projectId } = useProject();
  const usable = connections.filter((c) => ["instagram", "messenger"].includes(c.channel));
  const [chosenId, setConnectionId] = useState("");
  const connectionId = chosenId || usable[0]?.id || "";
  const [state, setState] = useState({ loading: false, items: [], error: null, loadedFor: null });
  const [picked, setPicked] = useState(selected);

  const load = async (id) => {
    if (!id) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    const res = await listConnectionPosts(projectId, id, "posts");
    setState({
      loading: false,
      items: res.ok ? res.data?.items || [] : [],
      error: res.ok ? res.data?.error || null : res.error || "Couldn't load posts.",
      loadedFor: id,
    });
  };

  const toggle = (post) =>
    setPicked((p) => (p.some((x) => x.id === post.id) ? p.filter((x) => x.id !== post.id) : [...p, { id: post.id, caption: post.caption, thumbnailUrl: post.thumbnailUrl, permalink: post.permalink, connectionId }]));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setPicked(selected);
          if (state.loadedFor !== connectionId) load(connectionId);
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose posts</DialogTitle>
          <DialogDescription>Comments on these posts and reels start the automation. Pulled live from the connected account.</DialogDescription>
        </DialogHeader>
        {usable.length ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Account" className="min-w-56 flex-1">
                <Select
                  value={connectionId}
                  onValueChange={(id) => {
                    setConnectionId(id);
                    load(id);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {usable.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name || c.handle || c.channel} · {c.channel === "instagram" ? "Instagram" : "Facebook"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => load(connectionId)} disabled={state.loading}>
                {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
              </Button>
            </div>
            {state.error ? <Notice tone="warning">{state.error}</Notice> : null}
            {state.loading ? (
              <LoadingPanel size={40} label="Loading posts" />
            ) : state.items.length ? (
              <div className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">
                {state.items.map((post) => {
                  const on = picked.some((p) => p.id === post.id);
                  return (
                    <button
                      key={post.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(post)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-2.5 text-left transition-colors",
                        on ? "border-foreground bg-surface-card" : "border-border bg-surface-subtle hover:bg-surface-hover",
                      )}
                    >
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-active">
                        {post.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-4 w-4 text-text-tertiary" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm text-foreground">{post.caption || "No caption"}</span>
                        <span className="mt-1 block text-xs text-text-tertiary">
                          {[post.mediaType, post.timestamp ? formatRelative(post.timestamp) : null, post.commentsCount != null ? `${formatNumber(post.commentsCount)} comments` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {on ? <Check className="h-4 w-4 shrink-0 text-foreground" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : !state.error && state.loadedFor ? (
              <p className="py-8 text-center text-sm text-text-secondary">This account has no posts yet.</p>
            ) : null}
          </div>
        ) : (
          <Notice tone="warning">No Instagram or Facebook account is connected. Enter post ids by hand, or connect an account in Social Accounts.</Notice>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className={PRIMARY_BUTTON}
            onClick={() => {
              onSave(picked);
              onOpenChange(false);
            }}
          >
            Use {picked.length} {picked.length === 1 ? "post" : "posts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostScope({ trigger, setTrigger, connections, disabled }) {
  const [picker, setPicker] = useState(false);
  const posts = trigger.postIds.map((id) => trigger.posts.find((p) => p.id === id) || { id });
  return (
    <div className="grid gap-4">
      <Field label="Watch">
        <SegmentedTabs
          tabs={[
            { value: "some", label: "Specific posts" },
            { value: "all", label: "All posts and reels" },
          ]}
          value={trigger.allPosts ? "all" : "some"}
          onChange={disabled ? undefined : (v) => setTrigger({ allPosts: v === "all" })}
        />
      </Field>
      {!trigger.allPosts ? (
        <div className="grid gap-2">
          {posts.length ? (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-card">
              {posts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-active">
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="h-3.5 w-3.5 text-text-tertiary" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{p.caption || "Post"}</span>
                    <span className="block truncate font-mono text-[11px] text-text-tertiary">{p.id}</span>
                  </span>
                  {!disabled ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove post"
                      className="text-text-tertiary hover:text-foreground"
                      onClick={() => setTrigger({ postIds: trigger.postIds.filter((x) => x !== p.id), posts: trigger.posts.filter((x) => x.id !== p.id) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">No posts chosen yet — comments won&apos;t trigger anything until you pick at least one.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setPicker(true)} disabled={disabled}>
              <Plus className="h-3.5 w-3.5" /> Choose posts
            </Button>
          </div>
          <Field label="Or paste post ids" hint="The media or post id from the platform, one per entry.">
            <TagInput
              value={trigger.postIds}
              onChange={(postIds) => setTrigger({ postIds, posts: trigger.posts.filter((p) => postIds.includes(p.id)) })}
              placeholder="e.g. 17895695668004550"
              disabled={disabled}
            />
          </Field>
        </div>
      ) : null}
      <SettingsList>
        <SettingRow
          title="Also watch ads"
          description={trigger.includeAds ? "Comments on ads (and dark posts) trigger it too." : "Only organic posts."}
          control={<Switch checked={trigger.includeAds} onCheckedChange={(includeAds) => setTrigger({ includeAds })} disabled={disabled} aria-label="Also watch ads" />}
        />
      </SettingsList>
      {trigger.includeAds ? (
        <Field label="Ad ids" hint="Leave empty to watch every ad on the account.">
          <TagInput value={trigger.adIds} onChange={(adIds) => setTrigger({ adIds })} placeholder="e.g. 120210000000000" disabled={disabled} />
        </Field>
      ) : null}
      <PostPickerDialog
        open={picker}
        onOpenChange={setPicker}
        connections={connections}
        selected={posts.filter((p) => p.caption != null || p.thumbnailUrl)}
        onSave={(picked) => {
          const manual = trigger.postIds.filter((id) => !trigger.posts.some((p) => p.id === id));
          setTrigger({ posts: picked, postIds: [...new Set([...picked.map((p) => p.id), ...manual])] });
        }}
      />
    </div>
  );
}

function TriggerSection({ kind, draft, setDraft, connections, connectedChannels, disabled }) {
  const t = draft.trigger;
  const setTrigger = (patch) => setDraft((d) => ({ ...d, trigger: { ...d.trigger, ...patch } }));
  return (
    <div className="space-y-6">
      <SectionCard bare title="Channels" description="Where this automation listens.">
        <div className="grid gap-3">
          <ChannelPicker value={draft.channels} onChange={(channels) => setDraft((d) => ({ ...d, channels }))} allowed={KIND_CHANNELS[kind]} connectedChannels={connectedChannels} disabled={disabled} />
          <ConnectionNotice channels={draft.channels} connectedChannels={connectedChannels} />
        </div>
      </SectionCard>

      {kind === "comment_to_dm" ? (
        <SectionCard bare title="Posts" description="Which posts' comments it answers.">
          <PostScope trigger={t} setTrigger={setTrigger} connections={connections} disabled={disabled} />
        </SectionCard>
      ) : null}

      {["comment_to_dm", "keyword", "story_reply"].includes(kind) ? (
        <SectionCard bare title={kind === "keyword" ? "Keywords" : "Matching"} description={kind === "comment_to_dm" ? "Which comments count." : kind === "story_reply" ? "Which story replies count." : "Words that start this reply."}>
          <KeywordEditor
            keywords={t.keywords}
            onKeywordsChange={(keywords) => setTrigger({ keywords })}
            match={kind === "keyword" && t.match === "any" ? "contains" : t.match}
            onMatchChange={(match) => setTrigger({ match })}
            allowAny={kind !== "keyword"}
            anyLabel={kind === "comment_to_dm" ? "Any comment" : "Any reply"}
            disabled={disabled}
          />
        </SectionCard>
      ) : null}

      {kind === "referral" ? (
        <SectionCard bare title="Ref values" description="The ?ref= (or Telegram ?start=) values this answers. Entry points generate these links.">
          <TagInput value={t.refs} onChange={(refs) => setTrigger({ refs })} transform={normalizeRef} placeholder="e.g. spring-qr" disabled={disabled} />
        </SectionCard>
      ) : null}

      {["story_mention", "welcome", "default_reply"].includes(kind) ? (
        <Notice>
          {kind === "story_mention"
            ? "Runs for every story that mentions your Instagram account. The mention opens a 24-hour window for one reply."
            : kind === "welcome"
              ? "Runs on the first message someone ever sends you on the channel, before keyword triggers are checked."
              : "Runs when no keyword trigger, flow or AI agent answered a message. It answers each person at most once per cooldown (set under Guardrails)."}
        </Notice>
      ) : null}

      <SectionCard bare title="Priority" description="When two automations of this type match the same message, the lower number runs.">
        <Input
          type="number"
          min={1}
          max={1000}
          value={draft.priority}
          onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
          className="w-32"
          aria-label="Priority"
          disabled={disabled}
        />
      </SectionCard>
    </div>
  );
}

function ResponseSection({ kind, draft, setDraft, flows, accountName, disabled }) {
  const dm = draft.actions.dm;
  const setActions = (patch) => setDraft((d) => ({ ...d, actions: { ...d.actions, ...patch } }));
  const setDm = (patch) => setActions({ dm: { ...dm, ...patch } });
  const [mode, setMode] = useState(dm.flowId && kind !== "comment_to_dm" ? "flow" : "message");
  const textOnly = draft.channels.length > 0 && draft.channels.every((c) => c === "tiktok");
  const limit = replyLimit(draft.channels);
  const previewChannel = draft.channels[0] || KIND_CHANNELS[kind][0];
  const flowOptions = flows.filter((f) => !f.channels.length || !draft.channels.length || draft.channels.some((c) => f.channels.includes(c)));

  const flowSelect = (label, hint) => (
    <Field label={label} hint={hint}>
      <Select value={dm.flowId || "none"} onValueChange={(v) => setDm({ flowId: v === "none" ? null : v })} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{kind === "comment_to_dm" ? "Don't continue" : "Choose a flow"}</SelectItem>
          {flowOptions.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
              {f.status !== "active" ? " (not live)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid content-start gap-6">
        {kind === "comment_to_dm" ? (
          <SectionCard bare title="Public reply" description="Posted under the comment after the DM goes out. Optional.">
            <ReplyVariantsEditor variants={draft.actions.publicReplies} onChange={(publicReplies) => setActions({ publicReplies })} disabled={disabled} />
          </SectionCard>
        ) : null}

        <SectionCard
          bare
          title={kind === "comment_to_dm" ? "Private reply" : "Direct reply"}
          description={kind === "comment_to_dm" ? "The one DM a comment allows. Use {first_name}, {name} or {username}." : "What the person receives. Use {first_name}, {name} or {username}."}
        >
          <div className="grid gap-4">
            {kind !== "comment_to_dm" ? (
              <SegmentedTabs
                tabs={[
                  { value: "message", label: "Send a message" },
                  { value: "flow", label: "Start a DM flow" },
                ]}
                value={mode}
                onChange={
                  disabled
                    ? undefined
                    : (v) => {
                        setMode(v);
                        if (v === "message") setDm({ flowId: null });
                      }
                }
              />
            ) : null}
            {mode === "flow" && kind !== "comment_to_dm" ? (
              flowSelect("Flow", flowOptions.length ? "The flow takes over the conversation from here." : "No flows on these channels yet — build one in DM Flows.")
            ) : (
              <>
                <Field label="Message" htmlFor="ca-dm">
                  <Textarea id="ca-dm" value={dm.text} onChange={(e) => setDm({ text: e.target.value })} rows={4} maxLength={1000} placeholder="e.g. Here's the spring guide, {first_name}!" disabled={disabled} />
                </Field>
                {textOnly ? (
                  <Notice>TikTok DMs are text-only, so buttons aren&apos;t available.</Notice>
                ) : (
                  <Field label="Buttons" hint={limit < 12 ? `These channels allow ${limit} reply options plus “Talk to a person”.` : undefined}>
                    <ButtonsEditor buttons={dm.buttons} onChange={(buttons) => setDm({ buttons })} allowReply={limit > 0} maxReplies={limit} disabled={disabled} />
                  </Field>
                )}
                {kind === "comment_to_dm" ? flowSelect("When they reply, continue in", "Optional. Their reply to this DM starts the flow.") : null}
              </>
            )}
          </div>
        </SectionCard>
      </div>
      <div className="xl:sticky xl:top-4 xl:self-start">
        <DmPreview
          channel={previewChannel}
          accountName={accountName}
          comment={kind === "comment_to_dm" ? (draft.trigger.keywords[0] ? `I want the ${draft.trigger.keywords[0]}!` : "Love this, how do I get it?") : null}
          incoming={
            kind === "comment_to_dm"
              ? null
              : kind === "story_mention"
                ? "Mentioned you in their story"
                : kind === "story_reply"
                  ? "Replied to your story"
                  : kind === "referral"
                    ? `Opened your link (ref ${draft.trigger.refs[0] || "…"})`
                    : draft.trigger.keywords[0] || "Hi!"
          }
          publicReply={kind === "comment_to_dm" ? draft.actions.publicReplies.find((v) => v.trim()) : null}
          text={mode === "flow" && kind !== "comment_to_dm" ? (dm.flowId ? "The flow's first message is sent here." : "") : dm.text}
          buttons={mode === "flow" && kind !== "comment_to_dm" ? [] : dm.buttons}
        />
      </div>
    </div>
  );
}

function ActionsSection({ draft, setDraft, sequences, disabled }) {
  const a = draft.actions;
  const setActions = (patch) => setDraft((d) => ({ ...d, actions: { ...d.actions, ...patch } }));
  return (
    <div className="space-y-6">
      <SectionCard bare title="Tags" description="Applied to the contact when the automation runs. Tag-triggered sequences and workflows pick them up.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Add tags">
            <TagInput value={a.tags} onChange={(tags) => setActions({ tags })} placeholder="e.g. spring-guide" disabled={disabled} />
          </Field>
          <Field label="Remove tags">
            <TagInput value={a.removeTags} onChange={(removeTags) => setActions({ removeTags })} placeholder="e.g. cold" disabled={disabled} />
          </Field>
        </div>
      </SectionCard>
      <SectionCard bare title="Fields" description="Saved on the contact's custom fields.">
        <FieldsEditor fields={a.fields} onChange={(fields) => setActions({ fields })} disabled={disabled} />
      </SectionCard>
      <SectionCard bare title="Follow-up sequence" description="Enroll the person in a timed DM sequence after this reply.">
        <Select value={a.sequenceId || "none"} onValueChange={(v) => setActions({ sequenceId: v === "none" ? null : v })} disabled={disabled}>
          <SelectTrigger className="w-full sm:max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No sequence</SelectItem>
            {sequences.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.status !== "active" ? " (not live)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SectionCard>
    </div>
  );
}

function GuardrailSection({ kind, draft, setDraft, disabled }) {
  const g = draft.guardrails;
  const setGuardrails = (next) => setDraft((d) => ({ ...d, guardrails: next }));
  const extra =
    kind === "comment_to_dm" ? (
      <SettingsList>
        <SettingRow
          title="One DM per person per post"
          description={g.oncePerPost ? "Someone who comments twice on the same post gets one DM." : "Each comment gets its own private reply (still within the 24-hour cap)."}
          control={<Switch checked={g.oncePerPost} onCheckedChange={(oncePerPost) => setGuardrails({ ...g, oncePerPost })} disabled={disabled} aria-label="One DM per person per post" />}
        />
      </SettingsList>
    ) : kind === "default_reply" ? (
      <Field label="Answer the same person at most every" hint="Stops the default reply from answering every message in a back-and-forth.">
        <Select value={String(g.cooldownHours)} onValueChange={(v) => setGuardrails({ ...g, cooldownHours: Number(v) })} disabled={disabled}>
          <SelectTrigger className="w-full sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 6, 12, 24, 72, 168].map((h) => (
              <SelectItem key={h} value={String(h)}>
                {h < 24 ? `${h} ${h === 1 ? "hour" : "hours"}` : `${h / 24} ${h === 24 ? "day" : "days"}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    ) : null;
  return <GuardrailsPanel kind={kind} channels={draft.channels} guardrails={g} onChange={setGuardrails} disabled={disabled} extra={extra} />;
}

function ActivitySection({ record }) {
  const { projectId } = useProject();
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      listTrackedEvents(projectId, { names: ["social.dm_blocked", "social.dm_click", "social.automation_triggered"], since: sinceIso(), limit: 2000 }),
      listChatOutbox(projectId, { sourceId: record.id, limit: 100 }),
    ]).then(async ([events, outbox]) => {
      const mine = (events ?? []).filter((e) => e.properties?.automationId === record.id);
      const blocked = mine.filter((e) => e.name === "social.dm_blocked");
      const ids = [...new Set([...blocked.map((e) => e.contactId), ...(outbox ?? []).map((o) => o.contactId)].filter(Boolean))];
      const contacts = ids.length ? await listContactsByIds(projectId, ids) : [];
      if (!alive) return;
      setData({
        triggered30: mine.filter((e) => e.name === "social.automation_triggered").length,
        clicks30: mine.filter((e) => e.name === "social.dm_click").length,
        blocked,
        outbox: outbox ?? [],
        contacts: new Map((contacts ?? []).map((c) => [c.id, c])),
      });
    });
    return () => {
      alive = false;
    };
  }, [projectId, record.id]);

  if (!data) return <LoadingPanel size={40} label="Loading activity" />;
  const s = record.stats;
  const steps = [
    { label: "Triggered", value: s.triggered, hint: KIND_META[record.kind]?.event },
    ...(record.kind === "comment_to_dm" ? [{ label: "Public replies", value: s.publicReplies }] : []),
    { label: "DMs sent", value: s.dmsSent },
  ];
  const contactName = (id) => (id ? data.contacts.get(id)?.name || "Unknown contact" : "Unknown person");
  const held = [
    ...data.blocked.map((e) => ({ id: e.id, contactId: e.contactId, channel: e.properties?.channel, status: "Blocked", reason: e.properties?.reason, at: e.occurredAt })),
    ...data.outbox.map((o) => ({ id: o.id, contactId: o.contactId, channel: o.channel, status: o.status === "queued" ? `Queued until ${formatDateTime(o.sendAfter)}` : o.status === "sent" ? "Sent after quiet hours" : "Not sent", reason: o.reason || "quiet_hours", at: o.createdAt })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return (
    <div className="grid gap-5">
      <FunnelBars steps={steps} />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Triggered (30 days)", value: formatNumber(data.triggered30) },
          { label: "Link clicks (30 days)", value: formatNumber(data.clicks30) },
          { label: "Held by guardrails", value: formatNumber(s.dmsBlocked + s.queued), hint: `${formatPercent(s.dmsBlocked, s.triggered)} of triggers blocked` },
        ].map((t) => (
          <div key={t.label} className="rounded-lg border border-border bg-surface-subtle px-4 py-3">
            <p className="text-xs text-text-secondary">{t.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{t.value}</p>
            {t.hint ? <p className="text-[11px] text-text-tertiary">{t.hint}</p> : null}
          </div>
        ))}
      </div>
      <SectionCard title="Held back" description="DMs the guardrails blocked or queued in the last 30 days, with the rule that stopped them.">
        <DataTable
          columns={[
            { key: "contact", header: "Person", render: (r) => <span className="font-medium text-foreground">{contactName(r.contactId)}</span> },
            { key: "channel", header: "Channel", className: "capitalize text-muted-foreground", render: (r) => r.channel || "—" },
            { key: "status", header: "Outcome", render: (r) => <Badge variant={r.status === "Blocked" || r.status === "Not sent" ? "warning" : "info"}>{r.status}</Badge> },
            { key: "reason", header: "Why", className: "text-muted-foreground", render: (r) => <span className="block max-w-md text-sm">{blockReason(r.reason)}</span> },
            { key: "at", header: "When", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (r) => formatRelative(r.at) },
          ]}
          data={held.slice(0, 50)}
          getRowKey={(r) => r.id}
          empty={<p className="px-4 py-8 text-center text-sm text-text-secondary">Nothing held back — every triggered DM was within the rules.</p>}
        />
      </SectionCard>
    </div>
  );
}

const EDITOR_NAV = [
  { key: "trigger", label: "Trigger", icon: MessageSquareReply, desc: "What starts it and where it listens." },
  { key: "response", label: "Reply", icon: Pencil, desc: "What the person receives." },
  { key: "actions", label: "Contact updates", icon: Tags, desc: "Tags, fields and follow-up sequences." },
  { key: "guardrails", label: "Guardrails", icon: ShieldCheck, desc: "Platform rules and quiet hours." },
  { key: "activity", label: "Activity", icon: Activity, desc: "Funnel and what the guardrails held back." },
];

function ChatAutomationEditor({ record, onBack, onSaved, onDelete, connections, connectedChannels, refs }) {
  const canEdit = useChatEdit();
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const { pendingId, change } = useStatusChange({ resource: "automations", normalize: normalizeChatAutomation, label: "Automation" });
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const disabled = !canEdit;
  const account = connections.find((c) => c.channel === (draft.channels[0] || KIND_CHANNELS[record.kind][0]));

  const save = async ({ quiet = false } = {}) => {
    setSaving(true);
    const patch = { ...draft, name: draft.name.trim() || "Untitled automation", priority: Number(draft.priority) || 100 };
    const saved = await updateChatAutomation(record.id, patch);
    setSaving(false);
    if (!saved) {
      toast.error("Couldn't save the automation.");
      return null;
    }
    onSaved(saved);
    setDraft(toDraft(saved));
    if (!quiet) toast.success("Saved.");
    return saved;
  };

  const setStatus = async (action) => {
    if (dirty && !(await save({ quiet: true }))) return;
    const next = await change(record, action);
    if (next) onSaved(next);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          aria-label="Automation name"
          placeholder="Untitled automation"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          disabled={disabled}
        />
      }
      status={record.status}
      statusMap={CHAT_STATUS_MAP}
      badges={
        <>
          <Badge variant="outline">{KIND_META[record.kind]?.label}</Badge>
          <ChannelBadges channels={draft.channels} />
        </>
      }
      meta={[summarizeAutomation({ ...record, ...draft }), record.lastTriggeredAt ? `Last triggered ${formatRelative(record.lastTriggeredAt)}` : null].filter(Boolean).join(" · ")}
      actions={
        <>
          {canEdit ? (
            <Button variant="ghost" size="icon" aria-label="Delete automation" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={() => save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
          <StatusActions status={record.status} pending={pendingId === record.id || saving} canEdit={canEdit} onPublish={() => setStatus("publish")} onPause={() => setStatus("pause")} />
        </>
      }
      nav={EDITOR_NAV}
      defaultSection="trigger"
    >
      {({ active }) => (
        <>
          {active === "trigger" ? <TriggerSection kind={record.kind} draft={draft} setDraft={setDraft} connections={connections} connectedChannels={connectedChannels} disabled={disabled} /> : null}
          {active === "response" ? <ResponseSection kind={record.kind} draft={draft} setDraft={setDraft} flows={refs.flows || []} accountName={account?.handle || account?.name || "Your account"} disabled={disabled} /> : null}
          {active === "actions" ? <ActionsSection draft={draft} setDraft={setDraft} sequences={refs.sequences || []} disabled={disabled} /> : null}
          {active === "guardrails" ? <GuardrailSection kind={record.kind} draft={draft} setDraft={setDraft} disabled={disabled} /> : null}
          {active === "activity" ? <ActivitySection record={record} /> : null}
        </>
      )}
    </EditorShell>
  );
}

export function ChatAutomationsScreen({ kinds, title, description, createLabel = "New automation", emptyTitle, emptyDescription, icon: Icon = MessageSquareReply }) {
  const { projectId } = useProject();
  const canEdit = useChatEdit();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const { connections, connectedChannels } = useChatConnections();
  const refs = useChatRefs(["flows", "sequences"]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { pendingId, change } = useStatusChange({ resource: "automations", normalize: normalizeChatAutomation, label: "Automation" });
  const kindKey = kinds.join(",");

  useEffect(() => {
    let alive = true;
    listChatAutomations(projectId, { kinds: kindKey.split(",") }).then((result) => {
      if (!alive) return;
      if (result === null) toast.error("Couldn't load automations.");
      setRows(result ?? []);
      setLoading(false);
    });
    getUser().then((u) => alive && setUserId(u?.id ?? null));
    return () => {
      alive = false;
    };
  }, [projectId, kindKey]);

  const replaceRow = (next) => setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));

  const channels = useMemo(() => [...new Set(kinds.flatMap((k) => KIND_CHANNELS[k] || []))], [kinds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (channelFilter !== "all" && !r.channels.includes(channelFilter)) return false;
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (q && !`${r.name} ${r.description} ${summarizeAutomation(r)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, statusFilter, channelFilter, kindFilter]);

  const stats = useMemo(() => {
    const live = rows.filter((r) => r.status === "active").length;
    const sum = (k) => rows.reduce((n, r) => n + Number(r.stats[k] || 0), 0);
    const triggered = sum("triggered");
    const sent = sum("dmsSent");
    const blocked = sum("dmsBlocked");
    const queued = sum("queued");
    return [
      { label: "Live", value: formatNumber(live), footer: `${formatNumber(rows.length)} in total` },
      { label: "Triggered", value: formatNumber(triggered), footer: "Since each was published" },
      { label: "DMs sent", value: formatNumber(sent), footer: `${formatPercent(sent, triggered)} of triggers` },
      { label: "Held by guardrails", value: formatNumber(blocked + queued), footer: queued ? `${formatNumber(queued)} queued for quiet hours` : "Blocked to stay within platform rules" },
    ];
  }, [rows]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${channelFilter}|${kindFilter}` });

  const create = async ({ kind, name, channels: chosen }) => {
    setCreating(true);
    const id = crypto.randomUUID();
    const saved = await createChatAutomation(projectId, { id, kind, name, channels: chosen, status: "draft", ...defaultsFor(kind), createdBy: userId });
    setCreating(false);
    if (!saved) {
      toast.error("Couldn't create the automation.");
      return false;
    }
    setRows((prev) => [saved, ...prev]);
    setCreateOpen(false);
    toast.success(`“${saved.name}” created as a draft.`);
    openRecord(saved.id);
    return true;
  };

  const duplicate = async (row) => {
    const id = crypto.randomUUID();
    const copy = { ...toDraft(row), id, kind: row.kind, name: `${row.name} (copy)`, status: "draft", createdBy: userId };
    const optimistic = normalizeChatAutomation({ id, project_id: projectId, kind: row.kind, name: copy.name, status: "draft", channels: row.channels, trigger: row.trigger, actions: row.actions, guardrails: row.guardrails, priority: row.priority, created_at: new Date().toISOString() });
    setRows((prev) => [optimistic, ...prev]);
    const saved = await createChatAutomation(projectId, copy);
    if (!saved) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.error("Couldn't duplicate the automation.");
      return;
    }
    replaceRow(saved);
    toast.success("Duplicated as a draft.");
  };

  const confirmDelete = async (row) => {
    setDeleting(true);
    const before = rows;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const ok = await softDeleteChatAutomation(row.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      setRows(before);
      toast.error("Couldn't delete the automation.");
      return;
    }
    if (recordId === row.id) closeRecord();
    toast.success("Automation deleted.");
  };

  const toggleStatus = async (row) => {
    const next = await change(row, row.status === "active" ? "pause" : "publish");
    if (next) replaceRow(next);
  };

  const open = !loading ? rows.find((r) => r.id === recordId) : null;
  if (open) {
    return (
      <>
        <ChatAutomationEditor
          key={open.id}
          record={open}
          onBack={closeRecord}
          onSaved={replaceRow}
          onDelete={setDeleteTarget}
          connections={connections}
          connectedChannels={connectedChannels}
          refs={refs}
        />
        <DeleteDialog target={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} pending={deleting} />
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || channelFilter !== "all" || kindFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setChannelFilter("all");
    setKindFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Automation",
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="max-w-md truncate text-xs text-text-secondary">{summarizeAutomation(r)}</span>
        </div>
      ),
    },
    ...(kinds.length > 1 ? [{ key: "kind", header: "Type", render: (r) => <Badge variant="outline">{KIND_META[r.kind]?.short}</Badge> }] : []),
    { key: "channels", header: "Channels", render: (r) => <ChannelBadges channels={r.channels} /> },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={CHAT_STATUS_MAP} /> },
    { key: "triggered", header: "Triggered", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => formatNumber(r.stats.triggered) },
    { key: "sent", header: "DMs sent", align: "right", className: "tabular-nums text-muted-foreground", render: (r) => formatNumber(r.stats.dmsSent) },
    {
      key: "held",
      header: "Held",
      align: "right",
      className: "tabular-nums",
      render: (r) => {
        const held = r.stats.dmsBlocked + r.stats.queued;
        return <span className={held ? "text-amber-600 dark:text-amber-400" : "text-text-tertiary"} title="Blocked or queued by the guardrails">{formatNumber(held)}</span>;
      },
    },
    { key: "last", header: "Last triggered", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (r) => formatRelative(r.lastTriggeredAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`} className="text-text-tertiary hover:text-foreground">
                {pendingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              <DropdownMenuItem onClick={() => openRecord(r.id)}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              {canEdit ? (
                <>
                  <DropdownMenuItem onClick={() => toggleStatus(r)}>
                    {r.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {r.status === "active" ? "Pause" : r.status === "paused" ? "Resume" : "Publish"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicate(r)}>
                    <Copy className="h-4 w-4" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" className="text-red-600 focus:bg-red-500/10 dark:text-red-400" onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={title}
        description={description}
        actions={
          canEdit ? (
            <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {createLabel}
            </Button>
          ) : null
        }
      />
      <StatsBar stats={stats} />
      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          {kinds.length > 1 ? (
            <FilterDropdown
              value={kindFilter}
              onValueChange={setKindFilter}
              options={[{ value: "all", label: "All types" }, ...kinds.map((k) => ({ value: k, label: KIND_META[k].label }))]}
              height="h-9"
            />
          ) : null}
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          {channels.length > 1 ? <FilterDropdown value={channelFilter} onValueChange={setChannelFilter} options={channelFilterOptions(channels)} height="h-9" /> : null}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search automations…" />
      </Toolbar>

      {loading ? (
        <LoadingPanel label="Loading automations" />
      ) : !rows.length ? (
        <EmptyPanel
          icon={Icon}
          title={emptyTitle}
          description={emptyDescription}
          action={
            canEdit ? (
              <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> {createLabel}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(r) => r.id}
            onRowClick={(r) => openRecord(r.id)}
            empty={
              <EmptyPanel
                icon={Icon}
                title="No matches"
                description="Try a different search or filter."
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="automations" />
        </div>
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} kinds={kinds} connectedChannels={connectedChannels} onCreate={create} creating={creating} />
      <DeleteDialog target={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} pending={deleting} />
    </MainScreenWrapper>
  );
}

export default ChatAutomationsScreen;
