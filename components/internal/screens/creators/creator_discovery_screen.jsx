"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AtSign,
  BarChart3,
  ExternalLink,
  FileText,
  Handshake,
  Instagram,
  Link2,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { listConnections } from "@/lib/supabase/channel_connections";
import {
  createCreator,
  listCreators,
  normalizeCreator,
  primaryHandle,
  softDeleteCreator,
  updateCreator,
} from "@/lib/supabase/creators";
import { listCollaborations } from "@/lib/supabase/collaborations";
import { listAffiliateLinks } from "@/lib/supabase/affiliate_links";
import { listOutreach, listOutreachRecipients } from "@/lib/supabase/creator_outreach";
import { followerTier, manualAudience, normalizeHandle, engagementRate } from "@/lib/creators/metrics";
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
  Field,
  InlineTitleInput,
  Input,
  ActionMenu,
  ScreenHeader,
  SearchInput,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatGrid,
  StatsBar,
  StatusPill,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import {
  COLLAB_STATUS_MAP,
  CREATOR_STATUS_MAP,
  CREATOR_STATUS_OPTIONS,
  CURRENCIES,
  DELIVERABLE_KINDS,
  ENGAGEMENT_FILTER_OPTIONS,
  FOLLOWER_TIERS,
  LINK_STATUS_MAP,
  NETWORKS,
  RECIPIENT_STATUS_MAP,
  formatCompact,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "./constants";
import {
  CreatorAvatar,
  CreatorCell,
  DeleteConfirmDialog,
  ListEmptyState,
  LoadingPanel,
  Notice,
  OUTLINE_BUTTON,
  ValueRow,
  useCanManageCreators,
} from "./creators_kit";

const TIER_FILTER_OPTIONS = [{ value: "all", label: "Any audience size" }, ...FOLLOWER_TIERS.map((t) => ({ value: t.value, label: t.label }))];

const CREATOR_NAV = [
  { key: "profile", label: "Profile", icon: UserRound, desc: "Who the creator is and where to reach them." },
  { key: "audience", label: "Audience", icon: BarChart3, desc: "Followers and engagement from Instagram or entered by hand." },
  { key: "rates", label: "Rate card", icon: Wallet, desc: "What the creator charges per deliverable." },
  { key: "notes", label: "Notes", icon: NotebookPen, desc: "Context the team should know." },
  { key: "activity", label: "Activity", icon: Handshake, desc: "Outreach, collaborations and affiliate links with this creator." },
];

const splitList = (value) => String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
const sourceLabel = (audience) =>
  audience?.source === "business_discovery"
    ? `Instagram · ${formatDateTime(audience.refreshedAt)}`
    : audience?.source === "manual"
      ? "Entered manually"
      : "No metrics yet";

function NicheBadges({ niches }) {
  if (!niches?.length) return <span className="text-text-tertiary">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {niches.slice(0, 3).map((n) => (
        <Badge key={n} variant="neutral" className="capitalize">
          {n}
        </Badge>
      ))}
      {niches.length > 3 ? <Badge variant="outline">+{niches.length - 3}</Badge> : null}
    </div>
  );
}

// --- Add creator dialog -------------------------------------------------------------------------

const EMPTY_MANUAL = { name: "", email: "", instagram: "", tiktok: "", youtube: "", niches: "", location: "", followers: "", avgLikes: "", avgComments: "", engagementRate: "" };

