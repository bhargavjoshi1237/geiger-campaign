"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Copy, Eye, FileText, Inbox, LayoutTemplate, Loader2, Megaphone, Pencil, PencilRuler, Plus, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  createEmailTemplate,
  listEmailTemplates,
  markEmailTemplateUsed,
  softDeleteEmailTemplate,
  updateEmailTemplate,
} from "@/lib/supabase/email_templates";
import { createCampaign } from "@/lib/supabase/campaigns";
import { getUser } from "@/lib/supabase/user";
import { getBrandKit } from "@/lib/supabase/brand_kits";
import { documentIsEmpty, emptyDocument, renderEmailDocument } from "@/lib/email/blocks";
import { EMAIL_STARTERS, TEMPLATE_CATEGORIES, getStarter } from "@/lib/email/starters";
import { DEVICE_TABS, EmailPreviewFrame, EmailThumbnail } from "./builder/email_preview";
import { DESTRUCTIVE_BUTTON, OUTLINE_BUTTON, PREHEADER_LIMIT, SUBJECT_LIMIT, formatDate, formatDateTime, formatNumber } from "./constants";
import {
  ActionMenu,
  Badge,
  Button,
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
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Toolbar,
} from "@geiger/ui";

const CATEGORY_LABEL = Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c.value, c.label]));
const CATEGORY_FILTER_OPTIONS = [{ value: "all", label: "All categories" }, ...TEMPLATE_CATEGORIES];
const VIEW_OPTIONS = [
  { value: "saved", label: "Saved" },
  { value: "starter", label: "Starter layouts" },
];

const TEMPLATE_NAV = [
  { key: "design", label: "Design", icon: PencilRuler, desc: "The email itself. Open the builder to change it." },
  { key: "details", label: "Details", icon: Inbox, desc: "Name, category and the inbox copy campaigns start with." },
  { key: "usage", label: "Usage", icon: BarChart3, desc: "How often campaigns have started from this template." },
];

const renderHtml = (content, t, brand) => renderEmailDocument(content, { brand, subject: t?.subject, preheader: t?.preheader, placeholders: true }).html;

