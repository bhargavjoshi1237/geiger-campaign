"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Mail, Megaphone, Pause, Pencil, Play, Plus, Trash2, Undo2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { CampaignEditor } from "@/components/internal/screens/campaigns/campaign_editor";
import {
  CAMPAIGN_STATUS_MAP,
  CHANNEL_FILTER_OPTIONS,
  CHANNEL_MAP,
  CREATABLE_TYPES,
  DESTRUCTIVE_BUTTON,
  OUTLINE_BUTTON,
  STATUS_FILTER_OPTIONS,
  TYPE_FILTER_OPTIONS,
  TYPE_MAP,
  campaignDate,
  campaignRates,
  formatDate,
  formatNumber,
  formatRate,
  rate,
} from "@/components/internal/screens/campaigns/constants";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { campaignCopyInput, createCampaign, listCampaigns, softDeleteCampaign, updateCampaign } from "@/lib/supabase/campaigns";
import { listEmailTemplates, markEmailTemplateUsed } from "@/lib/supabase/email_templates";
import { getUser } from "@/lib/supabase/user";
import { cancelCampaign, sendCampaign } from "@/lib/campaigns/api";
import { defaultAb } from "@/lib/campaigns/ab";
import { emptyDocument } from "@/lib/email/blocks";
import { EMAIL_STARTERS } from "@/lib/email/starters";
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
  EmptyState,
  Field,
  Input,
  LoadingArea,
  Progress,
  ScreenHeader,
  SearchInput,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@geiger/ui";

const BLANK = "blank";
const EMPTY_FORM = { name: "", type: "regular", channel: "email", start: BLANK };

// The starting document (and inbox copy) for a new campaign.
export function startingContent(start, templates) {
  if (!start || start === BLANK) return { content: emptyDocument() };
  const [kind, id] = start.split(":");
  if (kind === "starter") {
    const s = EMAIL_STARTERS.find((x) => x.key === id);
    return s ? { content: s.doc(), subject: s.subject, preheader: s.preheader } : { content: emptyDocument() };
  }
  const t = templates.find((x) => x.id === id);
  return t ? { content: t.content, subject: t.subject, preheader: t.preheader, templateId: t.id, template: t } : { content: emptyDocument() };
}

