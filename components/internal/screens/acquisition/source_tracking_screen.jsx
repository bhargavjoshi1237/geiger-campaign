"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Copy, ExternalLink, Link2, Loader2, Pencil, Plus, Tags, Trash2, MousePointerClick, UserPlus, Wallet } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import {
  ActionMenu,
  Badge,
  Button,
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
  LoadingArea,
  Progress,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatGrid,
  StatsBar,
  Toolbar,
} from "@geiger/ui";
import { SLUG_TAKEN, createTrackingLink, listTrackingLinks, softDeleteTrackingLink, updateTrackingLink } from "@/lib/supabase/tracking_links";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { listContactsByIds } from "@/lib/supabase/contacts";
import { getUser } from "@/lib/supabase/user";
import { buildTrackedUrl, cleanUtm, isHttpUrl, normalizeLinkSlug, randomSlug } from "@/lib/acquisition/tracking";
import { ATTRIBUTION_GROUPS, ATTRIBUTION_MODELS, attributeSources, dominantCurrency, linkPerformance } from "@/lib/acquisition/attribution";
import { DESTRUCTIVE_ICON_BUTTON, OUTLINE_BUTTON, formatDate, formatNumber, percent, relativeTime } from "./constants";
import { CopyField, DeleteDialog, copyText, useAcquisitionStatus } from "./shared";

const VIEW_OPTIONS = [
  { value: "links", label: "Tracked links" },
  { value: "sources", label: "Sources" },
];

const PERIOD_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

const LINK_NAV = [
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Clicks on the short link, signups carrying its tags and orders from people who clicked it." },
  { key: "utm", label: "Link & UTM", icon: Tags, desc: "Where the link points and how its traffic is tagged." },
];

const EMPTY_DRAFT = { name: "", destinationUrl: "", source: "", medium: "", campaign: "", term: "", content: "", slug: "", campaignId: "none" };

const toDraft = (l) => ({
  name: l.name || "",
  destinationUrl: l.destinationUrl || "",
  source: l.utm?.source || "",
  medium: l.utm?.medium || "",
  campaign: l.utm?.campaign || "",
  term: l.utm?.term || "",
  content: l.utm?.content || "",
  slug: l.slug || "",
  campaignId: l.campaignId || "none",
});

const draftToInput = (d) => ({
  name: d.name.trim(),
  destinationUrl: d.destinationUrl.trim(),
  utm: cleanUtm({ source: d.source, medium: d.medium, campaign: d.campaign, term: d.term, content: d.content }),
  slug: normalizeLinkSlug(d.slug),
  campaignId: d.campaignId === "none" ? null : d.campaignId,
});

const missingField = (d) =>
  !isHttpUrl(d.destinationUrl)
    ? "a destination URL starting with https://"
    : !d.source.trim()
      ? "a source"
      : !d.medium.trim()
        ? "a medium"
        : !d.campaign.trim()
          ? "a campaign"
          : !normalizeLinkSlug(d.slug)
            ? "a short link"
            : null;

const linkTitle = (l) => l.name || l.utm?.campaign || l.slug || "Untitled link";

function formatMoney(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: Math.abs(amount) >= 1000 ? 0 : 2 }).format(amount || 0);
  } catch {
    return `${formatNumber(Math.round(amount || 0))} ${currency}`;
  }
}

