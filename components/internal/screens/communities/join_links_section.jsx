"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Code2, Copy, ExternalLink, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Textarea,
} from "@geiger/ui";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { apiDelete, apiPost } from "@/lib/api/client";
import { normalizeJoinLink, updateJoinLink } from "@/lib/supabase/join_links";
import { PLATFORMS, isTelegramPlatform, normalizeSlug } from "@/lib/communities/platforms";
import { ConfirmDialog, CopyButton, ListEmptyState, Notice, OUTLINE_BUTTON, PRIMARY_BUTTON, copyText } from "./communities_kit";
import { SOURCE_OPTIONS, formatDate, formatNumber, formatPercent, sourceLabel, toLocalInput, fromLocalInput } from "./constants";

const ctaLabel = (channel) =>
  ({
    telegram_channel: "Join us on Telegram",
    telegram_group: "Join the group on Telegram",
    whatsapp_channel: "Follow us on WhatsApp",
    instagram_broadcast: "Join our Instagram channel",
  })[channel.platform] || "Join us";

function emailButton(url, label) {
  return `<a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#111827;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none">${label}</a>`;
}

// Short link + paste-ready snippets for emails, landing pages and link-in-bio.
function EmbedDialog({ link, channel, onClose }) {
  const label = ctaLabel(channel);
  const snippets = link
    ? [
        { key: "url", title: "Short link", hint: "Link-in-bio, QR codes, social posts.", value: link.shortUrl },
        { key: "email", title: "Email button", hint: "Paste into an HTML block in the email builder.", value: emailButton(link.shortUrl, label) },
        { key: "html", title: "Landing page link", hint: "Plain HTML for a landing page or website.", value: `<a href="${link.shortUrl}" rel="noopener">${label}</a>` },
        { key: "md", title: "Markdown", hint: "Docs, READMEs and community posts.", value: `[${label}](${link.shortUrl})` },
      ]
    : [];
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Use this join link</DialogTitle>
          <DialogDescription>Every click through these goes via {link?.shortUrl?.replace(/^https?:\/\//, "")} and is counted against “{link?.name}”.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {snippets.map((s) => (
            <Field key={s.key} label={s.title} hint={s.hint}>
              <div className="flex items-start gap-2">
                <Textarea readOnly value={s.value} rows={s.key === "email" ? 3 : 1} className="min-h-0 resize-none font-mono text-xs" onFocus={(e) => e.target.select()} />
                <CopyButton value={s.value} label={`Copy ${s.title.toLowerCase()}`} iconOnly message={`${s.title} copied.`} />
              </div>
            </Field>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ open, onOpenChange, channel, link, onCreate, onUpdate }) {
  const telegram = isTelegramPlatform(channel.platform);
  const editing = Boolean(link);
  const [form, setForm] = useState(() => ({
    name: link?.name || "",
    source: link?.utm?.source || "email",
    campaign: link?.utm?.campaign || "",
    slug: "",
    memberLimit: "",
    expiresAt: "",
    approval: false,
  }));
  const [pending, setPending] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Name the link after where it'll be used.");
      return;
    }
    const utm = { ...(link?.utm || {}), source: form.source, medium: link?.utm?.medium || (form.source === "email" ? "email" : form.source === "qr" ? "offline" : "referral") };
    if (form.campaign.trim()) utm.campaign = form.campaign.trim();
    else delete utm.campaign;
    setPending(true);
    const ok = editing
      ? await onUpdate(link, { name: form.name.trim(), utm })
      : await onCreate({
          name: form.name.trim(),
          utm,
          slug: form.slug ? normalizeSlug(form.slug) : undefined,
          memberLimit: telegram && !form.approval && Number(form.memberLimit) > 0 ? Number(form.memberLimit) : undefined,
          expiresAt: telegram ? fromLocalInput(form.expiresAt) || undefined : undefined,
          createsJoinRequest: telegram ? form.approval : undefined,
        });
    setPending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit join link" : "New join link"}</DialogTitle>
          <DialogDescription>
            {telegram
              ? "Creates a named Telegram invite link behind a short URL, so every join through it is attributed here."
              : `A short URL that sends people to the channel's ${PLATFORMS[channel.platform].appLabel} page and counts the clicks.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="jl-name" hint="Where it lives, e.g. “Newsletter footer” or “Café table QR”.">
            <Input id="jl-name" value={form.name} onChange={(e) => set("name")(e.target.value)} maxLength={telegram ? 32 : 80} placeholder="Newsletter footer" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source">
              <Select value={form.source} onValueChange={set("source")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Campaign" htmlFor="jl-campaign" hint="Optional utm_campaign.">
              <Input id="jl-campaign" value={form.campaign} onChange={(e) => set("campaign")(e.target.value)} placeholder="spring-launch" />
            </Field>
          </div>
          {!editing ? (
            <Field label="Custom slug" htmlFor="jl-slug" hint="Optional. Leave blank for a random one. Slugs can't be reused.">
              <Input id="jl-slug" value={form.slug} onChange={(e) => set("slug")(e.target.value)} placeholder="summit-group" />
            </Field>
          ) : null}
          {telegram && !editing ? (
            <>
              <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3">
                <SettingRow
                  title="Admins approve joins"
                  description="People request to join; an admin approves them in Telegram."
                  checked={form.approval}
                  onCheckedChange={set("approval")}
                />
              </SettingsList>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Member limit" htmlFor="jl-limit" hint={form.approval ? "Not available with approval." : "Optional, up to 99,999."}>
                  <Input id="jl-limit" type="number" min={1} max={99999} disabled={form.approval} value={form.memberLimit} onChange={(e) => set("memberLimit")(e.target.value)} />
                </Field>
                <Field label="Expires" htmlFor="jl-expires" hint="Optional.">
                  <Input id="jl-expires" type="datetime-local" value={form.expiresAt} min={toLocalInput(new Date().toISOString())} onChange={(e) => set("expiresAt")(e.target.value)} />
                </Field>
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save" : "Create link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function JoinLinksSection({ projectId, channel, links, setLinks, canEdit }) {
  const telegram = isTelegramPlatform(channel.platform);
  const app = PLATFORMS[channel.platform].appLabel;
  const [dialog, setDialog] = useState(null);
  const [embed, setEmbed] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const sorted = useMemo(() => [...links].sort((a, b) => b.clicks - a.clicks || String(b.createdAt).localeCompare(String(a.createdAt))), [links]);
  const pager = usePagination(sorted);

  const create = async (body) => {
    const res = await apiPost(`/api/projects/${projectId}/communities/join-links`, { channelId: channel.id, ...body });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const link = normalizeJoinLink(res.data.link);
    setLinks((prev) => [link, ...prev]);
    toast.success("Join link created.");
    setEmbed(link);
    return true;
  };

  const update = async (link, patch) => {
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...patch, source: patch.utm?.source ?? l.source } : l)));
    const saved = await updateJoinLink(link.id, patch);
    if (!saved) {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? link : l)));
      toast.error("Couldn't save the link.");
      return false;
    }
    setLinks((prev) => prev.map((l) => (l.id === link.id ? saved : l)));
    toast.success("Join link saved.");
    return true;
  };

  const remove = async () => {
    const link = deleteTarget;
    setDeleting(true);
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    const res = await apiDelete(`/api/projects/${projectId}/communities/join-links/${link.id}`);
    setDeleting(false);
    setDeleteTarget(null);
    if (!res.ok) {
      setLinks((prev) => [link, ...prev]);
      toast.error(res.error);
      return;
    }
    toast.success(telegram && res.data?.revoked === false ? "Link deleted. Revoke the invite link in Telegram too — the bot couldn't." : "Join link deleted.");
  };

  const columns = [
    {
      key: "link",
      header: "Link",
      render: (l) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{l.name}</span>
          <span className="truncate font-mono text-xs text-text-secondary">{l.shortUrl.replace(/^https?:\/\//, "")}</span>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (l) => (
        <div className="flex flex-col">
          <span className="text-sm text-foreground">{sourceLabel(l.source)}</span>
          {l.utm?.campaign ? <span className="text-xs text-text-tertiary">{l.utm.campaign}</span> : null}
        </div>
      ),
    },
    { key: "clicks", header: "Clicks", align: "right", className: "tabular-nums text-sm text-foreground", render: (l) => formatNumber(l.clicks) },
    {
      key: "joins",
      header: "Joins",
      align: "right",
      className: "tabular-nums text-sm text-foreground",
      render: (l) => (telegram ? formatNumber(l.joins) : <span className="text-text-tertiary">Not reported</span>),
    },
    {
      key: "rate",
      header: "Click → join",
      align: "right",
      className: "tabular-nums text-sm text-text-secondary",
      render: (l) => (telegram ? formatPercent(l.joins, l.clicks) : "—"),
    },
    { key: "created", header: "Created", className: "whitespace-nowrap text-sm text-text-secondary", render: (l) => formatDate(l.createdAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (l) => (
        <ActionMenu
          label="Join link actions"
          items={[
            { label: "Copy short link", icon: Copy, onSelect: () => copyText(l.shortUrl, "Short link copied.") },
            { label: "Embed code", icon: Code2, onSelect: () => setEmbed(l) },
            { label: `Open in ${app}`, icon: ExternalLink, href: l.platformUrl },
            canEdit && { label: "Edit", icon: Pencil, onSelect: () => setDialog({ link: l }) },
            canEdit && { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(l) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Notice
        title={telegram ? "Clicks and joins are both attributed" : "Clicks are attributed, joins aren't reported"}
        action={
          canEdit ? (
            <Button className={PRIMARY_BUTTON} onClick={() => setDialog({ link: null })} disabled={!telegram && !channel.inviteUrl}>
              <Plus className="h-4 w-4" /> New join link
            </Button>
          ) : null
        }
      >
        {telegram
          ? "Each link is a named Telegram invite link. When someone joins through it, the bot counts the join against the link and records a community_join event."
          : channel.inviteUrl
            ? `${app} doesn't tell anyone who followed a channel, so these links count clicks. Growth shows up in the follower history.`
            : `Add the channel's invite link in Settings first — join links send people there.`}
      </Notice>

      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(l) => l.id}
        onRowClick={(l) => setEmbed(l)}
        empty={
          <ListEmptyState
            icon={Link2}
            title="No join links yet"
            description="Create one per placement — newsletter footer, landing page, link in bio, QR code — to see which brings people in."
            action={
              canEdit && (telegram || channel.inviteUrl) ? (
                <Button className={PRIMARY_BUTTON} onClick={() => setDialog({ link: null })}>
                  <Plus className="h-4 w-4" /> New join link
                </Button>
              ) : null
            }
          />
        }
      />
      <ListPagination {...pager} itemLabel="join links" />
      {telegram ? (
        <p className="text-xs text-text-tertiary">
          Join attribution needs Telegram&apos;s chat_member updates on the bot&apos;s webhook. Joins through other links (or the public @handle) count toward members but not to a link.
        </p>
      ) : null}

      {dialog ? (
        <LinkDialog
          key={dialog.link?.id || "new"}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          channel={channel}
          link={dialog.link}
          onCreate={create}
          onUpdate={update}
        />
      ) : null}
      <EmbedDialog link={embed} channel={channel} onClose={() => setEmbed(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete join link"
        description={
          telegram
            ? `${deleteTarget?.name} stops working and its Telegram invite link is revoked. Counts stay in reporting.`
            : `${deleteTarget?.name} stops redirecting. Counts stay in reporting. This can't be undone.`
        }
        pending={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
