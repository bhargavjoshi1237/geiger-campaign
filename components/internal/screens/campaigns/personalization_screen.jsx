"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Braces, ChevronLeft, ChevronRight, Copy, Eye, PencilRuler, SplitSquareVertical, UserRound } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { listContacts } from "@/lib/supabase/contacts";
import { listEmailTemplates } from "@/lib/supabase/email_templates";
import { blockLabel, blockRule, renderEmailDocument, walkBlocks } from "@/lib/email/blocks";
import { describeCondition, evaluateCondition } from "@/lib/email/conditions";
import { SYSTEM_MERGE_TAGS, applyMergeTags, contactMergeData, extractMergeTags, formatMergeTag, resolveMergeValue } from "@/lib/email/merge_tags";
import { MergeTextField } from "./builder/merge_tag_picker";
import { DEVICE_TABS, EmailPreviewFrame } from "./builder/email_preview";
import { useBuilderResources } from "./builder/use_builder_resources";
import { CAMPAIGN_STATUS_MAP, OUTLINE_BUTTON, formatNumber, formatRate, rate } from "./constants";
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
  SegmentedTabs,
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
  cn,
} from "@geiger/ui";

const VIEW_OPTIONS = [
  { value: "tags", label: "Merge tags" },
  { value: "dynamic", label: "Dynamic content" },
  { value: "preview", label: "Preview" },
];
const TAB_KEYS = new Set(VIEW_OPTIONS.map((t) => t.value));

const GROUP_FILTER_OPTIONS = [
  { value: "all", label: "All fields" },
  { value: "Contact", label: "Contact" },
  { value: "Custom fields", label: "Custom fields" },
  { value: "Links and dates", label: "Links and dates" },
];

const KIND_FILTER_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "campaign", label: "Campaigns" },
  { value: "template", label: "Templates" },
  { value: "block", label: "Saved blocks" },
];

const KIND_LABEL = { campaign: "Campaign", template: "Template", block: "Saved block" };
const CONTACT_LIMIT = 1000;
const SYSTEM_GROUP = "Links and dates";
const SYSTEM_KEYS = new Set(SYSTEM_MERGE_TAGS.map((t) => t.key));
const isEmpty = (v) => v == null || v === "";
const fieldLabeler = (groups) => {
  const labels = new Map(groups.flatMap((g) => g.fields).map((f) => [f.key, f.label]));
  return (key) => labels.get(key) || key;
};
const emailsLabel = (n) => `${formatNumber(n)} ${n === 1 ? "email" : "emails"}`;