function AddCreatorDialog({ open, onOpenChange, projectId, igConnection, creators, onCreate, onOpenExisting }) {
  const [mode, setMode] = useState(igConnection ? "handle" : "manual");
  const [handle, setHandle] = useState("");
  const [looking, setLooking] = useState(false);
  const [profile, setProfile] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [extra, setExtra] = useState({ email: "", niches: "", location: "" });
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const setM = (key) => (e) => setManual((m) => ({ ...m, [key]: e.target.value }));

  const reset = () => {
    setHandle("");
    setProfile(null);
    setLookupError(null);
    setExtra({ email: "", niches: "", location: "" });
    setManual(EMPTY_MANUAL);
    setMode(igConnection ? "handle" : "manual");
  };
  const close = (next) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const existingByHandle = (h) => creators.find((c) => c.handles?.instagram && c.handles.instagram === h);

  const lookup = async () => {
    const clean = normalizeHandle(handle);
    if (!clean) {
      setLookupError({ message: "Enter an Instagram username like @lena.rides." });
      return;
    }
    const existing = existingByHandle(clean);
    if (existing) {
      toast.error(`@${clean} is already in your creator database.`);
      close(false);
      onOpenExisting(existing.id);
      return;
    }
    setLooking(true);
    setLookupError(null);
    setProfile(null);
    const res = await apiPost(`/api/projects/${projectId}/creators/lookup`, { handle: clean });
    setLooking(false);
    if (res.ok) {
      setProfile(res.data.profile);
      return;
    }
    setLookupError({ message: res.error, code: res.status === 409 ? "not_connected" : null });
  };

  const manualRate = engagementRate({ followers: manual.followers, avgLikes: manual.avgLikes, avgComments: manual.avgComments });

  const submitProfile = () => {
    onCreate({
      name: profile.name || profile.handle,
      email: extra.email,
      handles: { instagram: profile.handle, ...(profile.website ? { website: profile.website } : {}) },
      niches: splitList(extra.niches),
      location: extra.location,
      avatarUrl: profile.avatarUrl,
      audience: profile.audience,
      metadata: profile.biography ? { bio: profile.biography } : {},
    });
    close(false);
  };

  const submitManual = () => {
    if (!manual.name.trim()) {
      toast.error("Give the creator a name first.");
      return;
    }
    const ig = normalizeHandle(manual.instagram);
    if (ig && existingByHandle(ig)) {
      toast.error(`@${ig} is already in your creator database.`);
      return;
    }
    const hasMetrics = manual.followers !== "" || manual.avgLikes !== "" || manual.engagementRate !== "";
    onCreate({
      name: manual.name.trim(),
      email: manual.email,
      handles: { instagram: ig || "", tiktok: normalizeHandle(manual.tiktok) || "", youtube: normalizeHandle(manual.youtube) || "" },
      niches: splitList(manual.niches),
      location: manual.location,
      audience: hasMetrics ? manualAudience({ network: "instagram", ...manual }) : {},
    });
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add creator</DialogTitle>
          <DialogDescription>Pull public metrics from an Instagram Business or Creator account, or enter the creator by hand.</DialogDescription>
        </DialogHeader>

        <SegmentedTabs
          fullWidth
          value={mode}
          onChange={setMode}
          tabs={[
            { value: "handle", label: "Instagram handle", icon: Instagram },
            { value: "manual", label: "Manual entry", icon: Pencil },
          ]}
        />

        {mode === "handle" ? (
          <div className="grid gap-4">
            {!igConnection ? (
              <Notice icon={Instagram} title="Instagram isn't connected">
                Public metrics come from Instagram&apos;s business discovery API through your own professional account. Connect one in Channels → Instagram, or use manual entry.
              </Notice>
            ) : null}
            <Field label="Instagram username" htmlFor="cd-handle" hint={igConnection ? `Looked up through ${igConnection.handle ? `@${igConnection.handle}` : "your connected account"}.` : undefined}>
              <div className="flex gap-2">
                <Input
                  id="cd-handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && lookup()}
                  placeholder="@username"
                  disabled={!igConnection || looking}
                />
                <Button variant="outline" className={OUTLINE_BUTTON} onClick={lookup} disabled={!igConnection || looking || !handle.trim()}>
                  {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
                </Button>
              </div>
            </Field>

            {lookupError ? (
              <Notice
                icon={AtSign}
                title={lookupError.code === "not_connected" ? "Instagram isn't connected" : "Couldn't load this profile"}
                action={
                  <Button
                    variant="outline"
                    className={OUTLINE_BUTTON}
                    onClick={() => {
                      setManual((m) => ({ ...m, instagram: normalizeHandle(handle) || "" }));
                      setMode("manual");
                    }}
                  >
                    Enter manually
                  </Button>
                }
              >
                {lookupError.message}
              </Notice>
            ) : null}

            {profile ? (
              <div className="rounded-xl border border-border bg-surface-card p-4">
                <div className="flex items-center gap-3">
                  <CreatorAvatar creator={{ name: profile.name || profile.handle, avatarUrl: profile.avatarUrl }} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{profile.name || `@${profile.handle}`}</p>
                    <p className="truncate text-xs text-text-secondary">@{profile.handle} · {formatNumber(profile.audience.mediaCount)} posts</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Followers", formatCompact(profile.audience.followers)],
                    ["Engagement", formatPercent(profile.audience.engagementRate, 2)],
                    ["Avg. likes", formatCompact(profile.audience.avgLikes)],
                    ["Avg. comments", formatCompact(profile.audience.avgComments)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{label}</p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-text-tertiary">Averages from the last {profile.audience.postsSampled} posts.</p>
              </div>
            ) : null}

            {profile ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="cd-email" hint="Needed for outreach.">
                  <Input id="cd-email" type="email" value={extra.email} onChange={(e) => setExtra((x) => ({ ...x, email: e.target.value }))} placeholder="name@example.com" />
                </Field>
                <Field label="Location" htmlFor="cd-location">
                  <Input id="cd-location" value={extra.location} onChange={(e) => setExtra((x) => ({ ...x, location: e.target.value }))} placeholder="e.g. Lisbon" />
                </Field>
                <Field label="Niches" htmlFor="cd-niches" hint="Comma separated." className="sm:col-span-2">
                  <Input id="cd-niches" value={extra.niches} onChange={(e) => setExtra((x) => ({ ...x, niches: e.target.value }))} placeholder="cycling, travel, outdoor" />
                </Field>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid max-h-[55vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            <Field label="Name" htmlFor="cm-name" className="sm:col-span-2">
              <Input id="cm-name" value={manual.name} onChange={setM("name")} placeholder="Creator or channel name" />
            </Field>
            <Field label="Email" htmlFor="cm-email">
              <Input id="cm-email" type="email" value={manual.email} onChange={setM("email")} placeholder="name@example.com" />
            </Field>
            <Field label="Location" htmlFor="cm-location">
              <Input id="cm-location" value={manual.location} onChange={setM("location")} placeholder="e.g. Lisbon" />
            </Field>
            <Field label="Instagram" htmlFor="cm-ig">
              <Input id="cm-ig" value={manual.instagram} onChange={setM("instagram")} placeholder="@username" />
            </Field>
            <Field label="TikTok" htmlFor="cm-tt">
              <Input id="cm-tt" value={manual.tiktok} onChange={setM("tiktok")} placeholder="@username" />
            </Field>
            <Field label="YouTube" htmlFor="cm-yt">
              <Input id="cm-yt" value={manual.youtube} onChange={setM("youtube")} placeholder="@channel" />
            </Field>
            <Field label="Niches" htmlFor="cm-niches" hint="Comma separated.">
              <Input id="cm-niches" value={manual.niches} onChange={setM("niches")} placeholder="coffee, food" />
            </Field>
            <Field label="Followers" htmlFor="cm-followers">
              <Input id="cm-followers" type="number" min="0" value={manual.followers} onChange={setM("followers")} placeholder="0" />
            </Field>
            <Field label="Engagement rate (%)" htmlFor="cm-er" hint={manual.engagementRate === "" && manualRate != null ? `Calculated: ${manualRate}%` : "Leave blank to calculate."}>
              <Input id="cm-er" type="number" min="0" step="0.01" value={manual.engagementRate} onChange={setM("engagementRate")} placeholder="—" />
            </Field>
            <Field label="Avg. likes per post" htmlFor="cm-likes">
              <Input id="cm-likes" type="number" min="0" value={manual.avgLikes} onChange={setM("avgLikes")} placeholder="—" />
            </Field>
            <Field label="Avg. comments per post" htmlFor="cm-comments">
              <Input id="cm-comments" type="number" min="0" value={manual.avgComments} onChange={setM("avgComments")} placeholder="—" />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          {mode === "handle" ? (
            <Button onClick={submitProfile} disabled={!profile}>
              Add creator
            </Button>
          ) : (
            <Button onClick={submitManual} disabled={!manual.name.trim()}>
              Add creator
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Creator editor -----------------------------------------------------------------------------

const toDraft = (c) => ({
  name: c.name,
  email: c.email,
  status: c.status,
  location: c.location,
  niches: c.niches.join(", "),
  handles: { instagram: "", tiktok: "", youtube: "", x: "", twitch: "", website: "", ...c.handles },
  rateCard: { currency: c.rateCard.currency, items: c.rateCard.items.map((i) => ({ ...i })) },
  notes: c.notes,
});

const toManual = (a) => ({
  followers: a.followers ?? "",
  avgLikes: a.avgLikes ?? "",
  avgComments: a.avgComments ?? "",
  engagementRate: a.source === "manual" && a.engagementRate != null ? a.engagementRate : "",
});

function CreatorActivity({ projectId, creator }) {
  const { openRecordInTab } = useWorkspaceUrl();
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listCollaborations(projectId, { creatorId: creator.id }),
      listAffiliateLinks(projectId, { creatorId: creator.id }),
      listOutreachRecipients(projectId, { creatorId: creator.id }),
      listOutreach(projectId),
    ]).then(([collabs, links, recipients, sequences]) => {
      if (!alive) return;
      const names = new Map((sequences || []).map((s) => [s.id, s.name]));
      setState({
        collabs: collabs || [],
        links: links || [],
        outreach: (recipients || []).map((r) => ({ ...r, name: names.get(r.outreachId) || "Sequence" })),
      });
    });
    return () => {
      alive = false;
    };
  }, [projectId, creator.id]);

  if (!state) return <LoadingPanel label="Loading activity" size={40} />;
  const empty = (text) => <p className="text-sm text-text-tertiary">{text}</p>;

  return (
    <div className="space-y-5">
      <SectionCard title="Collaborations">
        {state.collabs.length
          ? state.collabs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openRecordInTab(c.id, "Collaborations")}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover"
              >
                <span className="truncate text-sm font-medium text-foreground">{c.campaignName}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-sm tabular-nums text-text-secondary">{formatMoney(c.fee, c.currency)}</span>
                  <StatusPill status={c.status} map={COLLAB_STATUS_MAP} />
                </span>
              </button>
            ))
          : empty("No collaborations yet.")}
      </SectionCard>
      <SectionCard title="Affiliate links">
        {state.links.length
          ? state.links.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => openRecordInTab(l.id, "Affiliate Links")}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover"
              >
                <span className="truncate font-mono text-sm text-foreground">{l.code}</span>
                <span className="flex shrink-0 items-center gap-3 text-sm tabular-nums text-text-secondary">
                  {formatNumber(l.conversions)} orders · {formatMoney(l.revenue, l.currency)}
                  <StatusPill status={l.status} map={LINK_STATUS_MAP} />
                </span>
              </button>
            ))
          : empty("No affiliate links yet.")}
      </SectionCard>
      <SectionCard title="Outreach">
        {state.outreach.length
          ? state.outreach.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openRecordInTab(r.outreachId, "Outreach")}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover"
              >
                <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-text-secondary">
                  {r.lastSentAt ? `Last email ${formatDate(r.lastSentAt)}` : "Not emailed yet"}
                  <StatusPill status={r.status} map={RECIPIENT_STATUS_MAP} />
                </span>
              </button>
            ))
          : empty("Not in any outreach sequence.")}
      </SectionCard>
    </div>
  );
}