function PreviewDialog({ item, brand, onOpenChange, onUse }) {
  const [device, setDevice] = useState("desktop");
  const html = useMemo(() => (item ? renderHtml(item.content, item, brand) : ""), [item, brand]);
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item?.name}</DialogTitle>
          <DialogDescription>{item?.subject || item?.description || "Preview with no contact data; merge tags show their fallbacks."}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <SegmentedTabs tabs={DEVICE_TABS} value={device} onChange={setDevice} buttonClassName="px-2" className="w-auto" />
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-surface-card p-3">
          <EmailPreviewFrame html={html} device={device} className="border-0" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {onUse ? (
            <Button onClick={() => onUse(item)}>
              <Megaphone className="h-4 w-4" /> Use in campaign
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTemplateDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", category: "newsletter", start: "blank" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const ok = await onCreate(form);
    setSaving(false);
    if (ok) {
      setForm({ name: "", category: "newsletter", start: "blank" });
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>Start blank or from a starter layout, then design it in the builder.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Template name" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. Monthly newsletter" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start from">
              <Select value={form.start} onValueChange={(v) => setForm((f) => ({ ...f, start: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank</SelectItem>
                  {EMAIL_STARTERS.map((s) => <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create and design
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (t) => ({ name: t.name, category: t.category, subject: t.subject, preheader: t.preheader });

function TemplateEditor({ record, brand, canEdit, onBack, onSave, onDelete, onUse, onOpenBuilder }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const html = useMemo(() => renderHtml(record.content, { ...record, ...draft }, brand), [record, draft, brand]);

  const save = async () => {
    setSaving(true);
    const ok = await onSave(record, {
      name: draft.name.trim() || "Untitled template",
      category: draft.category,
      subject: draft.subject,
      preheader: draft.preheader,
      previewHtml: renderEmailDocument(record.content, { brand, subject: draft.subject, preheader: draft.preheader }).html,
    });
    setSaving(false);
    if (ok) setDraft((d) => ({ ...d, name: d.name.trim() || "Untitled template" }));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput value={draft.name} onChange={(e) => set("name")(e.target.value)} aria-label="Template name" placeholder="Untitled template" disabled={!canEdit} className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl" />
      }
      badges={
        <>
          <Badge variant="neutral">{CATEGORY_LABEL[draft.category] || draft.category}</Badge>
          <span className="text-xs text-text-tertiary">Edited {formatDate(record.updatedAt)}</span>
        </>
      }
      actions={
        <>
          {canEdit ? (
            <Button variant="ghost" size="icon" aria-label="Delete template" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onUse(record)}>
            <Megaphone className="h-4 w-4" /> Use in campaign
          </Button>
          {canEdit ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
        </>
      }
      nav={TEMPLATE_NAV}
      defaultSection="design"
    >
      {({ active }) => (
        <>
          {active === "design" ? (
            <SectionCard
              action={
                <Button onClick={onOpenBuilder}>
                  <PencilRuler className="h-4 w-4" /> {canEdit ? "Open builder" : "View in builder"}
                </Button>
              }
              title="Email design"
            >
              {documentIsEmpty(record.content) ? (
                <EmptyState icon={LayoutTemplate} title="No design yet" description="Open the builder to add blocks." />
              ) : (
                <div className="max-h-[560px] overflow-auto rounded-lg border border-border bg-surface-card p-3">
                  <EmailPreviewFrame html={html} width={640} minHeight={360} className="border-0" />
                </div>
              )}
            </SectionCard>
          ) : null}

          {active === "details" ? (
            <SectionCard bare title="Template details" description="The name, category and inbox copy new campaigns start with.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Template name" htmlFor="te-name">
                  <Input id="te-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Category">
                  <Select value={draft.category} onValueChange={set("category")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Subject line" htmlFor="te-subject" hint={`Campaigns from this template start with it. ${draft.subject.length}/${SUBJECT_LIMIT}`} className="sm:col-span-2">
                  <Input id="te-subject" value={draft.subject} onChange={(e) => set("subject")(e.target.value)} placeholder="e.g. This month at {{company|our studio}}" disabled={!canEdit} />
                </Field>
                <Field label="Preheader" htmlFor="te-preheader" hint={`Shown after the subject in most inboxes. ${draft.preheader.length}/${PREHEADER_LIMIT}`} className="sm:col-span-2">
                  <Input id="te-preheader" value={draft.preheader} onChange={(e) => set("preheader")(e.target.value)} disabled={!canEdit} />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "usage" ? (
            <SectionCard bare title="Usage history" description="How often and how recently campaigns have started from this template.">
              <SettingsList>
                <SettingRow title="Campaigns started from it" description="Counted each time a campaign is created from this template." control={<span className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(record.usageCount)}</span>} />
                <SettingRow title="Last used" description="The most recent campaign created from it." control={<span className="text-sm text-muted-foreground">{formatDateTime(record.lastUsedAt)}</span>} />
                <SettingRow title="Created" description="When the template was saved." control={<span className="text-sm text-muted-foreground">{formatDateTime(record.createdAt)}</span>} />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

function TemplateCard({ name, meta, html, onOpen, actions, footer }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onOpen();
      }}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-surface-subtle transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div className="relative border-b border-border">
        <EmailThumbnail html={html} />
        {actions ? <div className="absolute right-2 top-2 rounded-md bg-surface-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{actions}</div> : null}
      </div>
      <div className="p-4">
        <h3 className="truncate font-medium text-foreground">{name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">{meta}</div>
        {footer ? <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function TemplatesScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();
  const [templates, setTemplates] = useState([]);
  const [brand, setBrand] = useState(null);
  const [loadedFor, setLoadedFor] = useState(null);
  const [tab, setTab] = useState("saved");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  const loading = loadedFor !== projectId;
  const canEdit = can("campaign.content.edit");
  const canCreateCampaign = can("campaign.campaign.edit");

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listEmailTemplates(projectId), getBrandKit(projectId)]).then(([rows, kit]) => {
      if (!alive) return;
      if (rows === null) toast.error("Couldn't load templates.");
      setTemplates(rows ?? []);
      setBrand(kit);
      setLoadedFor(projectId);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const starters = useMemo(() => EMAIL_STARTERS.map((s) => ({ ...s, id: s.key, content: s.doc() })), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = tab === "saved" ? templates : starters;
    return source.filter((t) => (category === "all" || t.category === category) && (!q || `${t.name} ${t.subject || ""} ${t.description || ""}`.toLowerCase().includes(q)));
  }, [templates, starters, tab, query, category]);

  const replace = (updated) => setTemplates((p) => p.map((t) => (t.id === updated.id ? updated : t)));

  const createTemplate = async ({ name, category: cat, start, content, subject, preheader, openBuilder = true }) => {
    const user = await getUser();
    const starter = start && start !== "blank" ? getStarter(start) : null;
    const doc = content || (starter ? starter.doc() : emptyDocument());
    const created = await createEmailTemplate(projectId, {
      id: crypto.randomUUID(),
      name,
      category: cat,
      subject: subject ?? starter?.subject ?? "",
      preheader: preheader ?? starter?.preheader ?? "",
      content: doc,
      starterKey: starter?.key ?? null,
      previewHtml: renderEmailDocument(doc, { brand }).html,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't create the template.");
      return null;
    }
    setTemplates((p) => [created, ...p]);
    if (openBuilder) openRecordInTab(created.id, "Email Builder");
    return created;
  };

  const handleUse = async (t) => {
    const user = await getUser();
    const created = await createCampaign(projectId, {
      id: crypto.randomUUID(),
      name: t.name,
      channel: "email",
      type: "regular",
      status: "draft",
      subject: t.subject || "",
      preheader: t.preheader || "",
      content: t.content || emptyDocument(),
      templateId: t.isStarter === undefined ? null : t.id,
      sendStrategy: { mode: "now" },
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't create the campaign.");
      return;
    }
    if (t.isStarter !== undefined) {
      const updated = await markEmailTemplateUsed(t);
      if (updated) replace(updated);
    }
    toast.success(`Created a draft campaign from “${t.name}”.`);
    openRecordInTab(created.id, "All Campaigns");
  };

  const handleDuplicate = async (t) => {
    const copy = await createTemplate({ name: `${t.name} (copy)`, category: t.category, content: t.content, subject: t.subject, preheader: t.preheader, openBuilder: false });
    if (copy) toast.success("Template duplicated.");
  };

  const handleSaveStarter = async (s) => {
    const copy = await createTemplate({ name: s.name, category: s.category, start: s.key, openBuilder: false });
    if (copy) {
      toast.success(`Saved “${s.name}” to your templates.`);
      setTab("saved");
    }
  };

  const handleSave = async (record, patch) => {
    const updated = await updateEmailTemplate(record.id, patch);
    if (!updated) {
      toast.error("Couldn't save the template.");
      return false;
    }
    replace(updated);
    toast.success("Template saved.");
    return true;
  };

  const handleDelete = async (t) => {
    setDeleteTarget(null);
    setTemplates((p) => p.filter((x) => x.id !== t.id));
    if (t.id === recordId) closeRecord();
    const ok = await softDeleteEmailTemplate(t.id);
    if (!ok) {
      setTemplates((p) => [t, ...p]);
      toast.error("Couldn't delete the template.");
      return;
    }
    toast.success(`Deleted “${t.name}”.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete template</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Campaigns created from it keep their own copy of the design.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DESTRUCTIVE_BUTTON} onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (recordId && loading) {
    return (
      <MainScreenWrapper>
        <LoadingArea size={88} label="Loading template" />
      </MainScreenWrapper>
    );
  }

  const open = templates.find((t) => t.id === recordId);
  if (open) {
    return (
      <>
        <TemplateEditor
          key={open.id}
          record={open}
          brand={brand}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onUse={handleUse}
          onOpenBuilder={() => openRecordInTab(open.id, "Email Builder")}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || category !== "all";
  const thumb = (t) => t.previewHtml || renderHtml(t.content, t, brand);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Templates"
        description="Saved email designs your team starts campaigns from, plus starter layouts."
        actions={canEdit ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New template</Button> : null}
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={tab} onValueChange={setTab} options={VIEW_OPTIONS} height="h-9" />
          <FilterDropdown value={category} onValueChange={setCategory} options={CATEGORY_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading templates" panel />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={FileText}
            title={filtersActive ? "No templates found" : "No saved templates yet"}
            description={filtersActive ? "No templates match your filters." : "Save a design from the builder, or start from a starter layout."}
            action={
              filtersActive ? (
                <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => { setQuery(""); setCategory("all"); }}>
                  Clear filters
                </Button>
              ) : canEdit ? (
                <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New template</Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tab === "saved"
            ? filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  name={t.name}
                  html={thumb(t)}
                  onOpen={() => openRecord(t.id)}
                  meta={
                    <>
                      <Badge variant="neutral">{CATEGORY_LABEL[t.category] || t.category}</Badge>
                      <span>Edited {formatDate(t.updatedAt)}</span>
                      <span>· Used {formatNumber(t.usageCount)}×</span>
                    </>
                  }
                  actions={
                    <ActionMenu
                      label={`Actions for ${t.name}`}
                      items={[
                        { label: "Edit", icon: Pencil, onSelect: () => openRecord(t.id) },
                        { label: "Preview", icon: Eye, onSelect: () => setPreview(t) },
                        canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(t) },
                        { separator: true },
                        canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(t) },
                      ]}
                    />
                  }
                  footer={
                    canCreateCampaign ? (
                      <Button variant="outline" size="sm" className="w-full bg-surface-card text-xs" onClick={() => handleUse(t)}>
                        Use template
                      </Button>
                    ) : null
                  }
                />
              ))
            : filtered.map((s) => (
                <TemplateCard
                  key={s.key}
                  name={s.name}
                  html={renderHtml(s.content, s, brand)}
                  onOpen={() => setPreview(s)}
                  meta={
                    <>
                      <Badge variant="neutral">{CATEGORY_LABEL[s.category]}</Badge>
                      <span className="line-clamp-1">{s.description}</span>
                    </>
                  }
                  footer={
                    <>
                      {canCreateCampaign ? (
                        <Button variant="outline" size="sm" className="flex-1 bg-surface-card text-xs" onClick={() => handleUse(s)}>
                          Use
                        </Button>
                      ) : null}
                      {canEdit ? (
                        <Button variant="outline" size="sm" className="flex-1 bg-surface-card text-xs" onClick={() => handleSaveStarter(s)}>
                          Save as template
                        </Button>
                      ) : null}
                    </>
                  }
                />
              ))}
        </div>
      )}

      <PreviewDialog item={preview} brand={brand} onOpenChange={(o) => !o && setPreview(null)} onUse={canCreateCampaign ? (t) => { setPreview(null); handleUse(t); } : null} />
      <NewTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(form) => createTemplate(form).then(Boolean)} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default TemplatesScreen;
