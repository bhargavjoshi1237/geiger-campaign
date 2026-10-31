"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, FileText, ImagePlus, Loader2, MessageSquare, MessagesSquare, Pause, Play, Plus, Rocket, Settings2, Trash2, Wallet } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
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
  InlineTitleInput,
  Input,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { listConnections } from "@/lib/supabase/channel_connections";
import { listAdCreatives } from "@/lib/supabase/ad_creatives";
import { createCtwaAd, listCtwaAds, listDmFlowOptions, normalizeCtwaAd, softDeleteCtwaAd, updateCtwaAd } from "@/lib/supabase/ctwa_ads";
import { AD_DESTINATIONS, AD_OBJECTIVES, adsManagerUrl, destinationMeta } from "@/lib/ads/catalog";
import {
  AccountSelect,
  AdsConnectState,
  DeleteConfirmDialog,
  ListEmptyState,
  LoadingPanel,
  MediaThumb,
  NO_PERMISSION,
  OUTLINE_BUTTON,
  PRIMARY_BUTTON,
  adsPath,
  copyText,
  splitList,
  useAdAccounts,
  useAdsManage,
  useNow,
} from "./ads_kit";
import { CTWA_STATUS_MAP, formatDateTime, formatMoney, formatNumber, timeAgo } from "./constants";

const NAV = [
  { key: "setup", label: "Setup", icon: Settings2, desc: "Ad account, page, destination and objective." },
  { key: "creative", label: "Creative", icon: ImagePlus, desc: "Media, primary text and headline." },
  { key: "conversation", label: "Conversation", icon: MessagesSquare, desc: "Welcome message, ice breakers and the flow that answers." },
  { key: "budget", label: "Budget & audience", icon: Wallet, desc: "Daily budget, countries and ages." },
  { key: "publish", label: "Publish", icon: Rocket, desc: "Create it on Meta, pause or resume." },
];

const DESTINATION_OPTIONS = [{ value: "all", label: "All destinations" }, ...AD_DESTINATIONS.map((d) => ({ value: d.value, label: d.label }))];
const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(CTWA_STATUS_MAP).map(([value, m]) => ({ value, label: m.label }))];
const MAX_ICE_BREAKERS = 4;

const toDraft = (a) => ({
  name: a.name,
  adAccountId: a.adAccountId || "",
  pageId: a.pageId || "",
  destination: a.destination,
  connectionId: a.connectionId || "",
  objective: a.objective,
  creativeId: a.creativeId || "",
  primaryText: a.primaryText,
  headline: a.headline,
  mediaUrl: a.mediaUrl,
  welcomeMessage: a.welcomeMessage,
  iceBreakers: a.iceBreakers.map((b) => b?.title || ""),
  flowId: a.flowId || "",
  dailyBudget: String(a.dailyBudget),
  countries: a.targeting.countries.join(", "),
  ageMin: String(a.targeting.ageMin),
  ageMax: String(a.targeting.ageMax),
});

const fromDraft = (d) => ({
  name: d.name.trim() || "Untitled ad",
  adAccountId: d.adAccountId,
  pageId: d.pageId,
  destination: d.destination,
  connectionId: d.connectionId,
  objective: d.objective,
  creativeId: d.creativeId,
  primaryText: d.primaryText,
  headline: d.headline,
  mediaUrl: d.mediaUrl.trim(),
  welcomeMessage: d.welcomeMessage,
  iceBreakers: d.iceBreakers.map((t) => t.trim()).filter(Boolean).map((title) => ({ title })),
  flowId: d.flowId,
  dailyBudget: Number(d.dailyBudget) || 0,
  targeting: {
    countries: splitList(d.countries).map((c) => c.toUpperCase()),
    ageMin: Math.min(65, Math.max(18, Number(d.ageMin) || 18)),
    ageMax: Math.min(65, Math.max(18, Number(d.ageMax) || 65)),
  },
});

