"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Tag as TagIcon,
  Pencil,
  Trash2,
  Merge,
  Hash,
  Copy,
  Asterisk,
  FileText,
  ShieldCheck,
  Users,
  ListChecks,
  BookmarkPlus,
  Loader2,
  X,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { scanContactFacets } from "@/lib/supabase/contacts";
import { createTag, deleteTag, listTags, mergeTag, updateTag } from "@/lib/supabase/tags";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  createCustomField,
  listCustomFields,
  softDeleteCustomField,
  toFieldKey,
  updateCustomField,
} from "@/lib/supabase/custom_fields";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  LoadingArea,
  SettingsList,
  SettingRow,
  Progress,
  StatsBar,
  SectionCard,
  InlineTitleInput,
} from "@geiger/ui";
import { DESTRUCTIVE_BUTTON, DESTRUCTIVE_GHOST, DIALOG_BODY, DIALOG_SCROLL, OUTLINE_BUTTON, TAG_COLOR_OPTIONS, TAG_DOT, number, plural } from "./constants";

const TAG_COLOR_NAME = Object.fromEntries(TAG_COLOR_OPTIONS.map((c) => [c.value, c.name]));

const USAGE_FILTER_OPTIONS = [
  { value: "all", label: "All tags" },
  { value: "used", label: "In use" },
  { value: "unused", label: "Unused" },
  { value: "uncatalogued", label: "Not in catalog" },
];

const TYPE_FILTER_OPTIONS = [{ value: "all", label: "All types" }, ...FIELD_TYPES.map((t) => ({ value: t, label: FIELD_TYPE_LABELS[t] }))];

const VIEW_OPTIONS = [
  { value: "tags", label: "Tags" },
  { value: "fields", label: "Custom fields" },
];

const TAG_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name, colour and what the tag means." },
  { key: "usage", label: "Usage", icon: Users, desc: "Contacts carrying this tag, and merging it into another." },
];

const FIELD_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Label, API key, type and help text." },
  { key: "options", label: "Options", icon: ListChecks, desc: "Allowed values for a dropdown field.", showIf: (f) => f?.type === "select" },
  { key: "validation", label: "Validation", icon: ShieldCheck, desc: "Whether forms must collect it, and how complete it is." },
];

const uncataloguedId = (name) => `tag:${name}`;

const tagNameError = (name, rows, selfName) => {
  if (!name) return "Give the tag a name first.";
  if (name.length > 60) return "Keep tag names under 60 characters.";
  if (rows.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.name.toLowerCase() !== (selfName || "").toLowerCase())) {
    return `A tag called "${name}" already exists.`;
  }
  return null;
};

