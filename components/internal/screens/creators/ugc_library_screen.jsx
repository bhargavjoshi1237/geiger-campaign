"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FileText, Image as ImageIcon, ImagePlus, Loader2, MailCheck, NotebookPen, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { listCollaborations } from "@/lib/supabase/collaborations";
import {
  createUgcItem,
  listAttachableAssets,
  listUgcItems,
  normalizeUgcItem,
  softDeleteUgcItem,
  updateUgcItem,
} from "@/lib/supabase/ugc_items";
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
  Switch,
  Textarea,
  Toolbar,
  cn,
} from "@geiger/ui";
import {
  NETWORKS,
  RIGHTS_STATUS_MAP,
  RIGHTS_STATUS_OPTIONS,
  UGC_KINDS,
  USAGE_CHANNELS,
  USAGE_LABELS,
  daysUntil,
  formatDate,
  formatDateTime,
  formatNumber,
  relativeDays,
  toDateInput,
} from "./constants";
import {
  CreatorPicker,
  DeleteConfirmDialog,
  ListEmptyState,
  LoadingPanel,
  Notice,
  OUTLINE_BUTTON,
  ValueRow,
  useCanManageCreators,
  useCreatorDirectory,
} from "./creators_kit";

const UGC_NAV = [
  { key: "content", label: "Content", icon: ImageIcon, desc: "Where the content came from and the file it's saved as." },
  { key: "rights", label: "Rights", icon: ShieldCheck, desc: "Permission to reuse it: status, term, channels and whitelisting." },
  { key: "notes", label: "Usage notes", icon: NotebookPen, desc: "Where it's been used and anything to watch for." },
];

const KIND_OPTIONS = [{ value: "all", label: "All formats" }, ...UGC_KINDS];
const WHITELIST_OPTIONS = [
  { value: "all", label: "Any whitelisting" },
  { value: "yes", label: "Whitelisted" },
  { value: "no", label: "Not whitelisted" },
];
const TERM_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
  { value: "0", label: "No end date" },
];
const NETWORK_OPTIONS = [...NETWORKS, { value: "website", label: "Website" }, { value: "other", label: "Other" }];
const kindLabel = (k) => UGC_KINDS.find((x) => x.value === k)?.label || k;
const networkLabel = (n) => NETWORK_OPTIONS.find((x) => x.value === n)?.label || n;

function Thumb({ item, size = "h-10 w-10" }) {
  const url = item.thumbnailUrl || (item.assetUrl && !/\.(mp4|mov|webm)(\?|$)/i.test(item.assetUrl) ? item.assetUrl : "");
  return url ? (
    <span role="img" aria-label={item.title || "Content preview"} className={cn("block shrink-0 rounded-lg border border-border bg-surface-active bg-cover bg-center", size)} style={{ backgroundImage: `url("${url.replace(/"/g, "%22")}")` }} />
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground", size)}>
      <ImageIcon className="h-4 w-4" />
    </span>
  );
}

function RightsCell({ item }) {
  const days = item.rightsStatus === "granted" ? daysUntil(item.rightsExpiresAt) : null;
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusPill status={item.rightsStatus} map={RIGHTS_STATUS_MAP} />
      {item.rightsStatus === "granted" ? (
        <span className={cn("text-xs", days != null && days <= 14 ? "text-amber-600 dark:text-amber-400" : "text-text-secondary")}>
          {item.rightsExpiresAt ? `Expires ${relativeDays(item.rightsExpiresAt)}` : "No end date"}
        </span>
      ) : item.rightsStatus === "requested" && item.rightsRequestedAt ? (
        <span className="text-xs text-text-secondary">Asked {formatDate(item.rightsRequestedAt)}</span>
      ) : null}
    </div>
  );
}