// What a block says, for tables: its text, label or name.
function blockSnippet(block) {
  const p = block?.props || {};
  const text = p.text || p.label || p.name || p.alt || p.html || "";
  return String(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
}

// Every campaign, template and saved block as one shape: text to scan for tags and a document to render.
function buildSources(campaigns, templates, savedBlocks) {
  const out = [];
  for (const c of campaigns) {
    const isEmail = c.channel === "email";
    out.push({
      kind: "campaign",
      id: c.id,
      name: c.name,
      status: c.status,
      channel: c.channel,
      subject: c.subject,
      preheader: c.preheader,
      doc: isEmail ? c.content : null,
      body: isEmail ? "" : c.content?.body || "",
      text: `${c.subject} ${c.preheader} ${JSON.stringify(c.content || {})} ${JSON.stringify(c.ab || {})}`,
    });
  }
  for (const t of templates) {
    out.push({ kind: "template", id: t.id, name: t.name, channel: "email", subject: t.subject, preheader: t.preheader, doc: t.content, body: "", text: `${t.subject} ${t.preheader} ${JSON.stringify(t.content || {})}` });
  }
  for (const b of savedBlocks) {
    out.push({ kind: "block", id: b.id, name: b.name, channel: "email", subject: "", preheader: "", doc: { blocks: [b.block] }, body: "", text: JSON.stringify(b.block || {}) });
  }
  return out;
}

function CopyTagDialog({ field, sampleData, onOpenChange }) {
  const [fallback, setFallback] = useState("");
  const token = field ? formatMergeTag(field.key, fallback) : "";
  const sample = sampleData.find((d) => !isEmpty(resolveMergeValue(d.data, field?.key)));
  const missing = sampleData.find((d) => isEmpty(resolveMergeValue(d.data, field?.key)));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(`Copied ${token}`);
      onOpenChange(false);
    } catch {
      toast.error("Couldn't copy. Select the tag and copy it manually.");
    }
  };

  return (
    <Dialog open={!!field} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy merge tag</DialogTitle>
          <DialogDescription>Paste it into a subject line, a text block or an SMS. The fallback shows when a contact has no {field?.label?.toLowerCase()}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Fallback" htmlFor="tag-fallback" hint="Optional, e.g. “there” for “Hi {{first_name|there}}”.">
            <Input id="tag-fallback" value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="No fallback" autoFocus />
          </Field>
          <Field label="Tag">
            <code className="block select-all rounded-lg border border-border bg-surface-card px-3 py-2 font-mono text-sm text-foreground">{token}</code>
          </Field>
          <div className="grid gap-1.5 text-sm">
            {sample ? (
              <p className="text-text-secondary">
                {sample.name}: <span className="text-foreground">{applyMergeTags(token, sample.data)}</span>
              </p>
            ) : null}
            {missing ? (
              <p className="text-text-secondary">
                {missing.name}: <span className="text-foreground">{applyMergeTags(token, missing.data) || "(blank)"}</span>
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={copy}>
            <Copy className="h-4 w-4" /> Copy tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CoverageCell({ count, total }) {
  if (!total) return <span className="text-text-secondary">—</span>;
  const r = rate(count, total);
  return (
    <div className="w-[140px] space-y-1.5">
      <Progress value={Math.round((r || 0) * 100)} className="h-1.5" />
      <p className="text-xs tabular-nums text-text-secondary">
        {formatRate(r)} · {formatNumber(count)} of {formatNumber(total)}
      </p>
    </div>
  );
}

function MergeTagsTab({ groups, contactData, usage, onTab, canManageFields, viewSwitch }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [copyField, setCopyField] = useState(null);

  const rows = useMemo(
    () =>
      groups.flatMap((g) =>
        g.fields.map((f) => {
          const system = g.group === SYSTEM_GROUP;
          const filled = system ? [] : contactData.filter((d) => !isEmpty(resolveMergeValue(d.data, f.key)));
          return { ...f, group: g.group, system, filled: filled.length, example: filled[0] ? String(resolveMergeValue(filled[0].data, f.key)) : "", usedIn: usage.get(f.key)?.size || 0 };
        }),
      ),
    [groups, contactData, usage],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (group === "all" || r.group === group) && (!q || `${r.label} ${r.key}`.toLowerCase().includes(q)));
  }, [rows, query, group]);

  const pager = usePagination(filtered, { resetKey: `${query}|${group}` });
  const hasCustom = groups.some((g) => g.group === "Custom fields");

  const columns = [
    {
      key: "field",
      header: "Field",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-foreground">{r.label}</span>
          <code className="font-mono text-xs text-text-secondary">{formatMergeTag(r.key)}</code>
        </div>
      ),
    },
    { key: "group", header: "Source", className: "whitespace-nowrap text-muted-foreground", render: (r) => r.group },
    {
      key: "coverage",
      header: "Contacts with a value",
      render: (r) => (r.system ? <span className="text-sm text-text-secondary">Filled at send</span> : <CoverageCell count={r.filled} total={contactData.length} />),
    },
    { key: "example", header: "Example", render: (r) => <span className="line-clamp-1 max-w-[220px] text-sm text-muted-foreground">{r.system ? "—" : r.example || "—"}</span> },
    { key: "usedIn", header: "Used in", align: "right", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (r) => (r.usedIn ? emailsLabel(r.usedIn) : "—") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => <ActionMenu label={`Actions for ${r.label}`} items={[{ label: "Copy tag", icon: Copy, onSelect: () => setCopyField(r) }]} />,
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar>
        <div className="flex items-center gap-2">
          {viewSwitch}
          <FilterDropdown value={group} onValueChange={setGroup} options={GROUP_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search fields…" />
      </Toolbar>
      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(r) => r.key}
        onRowClick={(r) => setCopyField(r)}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={Braces}
              title="No matching fields"
              description="Try a different search or source."
              action={
                <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => { setQuery(""); setGroup("all"); }}>
                  Clear filters
                </Button>
              }
            />
          </div>
        }
      />
      <ListPagination {...pager} itemLabel="fields" />
      {!hasCustom ? (
        <p className="text-sm text-text-secondary">
          Custom contact fields (plan, birthday, store…) become merge tags too.{" "}
          {canManageFields ? (
            <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => onTab("Tags & Fields")}>
              Add one in Tags &amp; Fields
            </button>
          ) : null}
        </p>
      ) : null}
      <CopyTagDialog key={copyField?.key || "none"} field={copyField} sampleData={contactData} onOpenChange={(o) => !o && setCopyField(null)} />
    </div>
  );
}

