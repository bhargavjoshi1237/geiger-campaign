"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, ClipboardList, Copy, ExternalLink, FileSignature, FileText, Handshake, LayoutList, Plus, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { getUser } from "@/lib/supabase/user";
import {
  createCollaboration,
  listCollaborations,
  normalizeCollaboration,
  softDeleteCollaboration,
  updateCollaboration,
} from "@/lib/supabase/collaborations";
import { listAffiliateLinks } from "@/lib/supabase/affiliate_links";
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
  Textarea,
  Toolbar,
  cn,
} from "@geiger/ui";
import {
  COLLAB_STATUS_MAP,
  COLLAB_STATUS_OPTIONS,
  CONTRACT_STATUS_MAP,
  CONTRACT_STATUS_OPTIONS,
  CURRENCIES,
  DELIVERABLE_KINDS,
  DELIVERABLE_LABELS,
  DELIVERABLE_STATUSES,
  DELIVERABLE_STATUS_MAP,
  daysUntil,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  relativeDays,
} from "./constants";
import {
  CreatorCell,
  CreatorPicker,
  DeleteConfirmDialog,
  ListEmptyState,
  LoadingPanel,
  OUTLINE_BUTTON,
  ValueRow,
  useCanManageCreators,
  useCreatorDirectory,
} from "./creators_kit";

const COLLAB_NAV = [
  { key: "overview", label: "Overview", icon: LayoutList, desc: "Status, fee, dates and the creator's affiliate link." },
  { key: "brief", label: "Brief", icon: ClipboardList, desc: "What the creator should make and say." },
  { key: "deliverables", label: "Deliverables", icon: CalendarClock, desc: "What's due, when, and where it went live." },
  { key: "contract", label: "Contract", icon: FileSignature, desc: "Terms and signature status." },
];

const OPEN = new Set(["planned", "active", "in_review"]);

// Pending deliverables past their due date read as overdue.
function deliverableState(d) {
  if (d.status === "pending" && d.dueAt && daysUntil(d.dueAt) < 0) return "overdue";
  return d.status;
}

const nextDue = (c) =>
  c.deliverables
    .filter((d) => d.status === "pending" && d.dueAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] || null;

