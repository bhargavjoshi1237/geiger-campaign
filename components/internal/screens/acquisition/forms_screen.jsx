"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Inbox,
  ListChecks,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Rocket,
  ShieldCheck,
  Target,
  Trash2,
  LayoutTemplate,
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
  createForm,
  listAudienceLists,
  listFormSubmissions,
  listForms,
  softDeleteForm,
  updateForm,
} from "@/lib/supabase/forms";
import { getBrandKit } from "@/lib/supabase/brand_kits";
import { getUser } from "@/lib/supabase/user";
import { CONSENT_CHANNELS, CONSENT_CHANNEL_LABEL, defaultFormFields, formIssues } from "@/lib/acquisition/fields";
import { FORM_SETTINGS_DEFAULTS, publicFormView } from "@/lib/acquisition/models";
import { isHttpUrl } from "@/lib/acquisition/tracking";
import { brandCssVars } from "@/lib/content/brand";
import { PublicForm } from "@/lib/acquisition/ui/public_form";
import { FormFieldBuilder } from "./form_builder";
import {
  DESTRUCTIVE_ICON_BUTTON,
  FORM_KINDS,
  FORM_KIND_MAP,
  FORM_STATUS_MAP,
  OUTLINE_BUTTON,
  SUBMISSION_STATUS_MAP,
  filterOptions,
  formatDate,
  formatNumber,
  percent,
} from "./constants";
import { ConfigNotice, CopyField, DeleteDialog, copyText, useAcquisitionStatus } from "./shared";

const KIND_FILTER_OPTIONS = [{ value: "all", label: "All types" }, ...FORM_KINDS.map((k) => ({ value: k.value, label: k.label }))];
const STATUS_FILTER_OPTIONS = filterOptions("All statuses", FORM_STATUS_MAP);

const FORM_NAV = [
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Views, submissions and the latest people who signed up." },
  { key: "fields", label: "Fields", icon: FileText, desc: "What the form asks. Changes show in the preview as you type." },
  { key: "delivery", label: "Lists & tags", icon: ListChecks, desc: "Where new contacts land and whether they confirm by email first." },
  { key: "consent", label: "Consent", icon: ShieldCheck, desc: "What submitting opts people into, recorded with proof in the consent ledger." },
  { key: "page", label: "Hosted page", icon: LayoutTemplate, desc: "The heading, intro and thank-you behaviour for every place the form appears." },
  { key: "embed", label: "Embed & share", icon: Code2, desc: "Put the form on your site, share the hosted link or post to it from your own code." },
];

// Status-changing primary action for each form status.
const PRIMARY_ACTION = {
  draft: { label: "Publish", icon: Rocket, next: "live", toast: "Form published. It's accepting submissions." },
  live: { label: "Pause", icon: Pause, next: "paused", toast: "Form paused. New submissions are refused." },
  paused: { label: "Resume", icon: Play, next: "live", toast: "Form resumed." },
};

const toDraft = (f) => ({
  name: f.name,
  description: f.description,
  kind: f.kind,
  fields: f.fields,
  settings: { ...FORM_SETTINGS_DEFAULTS, ...f.settings },
});