function UtmFields({ draft, set, idPrefix, campaigns, baseUrl, disabled }) {
  const preview = isHttpUrl(draft.destinationUrl) ? buildTrackedUrl(draft.destinationUrl, cleanUtm(draft)) : "";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor={`${idPrefix}-name`} hint="Optional. Shown in this list; defaults to the campaign tag.">
        <Input id={`${idPrefix}-name`} value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="Autumn lookbook — Instagram bio" disabled={disabled} />
      </Field>
      <Field label="Campaign" hint="Optional. Groups clicks under one of your campaigns.">
        <Select value={draft.campaignId} onValueChange={set("campaignId")} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not linked</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Destination URL" htmlFor={`${idPrefix}-url`} className="sm:col-span-2">
        <Input id={`${idPrefix}-url`} value={draft.destinationUrl} onChange={(e) => set("destinationUrl")(e.target.value)} placeholder="https://example.com/autumn" className="font-mono" disabled={disabled} />
      </Field>
      <Field label="Source" htmlFor={`${idPrefix}-source`} hint="Where the traffic comes from, e.g. instagram">
        <Input id={`${idPrefix}-source`} value={draft.source} onChange={(e) => set("source")(e.target.value)} placeholder="instagram" disabled={disabled} />
      </Field>
      <Field label="Medium" htmlFor={`${idPrefix}-medium`} hint="The channel type, e.g. social, cpc, email">
        <Input id={`${idPrefix}-medium`} value={draft.medium} onChange={(e) => set("medium")(e.target.value)} placeholder="social" disabled={disabled} />
      </Field>
      <Field label="Campaign tag" htmlFor={`${idPrefix}-campaign`} hint="utm_campaign, e.g. autumn_launch">
        <Input id={`${idPrefix}-campaign`} value={draft.campaign} onChange={(e) => set("campaign")(e.target.value)} placeholder="autumn_launch" disabled={disabled} />
      </Field>
      <Field label="Term" htmlFor={`${idPrefix}-term`} hint="Optional. Paid keyword.">
        <Input id={`${idPrefix}-term`} value={draft.term} onChange={(e) => set("term")(e.target.value)} disabled={disabled} />
      </Field>
      <Field label="Content" htmlFor={`${idPrefix}-content`} hint="Optional. Tells apart two links in one placement." className="sm:col-span-2">
        <Input id={`${idPrefix}-content`} value={draft.content} onChange={(e) => set("content")(e.target.value)} placeholder="story_swipe_up" disabled={disabled} />
      </Field>
      <Field label="Short link" htmlFor={`${idPrefix}-slug`} hint="Letters, numbers, dashes and underscores." className="sm:col-span-2">
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[50%] truncate font-mono text-sm text-text-secondary sm:inline">{baseUrl ? `${baseUrl}/l/` : "/l/"}</span>
          <Input id={`${idPrefix}-slug`} value={draft.slug} onChange={(e) => set("slug")(normalizeLinkSlug(e.target.value))} className="font-mono" disabled={disabled} />
          {!disabled ? (
            <Button type="button" variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => set("slug")(randomSlug())}>
              Shuffle
            </Button>
          ) : null}
        </div>
      </Field>
      <Field label="Tagged destination" className="sm:col-span-2" hint="Where the short link redirects, with the UTM tags added.">
        <div className="break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">{preview || "Add a destination URL to see it."}</div>
      </Field>
    </div>
  );
}

