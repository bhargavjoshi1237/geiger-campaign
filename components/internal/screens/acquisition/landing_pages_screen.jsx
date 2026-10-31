"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  BarChart3,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  LayoutTemplate,
  Link2,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  Rocket,
  Search,
  Target,
  Trash2,
  Undo2,
  Blocks,
} from "lucide-react";
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
  InlineTitleInput,
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
  SettingRow,
  SettingsList,
  StatGrid,
  StatsBar,
  StatusPill,
  Switch,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import {
  SLUG_TAKEN,
  createLandingPage,
  listLandingPages,
  softDeleteLandingPage,
  updateLandingPage,
} from "@/lib/supabase/landing_pages";
import { listForms } from "@/lib/supabase/forms";
import { getBrandKit } from "@/lib/supabase/brand_kits";
import { getUser } from "@/lib/supabase/user";
import { PAGE_TEMPLATES, TEMPLATE_LABEL, slugify, templateBlocks } from "@/lib/acquisition/blocks";
import { publicFormView } from "@/lib/acquisition/models";
import { brandCssVars } from "@/lib/content/brand";
import { LandingPageView } from "@/lib/acquisition/ui/landing_view";
import { AssetPicker } from "@/components/internal/screens/content/asset_picker";
import { PageBlockBuilder } from "./page_builder";
import {
  DESTRUCTIVE_ICON_BUTTON,
  OUTLINE_BUTTON,
  PAGE_STATUS_MAP,
  filterOptions,
  formatDate,
  formatNumber,
  percent,
} from "./constants";
import { ConfigNotice, CopyField, DeleteDialog, copyText, useAcquisitionStatus } from "./shared";

const STATUS_FILTER_OPTIONS = filterOptions("All statuses", PAGE_STATUS_MAP);

const PAGE_NAV = [
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Visits and form conversions since the page went live." },
  { key: "content", label: "Content", icon: Blocks, desc: "Build the page from blocks. The preview is what visitors see." },
  { key: "seo", label: "SEO & sharing", icon: Search, desc: "How the page appears in search results and link previews." },
  { key: "publishing", label: "Publishing", icon: Globe, desc: "The page's address, its default form and whether it's live." },
];

const slugTakenMessage = (slug) => `Another published page already uses /p/${slug}. Pick a different URL in Publishing.`;

const toDraft = (p) => ({ name: p.name, slug: p.slug, template: p.template, blocks: p.blocks, seo: p.seo, formId: p.formId || null });