const submissionsCsv = (rows, fields) => {
  const keys = fields.filter((f) => f.type !== "consent").map((f) => f.key);
  const header = ["submitted_at", "status", ...keys, "consent", "utm_source", "utm_medium", "utm_campaign", "source_url"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.createdAt,
      r.status,
      ...keys.map((k) => r.data?.[k]),
      Object.entries(r.consent || {})
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(" "),
      r.utm?.source,
      r.utm?.medium,
      r.utm?.campaign,
      r.sourceUrl,
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
};

function CreateFormDialog({ open, onOpenChange, onCreate, lists, pending }) {
  const empty = { name: "", kind: "embedded", listId: "none" };
  const [draft, setDraft] = useState(empty);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error("Give the form a name first.");
      return;
    }
    const ok = await onCreate({ name: draft.name.trim(), kind: draft.kind, listIds: draft.listId === "none" ? [] : [draft.listId] });
    if (ok) {
      setDraft(empty);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create form</DialogTitle>
          <DialogDescription>It starts as a draft with an email and first-name field. Publish it when it&apos;s ready.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Form name" htmlFor="form-name">
            <Input
              id="form-name"
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
              placeholder="e.g. Footer newsletter signup"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Mainly used as">
              <Select value={draft.kind} onValueChange={set("kind")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Add new contacts to">
              <Select value={draft.listId} onValueChange={set("listId")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No list yet</SelectItem>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
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
          <Button onClick={submit} disabled={!draft.name.trim() || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmissionsTable({ submissions, fields }) {
  const emailKey = fields.find((f) => f.type === "email")?.key;
  const phoneKey = fields.find((f) => f.type === "phone")?.key;
  const columns = [
    {
      key: "who",
      header: "Contact",
      render: (s) => {
        const name = [s.data?.first_name, s.data?.last_name].filter(Boolean).join(" ");
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{(emailKey && s.data?.[emailKey]) || (phoneKey && s.data?.[phoneKey]) || "—"}</span>
            {name ? <span className="truncate text-xs text-text-secondary">{name}</span> : null}
          </div>
        );
      },
    },
    {
      key: "source",
      header: "Source",
      className: "text-muted-foreground",
      render: (s) =>
        s.utm?.source ? (
          <span className="font-mono text-xs">
            {s.utm.source} / {s.utm.medium || "—"}
          </span>
        ) : s.landingPageId ? (
          "Landing page"
        ) : s.popupId ? (
          "Popup"
        ) : (
          "Direct"
        ),
    },
    {
      key: "consent",
      header: "Consent",
      className: "text-muted-foreground",
      render: (s) => {
        const given = Object.entries(s.consent || {})
          .filter(([, v]) => v)
          .map(([k]) => CONSENT_CHANNEL_LABEL[k] || k);
        return given.length ? given.join(", ") : "—";
      },
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (s) => <StatusPill status={s.status} map={SUBMISSION_STATUS_MAP} /> },
    { key: "at", header: "Submitted", className: "whitespace-nowrap text-muted-foreground", render: (s) => formatDate(s.createdAt, { time: true }) },
  ];
  return (
    <DataTable
      columns={columns}
      data={submissions}
      getRowKey={(s) => s.id}
      empty={
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Inbox} title="No submissions yet" description="Submissions appear here the moment someone fills in the form." />
        </div>
      }
    />
  );
}

function FormEditor({ record, projectId, lists, brand, status, baseUrl, canEdit, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const [submissions, setSubmissions] = useState(null);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setS = (key) => (value) => setDraft((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const primary = PRIMARY_ACTION[record.status] || PRIMARY_ACTION.draft;
  const s = draft.settings;

  useEffect(() => {
    let cancelled = false;
    listFormSubmissions(projectId, { formId: record.id, limit: 200 }).then((rows) => {
      if (!cancelled) setSubmissions(rows ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, record.id, record.submissionCount]);

  const issues = useMemo(() => {
    const list = formIssues(draft.fields);
    if ((s.consentChannels || []).length && !s.consentText.trim()) list.push("Add the consent statement shown above the submit button, or clear the implied consent channels.");
    if (s.redirectUrl && !isHttpUrl(s.redirectUrl)) list.push("The redirect URL must start with https://.");
    return list;
  }, [draft.fields, s.consentChannels, s.consentText, s.redirectUrl]);

  const preview = useMemo(() => publicFormView({ ...record, ...draft }), [record, draft]);
  const hostedUrl = baseUrl ? `${baseUrl}/f/${record.id}` : "";
  const embedSnippet = baseUrl ? `<div data-geiger-form="${record.id}"></div>\n<script src="${baseUrl}/embed/v1.js" async></script>` : "";
  const apiSnippet = baseUrl
    ? `POST ${baseUrl}/api/public/forms/${record.id}/submit\nContent-Type: application/json\n\n${JSON.stringify(
        { fields: Object.fromEntries(draft.fields.filter((f) => f.type !== "hidden").map((f) => [f.key, f.type === "checkbox" || f.type === "consent" ? true : f.type === "email" ? "ada@example.com" : "…"])), utm: { source: "partner" } },
        null,
        2,
      )}`
    : "";

  const save = async (patch = {}, message) => {
    const next = { ...draft, ...patch, name: draft.name.trim() || "Untitled form" };
    if ((patch.status === "live" || (record.status === "live" && !patch.status)) && issues.length) {
      toast.error(issues[0]);
      return;
    }
    setSaving(true);
    const ok = await onSave(record.id, next, message);
    setSaving(false);
    if (ok) setDraft(toDraft({ ...record, ...next }));
  };

  const listNames = (s.listIds || []).map((id) => lists.find((l) => l.id === id)?.name).filter(Boolean);
  const viewCount = record.viewCount;
  const performance = [
    { label: "Views", value: viewCount ? formatNumber(viewCount) : "—", icon: Eye, hint: viewCount ? "Times the form was shown" : "Not shown yet" },
    { label: "Submissions", value: record.submissionCount ? formatNumber(record.submissionCount) : "—", icon: Inbox, hint: record.lastSubmissionAt ? `Last ${formatDate(record.lastSubmissionAt, { time: true })}` : "None yet" },
    { label: "Conversion", value: percent(record.submissionCount, viewCount), icon: Target, hint: "Submissions per view" },
  ];

  const exportCsv = () => {
    if (!submissions?.length) return;
    const blob = new Blob([submissionsCsv(submissions, record.fields)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(record.name || "form").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Form name"
          placeholder="Untitled form"
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={FORM_STATUS_MAP}
      badges={
        <>
          <Badge variant={FORM_KIND_MAP[draft.kind]?.tone || "neutral"}>{FORM_KIND_MAP[draft.kind]?.label || draft.kind}</Badge>
          <span className="text-xs text-text-tertiary">{listNames.length ? `New contacts → ${listNames.join(", ")}` : "Not adding to a list"}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete form" className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={() => save()}>
              Save
            </Button>
            <Button onClick={() => save({ status: primary.next }, primary.toast)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <primary.icon className="h-4 w-4" />} {primary.label}
            </Button>
          </>
        ) : null
      }
      nav={FORM_NAV}
      defaultSection="performance"
    >
      {({ active }) => (
        <>
          {active === "performance" ? (
            <div className="space-y-5">
              <StatGrid stats={performance} columns={3} />
              <SectionCard
                bare
                title="Recent submissions"
                action={
                  <Button size="sm" variant="outline" className={OUTLINE_BUTTON} disabled={!submissions?.length} onClick={exportCsv}>
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </Button>
                }
              >
                {submissions === null ? <LoadingArea size={40} panel label="Loading submissions" /> : <SubmissionsTable submissions={submissions.slice(0, 50)} fields={record.fields} />}
              </SectionCard>
            </div>
          ) : null}

          {active === "fields" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                {issues.length ? (
                  <ConfigNotice title="Before this form can go live">
                    <ul className="list-disc space-y-0.5 pl-4">
                      {issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </ConfigNotice>
                ) : null}
                <FormFieldBuilder fields={draft.fields} onChange={set("fields")} disabled={!canEdit} />
              </div>
              <div className="xl:sticky xl:top-0 xl:self-start">
                <SectionCard title="Preview" description="Uses your brand kit's colour and fonts.">
                  <div className="rounded-lg border border-border bg-background p-4 text-foreground" style={brandCssVars(brand || {})}>
                    <PublicForm form={preview} preview />
                  </div>
                </SectionCard>
              </div>
            </div>
          ) : null}

          {active === "delivery" ? (
            <div className="space-y-6">
              {s.doubleOptIn && status && (!status.signingConfigured || !status.emailConfigured) ? (
                <ConfigNotice title="Confirmation emails can't be sent yet">
                  {!status.signingConfigured ? "Set CAMPAIGN_SIGNING_SECRET on the server so confirm links can be signed. " : null}
                  {!status.emailConfigured ? "Set GEIGER_EMAIL_API_KEY so the email can leave through Geiger Dash. " : null}
                  Until then, new contacts stay pending.
                </ConfigNotice>
              ) : null}
              <SectionCard bare title="Lists" description="New and existing contacts who submit are subscribed to every list ticked here.">
                {lists.length === 0 ? (
                  <p className="text-sm text-text-secondary">No lists in this project yet. Create one in Audience → Lists, then come back.</p>
                ) : (
                  <SettingsList>
                    {lists.map((l) => {
                      const checked = (s.listIds || []).includes(l.id);
                      return (
                        <SettingRow
                          key={l.id}
                          title={l.name}
                          description={l.doubleOptIn ? "This list asks for double opt-in" : undefined}
                          control={
                            <Switch
                              checked={checked}
                              disabled={!canEdit}
                              aria-label={`Add contacts to ${l.name}`}
                              onCheckedChange={(v) => setS("listIds")(v ? [...(s.listIds || []), l.id] : (s.listIds || []).filter((id) => id !== l.id))}
                            />
                          }
                        />
                      );
                    })}
                  </SettingsList>
                )}
              </SectionCard>
              <SectionCard bare title="Tags & details" description="Tags added to every contact who submits, and how your team files this form.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tags" htmlFor="fe-tags" hint="Comma-separated. Added to every contact who submits." className="sm:col-span-2">
                    <Input
                      id="fe-tags"
                      value={(s.tags || []).join(", ")}
                      onChange={(e) => setS("tags")(e.target.value.split(",").map((t) => t.trimStart()))}
                      onBlur={(e) => setS("tags")([...new Set(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))])}
                      placeholder="newsletter, website"
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Mainly used as" hint="For your own filtering; every form works embedded, hosted and in popups.">
                    <Select value={draft.kind} onValueChange={set("kind")} disabled={!canEdit}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Internal note" htmlFor="fe-desc" hint="Only your team sees this.">
                    <Input id="fe-desc" value={draft.description} onChange={(e) => set("description")(e.target.value)} placeholder="e.g. Site-wide footer opt-in" disabled={!canEdit} />
                  </Field>
                </div>
              </SectionCard>
              <SectionCard bare title="Confirmation" description="Whether new contacts confirm their email address before they're subscribed.">
                <SettingsList>
                  <SettingRow
                    title="Double opt-in"
                    description="Email a confirmation link first. Contacts and list memberships stay pending until they click it."
                    control={<Switch checked={Boolean(s.doubleOptIn)} disabled={!canEdit} aria-label="Double opt-in" onCheckedChange={setS("doubleOptIn")} />}
                  />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}

          {active === "consent" ? (
            <div className="space-y-6">
              <SectionCard bare title="Consent by submitting" description="Channels people opt into just by submitting. Show the statement so the opt-in is informed.">
                <div className="space-y-4">
                  <Field label="Consent statement" htmlFor="fe-consent" hint="Shown above the submit button and stored as proof on each consent record.">
                    <Textarea
                      id="fe-consent"
                      rows={3}
                      value={s.consentText}
                      onChange={(e) => setS("consentText")(e.target.value)}
                      placeholder="By subscribing you agree to receive marketing email from us. Unsubscribe at any time."
                      disabled={!canEdit}
                    />
                  </Field>
                  <SettingsList>
                    {CONSENT_CHANNELS.map((c) => (
                      <SettingRow
                        key={c.value}
                        title={c.label}
                        description={`Submitting records an opt-in for ${c.label.toLowerCase()}.`}
                        control={
                          <Switch
                            checked={(s.consentChannels || []).includes(c.value)}
                            disabled={!canEdit}
                            aria-label={`Implied ${c.label} consent`}
                            onCheckedChange={(v) => setS("consentChannels")(v ? [...(s.consentChannels || []), c.value] : (s.consentChannels || []).filter((x) => x !== c.value))}
                          />
                        }
                      />
                    ))}
                  </SettingsList>
                </div>
              </SectionCard>
              <SectionCard bare title="Explicit consent" description="For channels that need an unticked checkbox (SMS and WhatsApp in most markets), add a Consent field in Fields.">
                {draft.fields.filter((f) => f.type === "consent").length ? (
                  <ul className="space-y-2 text-sm">
                    {draft.fields
                      .filter((f) => f.type === "consent")
                      .map((f) => (
                        <li key={f.id} className="flex items-start justify-between gap-3">
                          <span className="text-foreground">{f.label}</span>
                          <Badge variant="neutral">{CONSENT_CHANNEL_LABEL[f.channel] || f.channel}</Badge>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-secondary">No consent checkboxes on this form.</p>
                )}
              </SectionCard>
            </div>
          ) : null}

          {active === "page" ? (
            <SectionCard bare title="Page copy" description="The heading, intro and thank-you message around the form.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Heading" htmlFor="fe-title" hint="On the hosted page. Leave blank to use the form name." className="sm:col-span-2">
                  <Input id="fe-title" value={s.title} onChange={(e) => setS("title")(e.target.value)} placeholder={draft.name} disabled={!canEdit} />
                </Field>
                <Field label="Intro" htmlFor="fe-intro" className="sm:col-span-2">
                  <Textarea id="fe-intro" rows={3} value={s.intro} onChange={(e) => setS("intro")(e.target.value)} placeholder="One or two sentences on what people get." disabled={!canEdit} />
                </Field>
                <Field label="Submit button" htmlFor="fe-submit">
                  <Input id="fe-submit" value={s.submitLabel} onChange={(e) => setS("submitLabel")(e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Redirect after submit" htmlFor="fe-redirect" hint="Optional. Otherwise the thank-you message replaces the form.">
                  <Input id="fe-redirect" value={s.redirectUrl} onChange={(e) => setS("redirectUrl")(e.target.value.trim())} placeholder="https://example.com/thanks" className="font-mono" disabled={!canEdit} />
                </Field>
                <Field label="Thank-you message" htmlFor="fe-success" className="sm:col-span-2">
                  <Textarea id="fe-success" rows={2} value={s.successMessage} onChange={(e) => setS("successMessage")(e.target.value)} disabled={!canEdit} />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "embed" ? (
            <div className="space-y-5">
              {record.status !== "live" ? (
                <ConfigNotice title="This form is a draft">Publish it before sharing — until then the link and embed show a closed message.</ConfigNotice>
              ) : null}
              {status && !status.ingestConfigured ? (
                <ConfigNotice title="Submissions can't be received on this deployment">Set SUPABASE_SERVICE_ROLE_KEY on the server so public submissions can be stored.</ConfigNotice>
              ) : null}
              <SectionCard
                title="Hosted page"
                action={
                  hostedUrl ? (
                    <Button size="sm" variant="outline" className={OUTLINE_BUTTON} asChild>
                      <a href={hostedUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                    </Button>
                  ) : null
                }
              >
                <CopyField value={hostedUrl} copyMessage="Form link copied." />
              </SectionCard>
              <SectionCard title="Embed on your site" description="Paste where the form should appear. The script is tiny, has no dependencies and loads asynchronously.">
                <CopyField value={embedSnippet} copyMessage="Embed code copied." />
              </SectionCard>
              <SectionCard title="Post from your own code" description="Your own form can submit here directly. The same validation, lists, consent and webhooks apply.">
                <CopyField value={apiSnippet} copyMessage="Request copied." />
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function FormsScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canEdit = useCan("campaign.acquisition.edit");
  const { status, baseUrl } = useAcquisitionStatus(projectId);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState([]);
  const [brand, setBrand] = useState(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    Promise.all([listForms(projectId), listAudienceLists(projectId), getBrandKit(projectId)]).then(([rows, listRows, kit]) => {
      if (cancelled) return;
      if (rows === null) toast.error("Couldn't load forms.");
      setForms(rows ?? []);
      setLists(listRows ?? []);
      setBrand(kit);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms.filter(
      (f) =>
        (kindFilter === "all" || f.kind === kindFilter) &&
        (statusFilter === "all" || f.status === statusFilter) &&
        (!q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)),
    );
  }, [forms, search, kindFilter, statusFilter]);

  const stats = useMemo(() => {
    const live = forms.filter((f) => f.status === "live").length;
    const submissions = forms.reduce((s, f) => s + f.submissionCount, 0);
    const viewed = forms.filter((f) => f.viewCount > 0);
    return [
      { label: "Forms", value: formatNumber(forms.length) },
      { label: "Live", value: formatNumber(live) },
      { label: "Submissions", value: formatNumber(submissions) },
      { label: "Conversion", value: percent(viewed.reduce((s, f) => s + f.submissionCount, 0), viewed.reduce((s, f) => s + f.viewCount, 0)) },
    ];
  }, [forms]);

  const pager = usePagination(filtered, { resetKey: `${search}|${kindFilter}|${statusFilter}` });

  const handleCreate = async ({ name, kind, listIds }) => {
    setCreating(true);
    const user = await getUser().catch(() => null);
    const row = await createForm(projectId, {
      id: crypto.randomUUID(),
      name,
      kind,
      status: "draft",
      fields: defaultFormFields(),
      settings: { ...FORM_SETTINGS_DEFAULTS, listIds },
      createdBy: user?.id ?? null,
    });
    setCreating(false);
    if (!row) {
      toast.error("Couldn't create the form.");
      return false;
    }
    setForms((p) => [row, ...p]);
    openRecord(row.id);
    return true;
  };

  // Optimistic: apply locally, persist, roll back on failure.
  const handleSave = async (id, patch, message = "Form saved.") => {
    const before = forms.find((f) => f.id === id);
    setForms((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const saved = await updateForm(id, patch);
    if (!saved) {
      setForms((p) => p.map((f) => (f.id === id ? before : f)));
      toast.error("Couldn't save the form.");
      return false;
    }
    setForms((p) => p.map((f) => (f.id === id ? saved : f)));
    toast.success(message);
    return true;
  };

  const handleDuplicate = async (f) => {
    const user = await getUser().catch(() => null);
    const copy = await createForm(projectId, {
      id: crypto.randomUUID(),
      name: `${f.name} (copy)`,
      description: f.description,
      kind: f.kind,
      status: "draft",
      fields: f.fields,
      settings: f.settings,
      createdBy: user?.id ?? null,
    });
    if (!copy) {
      toast.error("Couldn't duplicate the form.");
      return;
    }
    setForms((p) => [copy, ...p]);
    toast.success("Form duplicated as a draft.");
  };

  const quickStatus = async (f, next) => {
    if (next === "live" && formIssues(f.fields).length) {
      toast.error(formIssues(f.fields)[0]);
      return;
    }
    await handleSave(f.id, { status: next }, PRIMARY_ACTION[f.status]?.toast);
  };

  const handleDelete = async (f) => {
    setDeleting(true);
    const ok = await softDeleteForm(f.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error("Couldn't delete the form.");
      return;
    }
    setForms((p) => p.filter((x) => x.id !== f.id));
    if (recordId === f.id) closeRecord();
    toast.success(`Deleted "${f.name}".`);
  };

  const embedFor = (f) => (baseUrl ? `<div data-geiger-form="${f.id}"></div>\n<script src="${baseUrl}/embed/v1.js" async></script>` : "");

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      noun="form"
      name={deleteTarget?.name}
      consequence="Embeds and the hosted link stop accepting submissions. Existing contacts and submissions are kept."
      pending={deleting}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = forms.find((f) => f.id === recordId);
  if (open) {
    return (
      <>
        <FormEditor
          key={open.id}
          record={open}
          projectId={projectId}
          lists={lists}
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

  const filtersActive = search || kindFilter !== "all" || statusFilter !== "all";

  const columns = [
    {
      key: "form",
      header: "Form",
      render: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{f.name}</span>
          <span className="truncate text-xs text-text-secondary">
            {f.description || `${f.fields.length} field${f.fields.length === 1 ? "" : "s"}`}
          </span>
        </div>
      ),
    },
    { key: "kind", header: "Type", render: (f) => <Badge variant={FORM_KIND_MAP[f.kind]?.tone || "neutral"}>{FORM_KIND_MAP[f.kind]?.label || f.kind}</Badge> },
    { key: "submissions", header: "Submissions", className: "tabular-nums text-muted-foreground", render: (f) => (f.submissionCount ? formatNumber(f.submissionCount) : "—") },
    {
      key: "conversion",
      header: "Conversion",
      render: (f) =>
        f.viewCount > 0 ? (
          <div className="w-[120px] space-y-1.5">
            <Progress value={Math.min(100, (f.submissionCount / f.viewCount) * 100)} className="h-1.5 bg-surface-hover" />
            <p className="text-xs tabular-nums text-text-secondary">{percent(f.submissionCount, f.viewCount)}</p>
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (f) => <StatusPill status={f.status} map={FORM_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (f) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${f.name}`}
            items={[
              { label: canEdit ? "Edit" : "Open", icon: Pencil, onSelect: () => openRecord(f.id) },
              canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(f) },
              canEdit && f.status === "live" && { label: "Pause", icon: Pause, onSelect: () => quickStatus(f, "paused") },
              canEdit && f.status !== "live" && { label: f.status === "draft" ? "Publish" : "Resume", icon: f.status === "draft" ? Rocket : Play, onSelect: () => quickStatus(f, "live") },
              { label: "Copy embed code", icon: Code2, onSelect: () => copyText(embedFor(f), "Embed code copied.") },
              { label: "Open hosted page", icon: ExternalLink, href: baseUrl ? `${baseUrl}/f/${f.id}` : undefined, disabled: !baseUrl },
              canEdit && { separator: true },
              canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(f) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Forms"
        description="Capture leads with embedded, popup and hosted signup forms."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New form
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={kindFilter} onValueChange={setKindFilter} options={KIND_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search forms…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} panel label="Loading forms" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(f) => f.id}
            onRowClick={(f) => openRecord(f.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={FileText}
                  title={filtersActive ? "No matches" : "No forms yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a form to start turning visitors into contacts."}
                  action={
                    filtersActive ? (
                      <Button
                        variant="outline"
                        className={OUTLINE_BUTTON}
                        onClick={() => {
                          setSearch("");
                          setKindFilter("all");
                          setStatusFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New form
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="forms" />
        </div>
      )}

      <CreateFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} lists={lists} pending={creating} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default FormsScreen;