function DynamicContentTab({ rows, contactCount, groups, onOpenSource, onPreview, onTab, canEdit, viewSwitch }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const labelFor = useMemo(() => fieldLabeler(groups), [groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (kind === "all" || r.source.kind === kind) && (!q || `${r.source.name} ${r.snippet} ${r.rule.field} ${r.rule.value}`.toLowerCase().includes(q)));
  }, [rows, query, kind]);

  const pager = usePagination(filtered, { resetKey: `${query}|${kind}` });
  const filtersActive = query || kind !== "all";

  const columns = [
    {
      key: "block",
      header: "Block",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-foreground">{blockLabel(r.block.type)}</span>
          <span className="line-clamp-1 text-xs text-text-secondary">{r.snippet || "No text"}</span>
        </div>
      ),
    },
    { key: "rule", header: "Shown to", render: (r) => <span className="line-clamp-1 text-sm text-foreground">{describeCondition(r.rule, labelFor)}</span> },
    { key: "reach", header: "Contacts who'd see it", render: (r) => <CoverageCell count={r.reach} total={contactCount} /> },
    {
      key: "source",
      header: "In",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="line-clamp-1 text-sm text-foreground">{r.source.name}</span>
          <span className="flex items-center gap-1.5">
            <Badge variant="neutral">{KIND_LABEL[r.source.kind]}</Badge>
            {r.source.kind === "campaign" ? <StatusPill status={r.source.status} map={CAMPAIGN_STATUS_MAP} /> : null}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <ActionMenu
          label={`Actions for ${blockLabel(r.block.type)} in ${r.source.name}`}
          items={[
            r.source.kind !== "block" && { label: "Preview for a contact", icon: Eye, onSelect: () => onPreview(r.source) },
            { label: r.source.kind === "block" ? "Open block" : "Open in Email Builder", icon: PencilRuler, onSelect: () => onOpenSource(r.source) },
          ]}
        />
      ),
    },
  ];

  if (!rows.length) {
    return (
      <div className="space-y-4">
        <Toolbar>
          <div className="flex items-center gap-2">{viewSwitch}</div>
        </Toolbar>
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={SplitSquareVertical}
            title="No conditional content yet"
            description="In the Email Builder, select a block and turn on “Only show to some recipients” to show it to part of the audience."
            action={
              canEdit ? (
                <Button onClick={() => onTab("Email Builder")}>
                  <PencilRuler className="h-4 w-4" /> Open Email Builder
                </Button>
              ) : null
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Toolbar>
        <div className="flex items-center gap-2">
          {viewSwitch}
          <FilterDropdown value={kind} onValueChange={setKind} options={KIND_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search rules and emails…" />
      </Toolbar>
      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(r) => r.id}
        onRowClick={(r) => (r.source.kind === "block" ? onOpenSource(r.source) : onPreview(r.source))}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={SplitSquareVertical}
              title="No matches"
              description="Try a different search or source."
              action={
                filtersActive ? (
                  <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => { setQuery(""); setKind("all"); }}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          </div>
        }
      />
      <ListPagination {...pager} itemLabel="conditional blocks" />
    </div>
  );
}

function ContactPicker({ contacts, value, onChange }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? contacts.filter((c) => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q)) : contacts).slice(0, 50);
  }, [contacts, query]);
  const index = contacts.findIndex((c) => c.id === value);
  const step = (delta) => {
    if (!contacts.length) return;
    onChange(contacts[(index + delta + contacts.length) % contacts.length].id);
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput value={query} onChange={setQuery} placeholder="Find a contact…" expanded />
        </div>
        <Button variant="outline" size="icon-sm" className="bg-surface-card" aria-label="Previous contact" onClick={() => step(-1)} disabled={!contacts.length}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon-sm" className="bg-surface-card" aria-label="Next contact" onClick={() => step(1)} disabled={!contacts.length}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-card p-1" role="listbox" aria-label="Contacts">
        {matches.length ? (
          matches.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === value}
              onClick={() => onChange(c.id)}
              className={cn(
                "flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/40",
                c.id === value && "bg-surface-active",
              )}
            >
              <span className="text-sm text-foreground">{c.name}</span>
              <span className="text-xs text-text-secondary">{c.email || c.phone || "No address"}</span>
            </button>
          ))
        ) : (
          <p className="px-2.5 py-2 text-sm text-text-secondary">No contacts match.</p>
        )}
      </div>
    </div>
  );
}