function DeliverableProgress({ deliverables }) {
  const total = deliverables.length;
  const live = deliverables.filter((d) => d.status === "live").length;
  if (!total) return <span className="text-text-tertiary">None yet</span>;
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="text-sm tabular-nums text-foreground">
        {live} of {total} live
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-surface-active">
        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((live / total) * 100)}%` }} />
      </span>
    </div>
  );
}

function DueCell({ deliverable }) {
  if (!deliverable) return <span className="text-text-tertiary">—</span>;
  const overdue = daysUntil(deliverable.dueAt) < 0;
  return (
    <div className="flex flex-col">
      <span className={cn("text-sm tabular-nums", overdue ? "text-red-600 dark:text-red-400" : "text-foreground")}>{formatDate(deliverable.dueAt)}</span>
      <span className="text-xs text-text-secondary">
        {DELIVERABLE_LABELS[deliverable.kind]} · {relativeDays(deliverable.dueAt)}
      </span>
    </div>
  );
}

function CreateCollaborationDialog({ open, onOpenChange, creators, onCreate }) {
  const blank = { creatorId: null, campaignName: "", fee: "", currency: "USD", startsOn: "", endsOn: "" };
  const [form, setForm] = useState(blank);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const valid = form.creatorId && form.campaignName.trim();
  const submit = () => {
    if (!valid) return;
    const creator = creators.find((c) => c.id === form.creatorId);
    onCreate({ ...form, campaignName: form.campaignName.trim(), fee: Number(form.fee) || 0, currency: creator?.rateCard?.currency && !form.fee ? creator.rateCard.currency : form.currency });
    setForm(blank);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New collaboration</DialogTitle>
          <DialogDescription>Track one creator&apos;s work on one campaign: brief, deliverables, contract and fee.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Creator" className="sm:col-span-2">
            <CreatorPicker creators={creators} value={form.creatorId} onChange={set("creatorId")} />
          </Field>
          <Field label="Campaign" htmlFor="nc-name" className="sm:col-span-2">
            <Input id="nc-name" value={form.campaignName} onChange={(e) => set("campaignName")(e.target.value)} placeholder="e.g. Kestrel Aero launch" />
          </Field>
          <Field label="Fee" htmlFor="nc-fee">
            <Input id="nc-fee" type="number" min="0" value={form.fee} onChange={(e) => set("fee")(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onValueChange={set("currency")}>
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
          <Field label="Starts" htmlFor="nc-start">
            <Input id="nc-start" type="date" value={form.startsOn} onChange={(e) => set("startsOn")(e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor="nc-end">
            <Input id="nc-end" type="date" value={form.endsOn} onChange={(e) => set("endsOn")(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Create collaboration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (c) => ({
  campaignName: c.campaignName,
  status: c.status,
  fee: c.fee,
  currency: c.currency,
  startsOn: c.startsOn || "",
  endsOn: c.endsOn || "",
  affiliateLinkId: c.affiliateLinkId,
  sendReminders: c.sendReminders,
  brief: { ...c.brief },
  deliverables: c.deliverables.map((d) => ({ ...d })),
  contract: { ...c.contract },
});

const BRIEF_FIELDS = [
  { key: "objective", label: "Objective", rows: 3, placeholder: "What should this content achieve?", wide: true },
  { key: "keyMessages", label: "Key messages", rows: 4, placeholder: "The points every post should land.", wide: true },
  { key: "dos", label: "Do", rows: 4, placeholder: "Show the bike outdoors, mention the 80 km range…" },
  { key: "donts", label: "Don't", rows: 4, placeholder: "No competitor brands in frame…" },
];

function CollaborationEditor({ record, creator, links, canManage, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setBrief = (key) => (e) => setDraft((d) => ({ ...d, brief: { ...d.brief, [key]: e.target.value } }));
  const setDeliverable = (i, patch) => setDraft((d) => ({ ...d, deliverables: d.deliverables.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const creatorLinks = links.filter((l) => l.creatorId === record.creatorId);
  const locked = !canManage;

  const setContractStatus = (status) =>
    setDraft((d) => {
      const now = new Date().toISOString();
      return {
        ...d,
        contract: {
          ...d.contract,
          status,
          sentAt: status === "draft" ? null : d.contract.sentAt || now,
          signedAt: status === "signed" ? d.contract.signedAt || now : null,
        },
      };
    });

  const save = () => {
    const patch = { ...draft, campaignName: draft.campaignName.trim() || "Untitled collaboration", fee: Number(draft.fee) || 0 };
    if (draft.status !== record.status) patch.completedAt = draft.status === "completed" ? new Date().toISOString() : null;
    onSave(record.id, patch);
  };

  const live = draft.deliverables.filter((d) => d.status === "live").length;

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.campaignName}
          onChange={(e) => set("campaignName")(e.target.value)}
          aria-label="Campaign name"
          placeholder="Untitled collaboration"
          disabled={locked}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={COLLAB_STATUS_MAP}
      badges={
        <>
          <StatusPill status={record.contract.status} map={CONTRACT_STATUS_MAP} />
          <span className="text-xs text-text-tertiary">
            {creator?.name || "Unknown creator"} · {formatMoney(record.fee, record.currency)}
          </span>
        </>
      }
      actions={
        canManage ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete collaboration"
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
      nav={COLLAB_NAV}
      defaultSection="overview"
    >
      {({ active }) => (
        <>
          {active === "overview" ? (
            <div className="space-y-6">
              <SectionCard bare title="Key details" description="The collaboration's status, fee, dates and the link that credits the creator.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Status" hint={record.payoutId ? "The fee is already on a payout." : "Completed collaborations with a fee are paid out from Payouts."}>
                    <Select value={draft.status} onValueChange={set("status")} disabled={locked || Boolean(record.payoutId)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(COLLAB_STATUS_MAP).map(([value, m]) => (
                          <SelectItem key={value} value={value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Affiliate link" hint="Orders through this link count toward the creator.">
                    <Select value={draft.affiliateLinkId || "none"} onValueChange={(v) => set("affiliateLinkId")(v === "none" ? null : v)} disabled={locked}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No link</SelectItem>
                        {creatorLinks.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Fee" htmlFor="co-fee">
                    <Input id="co-fee" type="number" min="0" value={draft.fee} onChange={(e) => set("fee")(e.target.value)} disabled={locked || Boolean(record.payoutId)} />
                  </Field>
                  <Field label="Currency">
                    <Select value={draft.currency} onValueChange={set("currency")} disabled={locked || Boolean(record.payoutId)}>
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
                  <Field label="Starts" htmlFor="co-start">
                    <Input id="co-start" type="date" value={draft.startsOn} onChange={(e) => set("startsOn")(e.target.value)} disabled={locked} />
                  </Field>
                  <Field label="Ends" htmlFor="co-end">
                    <Input id="co-end" type="date" value={draft.endsOn} onChange={(e) => set("endsOn")(e.target.value)} disabled={locked} />
                  </Field>
                </div>
                <SettingsList className="mt-5 border-t border-border pt-4">
                  <SettingRow
                    title="Email due-date reminders"
                    description="The creator gets a reminder two days before a pending deliverable is due, and one if it's overdue."
                    checked={draft.sendReminders}
                    onCheckedChange={locked ? undefined : set("sendReminders")}
                  />
                </SettingsList>
              </SectionCard>
              <SectionCard bare title="Summary" description="Where this collaboration stands right now.">
                <SettingsList>
                  <ValueRow title="Creator" value={creator?.name || "—"} />
                  <ValueRow title="Deliverables live" value={`${live} of ${draft.deliverables.length}`} />
                  <ValueRow title="Completed" value={formatDate(record.completedAt)} />
                  <ValueRow title="Payout" value={record.payoutId ? "On a payout" : record.status === "completed" && record.fee > 0 ? "Ready to pay out" : "—"} />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}

          {active === "brief" ? (
            <SectionCard bare title="Content brief" description="What the creator should make, and the tags, links and codes to include.">
              <div className="grid gap-4 sm:grid-cols-2">
                {BRIEF_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`cb-${f.key}`} className={f.wide ? "sm:col-span-2" : undefined}>
                    <Textarea id={`cb-${f.key}`} rows={f.rows} value={draft.brief[f.key]} onChange={setBrief(f.key)} disabled={locked} placeholder={f.placeholder} />
                  </Field>
                ))}
                <Field label="Hashtags" htmlFor="cb-hashtags">
                  <Input id="cb-hashtags" value={draft.brief.hashtags} onChange={setBrief("hashtags")} disabled={locked} placeholder="#KestrelAero #ad" />
                </Field>
                <Field label="Mentions" htmlFor="cb-mentions">
                  <Input id="cb-mentions" value={draft.brief.mentions} onChange={setBrief("mentions")} disabled={locked} placeholder="@kestrelbikes" />
                </Field>
                <Field label="Link to share" htmlFor="cb-link">
                  <Input id="cb-link" value={draft.brief.linkUrl} onChange={setBrief("linkUrl")} disabled={locked} placeholder="Affiliate or landing page URL" />
                </Field>
                <Field label="Discount code" htmlFor="cb-code">
                  <Input id="cb-code" value={draft.brief.discountCode} onChange={setBrief("discountCode")} disabled={locked} placeholder="LENA15" />
                </Field>
                <Field label="Usage rights" htmlFor="cb-rights" className="sm:col-span-2" hint="How you may reuse the content — track the actual grant in UGC Library.">
                  <Textarea id="cb-rights" rows={3} value={draft.brief.usageRights} onChange={setBrief("usageRights")} disabled={locked} placeholder="Organic reposts for 90 days, paid usage by separate agreement." />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "deliverables" ? (
            <SectionCard
              title="Content schedule"
              description={`${live} of ${draft.deliverables.length} live`}
              bodyPadding={false}
              action={
                canManage ? (
                  <Button
                    variant="outline"
                    className={OUTLINE_BUTTON}
                    onClick={() => setDraft((d) => ({ ...d, deliverables: [...d.deliverables, { id: crypto.randomUUID(), kind: "instagram_reel", dueAt: "", status: "pending", url: "", notes: "" }] }))}
                  >
                    <Plus className="h-4 w-4" /> Add deliverable
                  </Button>
                ) : null
              }
            >
              {draft.deliverables.length ? (
                <div className="divide-y divide-border">
                  {draft.deliverables.map((d, i) => {
                    const state = deliverableState(d);
                    return (
                      <div key={d.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_150px_150px_1.5fr_auto] lg:items-end">
                        <Field label="Deliverable">
                          <Select value={d.kind} onValueChange={(v) => setDeliverable(i, { kind: v })} disabled={locked}>
                            <SelectTrigger className="w-full">
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
                        </Field>
                        <Field label="Due" htmlFor={`dl-due-${d.id}`}>
                          <Input id={`dl-due-${d.id}`} type="date" value={d.dueAt ? d.dueAt.slice(0, 10) : ""} onChange={(e) => setDeliverable(i, { dueAt: e.target.value })} disabled={locked} />
                        </Field>
                        <Field label="Status">
                          <Select value={d.status} onValueChange={(v) => setDeliverable(i, { status: v })} disabled={locked}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DELIVERABLE_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {DELIVERABLE_STATUS_MAP[s].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Live URL" htmlFor={`dl-url-${d.id}`}>
                          <div className="flex gap-2">
                            <Input id={`dl-url-${d.id}`} value={d.url} onChange={(e) => setDeliverable(i, { url: e.target.value })} disabled={locked} placeholder="https://" />
                            {d.url ? (
                              <Button variant="ghost" size="icon" asChild aria-label="Open live post">
                                <a href={d.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : null}
                          </div>
                        </Field>
                        <div className="flex items-center gap-2 lg:pb-1.5">
                          {state === "overdue" ? <StatusPill status="overdue" map={DELIVERABLE_STATUS_MAP} /> : null}
                          {canManage ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remove deliverable"
                              className="text-text-secondary hover:text-red-600 dark:hover:text-red-400"
                              onClick={() => setDraft((x) => ({ ...x, deliverables: x.deliverables.filter((_, idx) => idx !== i) }))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-5 py-6 text-sm text-text-tertiary">No deliverables yet. Add each post, Reel or video with its due date to track it and send reminders.</p>
              )}
            </SectionCard>
          ) : null}

          {active === "contract" ? (
            <SectionCard bare title="Agreement terms" description="What the creator agreed to, and who signed it and when.">
              <Field label="Status" className="mb-4">
                <SegmentedTabs
                  value={draft.contract.status}
                  onChange={locked ? undefined : setContractStatus}
                  tabs={[
                    { value: "draft", label: "Draft" },
                    { value: "sent", label: "Sent" },
                    { value: "signed", label: "Signed" },
                  ]}
                  className="w-fit"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Terms" htmlFor="cc-terms" className="sm:col-span-2" hint="Scope, payment terms, exclusivity, usage and cancellation.">
                  <Textarea
                    id="cc-terms"
                    rows={10}
                    value={draft.contract.terms}
                    onChange={(e) => setDraft((d) => ({ ...d, contract: { ...d.contract, terms: e.target.value } }))}
                    disabled={locked}
                    placeholder="Creator will publish 1 Reel and 3 Stories between…"
                  />
                </Field>
                <Field label="Signed by" htmlFor="cc-signer">
                  <Input
                    id="cc-signer"
                    value={draft.contract.signedBy}
                    onChange={(e) => setDraft((d) => ({ ...d, contract: { ...d.contract, signedBy: e.target.value } }))}
                    disabled={locked || draft.contract.status !== "signed"}
                    placeholder="Name as signed"
                  />
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <ValueRow title="Sent" value={formatDateTime(draft.contract.sentAt)} />
                <ValueRow title="Signed" value={formatDateTime(draft.contract.signedAt)} />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function CollaborationsScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canManage = useCanManageCreators();
  const { creators, byId } = useCreatorDirectory(projectId);
  const [collabs, setCollabs] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [contract, setContract] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listCollaborations(projectId), listAffiliateLinks(projectId), getUser()]).then(([rows, linkRows, user]) => {
      if (!alive) return;
      setCollabs(rows ?? []);
      setLinks(linkRows ?? []);
      setUserId(user?.id || null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const reload = () => listCollaborations(projectId).then((rows) => rows && setCollabs(rows));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return collabs.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (contract !== "all" && c.contract.status !== contract) return false;
      if (q && !`${c.campaignName} ${byId.get(c.creatorId)?.name || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [collabs, query, status, contract, byId]);

  const stats = useMemo(() => {
    const open = collabs.filter((c) => OPEN.has(c.status));
    const pending = open.flatMap((c) => c.deliverables.filter((d) => d.status === "pending" && d.dueAt));
    const dueWeek = pending.filter((d) => {
      const n = daysUntil(d.dueAt);
      return n >= 0 && n <= 7;
    }).length;
    const overdue = pending.filter((d) => daysUntil(d.dueAt) < 0).length;
    const counts = {};
    for (const c of collabs) if (c.status !== "cancelled") counts[c.currency] = (counts[c.currency] || 0) + 1;
    const currency = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "USD";
    const fees = collabs.filter((c) => c.status !== "cancelled" && c.currency === currency).reduce((s, c) => s + c.fee, 0);
    return [
      { label: "Open collaborations", value: formatNumber(open.length), footer: `${collabs.filter((c) => c.status === "completed").length} completed` },
      { label: "Due this week", value: formatNumber(dueWeek), footer: "Pending deliverables" },
      { label: "Overdue", value: formatNumber(overdue), footer: overdue ? "Reminders go out automatically" : "Nothing late" },
      { label: "Committed fees", value: formatMoney(fees, currency), footer: Object.keys(counts).length > 1 ? `${currency} only · ${Object.keys(counts).length} currencies` : "Excludes cancelled" },
    ];
  }, [collabs]);

  const pager = usePagination(filtered, { resetKey: `${query}|${status}|${contract}` });

  const handleCreate = async (input, from = null) => {
    const id = crypto.randomUUID();
    const base = from
      ? { ...from, id, status: "planned", campaignName: `${from.campaignName} (copy)`, contract: { terms: from.contract.terms, status: "draft" }, deliverables: from.deliverables.map((d) => ({ ...d, id: crypto.randomUUID(), status: "pending", url: "" })), payoutId: null, completedAt: null }
      : { ...input, id, status: "planned", brief: {}, deliverables: [], contract: { status: "draft" }, sendReminders: true };
    const optimistic = normalizeCollaboration({
      id,
      project_id: projectId,
      creator_id: base.creatorId,
      campaign_name: base.campaignName,
      status: "planned",
      brief: base.brief,
      deliverables: base.deliverables.map((d) => ({ ...d, due_at: d.dueAt })),
      contract: { terms: base.contract.terms || "", status: "draft" },
      fee: base.fee,
      currency: base.currency,
      starts_on: base.startsOn || null,
      ends_on: base.endsOn || null,
      created_at: new Date().toISOString(),
    });
    setCollabs((prev) => [optimistic, ...prev]);
    if (!from) openRecord(id);
    const saved = await createCollaboration(projectId, {
      id,
      creatorId: base.creatorId,
      campaignName: base.campaignName,
      status: "planned",
      brief: base.brief,
      deliverables: base.deliverables,
      contract: base.contract,
      fee: base.fee,
      currency: base.currency,
      startsOn: base.startsOn,
      endsOn: base.endsOn,
      affiliateLinkId: base.affiliateLinkId || null,
      sendReminders: base.sendReminders !== false,
      createdBy: userId,
    });
    if (saved) {
      setCollabs((prev) => prev.map((c) => (c.id === id ? saved : c)));
      toast.success(from ? `Duplicated "${from.campaignName}".` : `Created "${saved.campaignName}".`);
    } else {
      setCollabs((prev) => prev.filter((c) => c.id !== id));
      closeRecord();
      toast.error("Couldn't create the collaboration.");
    }
  };

  const handleSave = async (id, patch) => {
    setCollabs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const saved = await updateCollaboration(id, patch);
    if (saved) {
      setCollabs((prev) => prev.map((c) => (c.id === id ? saved : c)));
      toast.success("Collaboration saved.");
    } else {
      toast.error("Couldn't save the collaboration.");
      reload();
    }
  };

  const handleDelete = async (collab) => {
    setDeleteTarget(null);
    setCollabs((prev) => prev.filter((c) => c.id !== collab.id));
    if (collab.id === recordId) closeRecord();
    const ok = await softDeleteCollaboration(collab.id);
    if (ok) toast.success(`Deleted "${collab.campaignName}".`);
    else {
      toast.error("Couldn't delete the collaboration.");
      reload();
    }
  };

  const deleteDialog = (
    <DeleteConfirmDialog
      target={deleteTarget}
      title="Delete collaboration"
      name={deleteTarget?.campaignName}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = collabs.find((c) => c.id === recordId);
  if (open) {
    return (
      <>
        <CollaborationEditor
          key={open.id}
          record={open}
          creator={byId.get(open.creatorId)}
          links={links}
          canManage={canManage}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = Boolean(query) || status !== "all" || contract !== "all";

  const columns = [
    {
      key: "collab",
      header: "Collaboration",
      render: (c) => <CreatorCell creator={byId.get(c.creatorId)} meta={`${c.campaignName}`} />,
    },
    { key: "status", header: "Status", render: (c) => <StatusPill status={c.status} map={COLLAB_STATUS_MAP} /> },
    { key: "deliverables", header: "Deliverables", render: (c) => <DeliverableProgress deliverables={c.deliverables} /> },
    { key: "due", header: "Next due", render: (c) => (OPEN.has(c.status) ? <DueCell deliverable={nextDue(c)} /> : <span className="text-text-tertiary">—</span>) },
    { key: "contract", header: "Contract", render: (c) => <StatusPill status={c.contract.status} map={CONTRACT_STATUS_MAP} /> },
    { key: "fee", header: "Fee", align: "right", className: "tabular-nums font-medium text-foreground", render: (c) => formatMoney(c.fee, c.currency) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.campaignName}`}
          items={[
            { label: "Open", icon: FileText, onSelect: () => openRecord(c.id) },
            canManage && { label: "Duplicate", icon: Copy, onSelect: () => handleCreate(null, c) },
            canManage && { separator: true },
            canManage && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Collaborations"
        description="Briefs, deliverables with due dates, contracts and fees for every creator partnership."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)} disabled={!creators.length}>
              <Plus className="h-4 w-4" /> New collaboration
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={COLLAB_STATUS_OPTIONS} />
          <FilterDropdown value={contract} onValueChange={setContract} options={CONTRACT_STATUS_OPTIONS} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search campaigns or creators…" />
      </Toolbar>

      {loading ? (
        <LoadingPanel label="Loading collaborations" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecord(c.id)}
            empty={
              <ListEmptyState
                icon={Handshake}
                filtersActive={filtersActive}
                title="No collaborations yet"
                description={creators.length ? "Start one to brief a creator, track their deliverables and record the fee." : "Add creators in Creator Discovery, then start a collaboration here."}
                onClear={() => {
                  setQuery("");
                  setStatus("all");
                  setContract("all");
                }}
                action={
                  canManage && creators.length ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> New collaboration
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="collaborations" />
        </div>
      )}

      <CreateCollaborationDialog open={createOpen} onOpenChange={setCreateOpen} creators={creators} onCreate={(input) => handleCreate(input)} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CollaborationsScreen;