function AssetPicker({ assets, value, onChange, disabled }) {
  if (!assets.length) {
    return <p className="text-sm text-text-tertiary">No images or videos in the asset library yet. Upload them in Content → Asset Library.</p>;
  }
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? null : assets.find((a) => a.id === v))} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="none">No file attached</SelectItem>
        {assets.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name} <span className="ml-1 text-text-tertiary capitalize">{a.kind}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddUgcDialog({ open, onOpenChange, creators, assets, onCreate }) {
  const blank = { title: "", sourceUrl: "", creatorId: null, authorHandle: "", kind: "reel", network: "instagram", caption: "", asset: null };
  const [form, setForm] = useState(blank);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const valid = form.sourceUrl.trim() || form.asset;
  const submit = () => {
    if (!valid) return;
    onCreate({
      title: form.title.trim(),
      sourceUrl: form.sourceUrl.trim(),
      creatorId: form.creatorId,
      authorHandle: form.authorHandle,
      kind: form.kind,
      network: form.network,
      caption: form.caption,
      assetId: form.asset?.id || null,
      assetUrl: form.asset?.url || null,
    });
    setForm(blank);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add content</DialogTitle>
          <DialogDescription>Save a creator or customer post to the library, then track permission to reuse it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Source URL" htmlFor="ua-url" className="sm:col-span-2">
            <Input id="ua-url" value={form.sourceUrl} onChange={(e) => set("sourceUrl")(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
          </Field>
          <Field label="Title" htmlFor="ua-title" className="sm:col-span-2">
            <Input id="ua-title" value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Aero unboxing Reel" />
          </Field>
          <Field label="Creator">
            <CreatorPicker creators={creators} value={form.creatorId} onChange={set("creatorId")} allowNone />
          </Field>
          <Field label="Or author handle" htmlFor="ua-handle" hint="For customers not in your creator database.">
            <Input id="ua-handle" value={form.authorHandle} onChange={(e) => set("authorHandle")(e.target.value)} placeholder="@customer" disabled={Boolean(form.creatorId)} />
          </Field>
          <Field label="Format">
            <Select value={form.kind} onValueChange={set("kind")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UGC_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Network">
            <Select value={form.network} onValueChange={set("network")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NETWORK_OPTIONS.map((n) => (
                  <SelectItem key={n.value} value={n.value}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="File from the asset library" className="sm:col-span-2">
            <AssetPicker assets={assets} value={form.asset?.id} onChange={set("asset")} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Add to library
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestRightsDialog({ item, creator, open, onOpenChange, onSent, projectId }) {
  const [form, setForm] = useState(() => ({
    termDays: "90",
    channels: item.usageChannels.length ? item.usageChannels : ["organic"],
    whitelisting: item.whitelisting,
    message: "",
  }));
  const [sending, setSending] = useState(false);
  const toggle = (value) =>
    setForm((f) => ({ ...f, channels: f.channels.includes(value) ? f.channels.filter((c) => c !== value) : [...f.channels, value] }));

  const send = async () => {
    setSending(true);
    const res = await apiPost(`/api/projects/${projectId}/creators/ugc/${item.id}/request-rights`, { ...form, termDays: Number(form.termDays) });
    setSending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't send the request.");
      return;
    }
    onSent(normalizeUgcItem(res.data.item));
    onOpenChange(false);
    toast.success(`Rights request emailed to ${creator?.name || "the creator"}.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request usage rights</DialogTitle>
          <DialogDescription>
            {creator?.name || "The creator"} gets an email with a link to approve or decline. Their answer, with the time and IP, is stored as proof.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Term">
            <Select value={form.termDays} onValueChange={(v) => setForm((f) => ({ ...f, termDays: v }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERM_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Where you'll use it">
            <div className="grid gap-2 sm:grid-cols-2">
              {USAGE_CHANNELS.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={form.channels.includes(c.value)} onCheckedChange={() => toggle(c.value)} />
                  {c.label}
                </label>
              ))}
            </div>
          </Field>
          <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3">
            <SettingRow
              title="Ask for whitelisting"
              description="Permission to run paid ads from the creator's handle."
              checked={form.whitelisting}
              onCheckedChange={(v) => setForm((f) => ({ ...f, whitelisting: v }))}
            />
          </SettingsList>
          <Field label="Personal note" htmlFor="rr-msg" hint="Optional — added above the request.">
            <Textarea id="rr-msg" rows={3} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Loved how you shot this on the coast road!" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending || !form.channels.length}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />} Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (i) => ({
  title: i.title,
  sourceUrl: i.sourceUrl,
  network: i.network,
  kind: i.kind,
  caption: i.caption,
  authorHandle: i.authorHandle,
  creatorId: i.creatorId,
  collaborationId: i.collaborationId,
  assetId: i.assetId,
  assetUrl: i.assetUrl,
  rightsStatus: i.rightsStatus,
  rightsExpiresAt: toDateInput(i.rightsExpiresAt),
  usageChannels: [...i.usageChannels],
  whitelisting: i.whitelisting,
  usageNotes: i.usageNotes,
});

function UgcEditor({ record, projectId, creators, collabs, assets, canManage, onBack, onSave, onReplace, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [requestOpen, setRequestOpen] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const locked = !canManage;
  const creator = creators.find((c) => c.id === draft.creatorId);
  const creatorCollabs = collabs.filter((c) => c.creatorId === draft.creatorId);
  const proof = record.rightsProof;

  const save = () => {
    const patch = { ...draft, rightsExpiresAt: draft.rightsExpiresAt ? new Date(`${draft.rightsExpiresAt}T23:59:59Z`).toISOString() : null };
    if (draft.rightsStatus !== record.rightsStatus && draft.rightsStatus === "granted" && !record.rightsGrantedAt) patch.rightsGrantedAt = new Date().toISOString();
    onSave(record.id, patch);
  };

  const canRequest = canManage && creator?.email && ["not_requested", "denied", "expired", "requested"].includes(record.rightsStatus);

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.title}
          onChange={(e) => set("title")(e.target.value)}
          aria-label="Content title"
          placeholder="Untitled content"
          disabled={locked}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.rightsStatus}
      statusMap={RIGHTS_STATUS_MAP}
      badges={
        <>
          {record.whitelisting ? <Badge variant="purple">Whitelisting</Badge> : null}
          <span className="text-xs text-text-tertiary">
            {kindLabel(record.kind)} · {networkLabel(record.network)} · {creator?.name || (record.authorHandle ? `@${record.authorHandle}` : "Unknown author")}
          </span>
        </>
      }
      actions={
        <>
          {canManage ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete content"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(record)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
              Save
            </Button>
          ) : null}
          {canRequest ? (
            <Button onClick={() => setRequestOpen(true)} disabled={dirty}>
              <MailCheck className="h-4 w-4" /> {record.rightsStatus === "requested" ? "Resend request" : "Request rights"}
            </Button>
          ) : null}
        </>
      }
      nav={UGC_NAV}
      defaultSection="content"
    >
      {({ active }) => (
        <>
          {active === "content" ? (
            <SectionCard bare title="Source & file" description="Where the content came from, who made it and the file it's saved as.">
              <div className="mb-5 flex items-center gap-4">
                <Thumb item={{ ...record, assetUrl: draft.assetUrl }} size="h-24 w-24" />
                <div className="min-w-0 space-y-1 text-sm">
                  {draft.sourceUrl ? (
                    <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline">
                      View original <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <p className="text-text-tertiary">No source URL</p>
                  )}
                  <p className="text-text-secondary">Added {formatDate(record.createdAt)}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Source URL" htmlFor="ue-url" className="sm:col-span-2">
                  <Input id="ue-url" value={draft.sourceUrl} onChange={(e) => set("sourceUrl")(e.target.value)} disabled={locked} placeholder="https://" />
                </Field>
                <Field label="Creator">
                  <CreatorPicker creators={creators} value={draft.creatorId} onChange={(v) => setDraft((d) => ({ ...d, creatorId: v, collaborationId: null }))} allowNone disabled={locked} />
                </Field>
                <Field label="Author handle" htmlFor="ue-handle">
                  <Input id="ue-handle" value={draft.authorHandle} onChange={(e) => set("authorHandle")(e.target.value)} disabled={locked || Boolean(draft.creatorId)} placeholder="@customer" />
                </Field>
                <Field label="Format">
                  <Select value={draft.kind} onValueChange={set("kind")} disabled={locked}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UGC_KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Network">
                  <Select value={draft.network} onValueChange={set("network")} disabled={locked}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NETWORK_OPTIONS.map((n) => (
                        <SelectItem key={n.value} value={n.value}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Collaboration">
                  <Select value={draft.collaborationId || "none"} onValueChange={(v) => set("collaborationId")(v === "none" ? null : v)} disabled={locked || !draft.creatorId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not part of a collaboration</SelectItem>
                      {creatorCollabs.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.campaignName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="File from the asset library">
                  <AssetPicker
                    assets={assets}
                    value={draft.assetId}
                    disabled={locked}
                    onChange={(a) => setDraft((d) => ({ ...d, assetId: a?.id || null, assetUrl: a?.url || null }))}
                  />
                </Field>
                <Field label="Caption" htmlFor="ue-caption" className="sm:col-span-2">
                  <Textarea id="ue-caption" rows={4} value={draft.caption} onChange={(e) => set("caption")(e.target.value)} disabled={locked} placeholder="The original caption, for context and credit." />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "rights" ? (
            <div className="space-y-6">
              {!creator?.email && record.rightsStatus !== "granted" ? (
                <Notice icon={MailCheck} title="Rights requests need a creator email">
                  Link this content to a creator with an email address to send a request they can approve. You can still record a permission you got elsewhere below.
                </Notice>
              ) : null}
              <SectionCard bare title="Usage rights" description="What you may do with this content, on which channels and until when.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Rights status" hint="Set by the creator's response; change it here for permissions agreed elsewhere.">
                    <Select value={draft.rightsStatus} onValueChange={set("rightsStatus")} disabled={locked}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RIGHTS_STATUS_MAP).map(([value, m]) => (
                          <SelectItem key={value} value={value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Rights expire" htmlFor="ue-exp" hint="Leave blank for no end date. Expired grants flip to Expired automatically.">
                    <Input id="ue-exp" type="date" value={draft.rightsExpiresAt} onChange={(e) => set("rightsExpiresAt")(e.target.value)} disabled={locked} />
                  </Field>
                  <Field label="Approved channels" className="sm:col-span-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {USAGE_CHANNELS.map((c) => (
                        <label key={c.value} className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={draft.usageChannels.includes(c.value)}
                            disabled={locked}
                            onCheckedChange={() =>
                              set("usageChannels")(draft.usageChannels.includes(c.value) ? draft.usageChannels.filter((x) => x !== c.value) : [...draft.usageChannels, c.value])
                            }
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  </Field>
                </div>
                <SettingsList className="mt-5 border-t border-border pt-4">
                  <SettingRow
                    title="Whitelisting"
                    description="You may run paid ads from the creator's own handle."
                    control={<Switch checked={draft.whitelisting} onCheckedChange={set("whitelisting")} disabled={locked} aria-label="Whitelisting" />}
                  />
                  <ValueRow title="Requested" value={formatDateTime(record.rightsRequestedAt)} />
                  <ValueRow title="Granted" value={formatDateTime(record.rightsGrantedAt)} />
                  {record.rightsRequest?.count ? <ValueRow title="Requests sent" value={formatNumber(record.rightsRequest.count)} /> : null}
                </SettingsList>
              </SectionCard>
              {proof?.decision ? (
                <SectionCard bare title="Proof of consent" description="Recorded when the creator answered the request.">
                  <SettingsList>
                    <ValueRow title="Decision" value={proof.decision === "granted" ? "Approved" : "Declined"} />
                    <ValueRow title="When" value={formatDateTime(proof.at)} />
                    <ValueRow title="What they agreed to" value={proof.use || "—"} />
                    <ValueRow title="IP address" value={proof.ip || "—"} />
                  </SettingsList>
                </SectionCard>
              ) : null}
            </div>
          ) : null}

          {active === "notes" ? (
            <SectionCard bare title="Usage history" description="Where this content has run and anything to watch for when reusing it.">
              <Field label="Usage notes" htmlFor="ue-notes">
                <Textarea id="ue-notes" rows={8} value={draft.usageNotes} onChange={(e) => set("usageNotes")(e.target.value)} disabled={locked} placeholder="Used in the October newsletter hero; crop to 4:5 for ads…" />
              </Field>
            </SectionCard>
          ) : null}

          {canRequest ? (
            <RequestRightsDialog
              key={`${record.id}-${requestOpen}`}
              item={record}
              creator={creator}
              open={requestOpen}
              onOpenChange={setRequestOpen}
              projectId={projectId}
              onSent={onReplace}
            />
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function UgcLibraryScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canManage = useCanManageCreators();
  const { creators, byId } = useCreatorDirectory(projectId);
  const [items, setItems] = useState([]);
  const [collabs, setCollabs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [rights, setRights] = useState("all");
  const [kind, setKind] = useState("all");
  const [whitelist, setWhitelist] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listUgcItems(projectId), listCollaborations(projectId), listAttachableAssets(projectId), getUser()]).then(([rows, collabRows, assetRows, user]) => {
      if (!alive) return;
      setItems(rows ?? []);
      setCollabs(collabRows ?? []);
      setAssets(assetRows ?? []);
      setUserId(user?.id || null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const reload = () => listUgcItems(projectId).then((rows) => rows && setItems(rows));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (rights !== "all" && i.rightsStatus !== rights) return false;
      if (kind !== "all" && i.kind !== kind) return false;
      if (whitelist === "yes" && !i.whitelisting) return false;
      if (whitelist === "no" && i.whitelisting) return false;
      if (q && !`${i.title} ${i.caption} ${i.authorHandle} ${i.sourceUrl} ${byId.get(i.creatorId)?.name || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, rights, kind, whitelist, byId]);

  const stats = useMemo(() => {
    const granted = items.filter((i) => i.rightsStatus === "granted");
    const expiring = granted.filter((i) => {
      const d = daysUntil(i.rightsExpiresAt);
      return d != null && d >= 0 && d <= 30;
    }).length;
    return [
      { label: "Library items", value: formatNumber(items.length), footer: `${items.filter((i) => i.assetId).length} saved as files` },
      { label: "Rights granted", value: formatNumber(granted.length), footer: `${granted.filter((i) => i.whitelisting).length} with whitelisting` },
      { label: "Awaiting answer", value: formatNumber(items.filter((i) => i.rightsStatus === "requested").length), footer: "Requests sent" },
      { label: "Expiring in 30 days", value: formatNumber(expiring), footer: "Renew or stop using" },
    ];
  }, [items]);

  const pager = usePagination(filtered, { resetKey: `${query}|${rights}|${kind}|${whitelist}` });

  const handleCreate = async (input) => {
    const id = crypto.randomUUID();
    const optimistic = normalizeUgcItem({
      id,
      project_id: projectId,
      title: input.title,
      source_url: input.sourceUrl,
      creator_id: input.creatorId,
      author_handle: input.authorHandle,
      kind: input.kind,
      network: input.network,
      caption: input.caption,
      asset_id: input.assetId,
      asset_url: input.assetUrl,
      rights_status: "not_requested",
      created_at: new Date().toISOString(),
    });
    setItems((prev) => [optimistic, ...prev]);
    openRecord(id);
    const saved = await createUgcItem(projectId, { ...input, id, rightsStatus: "not_requested", createdBy: userId });
    if (saved) {
      setItems((prev) => prev.map((i) => (i.id === id ? saved : i)));
      toast.success("Added to the UGC library.");
    } else {
      setItems((prev) => prev.filter((i) => i.id !== id));
      closeRecord();
      toast.error("Couldn't add the content.");
    }
  };

  const handleSave = async (id, patch) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const saved = await updateUgcItem(id, patch);
    if (saved) {
      setItems((prev) => prev.map((i) => (i.id === id ? saved : i)));
      toast.success("Content saved.");
    } else {
      toast.error("Couldn't save the content.");
      reload();
    }
  };

  const handleReplace = (item) => setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));

  const handleDelete = async (item) => {
    setDeleteTarget(null);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (item.id === recordId) closeRecord();
    const ok = await softDeleteUgcItem(item.id);
    if (ok) toast.success("Removed from the library.");
    else {
      toast.error("Couldn't remove the content.");
      reload();
    }
  };

  const deleteDialog = (
    <DeleteConfirmDialog
      target={deleteTarget}
      title="Remove content"
      name={deleteTarget?.title || "this content"}
      confirmLabel="Remove"
      description="The file stays in the asset library."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = items.find((i) => i.id === recordId);
  if (open) {
    return (
      <>
        <UgcEditor
          key={open.id}
          record={open}
          projectId={projectId}
          creators={creators}
          collabs={collabs}
          assets={assets}
          canManage={canManage}
          onBack={closeRecord}
          onSave={handleSave}
          onReplace={handleReplace}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = Boolean(query) || rights !== "all" || kind !== "all" || whitelist !== "all";

  const columns = [
    {
      key: "content",
      header: "Content",
      render: (i) => (
        <div className="flex min-w-0 items-center gap-3">
          <Thumb item={i} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{i.title || i.caption || "Untitled content"}</span>
            <span className="truncate text-xs text-text-secondary">
              {kindLabel(i.kind)} · {networkLabel(i.network)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "creator",
      header: "Author",
      className: "text-sm",
      render: (i) => byId.get(i.creatorId)?.name || (i.authorHandle ? `@${i.authorHandle}` : <span className="text-text-tertiary">—</span>),
    },
    { key: "rights", header: "Rights", render: (i) => <RightsCell item={i} /> },
    {
      key: "usage",
      header: "Usage",
      className: "text-sm text-text-secondary",
      render: (i) => (
        <div className="flex flex-col items-start gap-1">
          {i.whitelisting ? <Badge variant="purple">Whitelisting</Badge> : null}
          <span className="line-clamp-1">{i.usageChannels.length ? i.usageChannels.map((c) => USAGE_LABELS[c] || c).join(", ") : "—"}</span>
        </div>
      ),
    },
    { key: "added", header: "Added", className: "text-sm text-text-secondary whitespace-nowrap", render: (i) => formatDate(i.createdAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (i) => (
        <ActionMenu
          label={`Actions for ${i.title || "content"}`}
          items={[
            { label: "Open", icon: FileText, onSelect: () => openRecord(i.id) },
            i.sourceUrl && { label: "View original", icon: ExternalLink, href: i.sourceUrl },
            canManage && { separator: true },
            canManage && { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(i) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="UGC Library"
        description="Creator and customer content with usage rights, expiry and whitelisting tracked per item."
        actions={
          canManage ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add content
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={rights} onValueChange={setRights} options={RIGHTS_STATUS_OPTIONS} />
          <FilterDropdown value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
          <FilterDropdown value={whitelist} onValueChange={setWhitelist} options={WHITELIST_OPTIONS} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search content, captions, authors…" />
      </Toolbar>

      {loading ? (
        <LoadingPanel label="Loading content" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(i) => i.id}
            onRowClick={(i) => openRecord(i.id)}
            empty={
              <ListEmptyState
                icon={ImagePlus}
                filtersActive={filtersActive}
                title="No content yet"
                description="Save creator posts and customer content here, then request permission before you reuse them."
                onClear={() => {
                  setQuery("");
                  setRights("all");
                  setKind("all");
                  setWhitelist("all");
                }}
                action={
                  canManage ? (
                    <Button onClick={() => setAddOpen(true)}>
                      <Plus className="h-4 w-4" /> Add content
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="items" />
        </div>
      )}

      <AddUgcDialog open={addOpen} onOpenChange={setAddOpen} creators={creators} assets={assets} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default UgcLibraryScreen;