function PreviewTab({ sources, contacts, sourceId, setSourceId, groups, brand }) {
  const [contactId, setContactId] = useState(contacts[0]?.id || null);
  const [device, setDevice] = useState("desktop");
  const [snippet, setSnippet] = useState("Hi {{first_name|there}}, here's what's new in {{city|your city}}.");
  const previewable = useMemo(() => sources.filter((s) => s.kind !== "block"), [sources]);
  const source = useMemo(() => previewable.find((s) => s.id === sourceId) || previewable[0] || null, [previewable, sourceId]);
  const contact = useMemo(() => contacts.find((c) => c.id === contactId) || contacts[0] || null, [contacts, contactId]);
  const data = useMemo(() => (contact ? contactMergeData(contact) : {}), [contact]);
  const labelFor = useMemo(() => fieldLabeler(groups), [groups]);

  const rendered = useMemo(() => {
    if (!source?.doc) return null;
    return renderEmailDocument(source.doc, { mergeData: data, brand, subject: source.subject, preheader: source.preheader, placeholders: true });
  }, [source, data, brand]);

  const tags = useMemo(() => {
    if (!source) return [];
    const keys = extractMergeTags(source.text);
    return keys.map((key) => {
      const value = resolveMergeValue(data, key);
      const hasFallback = new RegExp(`\\{\\{\\s*${key.replace(/\./g, "\\.")}\\s*\\|`).test(source.text);
      return { key, label: labelFor(key), value: isEmpty(value) ? "" : String(value), hasFallback, system: SYSTEM_KEYS.has(key) };
    });
  }, [source, data, labelFor]);

  const rules = useMemo(() => {
    const out = [];
    if (source?.doc) walkBlocks(source.doc, (b) => {
      const rule = blockRule(b);
      if (rule) out.push({ id: b.id, block: b, rule, shown: !rendered?.hiddenBlockIds?.includes(b.id) });
    });
    return out;
  }, [source, rendered]);

  if (!previewable.length) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={Eye} title="Nothing to preview yet" description="Create a campaign or a template, then preview it here as any contact." />
      </div>
    );
  }

  const byKind = (kind) => previewable.filter((s) => s.kind === kind);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <SectionCard title="Preview as">
          <div className="grid gap-4">
            <Field label="Email or message">
              <Select value={source?.id || ""} onValueChange={setSourceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose what to preview" />
                </SelectTrigger>
                <SelectContent>
                  {byKind("campaign").length ? (
                    <SelectGroup>
                      <SelectLabel>Campaigns</SelectLabel>
                      {byKind("campaign").map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  {byKind("template").length ? (
                    <SelectGroup>
                      <SelectLabel>Templates</SelectLabel>
                      {byKind("template").map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contact">
              {contacts.length ? (
                <ContactPicker contacts={contacts} value={contact?.id} onChange={setContactId} />
              ) : (
                <p className="text-sm text-text-secondary">No contacts yet. Import or add contacts in Audience to preview real data; tags show their fallbacks until then.</p>
              )}
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Merge tags" description={tags.length ? `${tags.length} in this ${source?.channel === "email" ? "email" : "message"}` : undefined} bodyPadding={!tags.length}>
          {tags.length ? (
            <ul className="divide-y divide-border">
              {tags.map((t) => (
                <li key={t.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{t.label}</p>
                    <code className="font-mono text-xs text-text-secondary">{`{{${t.key}}}`}</code>
                  </div>
                  <span className="min-w-0 max-w-[55%] text-right text-sm">
                    {t.system ? (
                      <span className="text-text-secondary">Filled at send</span>
                    ) : t.value ? (
                      <span className="line-clamp-2 break-words text-foreground">{t.value}</span>
                    ) : t.hasFallback ? (
                      <span className="text-text-secondary">Uses fallback</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> Blank, no fallback
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">This {source?.channel === "email" ? "email" : "message"} doesn&apos;t use merge tags.</p>
          )}
        </SectionCard>

        {rules.length ? (
          <SectionCard title="Display rules" description={`For ${contact?.name || "this contact"}`} bodyPadding={false}>
            <ul className="divide-y divide-border">
              {rules.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{blockLabel(r.block.type)}</p>
                    <p className="line-clamp-1 text-xs text-text-secondary">{describeCondition(r.rule, labelFor)}</p>
                  </div>
                  <Badge variant={r.shown ? "success" : "outline"}>{r.shown ? "Shown" : "Hidden"}</Badge>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <SectionCard title="Try a snippet" description="Test merge tags and fallbacks before you use them.">
          <div className="grid gap-3">
            <MergeTextField id="snippet" label="Text" value={snippet} onChange={setSnippet} groups={groups} multiline rows={3} />
            <div className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-foreground">{applyMergeTags(snippet, data) || <span className="text-text-secondary">(blank)</span>}</div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={contact ? `As ${contact.name}` : "Preview"}
        description={contact?.email || undefined}
        action={source?.doc ? <SegmentedTabs tabs={DEVICE_TABS} value={device} onChange={setDevice} buttonClassName="px-2" className="w-auto" /> : null}
      >
        {source?.doc ? (
          <div className="grid gap-4">
            <div className="grid gap-1 rounded-lg border border-border bg-surface-card px-3 py-2.5">
              <p className="text-sm font-medium text-foreground">{applyMergeTags(source.subject, data) || <span className="text-text-secondary">No subject</span>}</p>
              {source.preheader ? <p className="text-xs text-text-secondary">{applyMergeTags(source.preheader, data)}</p> : null}
            </div>
            <EmailPreviewFrame html={rendered?.html || ""} device={device} title={`${source.name} as ${contact?.name || "a contact"}`} />
          </div>
        ) : (
          <div className="whitespace-pre-wrap rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-foreground">
            {applyMergeTags(source?.body, data) || <span className="text-text-secondary">This message has no text yet.</span>}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export function PersonalizationScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { section, setSection, setTab, openRecordInTab } = useWorkspaceUrl();
  const resources = useBuilderResources(projectId);
  const [data, setData] = useState({ loadedFor: null, contacts: [], campaigns: [], templates: [] });
  const [previewSourceId, setPreviewSourceId] = useState(null);
  const tab = TAB_KEYS.has(section) ? section : "tags";
  const loading = data.loadedFor !== projectId || resources.loading;

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listContacts(projectId, { limit: CONTACT_LIMIT }), listCampaigns(projectId), listEmailTemplates(projectId)]).then(([contacts, campaigns, templates]) => {
      if (!alive) return;
      if (contacts === null || campaigns === null) toast.error("Couldn't load everything personalization needs.");
      setData({ loadedFor: projectId, contacts: contacts ?? [], campaigns: campaigns ?? [], templates: templates ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const contactData = useMemo(() => data.contacts.map((c) => ({ id: c.id, name: c.name, data: contactMergeData(c) })), [data.contacts]);
  const sources = useMemo(() => buildSources(data.campaigns, data.templates, resources.savedBlocks), [data.campaigns, data.templates, resources.savedBlocks]);

  // Merge-tag key -> ids of the emails that use it.
  const usage = useMemo(() => {
    const map = new Map();
    for (const s of sources) {
      if (s.kind === "block") continue;
      for (const key of extractMergeTags(s.text)) {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(s.id);
      }
    }
    return map;
  }, [sources]);

  const dynamicRows = useMemo(() => {
    const rows = [];
    for (const s of sources) {
      if (!s.doc) continue;
      walkBlocks(s.doc, (b) => {
        const rule = blockRule(b);
        if (!rule) return;
        rows.push({ id: `${s.kind}:${s.id}:${b.id}`, source: s, block: b, rule, snippet: blockSnippet(b), reach: contactData.filter((d) => evaluateCondition(rule, d.data)).length });
      });
    }
    return rows;
  }, [sources, contactData]);

  const stats = useMemo(() => {
    const emails = sources.filter((s) => s.kind !== "block");
    const tagged = emails.filter((s) => extractMergeTags(s.text).length).length;
    const named = contactData.filter((d) => !isEmpty(d.data.first_name)).length;
    const fieldCount = resources.groups.filter((g) => g.group !== SYSTEM_GROUP).reduce((n, g) => n + g.fields.length, 0);
    return [
      { label: "Merge fields", value: formatNumber(fieldCount) },
      { label: "Emails using merge tags", value: formatNumber(tagged) },
      { label: "Conditional blocks", value: formatNumber(dynamicRows.length) },
      { label: "Contacts with a first name", value: formatRate(rate(named, contactData.length)) },
    ];
  }, [sources, contactData, resources.groups, dynamicRows]);

  const openSource = (s) => openRecordInTab(s.id, s.kind === "block" ? "Content Blocks" : "Email Builder");
  const preview = (s) => {
    setPreviewSourceId(s.id);
    setSection("preview");
  };
  const viewSwitch = <FilterDropdown value={tab} onValueChange={(v) => setSection(v === "tags" ? null : v)} options={VIEW_OPTIONS} height="h-9" />;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Personalization"
        description="Merge tags, conditional content and a preview of any email as a real contact."
      />

      <StatsBar stats={stats} />

      {loading ? (
        <LoadingArea size={48} label="Loading personalization" panel />
      ) : (
        <>
          {contactData.length >= CONTACT_LIMIT ? (
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <UserRound className="h-3.5 w-3.5" /> Coverage and reach use the {formatNumber(CONTACT_LIMIT)} most recent contacts.
            </p>
          ) : null}
          {tab === "tags" ? <MergeTagsTab groups={resources.groups} contactData={contactData} usage={usage} onTab={setTab} canManageFields={can("campaign.contact.edit")} viewSwitch={viewSwitch} /> : null}
          {tab === "dynamic" ? (
            <DynamicContentTab rows={dynamicRows} contactCount={contactData.length} groups={resources.groups} onOpenSource={openSource} onPreview={preview} onTab={setTab} canEdit={can("campaign.campaign.edit")} viewSwitch={viewSwitch} />
          ) : null}
          {tab === "preview" ? (
            <Toolbar>
              <div className="flex items-center gap-2">{viewSwitch}</div>
            </Toolbar>
          ) : null}
          {tab === "preview" ? (
            <PreviewTab sources={sources} contacts={data.contacts} sourceId={previewSourceId} setSourceId={setPreviewSourceId} groups={resources.groups} brand={resources.brand} />
          ) : null}
        </>
      )}
    </MainScreenWrapper>
  );
}

export default PersonalizationScreen;
