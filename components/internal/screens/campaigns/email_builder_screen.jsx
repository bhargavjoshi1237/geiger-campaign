"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, LayoutTemplate, Loader2, Mail, Megaphone, Pencil, Plus, Save, Send } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorHeader } from "@/components/internal/shared/editor_shell";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
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
  InlineTitleInput,
  Input,
  LoadingArea,
  ScreenHeader,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { createCampaign, getCampaign, listCampaigns, updateCampaign } from "@/lib/supabase/campaigns";
import { createEmailTemplate, getEmailTemplate, listEmailTemplates, updateEmailTemplate } from "@/lib/supabase/email_templates";
import { getUser } from "@/lib/supabase/user";
import { normalizeAb } from "@/lib/campaigns/ab";
import { emptyDocument, normalizeDocument, renderEmailDocument } from "@/lib/email/blocks";
import { TEMPLATE_CATEGORIES } from "@/lib/email/starters";
import { EmailBuilder } from "./builder/email_builder";
import { MergeTextField } from "./builder/merge_tag_picker";
import { useBuilderResources } from "./builder/use_builder_resources";
import { SendTestDialog } from "./editor/send_test_dialog";
import { CAMPAIGN_STATUS_MAP, EDITABLE_STATUSES, OUTLINE_BUTTON, PREHEADER_LIMIT, SUBJECT_LIMIT, formatDate } from "./constants";

const CATEGORY_LABEL = Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c.value, c.label]));

// What's open: "<campaignId>", "<campaignId>~b" (A/B variant B content), "<templateId>" or "new".
function parseRecord(recordId) {
  const [id, variant] = String(recordId || "").split("~");
  return { id, variant: variant === "b" ? "b" : null };
}