function CreatorEditor({ record, projectId, canManage, igConnected, refreshing, onBack, onSave, onRefresh, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [manual, setManual] = useState(() => toManual(record.audience));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setHandle = (network) => (e) => setDraft((d) => ({ ...d, handles: { ...d.handles, [network]: e.target.value } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const a = record.audience;

  const save = () => {
    const handles = Object.fromEntries(
      Object.entries(draft.handles).map(([k, v]) => [k, k === "website" ? v.trim() : normalizeHandle(v) || ""]),
    );
    onSave(record.id, {
      name: draft.name.trim() || "Unnamed creator",
      email: draft.email,
      status: draft.status,
      location: draft.location,
      niches: splitList(draft.niches),
      handles,
      rateCard: { currency: draft.rateCard.currency, items: draft.rateCard.items.filter((i) => i.deliverable).map((i) => ({ ...i, price: Number(i.price) || 0 })) },
      notes: draft.notes,
    });
  };

  const saveManual = () => {
    onSave(record.id, { audience: { ...a, ...manualAudience({ network: a.network || "instagram", ...manual }), recentPosts: [] } });
  };

  const setRate = (i, patch) =>
    setDraft((d) => ({ ...d, rateCard: { ...d.rateCard, items: d.rateCard.items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)) } }));

  const audienceStats = [
    { label: "Followers", value: a.followers != null ? formatNumber(a.followers) : "—", hint: followerTier(a.followers) ? FOLLOWER_TIERS.find((t) => t.value === followerTier(a.followers))?.label : "Unknown" },
    { label: "Engagement rate", value: a.engagementRate != null ? `${a.engagementRate.toFixed(2)}%` : "—", hint: "Avg. interactions ÷ followers" },
    { label: "Avg. likes", value: a.avgLikes != null ? formatNumber(Math.round(a.avgLikes)) : "—", hint: a.postsSampled ? `Last ${a.postsSampled} posts` : "Per post" },
    { label: "Avg. comments", value: a.avgComments != null ? formatNumber(Math.round(a.avgComments)) : "—", hint: a.postsSampled ? `Last ${a.postsSampled} posts` : "Per post" },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Creator name"
          placeholder="Unnamed creator"
          disabled={!canManage}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={CREATOR_STATUS_MAP}
      badges={
        <>
          {primaryHandle(record) ? <Badge variant="neutral">@{primaryHandle(record).handle}</Badge> : null}
          <span className="text-xs text-text-tertiary">{sourceLabel(a)}</span>
        </>
      }
      actions={
        canManage ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete creator"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(record)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
              Save
            </Button>
          </>
        ) : null
      }
      nav={CREATOR_NAV}
      defaultSection="profile"
    >
      {({ active }) => (
        <>
          {active === "profile" ? (
            <SectionCard bare title="Contact & handles" description="How to reach the creator and where they post.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="ce-email" hint="Outreach, reminders and rights requests go here.">
                  <Input id="ce-email" type="email" value={draft.email} onChange={(e) => set("email")(e.target.value)} disabled={!canManage} placeholder="name@example.com" />
                </Field>
                <Field label="Status">
                  <Select value={draft.status} onValueChange={set("status")} disabled={!canManage}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CREATOR_STATUS_MAP).map(([value, m]) => (
                        <SelectItem key={value} value={value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Location" htmlFor="ce-location">
                  <Input id="ce-location" value={draft.location} onChange={(e) => set("location")(e.target.value)} disabled={!canManage} placeholder="City, country" />
                </Field>
                <Field label="Niches" htmlFor="ce-niches" hint="Comma separated.">
                  <Input id="ce-niches" value={draft.niches} onChange={(e) => set("niches")(e.target.value)} disabled={!canManage} placeholder="cycling, travel" />
                </Field>
                {NETWORKS.map((n) => (
                  <Field key={n.value} label={n.label} htmlFor={`ce-${n.value}`}>
                    <Input id={`ce-${n.value}`} value={draft.handles[n.value] || ""} onChange={setHandle(n.value)} disabled={!canManage} placeholder="@username" />
                  </Field>
                ))}
                <Field label="Website" htmlFor="ce-website">
                  <Input id="ce-website" value={draft.handles.website || ""} onChange={setHandle("website")} disabled={!canManage} placeholder="https://" />
                </Field>
              </div>
              {record.bio ? <p className="mt-5 border-t border-border pt-4 text-sm text-text-secondary">{record.bio}</p> : null}
            </SectionCard>
          ) : null}

          {active === "audience" ? (
            <div className="space-y-6">
              {record.handles?.instagram && !igConnected ? (
                <Notice icon={Instagram} title="Instagram isn't connected">
                  Connect an Instagram professional account in Channels → Instagram to refresh these numbers from the public profile. Until then they stay as entered.
                </Notice>
              ) : null}
              <StatGrid stats={audienceStats} columns={4} />
              <SectionCard
                bare
                title="Source"
                description={sourceLabel(a)}
                action={
                  canManage && record.handles?.instagram ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} disabled={!igConnected || refreshing} onClick={() => onRefresh(record)}>
                      {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh from Instagram
                    </Button>
                  ) : null
                }
              >
                {a.lastRefreshError ? <p className="mb-4 text-sm text-red-600 dark:text-red-400">Last refresh failed: {a.lastRefreshError}</p> : null}
                <div className="grid gap-4 sm:grid-cols-4">
                  <Field label="Followers" htmlFor="ca-f">
                    <Input id="ca-f" type="number" min="0" value={manual.followers} onChange={(e) => setManual((m) => ({ ...m, followers: e.target.value }))} disabled={!canManage} />
                  </Field>
                  <Field label="Avg. likes" htmlFor="ca-l">
                    <Input id="ca-l" type="number" min="0" value={manual.avgLikes} onChange={(e) => setManual((m) => ({ ...m, avgLikes: e.target.value }))} disabled={!canManage} />
                  </Field>
                  <Field label="Avg. comments" htmlFor="ca-c">
                    <Input id="ca-c" type="number" min="0" value={manual.avgComments} onChange={(e) => setManual((m) => ({ ...m, avgComments: e.target.value }))} disabled={!canManage} />
                  </Field>
                  <Field label="Engagement (%)" htmlFor="ca-er" hint="Blank = calculated">
                    <Input id="ca-er" type="number" min="0" step="0.01" value={manual.engagementRate} onChange={(e) => setManual((m) => ({ ...m, engagementRate: e.target.value }))} disabled={!canManage} />
                  </Field>
                </div>
                {canManage ? (
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={saveManual} disabled={JSON.stringify(manual) === JSON.stringify(toManual(a))}>
                      Save manual metrics
                    </Button>
                  </div>
                ) : null}
              </SectionCard>
              {a.recentPosts?.length ? (
                <SectionCard title="Recent posts" description="The posts the averages were calculated from." bodyPadding={false}>
                  <div className="divide-y divide-border">
                    {a.recentPosts.map((p, i) => (
                      <div key={p.permalink || i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <span className="text-text-secondary">{formatDate(p.timestamp)} · <span className="capitalize">{String(p.mediaType || "post").toLowerCase().replace("_", " ")}</span></span>
                        <span className="flex items-center gap-4 tabular-nums text-foreground">
                          <span>{p.likes == null ? "Likes hidden" : `${formatNumber(p.likes)} likes`}</span>
                          <span>{formatNumber(p.comments)} comments</span>
                          {p.permalink ? (
                            <a href={p.permalink} target="_blank" rel="noopener noreferrer" aria-label="Open post on Instagram" className="text-text-secondary hover:text-foreground">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}
            </div>
          ) : null}

          {active === "rates" ? (
            <SectionCard
              bare
              description="What the creator charges for each type of deliverable."
              action={
                canManage ? (
                  <Button
                    variant="outline"
                    className={OUTLINE_BUTTON}
                    onClick={() => setDraft((d) => ({ ...d, rateCard: { ...d.rateCard, items: [...d.rateCard.items, { id: crypto.randomUUID(), deliverable: "instagram_post", price: "" }] } }))}
                  >
                    <Plus className="h-4 w-4" /> Add rate
                  </Button>
                ) : null
              }
              title="Rates"
            >
              <Field label="Currency" className="mb-4 max-w-40">
                <Select value={draft.rateCard.currency} onValueChange={(v) => setDraft((d) => ({ ...d, rateCard: { ...d.rateCard, currency: v } }))} disabled={!canManage}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {draft.rateCard.items.length ? (
                <div className="space-y-2">
                  {draft.rateCard.items.map((item, i) => (
                    <div key={item.id || i} className="flex items-center gap-2">
                      <Select value={item.deliverable} onValueChange={(v) => setRate(i, { deliverable: v })} disabled={!canManage}>
                        <SelectTrigger className="w-full" aria-label="Deliverable">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DELIVERABLE_KINDS.map((k) => (
                            <SelectItem key={k.value} value={k.value}>
                              {k.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" min="0" value={item.price} onChange={(e) => setRate(i, { price: e.target.value })} disabled={!canManage} className="w-36" aria-label="Price" placeholder="0" />
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove rate"
                          className="text-text-secondary hover:text-red-600 dark:hover:text-red-400"
                          onClick={() => setDraft((d) => ({ ...d, rateCard: { ...d.rateCard, items: d.rateCard.items.filter((_, idx) => idx !== i) } }))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">No rates recorded. Add what this creator charges per deliverable to compare offers.</p>
              )}
            </SectionCard>
          ) : null}

          {active === "notes" ? (
            <SectionCard bare title="Team notes" description="Anything the team should know before working with this creator.">
              <Field label="Notes" htmlFor="ce-notes">
                <Textarea id="ce-notes" rows={8} value={draft.notes} onChange={(e) => set("notes")(e.target.value)} disabled={!canManage} placeholder="Past work, preferences, who introduced you…" />
              </Field>
              <div className="mt-4">
                <ValueRow title="Added" value={formatDate(record.createdAt)} />
              </div>
            </SectionCard>
          ) : null}

          {active === "activity" ? <CreatorActivity projectId={projectId} creator={record} /> : null}
        </>
      )}
    </EditorShell>
  );
}

// --- Screen -------------------------------------------------------------------------------------

export function CreatorDiscoveryScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canManage = useCanManageCreators();
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [igConnection, setIgConnection] = useState(null);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [niche, setNiche] = useState("all");
  const [tier, setTier] = useState("all");
  const [engagement, setEngagement] = useState("all");
  const [location, setLocation] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listCreators(projectId), listConnections(projectId, { channel: "instagram" }), getUser()]).then(([rows, connections, user]) => {
      if (!alive) return;
      setCreators(rows ?? []);
      setIgConnection((connections || []).find((c) => c.status === "connected") || null);
      setUserId(user?.id || null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const nicheOptions = useMemo(() => {
    const all = [...new Set(creators.flatMap((c) => c.niches))].sort();
    return [{ value: "all", label: "All niches" }, ...all.map((n) => ({ value: n, label: n.charAt(0).toUpperCase() + n.slice(1) }))];
  }, [creators]);
  const locationOptions = useMemo(() => {
    const all = [...new Set(creators.map((c) => c.location).filter(Boolean))].sort();
    return [{ value: "all", label: "All locations" }, ...all.map((l) => ({ value: l, label: l }))];
  }, [creators]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creators.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (niche !== "all" && !c.niches.includes(niche)) return false;
      if (location !== "all" && c.location !== location) return false;
      if (tier !== "all" && followerTier(c.audience.followers) !== tier) return false;
      if (engagement !== "all" && !((c.audience.engagementRate ?? -1) >= Number(engagement))) return false;
      if (q) {
        const hay = [c.name, c.email, c.location, ...c.niches, ...Object.values(c.handles)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [creators, query, status, niche, location, tier, engagement]);

  const stats = useMemo(() => {
    const withRate = creators.filter((c) => c.audience.engagementRate != null);
    const reach = creators.reduce((s, c) => s + (c.audience.followers || 0), 0);
    const avg = withRate.length ? withRate.reduce((s, c) => s + c.audience.engagementRate, 0) / withRate.length : null;
    const live = creators.filter((c) => c.audience.source === "business_discovery").length;
    return [
      { label: "Creators", value: formatNumber(creators.length), footer: `${creators.filter((c) => c.status === "active").length} active` },
      { label: "Combined reach", value: formatCompact(reach), footer: "Followers across profiles" },
      { label: "Avg. engagement", value: avg == null ? "—" : `${avg.toFixed(2)}%`, footer: `${withRate.length} with metrics` },
      { label: "Live metrics", value: formatNumber(live), footer: "From Instagram business discovery" },
    ];
  }, [creators]);

  const pager = usePagination(filtered, { resetKey: `${query}|${status}|${niche}|${location}|${tier}|${engagement}` });

  const reload = () => listCreators(projectId).then((rows) => rows && setCreators(rows));

  const handleCreate = async (input) => {
    const id = crypto.randomUUID();
    const optimistic = normalizeCreator({
      id,
      project_id: projectId,
      name: input.name,
      email: input.email,
      handles: input.handles,
      niches: input.niches,
      location: input.location,
      avatar_url: input.avatarUrl,
      audience: input.audience,
      status: "prospect",
      metadata: input.metadata,
      created_at: new Date().toISOString(),
    });
    setCreators((prev) => [optimistic, ...prev]);
    openRecord(id);
    const saved = await createCreator(projectId, { ...input, id, status: "prospect", createdBy: userId });
    if (saved) {
      setCreators((prev) => prev.map((c) => (c.id === id ? saved : c)));
      toast.success(`Added ${saved.name}.`);
    } else {
      setCreators((prev) => prev.filter((c) => c.id !== id));
      closeRecord();
      toast.error("Couldn't add the creator. A creator with this Instagram handle may already exist.");
    }
  };

  const handleSave = async (id, patch) => {
    setCreators((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, audience: patch.audience ? { ...c.audience, ...patch.audience } : c.audience } : c)));
    const saved = await updateCreator(id, patch);
    if (saved) {
      setCreators((prev) => prev.map((c) => (c.id === id ? saved : c)));
      toast.success("Creator saved.");
    } else {
      toast.error("Couldn't save the creator.");
      reload();
    }
  };

  const handleRefresh = async (creator) => {
    setRefreshingId(creator.id);
    const res = await apiPost(`/api/projects/${projectId}/creators/${creator.id}/refresh`);
    setRefreshingId(null);
    if (res.ok && res.data?.creator) {
      const fresh = normalizeCreator(res.data.creator);
      setCreators((prev) => prev.map((c) => (c.id === creator.id ? fresh : c)));
      toast.success(`Metrics refreshed for ${fresh.name}.`);
    } else {
      toast.error(res.error || "Couldn't refresh metrics.");
    }
  };

  const handleDelete = async (creator) => {
    setDeleteTarget(null);
    setCreators((prev) => prev.filter((c) => c.id !== creator.id));
    if (creator.id === recordId) closeRecord();
    const ok = await softDeleteCreator(creator.id);
    if (ok) toast.success(`Removed ${creator.name}.`);
    else {
      toast.error("Couldn't remove the creator.");
      reload();
    }
  };

  const deleteDialog = (
    <DeleteConfirmDialog
      target={deleteTarget}
      title="Remove creator"
      name={deleteTarget?.name}
      confirmLabel="Remove"
      description="Their collaborations, links and payouts stay in the ledger."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = creators.find((c) => c.id === recordId);
  if (open) {
    return (
      <>
        <CreatorEditor
          key={open.id}
          record={open}
          projectId={projectId}
          canManage={canManage}
          igConnected={Boolean(igConnection)}
          refreshing={refreshingId === open.id}
          onBack={closeRecord}
          onSave={handleSave}
          onRefresh={handleRefresh}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = Boolean(query) || [status, niche, location, tier, engagement].some((f) => f !== "all");
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setNiche("all");
    setLocation("all");
    setTier("all");
    setEngagement("all");
  };

  const columns = [
    { key: "creator", header: "Creator", render: (c) => <CreatorCell creator={c} /> },
    { key: "niches", header: "Niches", render: (c) => <NicheBadges niches={c.niches} /> },
    { key: "location", header: "Location", className: "text-sm text-text-secondary", render: (c) => c.location || "—" },
    { key: "followers", header: "Followers", align: "right", className: "tabular-nums font-medium text-foreground", render: (c) => formatCompact(c.audience.followers) },
    { key: "engagement", header: "Engagement", align: "right", className: "tabular-nums text-foreground", render: (c) => formatPercent(c.audience.engagementRate, 2) },
    {
      key: "source",
      header: "Metrics",
      render: (c) => (
        <span className="text-xs text-text-secondary">
          {c.audience.source === "business_discovery" ? "Instagram" : c.audience.source === "manual" ? "Manual" : "—"}
          {c.audience.refreshedAt ? <span className="block text-text-tertiary">{formatDate(c.audience.refreshedAt)}</span> : null}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (c) => <StatusPill status={c.status} map={CREATOR_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: "Open", icon: FileText, onSelect: () => openRecord(c.id) },
            canManage && c.handles?.instagram && igConnection && { label: "Refresh metrics", icon: RefreshCw, spin: refreshingId === c.id, onSelect: () => handleRefresh(c) },
            c.handles?.instagram && { label: "View on Instagram", icon: Link2, href: `https://www.instagram.com/${c.handles.instagram}/` },
            canManage && { separator: true },
            canManage && { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Creator Discovery"
        description="Your creator database — search by niche, audience size, engagement and location."
        actions={
          canManage ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add creator
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={CREATOR_STATUS_OPTIONS} />
          <FilterDropdown value={niche} onValueChange={setNiche} options={nicheOptions} />
          <FilterDropdown value={tier} onValueChange={setTier} options={TIER_FILTER_OPTIONS} />
          <FilterDropdown value={engagement} onValueChange={setEngagement} options={ENGAGEMENT_FILTER_OPTIONS} />
          <FilterDropdown value={location} onValueChange={setLocation} options={locationOptions} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search creators, handles, niches…" />
      </Toolbar>

      {loading ? (
        <LoadingPanel label="Loading creators" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecord(c.id)}
            empty={
              <ListEmptyState
                icon={Users}
                filtersActive={filtersActive}
                title="No creators yet"
                description="Add creators by Instagram handle to pull their public metrics, or enter them by hand."
                onClear={clearFilters}
                action={
                  canManage ? (
                    <Button onClick={() => setAddOpen(true)}>
                      <Plus className="h-4 w-4" /> Add creator
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="creators" />
        </div>
      )}

      <AddCreatorDialog
        key={igConnection ? "ig" : "manual"}
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        igConnection={igConnection}
        creators={creators}
        onCreate={handleCreate}
        onOpenExisting={openRecord}
      />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CreatorDiscoveryScreen;