function CreateLinkDialog({ open, onOpenChange, onCreate, campaigns, baseUrl, pending }) {
  const fresh = () => ({ ...EMPTY_DRAFT, slug: randomSlug() });
  const [draft, setDraft] = useState(fresh);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const missing = missingField(draft);

  const submit = async () => {
    if (missing) {
      toast.error(`Add ${missing} first.`);
      return;
    }
    const ok = await onCreate(draftToInput(draft));
    if (ok) {
      setDraft(fresh());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New tracked link</DialogTitle>
          <DialogDescription>A short link that redirects to your page with UTM tags, so clicks, signups and orders are credited to the right source.</DialogDescription>
        </DialogHeader>
        <UtmFields draft={draft} set={set} idPrefix="utm" campaigns={campaigns} baseUrl={baseUrl} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!!missing || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecentClicks({ projectId, clicks }) {
  const [names, setNames] = useState({});
  const ids = useMemo(() => [...new Set(clicks.map((c) => c.contactId).filter(Boolean))], [clicks]);

  useEffect(() => {
    if (!ids.length) return undefined;
    let cancelled = false;
    listContactsByIds(projectId, ids).then((rows) => {
      if (!cancelled) setNames(Object.fromEntries((rows || []).map((c) => [c.id, c.name])));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, ids]);

  const columns = [
    { key: "at", header: "Clicked", className: "whitespace-nowrap text-muted-foreground", render: (c) => formatDate(c.occurredAt, { time: true }) },
    {
      key: "who",
      header: "Visitor",
      render: (c) => (c.contactId ? <span className="text-foreground">{names[c.contactId] || "Known contact"}</span> : <span className="text-text-secondary">Anonymous</span>),
    },
    { key: "referrer", header: "Referrer", render: (c) => <span className="block max-w-[280px] truncate font-mono text-xs text-text-secondary">{c.referrer || "—"}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      data={clicks}
      getRowKey={(c) => c.id}
      empty={
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={MousePointerClick} title="No clicks in this period" description="Clicks show here as soon as someone opens the short link." />
        </div>
      }
    />
  );
}

function LinkEditor({ record, projectId, events, periodLabel, campaigns, baseUrl, canEdit, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const perf = useMemo(() => linkPerformance(record, events), [record, events]);
  const currency = useMemo(() => dominantCurrency(events), [events]);
  const shortUrl = baseUrl ? `${baseUrl}/l/${record.slug}` : "";

  const save = async () => {
    const missing = missingField(draft);
    if (missing) {
      toast.error(`A tracked link needs ${missing}.`);
      return;
    }
    setSaving(true);
    const ok = await onSave(record.id, draftToInput(draft));
    setSaving(false);
    if (ok) setDraft(toDraft({ ...record, ...draftToInput(draft) }));
  };

  const performance = [
    { label: "Clicks", value: record.clicks ? formatNumber(record.clicks) : "—", icon: MousePointerClick, hint: record.lastClickedAt ? `All time · last ${relativeTime(record.lastClickedAt).toLowerCase()}` : "Not clicked yet" },
    { label: "Signups", value: perf.signups ? formatNumber(perf.signups) : "—", icon: UserPlus, hint: `Form submissions carrying these tags · ${periodLabel.toLowerCase()}` },
    { label: "Revenue", value: perf.revenue ? formatMoney(perf.revenue, currency) : "—", icon: Wallet, hint: perf.orders ? `${formatNumber(perf.orders)} order${perf.orders === 1 ? "" : "s"} by people who clicked` : "No orders after a click yet" },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={linkTitle({ ...record, name: draft.name, utm: { campaign: draft.campaign } })}
      badges={
        <>
          <Badge variant="neutral" className="font-mono">
            {draft.source || "—"} / {draft.medium || "—"}
          </Badge>
          <span className="truncate font-mono text-xs text-text-tertiary">/l/{record.slug}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete tracked link" className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={LINK_NAV}
      defaultSection="performance"
    >
      {({ active }) => (
        <>
          {active === "performance" ? (
            <div className="space-y-5">
              <StatGrid stats={performance} columns={3} />
              <SectionCard bare title="Recent clicks" description={`${periodLabel}. Visitors are named when the link carries their contact token.`}>
                <RecentClicks projectId={projectId} clicks={perf.clicks.slice(0, 25)} />
              </SectionCard>
            </div>
          ) : null}

          {active === "utm" ? (
            <div className="space-y-6">
              <SectionCard
                title="Share"
                action={
                  shortUrl ? (
                    <Button size="sm" variant="outline" className={OUTLINE_BUTTON} asChild>
                      <a href={shortUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                    </Button>
                  ) : null
                }
              >
                <div className="space-y-4">
                  <CopyField label="Short link" value={shortUrl} copyMessage="Short link copied." />
                  <CopyField label="Tagged URL" hint="Use this where short links aren't allowed. Clicks then aren't counted on the link, but signups still carry the tags." value={buildTrackedUrl(record.destinationUrl, record.utm)} copyMessage="Tagged URL copied." />
                </div>
              </SectionCard>
              <SectionCard bare title="Destination & tags" description="Where the short link redirects and the UTM tags added to its traffic.">
                <UtmFields draft={draft} set={set} idPrefix="le" campaigns={campaigns} baseUrl={baseUrl} disabled={!canEdit} />
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function SourceTrackingScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canEdit = useCan("campaign.acquisition.edit");
  const { baseUrl } = useAcquisitionStatus(projectId);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [view, setView] = useState("links");
  const [period, setPeriod] = useState("90");
  const [model, setModel] = useState("first");
  const [groupBy, setGroupBy] = useState("source_medium");
  const [query, setQuery] = useState("");
  const [mediumFilter, setMediumFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    Promise.all([listTrackingLinks(projectId), listCampaigns(projectId)]).then(([rows, campaignRows]) => {
      if (cancelled) return;
      if (rows === null) toast.error("Couldn't load tracked links.");
      setLinks(rows ?? []);
      setCampaigns(campaignRows ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    const since = new Date(Date.now() - Number(period) * 86400000).toISOString();
    listTrackedEvents(projectId, { since, limit: 20000 }).then((rows) => {
      if (cancelled) return;
      if (rows === null) toast.error("Couldn't load tracked events.");
      setEvents(rows ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, period]);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label || "";
  const eventRows = useMemo(() => events || [], [events]);
  const currency = useMemo(() => dominantCurrency(eventRows), [eventRows]);
  const sources = useMemo(() => attributeSources(eventRows, { model, groupBy }), [eventRows, model, groupBy]);
  const performanceById = useMemo(() => Object.fromEntries(links.map((l) => [l.id, linkPerformance(l, eventRows)])), [links, eventRows]);

  const stats = useMemo(() => {
    const bySource = attributeSources(eventRows, { model, groupBy: "source" });
    const tagged = bySource.filter((r) => r.source !== "(direct)");
    const signups = bySource.reduce((s, r) => s + r.signups, 0);
    const taggedSignups = tagged.reduce((s, r) => s + r.signups, 0);
    return [
      { label: "Tracked links", value: formatNumber(links.length) },
      { label: "Link clicks", value: formatNumber(eventRows.filter((e) => e.name === "link_clicked").length), footer: periodLabel },
      { label: "Signups from tagged traffic", value: formatNumber(taggedSignups), footer: signups ? `${percent(taggedSignups, signups)} of ${formatNumber(signups)} signups` : periodLabel },
      { label: "Attributed revenue", value: formatMoney(tagged.reduce((s, r) => s + r.revenue, 0), currency), footer: ATTRIBUTION_MODELS.find((m) => m.value === model)?.label },
    ];
  }, [eventRows, links.length, model, periodLabel, currency]);

  // Mediums are free text, so the options come from the links (plus the active pick).
  const mediumFilterOptions = useMemo(() => {
    const mediums = new Set(links.map((l) => l.utm?.medium).filter(Boolean));
    if (mediumFilter !== "all") mediums.add(mediumFilter);
    return [{ value: "all", label: "All mediums" }, ...[...mediums].sort().map((m) => ({ value: m, label: m }))];
  }, [links, mediumFilter]);

  const filteredLinks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return links.filter((l) => {
      if (mediumFilter !== "all" && l.utm?.medium !== mediumFilter) return false;
      if (q && !`${l.name} ${l.slug} ${l.destinationUrl} ${Object.values(l.utm || {}).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [links, query, mediumFilter]);

  const filteredSources = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sources.filter((s) => s.label.includes(q)) : sources;
  }, [sources, query]);

  const linkPager = usePagination(filteredLinks, { resetKey: `${query}|${mediumFilter}` });
  const sourcePager = usePagination(filteredSources, { resetKey: `${query}|${model}|${groupBy}|${period}` });
  const totalRevenue = useMemo(() => sources.reduce((s, r) => s + r.revenue, 0), [sources]);

  const handleCreate = async (input) => {
    setCreating(true);
    const user = await getUser().catch(() => null);
    const row = await createTrackingLink(projectId, { ...input, id: crypto.randomUUID(), createdBy: user?.id ?? null });
    setCreating(false);
    if (row === SLUG_TAKEN) {
      toast.error("That short link is already taken. Pick another.");
      return false;
    }
    if (!row) {
      toast.error("Couldn't create the tracked link.");
      return false;
    }
    setLinks((p) => [row, ...p]);
    toast.success("Tracked link created.");
    openRecord(row.id);
    return true;
  };

  // Optimistic: apply locally, persist, roll back on failure.
  const handleSave = async (id, patch) => {
    const before = links.find((l) => l.id === id);
    setLinks((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const saved = await updateTrackingLink(id, patch);
    if (!saved || saved === SLUG_TAKEN) {
      setLinks((p) => p.map((l) => (l.id === id ? before : l)));
      toast.error(saved === SLUG_TAKEN ? "That short link is already taken. Pick another." : "Couldn't save the tracked link.");
      return false;
    }
    setLinks((p) => p.map((l) => (l.id === id ? saved : l)));
    toast.success("Tracked link saved.");
    return true;
  };

  const handleDuplicate = async (l) => {
    const user = await getUser().catch(() => null);
    const copy = await createTrackingLink(projectId, {
      id: crypto.randomUUID(),
      name: l.name ? `${l.name} (copy)` : "",
      destinationUrl: l.destinationUrl,
      utm: l.utm,
      slug: randomSlug(),
      campaignId: l.campaignId,
      createdBy: user?.id ?? null,
    });
    if (!copy || copy === SLUG_TAKEN) {
      toast.error("Couldn't duplicate the tracked link.");
      return;
    }
    setLinks((p) => [copy, ...p]);
    toast.success("Tracked link duplicated with a new short link.");
  };

  const handleDelete = async (l) => {
    setDeleting(true);
    const ok = await softDeleteTrackingLink(l.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error("Couldn't delete the tracked link.");
      return;
    }
    setLinks((p) => p.filter((x) => x.id !== l.id));
    if (recordId === l.id) closeRecord();
    toast.success(`Deleted "${linkTitle(l)}".`);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      noun="tracked link"
      name={deleteTarget ? linkTitle(deleteTarget) : ""}
      consequence={`/l/${deleteTarget?.slug || ""} stops redirecting. Clicks and signups already recorded stay in your reports.`}
      pending={deleting}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = links.find((l) => l.id === recordId);
  if (open) {
    return (
      <>
        <LinkEditor
          key={open.id}
          record={open}
          projectId={projectId}
          events={eventRows}
          periodLabel={periodLabel}
          campaigns={campaigns}
          baseUrl={baseUrl}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || mediumFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setMediumFilter("all");
  };
  const campaignName = (id) => campaigns.find((c) => c.id === id)?.name;
  const shortUrl = (l) => (baseUrl ? `${baseUrl}/l/${l.slug}` : "");

  const linkColumns = [
    {
      key: "link",
      header: "Link",
      render: (l) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{linkTitle(l)}</span>
          <span className="truncate font-mono text-xs text-text-secondary">/l/{l.slug}</span>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source / medium",
      render: (l) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-sm text-foreground">
            {l.utm?.source || "—"} / {l.utm?.medium || "—"}
          </span>
          <span className="truncate text-xs text-text-secondary">{campaignName(l.campaignId) || l.utm?.campaign || ""}</span>
        </div>
      ),
    },
    { key: "clicks", header: "Clicks", className: "tabular-nums text-muted-foreground", render: (l) => (l.clicks ? formatNumber(l.clicks) : "—") },
    { key: "signups", header: "Signups", className: "tabular-nums text-muted-foreground", render: (l) => formatNumber(performanceById[l.id]?.signups || 0) },
    {
      key: "conversion",
      header: "Click to signup",
      render: (l) => {
        const signups = performanceById[l.id]?.signups || 0;
        const clicks = performanceById[l.id]?.clicks.length || 0;
        return clicks > 0 ? (
          <div className="w-[120px] space-y-1.5">
            <Progress value={Math.min(100, (signups / clicks) * 100)} className="h-1.5 bg-surface-hover" />
            <p className="text-xs tabular-nums text-text-secondary">{percent(signups, clicks)}</p>
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        );
      },
    },
    { key: "last", header: "Last click", className: "whitespace-nowrap text-muted-foreground", render: (l) => relativeTime(l.lastClickedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (l) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${linkTitle(l)}`}
            items={[
              { label: canEdit ? "Edit" : "Open", icon: Pencil, onSelect: () => openRecord(l.id) },
              { label: "Copy short link", icon: Link2, onSelect: () => copyText(shortUrl(l), "Short link copied."), disabled: !baseUrl },
              { label: "Copy tagged URL", icon: Copy, onSelect: () => copyText(buildTrackedUrl(l.destinationUrl, l.utm), "Tagged URL copied.") },
              canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(l) },
              canEdit && { separator: true },
              canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(l) },
            ]}
          />
        </div>
      ),
    },
  ];

  const sourceColumns = [
    { key: "source", header: ATTRIBUTION_GROUPS.find((g) => g.value === groupBy)?.label, render: (s) => <span className="font-mono text-sm text-foreground">{s.label}</span> },
    { key: "visitors", header: "Visitors", className: "tabular-nums text-muted-foreground", render: (s) => formatNumber(s.visitors) },
    { key: "clicks", header: "Link clicks", className: "tabular-nums text-muted-foreground", render: (s) => formatNumber(s.clicks) },
    { key: "signups", header: "Signups", className: "tabular-nums text-muted-foreground", render: (s) => formatNumber(s.signups) },
    { key: "conversion", header: "Visitor to signup", className: "tabular-nums text-muted-foreground", render: (s) => (s.visitors ? percent(s.signups, s.visitors) : "—") },
    { key: "orders", header: "Orders", className: "tabular-nums text-muted-foreground", render: (s) => formatNumber(s.orders) },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      render: (s) => (
        <div className="flex flex-col items-end">
          <span className="tabular-nums text-foreground">{formatMoney(s.revenue, currency)}</span>
          <span className="text-xs tabular-nums text-text-secondary">{totalRevenue ? percent(s.revenue, totalRevenue) : "—"}</span>
        </div>
      ),
    },
  ];

  const newLinkButton = canEdit ? (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" /> New tracked link
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Source Tracking" description="Tag links with UTM parameters and see which sources bring visitors, signups and revenue." actions={newLinkButton} />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={view} onValueChange={setView} options={VIEW_OPTIONS} height="h-9" />
          <FilterDropdown value={period} onValueChange={setPeriod} options={PERIOD_OPTIONS} height="h-9" />
          {view === "links" ? (
            <FilterDropdown value={mediumFilter} onValueChange={setMediumFilter} options={mediumFilterOptions} height="h-9" />
          ) : (
            <>
              <FilterDropdown value={groupBy} onValueChange={setGroupBy} options={ATTRIBUTION_GROUPS} height="h-9" />
              <FilterDropdown value={model} onValueChange={setModel} options={ATTRIBUTION_MODELS} height="h-9" />
            </>
          )}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder={view === "links" ? "Search links, tags or URLs…" : "Search sources…"} />
      </Toolbar>

      {view === "links" ? (
        loading ? (
          <LoadingArea size={48} panel label="Loading tracked links" />
        ) : (
          <div className="space-y-5">
            <DataTable
              columns={linkColumns}
              data={linkPager.pageItems}
              getRowKey={(l) => l.id}
              onRowClick={(l) => openRecord(l.id)}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState
                    icon={Link2}
                    title={filtersActive ? "No matches" : "No tracked links yet"}
                    description={filtersActive ? "Try a different search or filter." : "Create a short link with UTM tags to see which placements bring signups."}
                    action={
                      filtersActive ? (
                        <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : (
                        newLinkButton
                      )
                    }
                  />
                </div>
              }
            />
            <ListPagination {...linkPager} itemLabel="links" />
          </div>
        )
      ) : events === null ? (
        <LoadingArea size={48} panel label="Loading sources" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={sourceColumns}
            data={sourcePager.pageItems}
            getRowKey={(s) => s.key}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={BarChart3}
                  title={query ? "No matches" : "No traffic in this period"}
                  description={
                    query
                      ? "Try a different search."
                      : "Sources appear once visits, clicks, signups or orders are recorded. Share a tracked link or add utm_source to the URLs you post."
                  }
                  action={
                    query ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setQuery("")}>
                        Clear search
                      </Button>
                    ) : (
                      newLinkButton
                    )
                  }
                />
              </div>
            }
          />
          <ListPagination {...sourcePager} itemLabel="sources" />
          {sources.length ? (
            <p className="text-xs text-text-tertiary">
              {model === "first" ? "Each signup and order is credited to the person's first tagged visit in the period." : "Each signup and order is credited to the person's latest tagged visit before it."} Untagged traffic and people with no tagged visit show as (direct).
            </p>
          ) : null}
        </div>
      )}

      <CreateLinkDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} campaigns={campaigns} baseUrl={baseUrl} pending={creating} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default SourceTrackingScreen;