function NewPageDialog({ open, onOpenChange, onCreate, forms, pending }) {
  const empty = { name: "", slug: "", slugEdited: false, template: "lead_capture", formId: "none" };
  const [draft, setDraft] = useState(empty);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const slug = draft.slugEdited ? slugify(draft.slug) : slugify(draft.name);

  const submit = async () => {
    if (!draft.name.trim() || !slug) {
      toast.error("Give the page a name and a URL.");
      return;
    }
    const ok = await onCreate({ name: draft.name.trim(), slug, template: draft.template, formId: draft.formId === "none" ? null : draft.formId });
    if (ok) {
      setDraft(empty);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New landing page</DialogTitle>
          <DialogDescription>Start from a layout, then edit every block in the page builder.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Page name" htmlFor="lp-name">
            <Input id="lp-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Spring launch waitlist" autoFocus />
          </Field>
          <Field label="URL" htmlFor="lp-slug" hint={slug ? `Published at /p/${slug}` : "Letters, numbers and dashes."}>
            <Input
              id="lp-slug"
              value={draft.slugEdited ? draft.slug : slug}
              onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value, slugEdited: true }))}
              placeholder="spring-launch"
              className="font-mono"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Layout">
              <Select value={draft.template} onValueChange={set("template")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_TEMPLATES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Form">
              <Select value={draft.formId} onValueChange={set("formId")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose later</SelectItem>
                  {forms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!draft.name.trim() || !slug || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PageEditor({ record, projectId, forms, brand, status, baseUrl, canEdit, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const [seoPicker, setSeoPicker] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setSeo = (key) => (value) => setDraft((d) => ({ ...d, seo: { ...d.seo, [key]: value } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const published = record.status === "published";
  const url = baseUrl && draft.slug ? `${baseUrl}/p/${slugify(draft.slug)}` : "";

  const previewForms = useMemo(() => Object.fromEntries(forms.map((f) => [f.id, publicFormView(f)])), [forms]);
  const previewPage = useMemo(() => ({ id: record.id, blocks: draft.blocks, formId: draft.formId }), [record.id, draft.blocks, draft.formId]);
  const missingForm = draft.blocks.some((b) => b.type === "form" && !(b.props?.formId || draft.formId));
  const notLiveForms = [...new Set(draft.blocks.filter((b) => b.type === "form").map((b) => b.props?.formId || draft.formId))]
    .map((id) => forms.find((f) => f.id === id))
    .filter((f) => f && f.status !== "live");

  const save = async (patch = {}, message) => {
    const name = draft.name.trim() || "Untitled page";
    const slug = slugify(draft.slug) || slugify(name);
    if (!slug) {
      toast.error("The page needs a URL.");
      return;
    }
    setSaving(true);
    const ok = await onSave(record.id, { ...draft, ...patch, name, slug }, message);
    setSaving(false);
    if (ok) setDraft((d) => ({ ...d, name, slug }));
  };

  const performance = [
    { label: "Visits", value: record.views ? formatNumber(record.views) : "—", icon: Eye, hint: record.views ? "One per visitor session" : "No traffic yet" },
    { label: "Conversions", value: record.conversions ? formatNumber(record.conversions) : "—", icon: MousePointerClick, hint: "Form submissions on this page" },
    { label: "Conversion rate", value: percent(record.conversions, record.views), icon: Target, hint: "Conversions per visit" },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Page name"
          placeholder="Untitled page"
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={PAGE_STATUS_MAP}
      badges={
        <>
          <Badge variant="neutral">{TEMPLATE_LABEL[record.template] || "Custom"}</Badge>
          <span className="font-mono text-xs text-text-tertiary">/p/{slugify(draft.slug)}</span>
        </>
      }
      actions={
        <>
          {published && url ? (
            <Button variant="outline" className={OUTLINE_BUTTON} asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> View
              </a>
            </Button>
          ) : null}
          {canEdit ? (
            <>
              <Button variant="ghost" size="icon" aria-label="Delete page" className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onDelete(record)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={() => save()}>
                Save
              </Button>
              {published ? (
                <Button onClick={() => save({ status: "draft" }, "Page unpublished. Its URL now shows not found.")} disabled={saving} variant="outline" className={OUTLINE_BUTTON}>
                  <Undo2 className="h-4 w-4" /> Unpublish
                </Button>
              ) : (
                <Button onClick={() => save({ status: "published", publishedAt: record.publishedAt || new Date().toISOString() }, "Page published.")} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publish
                </Button>
              )}
            </>
          ) : null}
        </>
      }
      nav={PAGE_NAV}
      defaultSection="performance"
    >
      {({ active }) => (
        <>
          {active === "performance" ? (
            <div className="space-y-6">
              <StatGrid stats={performance} columns={3} />
              <SectionCard bare title="Page status" description="When the page went live and where visitors find it.">
                <SettingsList>
                  <SettingRow title="Published" description={record.publishedAt ? formatDate(record.publishedAt, { time: true }) : "Not published yet"} control={<StatusPill status={record.status} map={PAGE_STATUS_MAP} />} />
                  <SettingRow title="Address" description={<span className="break-all font-mono">{url || "—"}</span>} control={<Button size="sm" variant="outline" className={OUTLINE_BUTTON} disabled={!url || !published} onClick={() => copyText(url, "Page link copied.")}><Link2 className="h-3.5 w-3.5" /> Copy</Button>} />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}

          {active === "content" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                {missingForm ? <ConfigNotice title="A form block has no form">Choose a form on the block, or set the page&apos;s default form in Publishing.</ConfigNotice> : null}
                {notLiveForms.length ? (
                  <ConfigNotice title="A form on this page isn't live">
                    {notLiveForms.map((f) => f.name).join(", ")} won&apos;t accept submissions until you publish it in Forms.
                  </ConfigNotice>
                ) : null}
                <PageBlockBuilder blocks={draft.blocks} onChange={set("blocks")} forms={forms} projectId={projectId} disabled={!canEdit} />
              </div>
              <div className="xl:sticky xl:top-0 xl:self-start">
                <SectionCard title="Preview" description="Mobile width, with your brand kit.">
                  <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-background px-4 text-foreground" style={brandCssVars(brand || {})}>
                    <LandingPageView page={previewPage} forms={previewForms} preview />
                  </div>
                </SectionCard>
              </div>
            </div>
          ) : null}

          {active === "seo" ? (
            <SectionCard bare title="Search listing" description="The title, description and image used in search results and link previews.">
              <div className="grid gap-4">
                <Field label="Title" htmlFor="lpe-seo-title" hint="Leave blank to use the page name.">
                  <Input id="lpe-seo-title" value={draft.seo.title} onChange={(e) => setSeo("title")(e.target.value)} placeholder={draft.name || "Untitled page"} disabled={!canEdit} />
                </Field>
                <Field label="Meta description" htmlFor="lpe-seo-desc" hint={`${draft.seo.description.length}/160 characters`}>
                  <Textarea id="lpe-seo-desc" value={draft.seo.description} onChange={(e) => setSeo("description")(e.target.value)} placeholder="One or two sentences that earn the click from search results." disabled={!canEdit} />
                </Field>
                <Field label="Share image" hint="Shown when the link is shared. 1200×630 works everywhere.">
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-card">
                      {draft.seo.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={draft.seo.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-text-tertiary">None</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="bg-surface-card" disabled={!canEdit} onClick={() => setSeoPicker(true)}>
                        Choose image
                      </Button>
                      {draft.seo.imageUrl ? (
                        <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => setSeo("imageUrl")("")}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Field>
                <SettingsList>
                  <SettingRow
                    title="Hide from search engines"
                    description="Adds noindex, for pages only reachable from your own campaigns."
                    control={<Switch checked={Boolean(draft.seo.noIndex)} onCheckedChange={setSeo("noIndex")} disabled={!canEdit} aria-label="Hide from search engines" />}
                  />
                </SettingsList>
              </div>
              <AssetPicker open={seoPicker} onOpenChange={setSeoPicker} projectId={projectId} onPick={(a) => setSeo("imageUrl")(a.url)} title="Choose a share image" />
            </SectionCard>
          ) : null}

          {active === "publishing" ? (
            <div className="space-y-6">
              {status && !status.ingestConfigured ? (
                <ConfigNotice title="Pages can't be served on this deployment">Set SUPABASE_SERVICE_ROLE_KEY on the server so /p/ pages and their forms work.</ConfigNotice>
              ) : null}
              <SectionCard bare title="Address & form" description="The page's URL and the form its form blocks use by default.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="URL" htmlFor="lpe-slug" hint="Changing it breaks links already shared.">
                    <div className="flex items-center">
                      <span className="rounded-l-md border border-r-0 border-border bg-surface-card px-2.5 py-2 font-mono text-sm text-text-secondary">/p/</span>
                      <Input id="lpe-slug" value={draft.slug} onChange={(e) => set("slug")(e.target.value)} onBlur={(e) => set("slug")(slugify(e.target.value))} className="rounded-l-none font-mono" disabled={!canEdit} />
                    </div>
                  </Field>
                  <Field label="Default form" hint="Used by form blocks that don't pick their own.">
                    <Select value={draft.formId || "none"} onValueChange={(v) => set("formId")(v === "none" ? null : v)} disabled={!canEdit}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {forms.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                            {f.status !== "live" ? " (not live)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </SectionCard>
              <SectionCard title="Public address">
                <CopyField value={url} copyMessage="Page link copied." hint={published ? "Live now." : "Answers once the page is published."} />
              </SectionCard>
              {canEdit && record.status !== "archived" ? (
                <SectionCard bare title="Availability" description="Take the page offline once it's no longer needed.">
                  <SettingsList>
                    <SettingRow
                      title="Archive page"
                      description="Takes it offline and moves it out of the way. You can restore it as a draft later."
                      control={
                        <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => save({ status: "archived" }, "Page archived.")} disabled={saving}>
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </Button>
                      }
                    />
                  </SettingsList>
                </SectionCard>
              ) : null}
              {canEdit && record.status === "archived" ? (
                <SectionCard bare title="Availability" description="Bring this archived page back so it can be edited and published again.">
                  <SettingsList>
                    <SettingRow
                      title="Restore page"
                      description="Brings it back as a draft."
                      control={
                        <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => save({ status: "draft" }, "Page restored as a draft.")} disabled={saving}>
                          <Undo2 className="h-3.5 w-3.5" /> Restore
                        </Button>
                      }
                    />
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

export function LandingPagesScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canEdit = useCan("campaign.acquisition.edit");
  const { status, baseUrl } = useAcquisitionStatus(projectId);
  const [pages, setPages] = useState([]);
  const [forms, setForms] = useState([]);
  const [brand, setBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    Promise.all([listLandingPages(projectId), listForms(projectId), getBrandKit(projectId)]).then(([rows, formRows, kit]) => {
      if (cancelled) return;
      if (rows === null) toast.error("Couldn't load landing pages.");
      setPages(rows ?? []);
      setForms(formRows ?? []);
      setBrand(kit);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) => (statusFilter === "all" || p.status === statusFilter) && (!q || p.name.toLowerCase().includes(q) || p.slug.includes(q)));
  }, [pages, query, statusFilter]);

  const stats = useMemo(() => {
    const views = pages.reduce((s, p) => s + p.views, 0);
    const conversions = pages.reduce((s, p) => s + p.conversions, 0);
    return [
      { label: "Pages", value: formatNumber(pages.length) },
      { label: "Published", value: formatNumber(pages.filter((p) => p.status === "published").length) },
      { label: "Visits", value: formatNumber(views) },
      { label: "Conversion", value: percent(conversions, views) },
    ];
  }, [pages]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}` });

  const handleCreate = async ({ name, slug, template, formId }) => {
    setCreating(true);
    const user = await getUser().catch(() => null);
    const row = await createLandingPage(projectId, {
      id: crypto.randomUUID(),
      name,
      slug,
      template,
      formId,
      status: "draft",
      blocks: templateBlocks(template),
      seo: {},
      createdBy: user?.id ?? null,
    });
    setCreating(false);
    if (row === SLUG_TAKEN) {
      toast.error(`You already have a page at /p/${slug}. Choose another URL.`);
      return false;
    }
    if (!row) {
      toast.error("Couldn't create the page.");
      return false;
    }
    setPages((prev) => [row, ...prev]);
    openRecord(row.id);
    return true;
  };

  const handleSave = async (id, patch, message = "Page saved.") => {
    const before = pages.find((p) => p.id === id);
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const saved = await updateLandingPage(id, patch);
    if (!saved || saved === SLUG_TAKEN) {
      setPages((prev) => prev.map((p) => (p.id === id ? before : p)));
      toast.error(saved === SLUG_TAKEN ? slugTakenMessage(slugify(patch.slug ?? before.slug)) : "Couldn't save the page.");
      return false;
    }
    setPages((prev) => prev.map((p) => (p.id === id ? saved : p)));
    toast.success(message);
    return true;
  };

  const handleDuplicate = async (p) => {
    const user = await getUser().catch(() => null);
    const slug = `${p.slug}-copy-${crypto.randomUUID().slice(0, 4)}`;
    const copy = await createLandingPage(projectId, {
      id: crypto.randomUUID(),
      name: `${p.name} (copy)`,
      slug,
      template: p.template,
      formId: p.formId,
      status: "draft",
      blocks: p.blocks,
      seo: p.seo,
      createdBy: user?.id ?? null,
    });
    if (!copy || copy === SLUG_TAKEN) {
      toast.error("Couldn't duplicate the page.");
      return;
    }
    setPages((prev) => [copy, ...prev]);
    toast.success("Page duplicated as a draft.");
  };

  const handleCopyLink = (p) => {
    if (p.status !== "published") {
      toast.info(`"${p.name}" isn't published, so its link shows not found.`);
      return;
    }
    copyText(`${baseUrl}/p/${p.slug}`, "Page link copied.");
  };

  const handleDelete = async (p) => {
    setDeleting(true);
    const ok = await softDeleteLandingPage(p.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error("Couldn't delete the page.");
      return;
    }
    setPages((prev) => prev.filter((x) => x.id !== p.id));
    if (recordId === p.id) closeRecord();
    toast.success(`Deleted "${p.name}".`);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      noun="page"
      name={deleteTarget?.name}
      consequence="Its URL stops working immediately. Submissions already collected are kept."
      pending={deleting}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = pages.find((p) => p.id === recordId);
  if (open) {
    return (
      <>
        <PageEditor
          key={open.id}
          record={open}
          projectId={projectId}
          forms={forms}
          brand={brand}
          status={status}
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

  const filtersActive = query || statusFilter !== "all";

  const columns = [
    {
      key: "page",
      header: "Page",
      render: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{p.name}</span>
          <span className="truncate font-mono text-xs text-text-secondary">/p/{p.slug}</span>
        </div>
      ),
    },
    { key: "template", header: "Layout", className: "text-muted-foreground", render: (p) => TEMPLATE_LABEL[p.template] || "Custom" },
    { key: "views", header: "Visits", className: "tabular-nums text-muted-foreground", render: (p) => (p.views ? formatNumber(p.views) : "—") },
    {
      key: "conversion",
      header: "Conversion",
      render: (p) =>
        p.views > 0 ? (
          <div className="w-[120px] space-y-1.5">
            <Progress value={Math.min(100, (p.conversions / p.views) * 100)} className="h-1.5 bg-surface-hover" />
            <p className="text-xs tabular-nums text-text-secondary">
              {percent(p.conversions, p.views)} · {formatNumber(p.conversions)}
            </p>
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (p) => <StatusPill status={p.status} map={PAGE_STATUS_MAP} /> },
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (p) => formatDate(p.updatedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${p.name}`}
            items={[
              { label: canEdit ? "Edit" : "Open", icon: Pencil, onSelect: () => openRecord(p.id) },
              canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(p) },
              { label: "Copy link", icon: Link2, onSelect: () => handleCopyLink(p) },
              p.status === "published" && baseUrl && { label: "View live page", icon: ExternalLink, href: `${baseUrl}/p/${p.slug}` },
              canEdit && { separator: true },
              canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(p) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Landing Pages"
        description="Standalone pages built to convert campaign traffic."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New page
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search pages…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} panel label="Loading landing pages" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(p) => p.id}
            onRowClick={(p) => openRecord(p.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={LayoutTemplate}
                  title={filtersActive ? "No matches" : "No landing pages yet"}
                  description={filtersActive ? "Try a different search or status." : "Build a page around one offer and one form."}
                  action={
                    filtersActive ? (
                      <Button
                        variant="outline"
                        className={OUTLINE_BUTTON}
                        onClick={() => {
                          setQuery("");
                          setStatusFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New page
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="pages" />
        </div>
      )}

      <NewPageDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} forms={forms} pending={creating} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default LandingPagesScreen;