// What still blocks publishing, in the order Meta would reject it.
function publishBlockers(d, account, connections) {
  const out = [];
  if (!d.adAccountId) out.push("Choose an ad account.");
  else if (!account) out.push("The ad account isn't connected.");
  if (!d.pageId && !account?.pageIds?.length) out.push("Choose the Facebook page the ad runs from.");
  if (!d.mediaUrl.trim()) out.push("Add an image or video from the Creative Library or a URL.");
  if (d.destination === "whatsapp" && !connections.some((c) => c.id === d.connectionId)) out.push("Choose the WhatsApp number the ad opens.");
  if (!(Number(d.dailyBudget) > 0)) out.push("Set a daily budget above zero.");
  return out;
}

function CreateDialog({ open, onOpenChange, accounts, onCreate }) {
  const [form, setForm] = useState({ name: "", destination: "whatsapp", adAccountId: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Give the ad a name.");
      return;
    }
    onCreate({ ...form, name: form.name.trim(), adAccountId: form.adAccountId || accounts[0]?.id || "" });
    setForm({ name: "", destination: "whatsapp", adAccountId: "" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Click-to-Message ad</DialogTitle>
          <DialogDescription>Starts as a draft. Nothing reaches Meta until you publish it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Ad name" htmlFor="ctwa-name">
            <Input id="ctwa-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Kestrel Aero test ride — WhatsApp" />
          </Field>
          <Field label="Opens a thread in">
            <Select value={form.destination} onValueChange={set("destination")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AD_DESTINATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {accounts.length > 1 ? (
            <Field label="Ad account">
              <AccountSelect accounts={accounts} value={form.adAccountId || accounts[0]?.id} onValueChange={set("adAccountId")} />
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BUTTON} onClick={submit}><Plus className="h-4 w-4" /> Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CtwaEditor({ ad, accounts, creatives, connections, flows, canManage, busy, onBack, onSave, onPublish, onStatus, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(ad));
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const setText = (k) => (e) => set(k)(e.target.value);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(ad));
  const locked = !canManage;
  const published = Boolean(ad.externalAdId);
  const account = accounts.find((a) => a.id === draft.adAccountId) || null;
  const channelConnections = connections.filter((c) => c.channel === destinationMeta(draft.destination).channel);
  const channelFlows = flows.filter((f) => !f.channels.length || f.channels.includes(draft.destination));
  const blockers = publishBlockers(draft, account, channelConnections);
  const currency = account?.currency || ad.currency;

  const save = async () => {
    const saved = await onSave(ad.id, { ...fromDraft(draft), currency });
    return saved;
  };

  const publish = async (activate) => {
    if (dirty && !(await save())) return;
    onPublish(ad, activate);
  };

  const pickCreative = (id) => {
    const c = creatives.find((x) => x.id === id);
    setDraft((d) => (c ? { ...d, creativeId: c.id, primaryText: c.primaryText, headline: c.headline, mediaUrl: c.mediaUrl } : { ...d, creativeId: "" }));
  };

  const setBreaker = (i, value) => setDraft((d) => ({ ...d, iceBreakers: d.iceBreakers.map((b, idx) => (idx === i ? value : b)) }));

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={setText("name")}
          aria-label="Ad name"
          placeholder="Untitled ad"
          disabled={locked}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={ad.status}
      statusMap={CTWA_STATUS_MAP}
      badges={<span className="text-xs text-text-tertiary">{destinationMeta(ad.destination).label} · ref {ad.ref}</span>}
      actions={
        canManage ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete ad"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(ad)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>Save</Button>
          </>
        ) : null
      }
      nav={NAV}
      defaultSection="setup"
    >
      {({ active }) => (
        <>
          {active === "setup" ? (
            <SectionCard bare title="Account & destination" description="Where the ad runs and which inbox its threads land in.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ad account">
                  <AccountSelect accounts={accounts} value={draft.adAccountId} onValueChange={set("adAccountId")} disabled={locked || published} />
                </Field>
                <Field label="Facebook page" hint="The page the ad runs from and the thread opens on.">
                  <Select value={draft.pageId || "default"} onValueChange={(v) => set("pageId")(v === "default" ? "" : v)} disabled={locked || published || !account}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose a page" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">First page on the account</SelectItem>
                      {(account?.pages || []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name || p.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Opens a thread in">
                  <Select value={draft.destination} onValueChange={(v) => setDraft((d) => ({ ...d, destination: v, connectionId: "", flowId: "" }))} disabled={locked || published}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AD_DESTINATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={draft.destination === "whatsapp" ? "WhatsApp number" : "Inbox connection"} hint={channelConnections.length ? "Threads land on this connection in the Inbox." : `Connect ${destinationMeta(draft.destination).label} in Channels first.`}>
                  <Select value={draft.connectionId || "none"} onValueChange={(v) => set("connectionId")(v === "none" ? "" : v)} disabled={locked || published}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not chosen</SelectItem>
                      {channelConnections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || c.handle || c.externalId}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Objective" className="sm:col-span-2" hint={AD_OBJECTIVES.find((o) => o.value === draft.objective)?.hint}>
                  <Select value={draft.objective} onValueChange={set("objective")} disabled={locked || published}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AD_OBJECTIVES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "creative" ? (
            <SectionCard bare title="Ad copy & media" description={published ? "Published creatives are edited in Ads Manager; these fields are read-only now." : "Pick a saved creative or write the copy here."}>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="grid gap-4">
                  <Field label="From the Creative Library">
                    <Select value={draft.creativeId || "none"} onValueChange={(v) => pickCreative(v === "none" ? "" : v)} disabled={locked || published}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Write it here</SelectItem>
                        {creatives.filter((c) => c.status !== "archived").map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Media URL" htmlFor="ctwa-media" hint="An image (1080×1080 works everywhere) or video file URL.">
                    <Input id="ctwa-media" value={draft.mediaUrl} onChange={setText("mediaUrl")} placeholder="https://…" disabled={locked || published} />
                  </Field>
                </div>
                <MediaThumb url={draft.mediaUrl} label="Ad media" className="h-28 w-28" />
              </div>
              <div className="mt-4 grid gap-4">
                <Field label="Primary text" htmlFor="ctwa-text" hint={`${draft.primaryText.length}/125 before Meta truncates it.`}>
                  <Textarea id="ctwa-text" rows={3} value={draft.primaryText} onChange={setText("primaryText")} disabled={locked || published} />
                </Field>
                <Field label="Headline" htmlFor="ctwa-headline" hint={`${draft.headline.length}/40`}>
                  <Input id="ctwa-headline" value={draft.headline} onChange={setText("headline")} disabled={locked || published} />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "conversation" ? (
            <div className="space-y-6">
              <SectionCard bare title="Opening message" description="What people see when the thread opens, before they type.">
                <div className="grid gap-4">
                  <Field label="Welcome message" htmlFor="ctwa-welcome">
                    <Textarea id="ctwa-welcome" rows={3} value={draft.welcomeMessage} onChange={setText("welcomeMessage")} placeholder="Hi! Want to book a test ride? Pick an option below." disabled={locked || published} />
                  </Field>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Ice breakers</p>
                    {draft.iceBreakers.map((b, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input value={b} maxLength={80} onChange={(e) => setBreaker(i, e.target.value)} aria-label={`Ice breaker ${i + 1}`} disabled={locked || published} />
                        <Button variant="ghost" size="icon" aria-label={`Remove ice breaker ${i + 1}`} disabled={locked || published} onClick={() => setDraft((d) => ({ ...d, iceBreakers: d.iceBreakers.filter((_, idx) => idx !== i) }))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" className={OUTLINE_BUTTON} disabled={locked || published || draft.iceBreakers.length >= MAX_ICE_BREAKERS} onClick={() => setDraft((d) => ({ ...d, iceBreakers: [...d.iceBreakers, ""] }))}>
                      <Plus className="h-4 w-4" /> Add ice breaker
                    </Button>
                  </div>
                </div>
              </SectionCard>
              <SectionCard bare title="Answered by" description="Threads opened from this ad carry its ref, so the right flow picks them up. You can change this at any time.">
                <Field label="DM flow" hint={channelFlows.length ? "The flow starts on the first message from the ad." : "Build a DM flow in Chat Automation to answer these threads automatically."}>
                  <Select value={draft.flowId || "none"} onValueChange={(v) => set("flowId")(v === "none" ? "" : v)} disabled={locked}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No flow — the Inbox handles it</SelectItem>
                      {channelFlows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}{f.status !== "active" ? ` (${f.status})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Routing ref</p>
                    <p className="truncate font-mono text-xs text-text-secondary">{ad.ref}</p>
                  </div>
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => copyText(ad.ref, "Ref copied")}><Copy className="h-4 w-4" /> Copy</Button>
                </div>
              </SectionCard>
            </div>
          ) : null}

          {active === "budget" ? (
            <SectionCard bare title="Spend & targeting" description={published ? "Budget and targeting are managed in Ads Manager once the ad is live." : `Spend is billed by Meta in ${currency}. The ad set optimises for conversations.`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Daily budget (${currency})`} htmlFor="ctwa-budget">
                  <Input id="ctwa-budget" type="number" min="1" step="1" value={draft.dailyBudget} onChange={setText("dailyBudget")} disabled={locked || published} />
                </Field>
                <Field label="Countries" htmlFor="ctwa-countries" hint="Two-letter codes, comma separated (PT, ES, NL).">
                  <Input id="ctwa-countries" value={draft.countries} onChange={setText("countries")} placeholder="PT, ES" disabled={locked || published} />
                </Field>
                <Field label="Minimum age" htmlFor="ctwa-age-min">
                  <Input id="ctwa-age-min" type="number" min="18" max="65" value={draft.ageMin} onChange={setText("ageMin")} disabled={locked || published} />
                </Field>
                <Field label="Maximum age" htmlFor="ctwa-age-max">
                  <Input id="ctwa-age-max" type="number" min="18" max="65" value={draft.ageMax} onChange={setText("ageMax")} disabled={locked || published} />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "publish" ? (
            <div className="space-y-6">
              <SectionCard
                bare
                title={published ? "On Meta" : "Publish to Meta"}
                description={published ? "Pausing here pauses the ad on Meta." : "Creates the campaign, ad set, creative and ad. It stays paused until you activate it."}
                action={
                  canManage ? (
                    published ? (
                      <Button className={PRIMARY_BUTTON} disabled={busy || !["active", "paused"].includes(ad.status)} onClick={() => onStatus(ad, ad.status === "active" ? "PAUSED" : "ACTIVE")}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : ad.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {ad.status === "active" ? "Pause ad" : "Activate ad"}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" className={OUTLINE_BUTTON} disabled={busy || blockers.length > 0} onClick={() => publish(false)}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publish paused
                        </Button>
                        <Button className={PRIMARY_BUTTON} disabled={busy || blockers.length > 0} onClick={() => publish(true)}>
                          <Play className="h-4 w-4" /> Publish and activate
                        </Button>
                      </div>
                    )
                  ) : null
                }
              >
                {!published && blockers.length ? (
                  <ul className="space-y-1 text-sm text-text-secondary">
                    {blockers.map((b) => <li key={b}>· {b}</li>)}
                  </ul>
                ) : null}
                {ad.lastError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{ad.lastError}</p> : null}
                {published || ad.externalCampaignId ? (
                  <SettingsList className="mt-2">
                    <SettingRow title="Campaign" description="Meta campaign id" control={<span className="font-mono text-xs text-text-secondary">{ad.externalCampaignId || "—"}</span>} />
                    <SettingRow title="Ad set" description="Meta ad set id" control={<span className="font-mono text-xs text-text-secondary">{ad.externalAdsetId || "—"}</span>} />
                    <SettingRow title="Ad" description={ad.publishedAt ? `Published ${formatDateTime(ad.publishedAt)}` : "Not created yet"} control={<span className="font-mono text-xs text-text-secondary">{ad.externalAdId || "—"}</span>} />
                  </SettingsList>
                ) : null}
              </SectionCard>
              {published ? (
                <SectionCard title="Results" description={ad.stats.syncedAt ? `Meta insights from ${formatDateTime(ad.stats.syncedAt)}; threads counted from ad referrals in the last 30 days.` : "Insights arrive with the next account sync."}>
                  <SettingsList>
                    <SettingRow title="Threads opened" description="People who messaged from this ad" control={<span className="text-sm tabular-nums text-foreground">{formatNumber(ad.stats.threads)}</span>} />
                    <SettingRow title="Conversations started" description="As Meta reports it" control={<span className="text-sm tabular-nums text-foreground">{formatNumber(ad.stats.conversationsStarted)}</span>} />
                    <SettingRow title="Spend" control={<span className="text-sm tabular-nums text-foreground">{formatMoney(ad.stats.spend, currency)}</span>} />
                    <SettingRow title="Cost per conversation" control={<span className="text-sm tabular-nums text-foreground">{ad.stats.costPerConversation == null ? "—" : formatMoney(ad.stats.costPerConversation, currency)}</span>} />
                  </SettingsList>
                </SectionCard>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function ClickToMessageScreen() {
  const { projectId, accounts, connected, status, loading: accountsLoading, reload } = useAdAccounts();
  const canManage = useAdsManage();
  const now = useNow();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [ads, setAds] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [connections, setConnections] = useState([]);
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listCtwaAds(projectId), listAdCreatives(projectId), listConnections(projectId), listDmFlowOptions(projectId)]).then(([rows, creativeRows, connectionRows, flowRows]) => {
      if (!alive) return;
      setAds(rows ?? []);
      setCreatives(creativeRows ?? []);
      setConnections((connectionRows ?? []).filter((c) => ["whatsapp", "messenger", "instagram"].includes(c.channel)));
      setFlows(flowRows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const replace = (row) => setAds((prev) => prev.map((a) => (a.id === row.id ? row : a)));
  const flowName = useMemo(() => new Map(flows.map((f) => [f.id, f.name])), [flows]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const stats = useMemo(() => {
    const live = ads.filter((a) => a.externalAdId);
    const currencies = new Set(live.map((a) => a.currency));
    const currency = currencies.size === 1 ? [...currencies][0] : null;
    const threads = ads.reduce((s, a) => s + a.stats.threads, 0);
    const conversations = live.reduce((s, a) => s + a.stats.conversationsStarted, 0);
    const spend = live.reduce((s, a) => s + a.stats.spend, 0);
    const synced = live.map((a) => a.stats.syncedAt).filter(Boolean).sort().pop();
    return [
      { label: "Click-to-Message ads", value: formatNumber(ads.length), footer: `${ads.filter((a) => a.status === "active").length} active · ${ads.filter((a) => a.status === "draft").length} drafts` },
      { label: "Threads opened", value: formatNumber(threads), footer: "From ad referrals · 30 days" },
      { label: "Conversations started", value: formatNumber(conversations), footer: synced ? `Meta insights · ${timeAgo(synced, now)}` : "Reported by Meta" },
      { label: "Cost per conversation", value: conversations && currency ? formatMoney(spend / conversations, currency) : "—", footer: currencies.size > 1 ? "Mixed currencies" : spend && currency ? `${formatMoney(spend, currency)} spent` : "No spend yet" },
    ];
  }, [ads, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ads.filter((a) => {
      if (destination !== "all" && a.destination !== destination) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q && !`${a.name} ${a.ref} ${a.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ads, destination, statusFilter, query]);

  const pager = usePagination(filtered, { resetKey: `${query}|${destination}|${statusFilter}` });

  const handleCreate = async (input) => {
    const user = await getUser();
    const account = accountById.get(input.adAccountId);
    const optimistic = normalizeCtwaAd({
      id: crypto.randomUUID(),
      project_id: projectId,
      ad_account_id: input.adAccountId || null,
      name: input.name,
      destination: input.destination,
      ref: "",
      currency: account?.currency || "USD",
      status: "draft",
      created_at: new Date().toISOString(),
    });
    setAds((prev) => [optimistic, ...prev]);
    openRecord(optimistic.id);
    const saved = await createCtwaAd(projectId, {
      id: optimistic.id,
      name: input.name,
      destination: input.destination,
      adAccountId: input.adAccountId,
      currency: optimistic.currency,
      status: "draft",
      createdBy: user?.id ?? null,
    });
    if (!saved) {
      setAds((prev) => prev.filter((a) => a.id !== optimistic.id));
      closeRecord();
      toast.error("Couldn't create the ad.");
      return;
    }
    replace(saved);
    toast.success(`Created "${saved.name}".`);
  };

  const handleSave = async (id, patch) => {
    const prev = ads.find((a) => a.id === id);
    setAds((rows) => rows.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    const saved = await updateCtwaAd(id, patch);
    if (!saved) {
      if (prev) replace(prev);
      toast.error("Couldn't save the ad.");
      return null;
    }
    replace(saved);
    toast.success("Ad saved.");
    return saved;
  };

  const handlePublish = async (ad, activate) => {
    setBusyId(ad.id);
    const res = await apiPost(adsPath(projectId, `/ctwa/${ad.id}/publish`), { activate });
    setBusyId(null);
    const saved = res.data?.ad ? normalizeCtwaAd(res.data.ad) : null;
    if (saved) replace(saved);
    if (!res.ok) {
      toast.error(res.error || "Meta didn't accept the ad.");
      return;
    }
    if (saved?.status === "failed") toast.error(saved.lastError || "Publishing stopped part-way. Fix the issue and publish again.");
    else toast.success(activate ? "Published and active on Meta." : "Published to Meta, paused.");
  };

  const handleStatus = async (ad, next) => {
    setBusyId(ad.id);
    replace({ ...ad, status: next === "ACTIVE" ? "active" : "paused" });
    const res = await apiPost(adsPath(projectId, `/ctwa/${ad.id}/status`), { status: next });
    setBusyId(null);
    if (!res.ok) {
      replace(ad);
      toast.error(res.error || "Meta didn't change the status.");
      return;
    }
    if (res.data?.ad) replace(normalizeCtwaAd(res.data.ad));
    toast.success(next === "ACTIVE" ? `"${ad.name}" is active.` : `Paused "${ad.name}".`);
  };

  const handleDelete = async (ad) => {
    setDeleteTarget(null);
    setAds((prev) => prev.filter((a) => a.id !== ad.id));
    if (ad.id === recordId) closeRecord();
    const ok = await softDeleteCtwaAd(ad.id);
    if (!ok) {
      setAds((prev) => [ad, ...prev]);
      toast.error("Couldn't delete the ad.");
      return;
    }
    toast.success(`Deleted "${ad.name}".`);
  };

  const deleteDialog = (
    <DeleteConfirmDialog
      target={deleteTarget}
      title="Delete ad"
      name={deleteTarget?.name}
      description={deleteTarget?.externalAdId ? "It's removed here only — pause or delete the ad in Ads Manager too." : undefined}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = ads.find((a) => a.id === recordId);
  if (open && !loading) {
    return (
      <>
        <CtwaEditor
          key={open.id}
          ad={open}
          accounts={connected}
          creatives={creatives}
          connections={connections}
          flows={flows}
          canManage={canManage}
          busy={busyId === open.id}
          onBack={closeRecord}
          onSave={handleSave}
          onPublish={handlePublish}
          onStatus={handleStatus}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = Boolean(query) || destination !== "all" || statusFilter !== "all";

  const columns = [
    {
      key: "ad",
      header: "Ad",
      render: (a) => (
        <div className="flex min-w-0 items-center gap-3">
          <MediaThumb url={a.mediaUrl} label={a.name} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{a.name}</span>
            <span className="truncate text-xs text-text-secondary">{destinationMeta(a.destination).label} · {a.ref}</span>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (a) => <StatusPill status={a.status} map={CTWA_STATUS_MAP} /> },
    { key: "flow", header: "Answered by", render: (a) => <span className="text-sm text-text-secondary">{a.flowId ? flowName.get(a.flowId) || "A deleted flow" : "Inbox"}</span> },
    { key: "budget", header: "Budget/day", align: "right", className: "tabular-nums", render: (a) => formatMoney(a.dailyBudget, a.currency) },
    { key: "threads", header: "Threads", align: "right", className: "tabular-nums", render: (a) => formatNumber(a.stats.threads) },
    { key: "conversations", header: "Conv. started", align: "right", className: "tabular-nums", render: (a) => (a.externalAdId ? formatNumber(a.stats.conversationsStarted) : "—") },
    { key: "cost", header: "Cost/conv.", align: "right", className: "tabular-nums font-medium text-foreground", render: (a) => (a.stats.costPerConversation == null ? "—" : formatMoney(a.stats.costPerConversation, a.currency)) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (a) => {
        const live = Boolean(a.externalAdId) && ["active", "paused"].includes(a.status);
        return (
          <ActionMenu
            label={`Actions for ${a.name}`}
            items={[
              { icon: FileText, label: "Open", onSelect: () => openRecord(a.id) },
              live && { icon: a.status === "active" ? Pause : Play, label: a.status === "active" ? "Pause on Meta" : "Activate on Meta", disabled: !canManage || busyId === a.id, onSelect: () => handleStatus(a, a.status === "active" ? "PAUSED" : "ACTIVE") },
              { icon: Copy, label: "Copy ref", onSelect: () => copyText(a.ref, "Ref copied") },
              a.externalAdId && { icon: ExternalLink, label: "Open in Ads Manager", href: adsManagerUrl(accountById.get(a.adAccountId)?.externalId) },
              canManage && { separator: true },
              canManage && { icon: Trash2, label: "Delete", destructive: true, onSelect: () => setDeleteTarget(a) },
            ]}
          />
        );
      },
    },
  ];

  const newButton = (
    <Button className={PRIMARY_BUTTON} disabled={!canManage || !connected.length} title={canManage ? undefined : NO_PERMISSION} onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" /> New ad
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Click-to-Message" description="Ads that open a WhatsApp, Messenger or Instagram thread, and the flow that answers each one." actions={newButton} />

      {loading || accountsLoading ? (
        <LoadingPanel label="Loading Click-to-Message ads" />
      ) : (
        <>
          {!connected.length ? <AdsConnectState status={status} description="Click-to-Message ads are created on your Meta ad account through the Marketing API." onConnected={() => reload()} /> : null}
          {ads.length || connected.length ? (
            <>
              <StatsBar stats={stats} />
              <Toolbar>
                <div className="flex items-center gap-2">
                  <FilterDropdown value={destination} onValueChange={setDestination} options={DESTINATION_OPTIONS} height="h-9" />
                  <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} height="h-9" />
                </div>
                <SearchInput value={query} onChange={setQuery} placeholder="Search ads or refs…" />
              </Toolbar>
              <div className="space-y-5">
                <DataTable
                  columns={columns}
                  data={pager.pageItems}
                  getRowKey={(a) => a.id}
                  onRowClick={(a) => openRecord(a.id)}
                  empty={
                    <ListEmptyState
                      icon={MessageSquare}
                      filtersActive={filtersActive}
                      title="No Click-to-Message ads yet"
                      description="Create one to send ad clicks straight into a chat thread, answered by a flow or your team."
                      onClear={() => {
                        setQuery("");
                        setDestination("all");
                        setStatusFilter("all");
                      }}
                      action={canManage && connected.length ? newButton : null}
                    />
                  }
                />
                <ListPagination {...pager} itemLabel="ads" />
              </div>
            </>
          ) : null}
        </>
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} accounts={connected} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ClickToMessageScreen;
