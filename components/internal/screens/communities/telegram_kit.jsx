"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bot, CheckCircle2, Circle, Loader2, RefreshCw, Unlink } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  cn,
} from "@geiger/ui";
import { apiPost } from "@/lib/api/client";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listConnections } from "@/lib/supabase/channel_connections";
import { listCommunityChannels, normalizeCommunityChannel, softDeleteCommunityChannel, updateCommunityChannel } from "@/lib/supabase/community_channels";
import { listCommunityPosts } from "@/lib/supabase/community_posts";
import { PARSE_MODES } from "@/lib/communities/telegram_format";
import { ConfirmDialog, DANGER_BUTTON, Notice, OUTLINE_BUTTON, PRIMARY_BUTTON } from "./communities_kit";
import { formatRelative } from "./constants";

export const botLabel = (bot) => (bot ? (bot.handle ? `@${bot.handle.replace(/^@/, "")}` : bot.name || "Telegram bot") : "No bot");

// Telegram chats of one platform plus the project's bots and posts, fetched together on mount.
export function useTelegramChats(projectId, platform) {
  const [chats, setChats] = useState([]);
  const [bots, setBots] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([
      listCommunityChannels(projectId, { platform, includePending: true }),
      listConnections(projectId, { channel: "telegram" }),
      listCommunityPosts(projectId, { limit: 1000 }),
    ]).then(([c, b, p]) => {
      if (!alive) return;
      if (c === null) toast.error("Couldn't load your Telegram chats.");
      setChats(c ?? []);
      setBots(b ?? []);
      setPosts(p ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, platform]);

  const upsert = (row) => setChats((prev) => (prev.some((c) => c.id === row.id) ? prev.map((c) => (c.id === row.id ? row : c)) : [...prev, row]));
  return { chats, setChats, upsert, bots, posts, setPosts, loading };
}

const STEPS = {
  telegram_channel: [
    "In Telegram, open the channel → Administrators → Add admin, and pick your bot.",
    "Keep “Post messages” on (and “Invite users” for join links).",
    "Pick it below once it's detected, or enter its @username or numeric id.",
  ],
  telegram_group: [
    "In Telegram, open the group → Administrators → Add admin, and pick your bot.",
    "Give it “Delete messages” and “Ban users” for moderation, and “Invite users” for join links.",
    "Pick it below once it's detected, or enter its @username or numeric id.",
  ],
};

export function LinkTelegramDialog({ open, onOpenChange, projectId, platform, bots, detected, onLinked }) {
  const { setTab } = useWorkspaceUrl();
  const connected = bots.filter((b) => b.status !== "disconnected");
  const [botId, setBotId] = useState(connected[0]?.id || "");
  const [chat, setChat] = useState("");
  const [pending, setPending] = useState(null);
  const noun = platform === "telegram_group" ? "group" : "channel";
  const candidates = detected.filter((d) => !botId || d.connectionId === botId);

  const link = async (ref, key) => {
    if (!botId) {
      toast.error("Pick the bot to link with.");
      return;
    }
    setPending(key);
    const res = await apiPost(`/api/projects/${projectId}/communities/telegram/link`, { connectionId: botId, chat: ref, platform });
    setPending(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const channel = normalizeCommunityChannel(res.data.channel);
    onLinked(channel);
    toast.success(`${channel.name} linked.`);
    for (const warning of res.data.warnings || []) toast.warning(warning);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a Telegram {noun}</DialogTitle>
          <DialogDescription>Your bot posts and moderates for you. Geiger checks it&apos;s an admin with the right permissions before linking.</DialogDescription>
        </DialogHeader>
        {!connected.length ? (
          <Notice
            title="No Telegram bot connected"
            action={
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setTab("Telegram")}>
                Connect a bot
              </Button>
            }
          >
            Create a bot with @BotFather, then connect its token in Channels → Telegram.
          </Notice>
        ) : (
          <div className="grid gap-4">
            <ol className="space-y-1.5 rounded-lg border border-border bg-surface-card px-4 py-3 text-sm text-text-secondary">
              {STEPS[platform].map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="w-4 shrink-0 tabular-nums text-text-tertiary">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <Field label="Bot">
              <Select value={botId} onValueChange={setBotId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a bot" />
                </SelectTrigger>
                <SelectContent>
                  {connected.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {botLabel(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {candidates.length ? (
              <Field label={`Detected ${noun}s`} hint="Chats this bot was added to as an admin.">
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface-card">
                  {candidates.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{d.name || d.externalChatId}</p>
                        <p className="truncate text-xs text-text-tertiary">
                          {d.handle ? `@${d.handle}` : d.externalChatId} · added {formatRelative(d.createdAt)}
                        </p>
                      </div>
                      <Button size="sm" className={PRIMARY_BUTTON} disabled={!!pending} onClick={() => link(d.externalChatId, d.id)}>
                        {pending === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Link
                      </Button>
                    </li>
                  ))}
                </ul>
              </Field>
            ) : null}
            <Field label={`${noun === "group" ? "Group" : "Channel"} @username or id`} htmlFor="tg-chat" hint="e.g. @halcyondispatch, https://t.me/halcyondispatch or -1001234567890. Private invite links can't be looked up.">
              <Input id="tg-chat" value={chat} onChange={(e) => setChat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && chat.trim() && link(chat.trim(), "manual")} placeholder="@yourchannel" />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!pending}>
            Cancel
          </Button>
          {connected.length ? (
            <Button className={PRIMARY_BUTTON} disabled={!chat.trim() || !!pending} onClick={() => link(chat.trim(), "manual")}>
              {pending === "manual" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verify &amp; link
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RIGHTS = {
  telegram_channel: [
    ["canPost", "Post messages", "Publishes your scheduled posts."],
    ["canEdit", "Edit messages", "Optional."],
    ["canInvite", "Invite users", "Creates named invite links for join attribution."],
  ],
  telegram_group: [
    ["canDelete", "Delete messages", "Removes messages that break a rule."],
    ["canRestrict", "Ban users", "Mutes and bans for repeat offenders."],
    ["canInvite", "Invite users", "Creates named invite links for join attribution."],
  ],
};

// Bot rights as last verified, re-check, posting defaults (channels) and unlink.
export function TelegramSettingsSection({ projectId, channel, bot, canEdit, onChannelChange, onUnlinked }) {
  const rights = channel.settings?.rights || {};
  const [verifying, setVerifying] = useState(false);
  const [defaults, setDefaults] = useState(() => ({ parseMode: "none", silent: false, protectContent: false, disablePreview: false, ...(channel.settings?.defaults || {}) }));
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const saved = useMemo(() => ({ parseMode: "none", silent: false, protectContent: false, disablePreview: false, ...(channel.settings?.defaults || {}) }), [channel.settings]);
  const dirty = JSON.stringify(defaults) !== JSON.stringify(saved);
  const isChannel = channel.platform === "telegram_channel";

  const verify = async () => {
    setVerifying(true);
    const res = await apiPost(`/api/projects/${projectId}/communities/channels/${channel.id}/verify`);
    setVerifying(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onChannelChange(normalizeCommunityChannel(res.data.channel));
    if (res.data.warnings?.length) res.data.warnings.forEach((w) => toast.warning(w));
    else toast.success("The bot has everything it needs.");
  };

  const saveDefaults = async () => {
    setSaving(true);
    const settings = { ...channel.settings, defaults };
    onChannelChange({ ...channel, settings });
    const row = await updateCommunityChannel(channel.id, { settings });
    setSaving(false);
    if (!row) {
      onChannelChange(channel);
      toast.error("Couldn't save the defaults.");
      return;
    }
    onChannelChange(row);
    toast.success("Posting defaults saved.");
  };

  const unlink = async () => {
    setUnlinking(true);
    const ok = await softDeleteCommunityChannel(channel.id);
    setUnlinking(false);
    if (!ok) {
      toast.error("Couldn't unlink the chat.");
      return;
    }
    setConfirm(false);
    toast.success(`${channel.name} unlinked.`);
    onUnlinked(channel);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Bot access"
        description={`${botLabel(bot)} · last checked ${formatRelative(rights.checkedAt || channel.lastSyncedAt)}`}
        action={
          canEdit ? (
            <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={verify} disabled={verifying}>
              {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-check
            </Button>
          ) : null
        }
      >
        {channel.status === "error" && channel.settings?.statusReason ? (
          <Notice tone="warning" className="mb-4" title="The bot can't do its job">
            {channel.settings.statusReason}
          </Notice>
        ) : null}
        <ul className="space-y-2.5">
          <li className="flex items-start gap-2.5">
            {rights.isAdmin ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Circle className="mt-0.5 h-4 w-4 text-text-tertiary" />}
            <div>
              <p className="text-sm font-medium text-foreground">Admin of this {isChannel ? "channel" : "group"}</p>
              <p className="text-xs text-text-secondary">{rights.isAdmin ? "Verified with getChatMember." : "Add the bot as an admin in Telegram, then re-check."}</p>
            </div>
          </li>
          {RIGHTS[channel.platform].map(([key, label, hint]) => (
            <li key={key} className="flex items-start gap-2.5">
              {rights[key] ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Circle className="mt-0.5 h-4 w-4 text-text-tertiary" />}
              <div>
                <p className={cn("text-sm font-medium", rights[key] ? "text-foreground" : "text-text-secondary")}>{label}</p>
                <p className="text-xs text-text-secondary">{hint}</p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      {isChannel ? (
        <SectionCard
          bare
          title="Posting defaults"
          description="Applied to new posts; each post can override them."
          action={
            canEdit ? (
              <Button size="sm" className={PRIMARY_BUTTON} disabled={!dirty || saving} onClick={saveDefaults}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
              </Button>
            ) : null
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Formatting">
              <Select value={defaults.parseMode} onValueChange={(v) => setDefaults((d) => ({ ...d, parseMode: v }))} disabled={!canEdit}>
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
          </div>
          <SettingsList className="mt-5 border-t border-border pt-4">
            <SettingRow title="Send silently" description="No notification sound for subscribers." checked={defaults.silent} onCheckedChange={(v) => canEdit && setDefaults((d) => ({ ...d, silent: v }))} />
            <SettingRow title="Protect content" description="Stop forwarding and saving." checked={defaults.protectContent} onCheckedChange={(v) => canEdit && setDefaults((d) => ({ ...d, protectContent: v }))} />
            <SettingRow title="No link previews" description="Don't expand links in text posts." checked={defaults.disablePreview} onCheckedChange={(v) => canEdit && setDefaults((d) => ({ ...d, disablePreview: v }))} />
          </SettingsList>
        </SectionCard>
      ) : null}

      {canEdit ? (
        <SectionCard bare title="Unlink" description={`Geiger stops ${isChannel ? "posting to" : "moderating"} this ${isChannel ? "channel" : "group"}. Remove the bot in Telegram to revoke its access entirely.`}>
          <Button className={DANGER_BUTTON} onClick={() => setConfirm(true)}>
            <Unlink className="h-4 w-4" /> Unlink {isChannel ? "channel" : "group"}
          </Button>
        </SectionCard>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title={`Unlink ${channel.name}`}
        description="Scheduled posts stop, moderation stops and join links stop redirecting. History stays in reporting."
        confirmLabel="Unlink"
        pending={unlinking}
        onCancel={() => setConfirm(false)}
        onConfirm={unlink}
      />
    </div>
  );
}

export function BotCell({ bot }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
      <Bot className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
      {botLabel(bot)}
    </span>
  );
}