export function StartFromSelect({ value, onChange, templates, id }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={BLANK}>Blank email</SelectItem>
        {templates.length ? (
          <SelectGroup>
            <SelectLabel>Saved templates</SelectLabel>
            {templates.map((t) => (
              <SelectItem key={t.id} value={`saved:${t.id}`}>
                {t.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        <SelectGroup>
          <SelectLabel>Starter layouts</SelectLabel>
          {EMAIL_STARTERS.map((s) => (
            <SelectItem key={s.key} value={`starter:${s.key}`}>
              {s.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function CreateCampaignDialog({ open, onOpenChange, onCreate, templates }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Give the campaign a name first.");
      return;
    }
    setSaving(true);
    const ok = await onCreate(form);
    setSaving(false);
    if (ok) {
      setForm(EMPTY_FORM);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>Set up the basics. You choose the audience and design the content next.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Campaign name" htmlFor="cmp-name">
            <Input
              id="cmp-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. November newsletter"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Channel">
              <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v, type: v === "email" ? f.type : "regular" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_MAP).map(([value, m]) => (
                    <SelectItem key={value} value={value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")} disabled={form.channel !== "email"}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_MAP[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {form.channel === "email" ? (
            <Field label="Start from" htmlFor="cmp-start">
              <StartFromSelect id="cmp-start" value={form.start} onChange={set("start")} templates={templates} />
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AllCampaignsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [campaigns, setCampaigns] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const loading = loadedFor !== projectId;

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listCampaigns(projectId), listEmailTemplates(projectId)]).then(([rows, tpls]) => {
      if (!alive) return;
      if (rows === null) toast.error("Couldn't load campaigns.");
      setCampaigns(rows ?? []);
      setTemplates(tpls ?? []);
      setLoadedFor(projectId);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const canEdit = can("campaign.campaign.edit");
  const canSend = can("campaign.campaign.send");
  const canDelete = can("campaign.campaign.delete");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (channelFilter !== "all" && c.channel !== channelFilter) return false;
      if (q && !`${c.name} ${c.subject} ${c.description || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [campaigns, query, statusFilter, typeFilter, channelFilter]);

  const stats = useMemo(() => {
    const sent = campaigns.filter((c) => c.status === "sent" || c.status === "sending");
    const totals = sent.reduce(
      (t, c) => {
        const m = c.metrics || {};
        const base = Number(m.delivered) || Number(m.recipients) || 0;
        return { base: t.base + base, opens: t.opens + (Number(m.opens) || 0), clicks: t.clicks + (Number(m.clicks) || 0) };
      },
      { base: 0, opens: 0, clicks: 0 },
    );
    return [
      { label: "Sent", value: formatNumber(campaigns.filter((c) => c.status === "sent").length) },
      { label: "Scheduled", value: formatNumber(campaigns.filter((c) => c.status === "scheduled").length) },
      { label: "Avg. open rate", value: formatRate(rate(totals.opens, totals.base)) },
      { label: "Avg. click rate", value: formatRate(rate(totals.clicks, totals.base)) },
    ];
  }, [campaigns]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${typeFilter}|${channelFilter}` });

  const replace = (updated) => setCampaigns((p) => p.map((c) => (c.id === updated.id ? updated : c)));

  // The sender most recently used, so new campaigns start with it.
  const lastSender = () => campaigns.find((c) => c.fromEmail) || {};

  const handleCreate = async (form) => {
    const user = await getUser();
    const start = form.channel === "email" ? startingContent(form.start, templates) : { content: { body: "" } };
    const sender = lastSender();
    const input = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      channel: form.channel,
      type: form.type,
      status: "draft",
      subject: start.subject || "",
      preheader: start.preheader || "",
      fromName: sender.fromName || "",
      fromEmail: sender.fromEmail || "",
      replyTo: sender.replyTo || "",
      content: start.content,
      templateId: start.templateId || null,
      audience: {},
      sendStrategy: { mode: "now" },
      ab: form.type === "ab_test" ? { ...defaultAb(), enabled: true } : {},
      createdBy: user?.id ?? null,
    };
    const created = await createCampaign(projectId, input);
    if (!created) {
      toast.error("Couldn't create the campaign.");
      return false;
    }
    if (start.template) markEmailTemplateUsed(start.template);
    setCampaigns((p) => [created, ...p]);
    openRecord(created.id);
    return true;
  };

  const handleDuplicate = async (c) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const input = { ...campaignCopyInput(c), id, createdBy: user?.id ?? null };
    setCampaigns((p) => [{ ...c, ...input, metrics: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...p]);
    const created = await createCampaign(projectId, input);
    if (!created) {
      setCampaigns((p) => p.filter((x) => x.id !== id));
      toast.error("Couldn't duplicate the campaign.");
      return;
    }
    replace(created);
    toast.success("Duplicated as a draft.");
    if (recordId) openRecord(created.id);
  };

  const handleCancel = async (c) => {
    const res = await cancelCampaign(projectId, c.id);
    if (!res.ok) {
      toast.error(res.error || "Couldn't cancel the send.");
      return;
    }
    replace({ ...c, status: res.data?.status || "draft", scheduledAt: null });
    toast.success(`Cancelled “${c.name}”.`);
  };

  const handlePause = async (c) => {
    replace({ ...c, status: "paused" });
    const updated = await updateCampaign(c.id, { status: "paused" });
    if (!updated) {
      replace(c);
      toast.error("Couldn't pause the campaign.");
      return;
    }
    replace(updated);
    toast.success(`Paused “${c.name}”.`);
  };

  const handleResume = async (c) => {
    const res = await sendCampaign(projectId, c.id, { mode: "now", strategy: { mode: "now" } });
    if (!res.ok) {
      toast.error(res.error || "Couldn't resume the campaign.");
      return;
    }
    replace({ ...c, status: res.data?.status || "sending" });
    toast.success(`Resumed “${c.name}”.`);
  };

  const handleDelete = async (c) => {
    setDeleting(true);
    const ok = await softDeleteCampaign(c.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error("Couldn't delete the campaign.");
      return;
    }
    setCampaigns((p) => p.filter((x) => x.id !== c.id));
    if (c.id === recordId) closeRecord();
    toast.success(`Deleted “${c.name}”.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete campaign</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? It disappears from lists and the calendar; its send log stays for reporting.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DESTRUCTIVE_BUTTON} disabled={deleting} onClick={() => handleDelete(deleteTarget)}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (recordId && loading) {
    return (
      <MainScreenWrapper>
        <LoadingArea size={88} label="Loading campaign" />
      </MainScreenWrapper>
    );
  }

  const open = campaigns.find((c) => c.id === recordId);
  if (open) {
    return (
      <>
        <CampaignEditor key={open.id} campaign={open} projectId={projectId} onBack={closeRecord} onSaved={replace} onDelete={setDeleteTarget} onDuplicate={handleDuplicate} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || typeFilter !== "all" || channelFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setChannelFilter("all");
  };

  const columns = [
    {
      key: "campaign",
      header: "Campaign",
      render: (c) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-foreground">{c.name}</span>
          <span className="line-clamp-1 text-xs text-text-secondary">{c.subject || c.description || "No subject yet"}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", className: "whitespace-nowrap text-muted-foreground", render: (c) => TYPE_MAP[c.type]?.label || c.type },
    {
      key: "channel",
      header: "Channel",
      render: (c) => {
        const meta = CHANNEL_MAP[c.channel];
        const Icon = meta?.icon || Mail;
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {meta?.label || c.channel}
          </span>
        );
      },
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (c) => <StatusPill status={c.status} map={CAMPAIGN_STATUS_MAP} /> },
    {
      key: "recipients",
      header: "Recipients",
      align: "right",
      className: "tabular-nums text-muted-foreground",
      render: (c) => (campaignRates(c.metrics).recipients ? formatNumber(campaignRates(c.metrics).recipients) : "—"),
    },
    {
      key: "openRate",
      header: "Open rate",
      render: (c) => {
        const r = campaignRates(c.metrics).openRate;
        return r == null ? (
          <span className="text-text-secondary">—</span>
        ) : (
          <div className="w-[120px] space-y-1.5">
            <Progress value={Math.round(r * 100)} className="h-1.5" />
            <p className="text-xs tabular-nums text-text-secondary">{formatRate(r)}</p>
          </div>
        );
      },
    },
    { key: "clickRate", header: "Click rate", align: "right", className: "tabular-nums text-muted-foreground", render: (c) => formatRate(campaignRates(c.metrics).clickRate) },
    { key: "date", header: "Date", className: "whitespace-nowrap text-muted-foreground", render: (c) => formatDate(campaignDate(c)) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: "Open", icon: Pencil, onSelect: () => openRecord(c.id) },
            canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(c) },
            canSend && c.status === "scheduled" && { label: "Cancel schedule", icon: Undo2, onSelect: () => handleCancel(c) },
            canSend && c.status === "sending" && { label: "Pause", icon: Pause, onSelect: () => handlePause(c) },
            canSend && c.status === "paused" && { label: "Resume", icon: Play, onSelect: () => handleResume(c) },
            { separator: true },
            canDelete && c.status !== "sending" && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="All Campaigns"
        description="Every email, SMS and push campaign in this project, from draft to report."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create campaign
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={channelFilter} onValueChange={setChannelFilter} options={CHANNEL_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search campaigns…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading campaigns" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecord(c.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Megaphone}
                  title={filtersActive ? "No matches" : "No campaigns yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a campaign to reach your audience by email, SMS or push."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> Create campaign
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="campaigns" />
        </div>
      )}

      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} templates={templates} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default AllCampaignsScreen;