function NameDialog({ open, onOpenChange, title, description, initialName, withCategory, confirmLabel, onConfirm }) {
  const [name, setName] = useState(initialName || "");
  const [category, setCategory] = useState("newsletter");
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initialName || "");
      setCategory("newsletter");
    }
  }
  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onConfirm({ name: name.trim(), category });
    setSaving(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="eb-name">
            <Input id="eb-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. October newsletter" autoFocus />
          </Field>
          {withCategory ? (
            <Field label="Category">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All emails" },
  { value: "campaign", label: "Draft campaigns" },
  { value: "template", label: "Templates" },
];

const SORT_OPTIONS = [
  { value: "edited", label: "Recently edited" },
  { value: "name", label: "Name A–Z" },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Draft email campaigns and saved templates as one list of rows the builder can open.
const toRows = (campaigns, templates) => [
  ...campaigns
    .filter((c) => c.channel === "email" && EDITABLE_STATUSES.has(c.status))
    .map((c) => ({ id: c.id, kind: "campaign", name: c.name, subject: c.subject, status: c.status, updatedAt: c.updatedAt })),
  ...templates.map((t) => ({ id: t.id, kind: "template", name: t.name, subject: t.subject, category: t.category, updatedAt: t.updatedAt })),
];

function BuilderHome({ projectId, onOpen, onStartBlank }) {
  const { openRecordInTab } = useWorkspaceUrl();
  const [data, setData] = useState({ loadedFor: null, rows: [], loadedAt: 0 });
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("edited");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listCampaigns(projectId), listEmailTemplates(projectId)]).then(([campaigns, templates]) => {
      if (!alive) return;
      if (campaigns === null || templates === null) toast.error("Couldn't load your emails.");
      setData({ loadedFor: projectId, rows: toRows(campaigns ?? [], templates ?? []), loadedAt: Date.now() });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = data.loadedFor !== projectId;
  const rows = data.rows;

  const stats = useMemo(() => {
    const drafts = rows.filter((r) => r.kind === "campaign");
    const recent = rows.filter((r) => data.loadedAt - (Date.parse(r.updatedAt) || 0) < WEEK_MS).length;
    return [
      { label: "Draft emails", value: loading ? "" : String(drafts.length), footer: "Campaigns not sent yet" },
      { label: "In review", value: loading ? "" : String(drafts.filter((r) => r.status === "in_review").length), footer: "Waiting for approval" },
      { label: "Templates", value: loading ? "" : String(rows.length - drafts.length), footer: "Reusable designs" },
      { label: "Edited this week", value: loading ? "" : String(recent), footer: "Drafts and templates" },
    ];
  }, [rows, loading, data.loadedAt]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => (type === "all" || r.kind === type) && (!q || `${r.name} ${r.subject || ""}`.toLowerCase().includes(q)));
    return list.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))));
  }, [rows, type, sort, query]);

  const pager = usePagination(filtered, { resetKey: `${type}|${sort}|${query}` });
  const filtersActive = query || type !== "all";
  const clearFilters = () => {
    setQuery("");
    setType("all");
  };

  const columns = [
    {
      key: "name",
      header: "Email",
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{r.name}</span>
          <span className={r.subject ? "truncate text-xs text-text-secondary" : "text-xs text-text-tertiary"}>{r.subject || "No subject yet"}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      className: "whitespace-nowrap",
      render: (r) => <Badge variant={r.kind === "campaign" ? "info" : "purple"}>{r.kind === "campaign" ? "Campaign" : "Template"}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (r) =>
        r.kind === "campaign" ? (
          <StatusPill status={r.status} map={CAMPAIGN_STATUS_MAP} />
        ) : (
          <span className="text-sm text-muted-foreground">{CATEGORY_LABEL[r.category] || r.category || "—"}</span>
        ),
    },
    { key: "edited", header: "Edited", className: "whitespace-nowrap text-muted-foreground", render: (r) => formatDate(r.updatedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <ActionMenu
          label={`Actions for ${r.name}`}
          items={[
            { label: "Open in builder", icon: Pencil, onSelect: () => onOpen(r.id) },
            r.kind === "campaign"
              ? { label: "Open campaign", icon: Megaphone, onSelect: () => openRecordInTab(r.id, "All Campaigns") }
              : { label: "Open template", icon: LayoutTemplate, onSelect: () => openRecordInTab(r.id, "Templates") },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Email Builder"
        description="Design emails block by block. Open a draft campaign or a template, or start from a blank email."
        actions={
          <Button onClick={onStartBlank}>
            <Plus className="h-4 w-4" /> Blank email
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={type} onValueChange={setType} options={TYPE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={sort} onValueChange={setSort} options={SORT_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search emails…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading emails" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(r) => r.id}
            onRowClick={(r) => onOpen(r.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Mail}
                  title={filtersActive ? "No matches" : "No emails to edit yet"}
                  description={
                    filtersActive
                      ? "Try a different search or filter."
                      : "Draft email campaigns and saved templates show up here. Start from a blank email to design one."
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                    ) : (
                      <Button onClick={onStartBlank}>
                        <Plus className="h-4 w-4" /> Blank email
                      </Button>
                    )
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="emails" />
        </div>
      )}
    </MainScreenWrapper>
  );
}

// Loads what `recordId` points at and edits its document.
function BuilderSession({ projectId, recordId }) {
  const { can } = useRbac();
  const { openRecord, openRecordInTab, closeRecord } = useWorkspaceUrl();
  const { id, variant } = parseRecord(recordId);
  const resources = useBuilderResources(projectId);
  const [target, setTarget] = useState(id === "new" ? { kind: "blank", record: null } : null);
  const [draft, setDraft] = useState(id === "new" ? { name: "Untitled email", subject: "", preheader: "", doc: emptyDocument() } : null);
  const [baseline, setBaseline] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getUser().then((u) => alive && setUserEmail(u?.email || ""));
    if (id === "new" || !projectId) return () => {
      alive = false;
    };
    (async () => {
      const campaign = await getCampaign(projectId, id);
      const template = campaign ? null : await getEmailTemplate(projectId, id);
      if (!alive) return;
      let next = null;
      if (campaign) {
        const ab = normalizeAb(campaign.ab);
        const variantDoc = ab.variants[1]?.content?.blocks ? ab.variants[1].content : campaign.content;
        next = {
          name: campaign.name,
          subject: campaign.subject,
          preheader: campaign.preheader,
          doc: normalizeDocument(variant ? variantDoc : campaign.content),
        };
        setTarget({ kind: "campaign", record: campaign });
      } else if (template) {
        next = { name: template.name, subject: template.subject, preheader: template.preheader, doc: normalizeDocument(template.content) };
        setTarget({ kind: "template", record: template });
      } else {
        setTarget({ kind: "missing", record: null });
      }
      setDraft(next);
      setBaseline(next);
    })();
    return () => {
      alive = false;
    };
  }, [projectId, id, variant]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  if (!target || (target.kind !== "missing" && !draft)) {
    return (
      <MainScreenWrapper>
        <LoadingArea size={88} label="Loading the email" />
      </MainScreenWrapper>
    );
  }

  if (target.kind === "missing") {
    return (
      <MainScreenWrapper>
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Mail}
            title="Email not found"
            description="It may have been deleted, or it belongs to another project."
            action={<Button variant="outline" className={OUTLINE_BUTTON} onClick={closeRecord}>Back to the builder</Button>}
          />
        </div>
      </MainScreenWrapper>
    );
  }

  const { kind, record } = target;
  const isCampaign = kind === "campaign";
  const readOnly = isCampaign ? !can("campaign.campaign.edit") || !EDITABLE_STATUSES.has(record.status) : !can("campaign.content.edit");
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const snapshot = () =>
    renderEmailDocument(draft.doc, { brand: resources.brand, preheader: draft.preheader, subject: draft.subject }).html;

  const save = async () => {
    setSaving(true);
    let ok = false;
    if (isCampaign) {
      const patch = variant
        ? { ab: { ...normalizeAb(record.ab), variants: normalizeAb(record.ab).variants.map((v, i) => (i === 1 ? { ...v, content: draft.doc } : v)) } }
        : { name: draft.name.trim() || "Untitled campaign", subject: draft.subject, preheader: draft.preheader, content: draft.doc };
      // Edits to reviewed content need a fresh review.
      if (record.status === "in_review" || record.status === "approved") patch.status = "draft";
      const updated = await updateCampaign(record.id, patch);
      if (updated) {
        ok = true;
        setTarget({ kind, record: updated });
        toast.success(patch.status ? "Saved. The campaign needs a new review." : "Email saved.");
      }
    } else if (kind === "template") {
      const updated = await updateEmailTemplate(record.id, {
        name: draft.name.trim() || "Untitled template",
        subject: draft.subject,
        preheader: draft.preheader,
        content: draft.doc,
        previewHtml: snapshot(),
      });
      if (updated) {
        ok = true;
        setTarget({ kind, record: updated });
        toast.success("Template saved.");
      }
    }
    setSaving(false);
    if (!ok) {
      toast.error("Couldn't save the email.");
      return false;
    }
    setBaseline(draft);
    return true;
  };

  const saveAsTemplate = async ({ name, category }) => {
    const user = await getUser();
    const created = await createEmailTemplate(projectId, {
      id: crypto.randomUUID(),
      name,
      category,
      subject: draft.subject,
      preheader: draft.preheader,
      content: draft.doc,
      previewHtml: snapshot(),
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't save the template.");
      return false;
    }
    toast.success(`Saved “${name}” to templates.`);
    return true;
  };

  const createFromDraft = async ({ name }) => {
    const user = await getUser();
    const created = await createCampaign(projectId, {
      id: crypto.randomUUID(),
      name,
      channel: "email",
      type: "regular",
      status: "draft",
      subject: draft.subject,
      preheader: draft.preheader,
      content: draft.doc,
      templateId: kind === "template" ? record.id : null,
      sendStrategy: { mode: "now" },
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't create the campaign.");
      return false;
    }
    toast.success(`Created “${name}”.`);
    if (kind === "blank") openRecord(created.id);
    else openRecordInTab(created.id, "All Campaigns");
    return true;
  };

  const back = () => {
    if (isCampaign) openRecordInTab(record.id, "All Campaigns");
    else if (kind === "template") openRecordInTab(record.id, "Templates");
    else closeRecord();
  };

  const kindBadge = { campaign: "Campaign", template: "Template", blank: "Unsaved email" }[kind];

  return (
    <MainScreenWrapper>
      <EditorHeader
        back={{ label: "Back", onClick: () => (dirty ? setLeaveOpen(true) : back()) }}
        title={
          variant ? (
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Variant B · {record.name}</h1>
          ) : (
            <InlineTitleInput
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              aria-label="Email name"
              placeholder="Untitled email"
              disabled={readOnly}
              className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
            />
          )
        }
        badges={
          <>
            <Badge variant="neutral">{kindBadge}</Badge>
            {isCampaign ? <StatusPill status={record.status} map={CAMPAIGN_STATUS_MAP} /> : null}
            {readOnly ? <span className="text-xs text-text-tertiary">{isCampaign && !EDITABLE_STATUSES.has(record.status) ? "Sent or scheduled campaigns can't be edited." : "Your role can view but not edit this."}</span> : null}
          </>
        }
        actions={
          <>
            {isCampaign && !variant && can("campaign.campaign.edit") ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setDialog("test")}>
                <Send className="h-4 w-4" /> Send test
              </Button>
            ) : null}
            {!variant && can("campaign.content.edit") && kind !== "template" ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setDialog("template")}>
                <FileText className="h-4 w-4" /> Save as template
              </Button>
            ) : null}
            {kind !== "campaign" && can("campaign.campaign.edit") ? (
              <Button variant={kind === "blank" ? "default" : "outline"} className={kind === "blank" ? undefined : OUTLINE_BUTTON} onClick={() => setDialog("campaign")}>
                <Megaphone className="h-4 w-4" /> {kind === "blank" ? "Create campaign" : "Use in campaign"}
              </Button>
            ) : null}
            {kind !== "blank" && !readOnly ? (
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            ) : null}
          </>
        }
      />

      {!variant ? (
        <div className="grid gap-4 md:grid-cols-2">
          <MergeTextField id="eb-subject" label="Subject" value={draft.subject} onChange={set("subject")} groups={resources.groups} limit={SUBJECT_LIMIT} disabled={readOnly} placeholder="e.g. {{first_name|Hi}}, here's what's new" />
          <MergeTextField id="eb-preheader" label="Preheader" value={draft.preheader} onChange={set("preheader")} groups={resources.groups} limit={PREHEADER_LIMIT} disabled={readOnly} placeholder="The line shown after the subject" />
        </div>
      ) : (
        <p className="text-sm text-text-secondary">Variant B&apos;s design for the A/B content test. Subject and audience come from the campaign.</p>
      )}

      <EmailBuilder
        projectId={projectId}
        doc={draft.doc}
        onChange={set("doc")}
        subject={draft.subject}
        preheader={draft.preheader}
        readOnly={readOnly}
        resources={resources}
      />

      <NameDialog
        open={dialog === "template"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Save as template"
        description="Saves this design, subject and preheader as a reusable template."
        initialName={draft.name}
        withCategory
        confirmLabel="Save template"
        onConfirm={saveAsTemplate}
      />
      <NameDialog
        open={dialog === "campaign"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={kind === "blank" ? "Create a campaign" : "Use in a new campaign"}
        description="Creates a draft email campaign with this design. You pick its audience next."
        initialName={draft.name}
        confirmLabel="Create campaign"
        onConfirm={createFromDraft}
      />
      {isCampaign ? (
        <SendTestDialog
          open={dialog === "test"}
          onOpenChange={(o) => !o && setDialog(null)}
          projectId={projectId}
          campaignId={record.id}
          defaultTo={userEmail}
          beforeSend={async () => (dirty ? save() : true)}
        />
      ) : null}

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>{kind === "blank" ? "This email hasn't been saved anywhere yet." : "Your edits to this email haven't been saved."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button
              variant="outline"
              className={OUTLINE_BUTTON}
              onClick={() => {
                setLeaveOpen(false);
                back();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export function EmailBuilderScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord } = useWorkspaceUrl();
  if (!recordId) return <BuilderHome projectId={projectId} onOpen={openRecord} onStartBlank={() => openRecord("new")} />;
  return <BuilderSession key={`${projectId}:${recordId}`} projectId={projectId} recordId={recordId} />;
}

export default EmailBuilderScreen;