function TagColorPicker({ id, value, onChange, disabled }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" aria-label="Colour">
        <SelectValue placeholder="Choose a colour" />
      </SelectTrigger>
      <SelectContent>
        {TAG_COLOR_OPTIONS.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", c.dot)} />
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// How the tag will look on contacts, mirrored from the list's tag cell.
function TagPreview({ name, color }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-surface-active px-2.5 py-1 text-sm text-foreground">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TAG_DOT[color])} />
      <span className={cn("truncate", !name && "text-text-tertiary")}>{name || "tag name"}</span>
    </span>
  );
}

function CreateTagDialog({ open, onOpenChange, rows, onCreate }) {
  const [form, setForm] = useState({ name: "", color: "emerald", description: "" });
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm({ name: "", color: "emerald", description: "" });
  }
  const submit = async () => {
    const name = form.name.trim();
    const error = tagNameError(name, rows);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    const ok = await onCreate({ ...form, name });
    setSaving(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create tag</DialogTitle>
          <DialogDescription>Tags are labels you can put on any contact and target in segments and automations.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Tag name" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. vip" autoFocus />
          </Field>
          <Field label="Colour" htmlFor="t-color">
            <TagColorPicker id="t-color" value={form.color} onChange={(color) => setForm((f) => ({ ...f, color }))} />
          </Field>
          <Field label="Description (optional)" htmlFor="t-desc">
            <Textarea id="t-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="When should someone apply this tag?" />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-4 py-3">
            <span className="text-xs text-text-secondary">Preview</span>
            <TagPreview name={form.name.trim()} color={form.color} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeTagDialog({ source, rows, onOpenChange, onMerge }) {
  const open = !!source;
  const targets = rows.filter((t) => t.name !== source?.name);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTarget("");
  }
  const submit = async () => {
    const into = targets.find((t) => t.name === target);
    if (!into) return;
    setSaving(true);
    await onMerge(source, into);
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge tag</DialogTitle>
          <DialogDescription>
            The {plural(source?.contacts ?? 0, "contact")} tagged <span className="font-medium text-foreground">{source?.name}</span> get the tag you pick, then{" "}
            <span className="font-medium text-foreground">{source?.name}</span> is removed.
          </DialogDescription>
        </DialogHeader>
        <Field label="Merge into">
          <Select value={target || undefined} onValueChange={setTarget}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose a tag" /></SelectTrigger>
            <SelectContent>
              {targets.map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!target || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />} Merge tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionsEditor({ options, onChange, disabled }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || options.some((o) => o.toLowerCase() === v.toLowerCase())) return;
    onChange([...options, v]);
    setDraft("");
  };
  return (
    <div className="space-y-3">
      {options.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {options.map((o) => (
            <li key={o} className="flex items-center justify-between px-3 py-2 text-sm text-foreground">
              {o}
              {!disabled ? (
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${o}`} className="text-text-secondary" onClick={() => onChange(options.filter((x) => x !== o))}>
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-tertiary">No options yet — a dropdown needs at least one.</p>
      )}
      {!disabled ? (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add an option"
            aria-label="New option"
            className="max-w-xs"
          />
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={add} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_FIELD = { label: "", key: "", keyTouched: false, type: "text", options: [], required: false, description: "" };

function CreateFieldDialog({ open, onOpenChange, onCreate, fields }) {
  const [form, setForm] = useState(EMPTY_FIELD);
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(EMPTY_FIELD);
  }
  const key = form.keyTouched ? toFieldKey(form.key) : toFieldKey(form.label);
  const taken = fields.some((f) => f.key === key);

  const submit = async () => {
    if (!form.label.trim() || !key) {
      toast.error("Give the field a label first.");
      return;
    }
    if (taken) {
      toast.error(`The API key "${key}" is already in use.`);
      return;
    }
    if (form.type === "select" && !form.options.length) {
      toast.error("Add at least one option for a dropdown.");
      return;
    }
    setSaving(true);
    const ok = await onCreate({ label: form.label.trim(), key, type: form.type, options: form.options, required: form.required, description: form.description });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SCROLL}>
        <DialogHeader>
          <DialogTitle>New custom field</DialogTitle>
          <DialogDescription>Custom fields store structured data on every contact and show up in forms, imports and the segment builder.</DialogDescription>
        </DialogHeader>
        <div className={DIALOG_BODY}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Field label" htmlFor="f-label">
              <Input id="f-label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Plan tier" autoFocus />
            </Field>
            <Field label="API key" htmlFor="f-key" hint={taken ? "Already in use." : "Used in merge tags and the API. Can't change later."}>
              <Input
                id="f-key"
                value={key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value, keyTouched: true }))}
                className={cn("font-mono", taken && "border-red-500/50")}
                placeholder="plan_tier"
              />
            </Field>
          </div>
          <Field label="Field type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {form.type === "select" ? (
            <Field label="Options">
              <OptionsEditor options={form.options} onChange={(options) => setForm((f) => ({ ...f, options }))} />
            </Field>
          ) : null}
          <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3">
            <SettingRow
              title="Required field"
              description="Forms must collect this value before submitting."
              checked={form.required}
              onCheckedChange={(v) => setForm((f) => ({ ...f, required: v }))}
            />
          </SettingsList>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.label.trim() || !key || taken || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorActions({ label, dirty, saving, canEdit, canDelete, onDelete, onSave }) {
  return (
    <>
      {canDelete ? (
        <Button variant="ghost" size="icon" aria-label={label} className={DESTRUCTIVE_GHOST} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
      {canEdit ? (
        <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={onSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
        </Button>
      ) : null}
    </>
  );
}

const toTagDraft = (t) => ({ name: t.name, color: t.color, description: t.description });

function TagEditor({ record, rows, canEdit, canDelete, onBack, onSave, onDelete, onMerge, onCatalog }) {
  const [draft, setDraft] = useState(() => toTagDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toTagDraft(record));
  const renaming = draft.name.trim() && draft.name.trim() !== record.name;

  const save = async () => {
    const name = draft.name.trim();
    const error = tagNameError(name, rows, record.name);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    await onSave(record, { ...draft, name });
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Tags & Fields", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Tag name"
          placeholder="Untitled tag"
          disabled={!canEdit || !record.catalogued}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant="neutral">
            <span className={cn("h-2 w-2 rounded-full", TAG_DOT[draft.color])} />
            {TAG_COLOR_NAME[draft.color]}
          </Badge>
          {!record.catalogued ? <Badge variant="warning">Not in catalog</Badge> : null}
          <span className="text-xs text-text-tertiary">{plural(record.contacts, "contact")} tagged</span>
        </>
      }
      actions={
        record.catalogued ? (
          <EditorActions label="Delete tag" dirty={dirty} saving={saving} canEdit={canEdit} canDelete={canDelete} onDelete={() => onDelete(record)} onSave={save} />
        ) : canEdit ? (
          <Button onClick={() => onCatalog(record)}>
            <BookmarkPlus className="h-4 w-4" /> Add to catalog
          </Button>
        ) : null
      }
      nav={TAG_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Tag details" description="The name, colour and meaning shown wherever the tag appears.">
              {record.catalogued ? (
                <div className="grid gap-4">
                  <Field label="Tag name" htmlFor="te-name" hint={renaming && record.contacts ? `Saving renames it on ${plural(record.contacts, "contact")}.` : undefined}>
                    <Input id="te-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} />
                  </Field>
                  <Field label="Colour" htmlFor="te-color">
                    <TagColorPicker id="te-color" value={draft.color} onChange={set("color")} disabled={!canEdit} />
                  </Field>
                  <Field label="Description" htmlFor="te-desc">
                    <Textarea id="te-desc" value={draft.description} disabled={!canEdit} onChange={(e) => set("description")(e.target.value)} placeholder="When should someone apply this tag?" />
                  </Field>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  This tag is on contacts (from an import, a form or the API) but isn&apos;t in the catalog yet. Add it to give it a colour and description.
                </p>
              )}
            </SectionCard>
          ) : null}
          {active === "usage" ? (
            <SectionCard bare title="Contacts & merging" description="How many contacts carry this tag, and folding it into another one.">
              <SettingsList>
                <SettingRow
                  title="Contacts tagged"
                  description="Contacts that currently carry this tag."
                  control={<span className="text-sm font-semibold tabular-nums text-foreground">{number(record.contacts)}</span>}
                />
                {canEdit ? (
                  <SettingRow
                    title="Merge into another tag"
                    description="Move these contacts onto another tag, then remove this one."
                    control={
                      <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={rows.length < 2} onClick={() => onMerge(record)}>
                        <Merge className="h-4 w-4" /> Merge into…
                      </Button>
                    }
                  />
                ) : null}
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

const toFieldDraft = (f) => ({ label: f.label, type: f.type, options: f.options, required: f.required, description: f.description });

function FieldEditor({ record, completeness, canEdit, canDelete, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toFieldDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toFieldDraft(record));

  const save = async () => {
    if (draft.type === "select" && !draft.options.length) {
      toast.error("Add at least one option for a dropdown.");
      return;
    }
    setSaving(true);
    await onSave(record.id, { ...draft, label: draft.label.trim() || record.key });
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Tags & Fields", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.label}
          onChange={(e) => set("label")(e.target.value)}
          aria-label="Field label"
          placeholder="Untitled field"
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <Badge variant="info">{FIELD_TYPE_LABELS[draft.type]}</Badge>
          {draft.required ? <Badge variant="warning">Required</Badge> : null}
          <span className="font-mono text-xs text-text-tertiary">attributes.{record.key}</span>
        </>
      }
      actions={<EditorActions label="Delete field" dirty={dirty} saving={saving} canEdit={canEdit} canDelete={canDelete} onDelete={() => onDelete(record)} onSave={save} />}
      nav={FIELD_NAV}
      subject={draft}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Field details" description="How the field is labelled, stored and explained to your team.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Field label" htmlFor="fe-label">
                  <Input id="fe-label" value={draft.label} disabled={!canEdit} onChange={(e) => set("label")(e.target.value)} />
                </Field>
                <Field label="API key" hint="Fixed once created — merge tags and API calls rely on it.">
                  <div className="flex h-10 items-center rounded-md border border-border bg-background px-3 font-mono text-sm text-muted-foreground">{record.key}</div>
                </Field>
                <Field label="Field type" hint="Existing values are kept; segments compare them as the new type.">
                  <Select value={draft.type} onValueChange={set("type")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Help text" htmlFor="fe-desc" className="sm:col-span-2">
                  <Textarea id="fe-desc" value={draft.description} disabled={!canEdit} onChange={(e) => set("description")(e.target.value)} placeholder="Shown under the field on contact profiles and forms." />
                </Field>
              </div>
            </SectionCard>
          ) : null}
          {active === "options" ? (
            <SectionCard bare title="Dropdown options" description="The values people can pick from, in the order they appear.">
              <OptionsEditor options={draft.options} onChange={set("options")} disabled={!canEdit} />
            </SectionCard>
          ) : null}
          {active === "validation" ? (
            <SectionCard bare title="Requirement & coverage" description="Whether forms must collect this value and how many contacts already have one.">
              <SettingsList>
                <SettingRow
                  title="Required field"
                  description="Forms must collect this value before submitting."
                  control={<Switch checked={draft.required} disabled={!canEdit} onCheckedChange={set("required")} aria-label="Required field" />}
                />
                <SettingRow
                  title="Completeness"
                  description="Share of contacts with a value in this field."
                  control={<span className="text-sm font-semibold tabular-nums text-foreground">{completeness}%</span>}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function TagsFieldsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.contact.edit");
  const canDelete = can("campaign.contact.delete");
  const [tab, setTab] = useState("tags");
  const [data, setData] = useState({ key: null, tags: [], fields: [], facets: null });
  const [query, setQuery] = useState("");
  const [usageFilter, setUsageFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tagOpen, setTagOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const load = useCallback(() => Promise.all([listTags(projectId), listCustomFields(projectId), scanContactFacets(projectId)]), [projectId]);

  useEffect(() => {
    let alive = true;
    load().then(([tags, fields, facets]) => {
      if (!alive) return;
      if (!tags || !fields) toast.error("Couldn't load tags and fields.");
      setData({ key: projectId, tags: tags ?? [], fields: fields ?? [], facets });
    });
    return () => {
      alive = false;
    };
  }, [load, projectId]);

  const refreshFacets = () => scanContactFacets(projectId).then((facets) => facets && setData((d) => ({ ...d, facets })));

  const loading = data.key !== projectId;
  const tagCounts = useMemo(() => data.facets?.tagCounts || {}, [data.facets]);
  const totalContacts = data.facets?.total || 0;

  // Catalog tags plus names found on contacts that aren't catalogued yet.
  const tagRows = useMemo(() => {
    const counts = new Map();
    for (const [name, n] of Object.entries(tagCounts)) counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) || 0) + n);
    const known = new Set(data.tags.map((t) => t.name.toLowerCase()));
    const catalogued = data.tags.map((t) => ({ ...t, catalogued: true, contacts: counts.get(t.name.toLowerCase()) || 0 }));
    const extra = Object.keys(tagCounts)
      .filter((name) => !known.has(name.toLowerCase()))
      .filter((name, i, arr) => arr.findIndex((x) => x.toLowerCase() === name.toLowerCase()) === i)
      .map((name) => ({ id: uncataloguedId(name), name, color: "zinc", description: "", catalogued: false, contacts: counts.get(name.toLowerCase()) || 0 }));
    return [...catalogued, ...extra];
  }, [data.tags, tagCounts]);

  const completenessOf = (f) => (totalContacts ? Math.round(((data.facets?.fieldFilled?.[f.key] || 0) / totalContacts) * 100) : 0);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tagRows.filter((t) => {
      if (usageFilter === "used" && !t.contacts) return false;
      if (usageFilter === "unused" && t.contacts) return false;
      if (usageFilter === "uncatalogued" && t.catalogued) return false;
      if (q && !`${t.name} ${t.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tagRows, query, usageFilter]);

  const filteredFields = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.fields.filter((f) => {
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (q && !`${f.label} ${f.key}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.fields, query, typeFilter]);

  const stats = useMemo(() => {
    const filled = data.fields.map((f) => (totalContacts ? ((data.facets?.fieldFilled?.[f.key] || 0) / totalContacts) * 100 : 0));
    const avg = filled.length ? Math.round(filled.reduce((s, v) => s + v, 0) / filled.length) : 0;
    const uncatalogued = tagRows.filter((t) => !t.catalogued).length;
    return [
      { label: "Tags", value: loading ? "" : number(data.tags.length), footer: uncatalogued ? `${uncatalogued} more found on contacts` : "All tags catalogued" },
      { label: "Tagged contacts", value: loading ? "" : number(data.facets?.tagged ?? 0), footer: `Of ${number(totalContacts)} contacts` },
      { label: "Custom fields", value: loading ? "" : number(data.fields.length), footer: `${data.fields.filter((f) => f.required).length} required` },
      { label: "Avg. completeness", value: loading ? "" : `${avg}%`, footer: "Contacts with a value" },
    ];
  }, [data.tags, data.fields, data.facets, tagRows, totalContacts, loading]);

  const tagPager = usePagination(filteredTags, { resetKey: `${query}|${usageFilter}` });
  const fieldPager = usePagination(filteredFields, { resetKey: `${query}|${typeFilter}` });

  const handleCreateTag = async (input) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const created = await createTag(projectId, { id, ...input, createdBy: user?.id ?? null });
    if (!created) {
      toast.error("Couldn't create the tag.");
      return false;
    }
    setData((d) => ({ ...d, tags: [...d.tags, created].sort((a, b) => a.name.localeCompare(b.name)) }));
    toast.success(`Created "${created.name}".`);
    return true;
  };

  const handleCatalog = async (row) => {
    const ok = await handleCreateTag({ name: row.name, color: "zinc", description: "" });
    if (ok) closeRecord();
  };

  const handleSaveTag = async (record, patch) => {
    const saved = await updateTag(projectId, record, patch);
    if (!saved) {
      toast.error("Couldn't save the tag.");
      return;
    }
    setData((d) => ({ ...d, tags: d.tags.map((t) => (t.id === saved.id ? saved : t)) }));
    if (patch.name !== record.name) refreshFacets();
    toast.success(patch.name !== record.name && record.contacts ? `Renamed on ${plural(record.contacts, "contact")}.` : "Tag saved.");
  };

  const handleMerge = async (source, into) => {
    const ok = await mergeTag(projectId, source.catalogued ? source : { name: source.name }, into);
    if (!ok) {
      toast.error("Couldn't merge the tags.");
      return;
    }
    setMergeSource(null);
    setData((d) => ({ ...d, tags: d.tags.filter((t) => t.id !== source.id) }));
    if (source.id === recordId) closeRecord();
    refreshFacets();
    toast.success(`Merged "${source.name}" into "${into.name}".`);
  };

  const handleCreateField = async (input) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const created = await createCustomField(projectId, { id, ...input, position: data.fields.length, createdBy: user?.id ?? null });
    if (!created) {
      toast.error("Couldn't create the field — the key may already exist.");
      return false;
    }
    setData((d) => ({ ...d, fields: [...d.fields, created] }));
    toast.success(`Created "${created.label}".`);
    openRecord(id);
    return true;
  };

  const handleSaveField = async (id, patch) => {
    const before = data.fields.find((f) => f.id === id);
    setData((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
    const saved = await updateCustomField(id, patch);
    if (!saved) {
      setData((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? before : f)) }));
      toast.error("Couldn't save the field.");
      return;
    }
    setData((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? saved : f)) }));
    toast.success("Field saved.");
  };

  const handleDuplicateField = async (f) => {
    let key = `${f.key}_copy`;
    while (data.fields.some((x) => x.key === key)) key = `${key}_copy`;
    const user = await getUser();
    const created = await createCustomField(projectId, {
      id: crypto.randomUUID(),
      key,
      label: `${f.label} (copy)`,
      type: f.type,
      options: f.options,
      required: false,
      description: f.description,
      position: data.fields.length,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't duplicate the field.");
      return;
    }
    setData((d) => ({ ...d, fields: [...d.fields, created] }));
    toast.success("Field duplicated.");
  };

  const toggleRequired = (f) => handleSaveField(f.id, { required: !f.required });

  const handleDelete = async ({ kind, item }) => {
    setDeleting(true);
    const ok = kind === "tag" ? await deleteTag(projectId, item.catalogued ? item : { name: item.name }) : await softDeleteCustomField(item.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error(kind === "tag" ? "Couldn't delete the tag." : "Couldn't delete the field.");
      return;
    }
    if (kind === "tag") {
      setData((d) => ({ ...d, tags: d.tags.filter((t) => t.id !== item.id) }));
      refreshFacets();
    } else {
      setData((d) => ({ ...d, fields: d.fields.filter((f) => f.id !== item.id) }));
    }
    if (item.id === recordId) closeRecord();
    toast.success(kind === "tag" ? `Deleted tag "${item.name}".` : `Deleted field "${item.label}".`);
  };

  const deletingTag = deleteTarget?.kind === "tag";
  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deletingTag ? "Delete tag" : "Delete field"}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deletingTag ? deleteTarget?.item.name : deleteTarget?.item.label}</span>?{" "}
            {deletingTag
              ? `It's removed from ${plural(deleteTarget?.item.contacts ?? 0, "contact")}; segments using it stop matching on it.`
              : "Contacts keep their stored values, but the field disappears from profiles, forms, imports and the segment builder."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DESTRUCTIVE_BUTTON} disabled={deleting} onClick={() => handleDelete(deleteTarget)}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const mergeDialog = <MergeTagDialog source={mergeSource} rows={tagRows} onOpenChange={(o) => !o && setMergeSource(null)} onMerge={handleMerge} />;

  const openTag = tagRows.find((t) => t.id === recordId);
  const openField = data.fields.find((f) => f.id === recordId);
  const recordTab = openTag ? "tags" : openField ? "fields" : null;
  if (recordTab && recordTab !== tab) setTab(recordTab);

  if (openTag) {
    return (
      <>
        <TagEditor
          key={openTag.id}
          record={openTag}
          rows={tagRows}
          canEdit={canEdit}
          canDelete={canDelete}
          onBack={closeRecord}
          onSave={handleSaveTag}
          onDelete={(t) => setDeleteTarget({ kind: "tag", item: t })}
          onMerge={setMergeSource}
          onCatalog={handleCatalog}
        />
        {mergeDialog}
        {deleteDialog}
      </>
    );
  }
  if (openField) {
    return (
      <>
        <FieldEditor
          key={openField.id}
          record={openField}
          completeness={completenessOf(openField)}
          canEdit={canEdit}
          canDelete={canDelete}
          onBack={closeRecord}
          onSave={handleSaveField}
          onDelete={(f) => setDeleteTarget({ kind: "field", item: f })}
        />
        {deleteDialog}
      </>
    );
  }
  if (recordId && loading) return <LoadingArea size={88} label="Loading" className="min-h-[60vh]" />;

  const onTags = tab === "tags";
  const filtersActive = onTags ? query || usageFilter !== "all" : query || typeFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setUsageFilter("all");
    setTypeFilter("all");
  };
  const clearButton = <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>;

  const tagColumns = [
    {
      key: "tag",
      header: "Tag",
      render: (t) => (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-active px-2.5 py-1 text-sm text-foreground">
            <span className={cn("h-2.5 w-2.5 rounded-full", TAG_DOT[t.color])} />
            {t.name}
          </span>
          {!t.catalogued ? <Badge variant="warning">Not in catalog</Badge> : null}
        </div>
      ),
    },
    { key: "description", header: "Description", className: "max-w-80 truncate text-muted-foreground", render: (t) => t.description || "—" },
    { key: "contacts", header: "Contacts tagged", align: "right", className: "tabular-nums font-medium text-foreground", render: (t) => number(t.contacts) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.name}`}
          items={
            t.catalogued
              ? [
                  { label: "Edit tag", icon: Pencil, onSelect: () => openRecord(t.id) },
                  canEdit ? { label: "Merge into…", icon: Merge, disabled: tagRows.length < 2, onSelect: () => setMergeSource(t) } : null,
                  canDelete ? { separator: true } : null,
                  canDelete ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget({ kind: "tag", item: t }) } : null,
                ]
              : [
                  canEdit ? { label: "Add to catalog", icon: BookmarkPlus, onSelect: () => handleCreateTag({ name: t.name, color: "zinc", description: "" }) } : null,
                  canEdit ? { label: "Merge into…", icon: Merge, onSelect: () => setMergeSource(t) } : null,
                  canDelete ? { separator: true } : null,
                  canDelete ? { label: "Remove from contacts", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget({ kind: "tag", item: t }) } : null,
                ]
          }
        />
      ),
    },
  ];

  const fieldColumns = [
    {
      key: "field",
      header: "Field",
      render: (f) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{f.label}</span>
          {f.required ? <Badge variant="warning">Required</Badge> : null}
        </div>
      ),
    },
    { key: "key", header: "API key", className: "font-mono text-xs text-muted-foreground", render: (f) => f.key },
    { key: "type", header: "Type", render: (f) => <Badge variant="info">{FIELD_TYPE_LABELS[f.type]}</Badge> },
    { key: "options", header: "Options", className: "text-muted-foreground", render: (f) => (f.type === "select" ? plural(f.options.length, "option") : "—") },
    {
      key: "filled",
      header: "Completeness",
      render: (f) => (
        <div className="flex items-center gap-2">
          <Progress value={completenessOf(f)} className="h-1.5 w-24 bg-surface-hover" />
          <span className="text-xs tabular-nums text-text-secondary">{completenessOf(f)}%</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (f) => (
        <ActionMenu
          label={`Actions for ${f.label}`}
          items={[
            { label: "Edit field", icon: Pencil, onSelect: () => openRecord(f.id) },
            canEdit ? { label: f.required ? "Make optional" : "Make required", icon: Asterisk, onSelect: () => toggleRequired(f) } : null,
            canEdit ? { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicateField(f) } : null,
            canDelete ? { separator: true } : null,
            canDelete ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget({ kind: "field", item: f }) } : null,
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Tags & Fields"
        description="Label contacts with tags and store structured data in custom fields used across forms, imports and segments."
        actions={
          canEdit ? (
            onTags ? (
              <Button onClick={() => setTagOpen(true)}>
                <Plus className="h-4 w-4" /> New tag
              </Button>
            ) : (
              <Button onClick={() => setFieldOpen(true)}>
                <Plus className="h-4 w-4" /> New field
              </Button>
            )
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={tab} onValueChange={setTab} options={VIEW_OPTIONS} height="h-9" />
          {onTags ? (
            <FilterDropdown value={usageFilter} onValueChange={setUsageFilter} options={USAGE_FILTER_OPTIONS} height="h-9" />
          ) : (
            <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
          )}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder={onTags ? "Search tags…" : "Search fields…"} />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading tags and fields" panel />
      ) : onTags ? (
        <div className="space-y-5">
          <DataTable
            columns={tagColumns}
            data={tagPager.pageItems}
            getRowKey={(t) => t.id}
            onRowClick={(t) => openRecord(t.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={TagIcon}
                  title={filtersActive ? "No matches" : "No tags yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a tag to label contacts for targeting and automations."}
                  action={filtersActive ? clearButton : canEdit ? <Button onClick={() => setTagOpen(true)}><Plus className="h-4 w-4" /> New tag</Button> : null}
                />
              </div>
            }
          />
          <ListPagination {...tagPager} itemLabel="tags" />
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={fieldColumns}
            data={fieldPager.pageItems}
            getRowKey={(f) => f.id}
            onRowClick={(f) => openRecord(f.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Hash}
                  title={filtersActive ? "No matches" : "No custom fields yet"}
                  description={filtersActive ? "Try a different search or filter." : "Add a custom field to store structured data on every contact."}
                  action={filtersActive ? clearButton : canEdit ? <Button onClick={() => setFieldOpen(true)}><Plus className="h-4 w-4" /> New field</Button> : null}
                />
              </div>
            }
          />
          <ListPagination {...fieldPager} itemLabel="fields" />
        </div>
      )}

      <CreateTagDialog open={tagOpen} onOpenChange={setTagOpen} rows={tagRows} onCreate={handleCreateTag} />
      {mergeDialog}
      <CreateFieldDialog open={fieldOpen} onOpenChange={setFieldOpen} onCreate={handleCreateField} fields={data.fields} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default TagsFieldsScreen;
