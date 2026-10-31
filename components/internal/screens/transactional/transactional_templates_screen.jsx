"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  FileCode,
  Pencil,
  Copy,
  Send,
  Power,
  PowerOff,
  Trash2,
  FileText,
  Mail,
  Braces,
  Eye,
  Code,
  Loader2,
  X,
  Wand2,
  Download,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { listDeliveries } from "@/lib/supabase/deliveries";
import {
  createTransactionalTemplate,
  listTransactionalTemplates,
  softDeleteTransactionalTemplate,
  updateTransactionalTemplate,
} from "@/lib/supabase/transactional_templates";
import { detectVariables, renderTransactional, sampleData } from "@/lib/channels/transactional_render";
import {
  Button,
  Checkbox,
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
  Textarea,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  StatsBar,
  StatusPill,
  SectionCard,
  SettingsList,
  SettingRow,
  SegmentedTabs,
  InlineTitleInput,
} from "@geiger/ui";
import {
  CodeBlock,
  DANGER_ICON_BUTTON,
  DeleteConfirmDialog,
  ListEmptyState,
  OUTLINE_BUTTON,
  SectionLoading,
  TRANSACTIONAL_MANAGE,
  useChannelStatus,
  formatRelative,
  useNow,
} from "@/components/internal/screens/channels/channels_kit";

// Transactional email templates referenced by `key` from POST /api/v1/messages. HTML with merge tags, or
// an Email Builder block document copied from a campaign; the variable schema documents and validates
// the data API callers send. Preview renders with the same code the API uses.

const CATEGORIES = {
  welcome: { label: "Welcome", tone: "success" },
  password_reset: { label: "Password reset", tone: "warning" },
  receipt: { label: "Receipt", tone: "info" },
  verification: { label: "Verification", tone: "purple" },
  shipping: { label: "Shipping update", tone: "neutral" },
  notification: { label: "Notification", tone: "neutral" },
  other: { label: "Other", tone: "neutral" },
};

const STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  draft: { label: "Draft", variant: "neutral" },
  inactive: { label: "Inactive", variant: "warning" },
};

const TYPE_FILTER_OPTIONS = [{ value: "all", label: "All categories" }, ...Object.entries(CATEGORIES).map(([value, c]) => ({ value, label: c.label }))];
const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_MAP).map(([value, s]) => ({ value, label: s.label }))];

const TEMPLATE_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name, API key, category, sender and whether it can send." },
  { key: "content", label: "Content", icon: Mail, desc: "Subject, preheader and the HTML or block design." },
  { key: "variables", label: "Variables", icon: Braces, desc: "The data API callers send, with sample values for previews." },
  { key: "preview", label: "Preview", icon: Eye, desc: "Rendered with the sample data, exactly as the API sends it." },
  { key: "api", label: "API", icon: Code, desc: "A ready-to-run request for this template." },
];

const STARTER_HTML = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <p>Hi {{first_name|there}},</p>
    <p>Your order <strong>{{order_id}}</strong> is confirmed.</p>
  </body>
</html>`;

const toKey = (name) => name.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 64);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CategorySelect({ value, onValueChange, disabled }) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {Object.entries(CATEGORIES).map(([v, c]) => (
          <SelectItem key={v} value={v}>{c.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateTemplateDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", key: "", category: "receipt", subject: "" });
  const [keyTouched, setKeyTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v, ...(k === "name" && !keyTouched ? { key: toKey(v) } : {}) }));
  const submit = async () => {
    if (!form.name.trim() || !form.key) {
      toast.error("Give the template a name and an API key.");
      return;
    }
    setPending(true);
    const ok = await onCreate({ ...form, name: form.name.trim(), key: toKey(form.key), subject: form.subject.trim() });
    setPending(false);
    if (ok) {
      setForm({ name: "", key: "", category: "receipt", subject: "" });
      setKeyTouched(false);
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>Starts as a draft with starter HTML. Activate it once the content is ready.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Template name" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Order receipt" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="API key" htmlFor="t-key" hint="Callers send this as `template`.">
              <Input
                id="t-key"
                value={form.key}
                onChange={(e) => {
                  setKeyTouched(true);
                  set("key")(toKey(e.target.value));
                }}
                placeholder="order_receipt"
                className="font-mono"
              />
            </Field>
            <Field label="Category">
              <CategorySelect value={form.category} onValueChange={set("category")} />
            </Field>
          </div>
          <Field label="Subject" htmlFor="t-subject">
            <Input id="t-subject" value={form.subject} onChange={(e) => set("subject")(e.target.value)} placeholder="Your order {{order_id}} is confirmed" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !form.name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({ template, onOpenChange, onSend, defaultTo }) {
  const [to, setTo] = useState(defaultTo || "");
  const [pending, setPending] = useState(false);
  const send = async () => {
    if (!EMAIL.test(to.trim())) {
      toast.error("Enter an email address.");
      return;
    }
    setPending(true);
    const ok = await onSend(template, to.trim());
    setPending(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={Boolean(template)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test</DialogTitle>
          <DialogDescription>
            Renders <span className="font-medium text-foreground">{template?.name}</span> with its sample data and sends it through Geiger Dash.
          </DialogDescription>
        </DialogHeader>
        <Field label="Send to" htmlFor="tt-to">
          <Input id="tt-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange, projectId, onImport }) {
  const [campaigns, setCampaigns] = useState(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!open || campaigns) return undefined;
    let alive = true;
    listCampaigns(projectId).then((rows) => {
      if (alive) setCampaigns((rows ?? []).filter((c) => c.channel === "email" && Array.isArray(c.content?.blocks) && c.content.blocks.length));
    });
    return () => {
      alive = false;
    };
  }, [open, campaigns, projectId]);
  const campaign = campaigns?.find((c) => c.id === selected);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Use a campaign design</DialogTitle>
          <DialogDescription>Copies the campaign&apos;s Email Builder blocks into this template. Later edits to the campaign don&apos;t carry over.</DialogDescription>
        </DialogHeader>
        {!campaigns ? (
          <SectionLoading label="Loading campaigns" size={36} />
        ) : campaigns.length ? (
          <Field label="Campaign">
            <Select value={selected || undefined} onValueChange={setSelected}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a campaign" /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-text-secondary">No email campaigns with an Email Builder design yet.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!campaign}
            onClick={() => {
              onImport(campaign);
              onOpenChange(false);
            }}
          >
            <Download className="h-4 w-4" /> Copy design
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (t) => ({
  name: t.name,
  key: t.key,
  category: t.category,
  status: t.status,
  fromName: t.fromName,
  fromEmail: t.fromEmail,
  subject: t.subject,
  preheader: t.preheader,
  format: t.format,
  html: t.html,
  content: t.content,
  variables: t.variables,
});

const CONTENT_KEYS = ["subject", "preheader", "format", "html", "content"];

function curlFor(url, draft) {
  const data = sampleData(draft);
  const body = JSON.stringify({ to: "customer@example.com", template: draft.key, data }, null, 2).replace(/'/g, "'\\''");
  return `curl -X POST ${url || "https://…/api/v1/messages"} \\
  -H "Authorization: Bearer $GEIGER_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-48213-receipt" \\
  -d '${body}'`;
}

function TemplateEditor({ record, projectId, canManage, now, apiUrl, onBack, onSave, onDelete, onTest }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const locked = !canManage;
  const preview = useMemo(() => renderTransactional(draft, sampleData(draft)), [draft]);

  const save = async () => {
    if (!draft.name.trim() || !draft.key) {
      toast.error("A template needs a name and an API key.");
      return;
    }
    if (draft.fromEmail && !EMAIL.test(draft.fromEmail)) {
      toast.error("The from address isn't a valid email.");
      return;
    }
    const contentChanged = CONTENT_KEYS.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(record[k]));
    setSaving(true);
    await onSave(record.id, { ...draft, name: draft.name.trim(), version: contentChanged ? record.version + 1 : record.version });
    setSaving(false);
  };

  const detect = () => {
    const keys = detectVariables(draft.subject, draft.preheader, draft.format === "html" ? draft.html : JSON.stringify(draft.content));
    const known = new Set(draft.variables.map((v) => v.key));
    const added = keys.filter((k) => !known.has(k)).map((key) => ({ key, label: key.replace(/[._]/g, " "), required: false, sample: "" }));
    if (!added.length) {
      toast.success("Every merge tag in the content is already listed.");
      return;
    }
    set("variables")([...draft.variables, ...added]);
    toast.success(`Added ${added.length} variable${added.length === 1 ? "" : "s"} from the content.`);
  };
  const updateVar = (i, patch) => set("variables")(draft.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const importCampaign = (campaign) => {
    setDraft((d) => ({ ...d, format: "blocks", content: campaign.content, subject: d.subject || campaign.subject, preheader: d.preheader || campaign.preheader }));
    toast.success(`Copied the design from “${campaign.name}”. Save to keep it.`);
  };
  const convertToHtml = () => {
    setDraft((d) => ({ ...d, format: "html", html: renderTransactional({ ...d, format: "blocks" }, {}).html }));
    toast.success("Converted to HTML — merge tags stay in place.");
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Template name"
          placeholder="Untitled template"
          disabled={locked}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={draft.status}
      statusMap={STATUS_MAP}
      badges={
        <>
          <Badge variant={CATEGORIES[draft.category]?.tone || "neutral"}>{CATEGORIES[draft.category]?.label || draft.category}</Badge>
          <span className="font-mono text-xs text-text-tertiary">{draft.key}</span>
          <span className="text-xs text-text-tertiary">· v{record.version} · updated {formatRelative(record.updatedAt, now)}</span>
        </>
      }
      actions={
        <>
          {canManage ? (
            <Button variant="ghost" size="icon" aria-label="Delete template" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={dirty} onClick={() => onTest(record)}>
            <Send className="h-4 w-4" /> Send test
          </Button>
          {canManage ? (
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          ) : null}
        </>
      }
      nav={TEMPLATE_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Name & sender" description="How the template is named and called, who it's sent from and whether it can send.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Template name" htmlFor="te-name">
                  <Input id="te-name" value={draft.name} disabled={locked} onChange={(e) => set("name")(e.target.value)} />
                </Field>
                <Field label="API key" htmlFor="te-key" hint="Changing it breaks callers that use the old key.">
                  <Input id="te-key" value={draft.key} disabled={locked} onChange={(e) => set("key")(toKey(e.target.value))} className="font-mono" />
                </Field>
                <Field label="Category">
                  <CategorySelect value={draft.category} onValueChange={set("category")} disabled={locked} />
                </Field>
                <div />
                <Field label="From name" htmlFor="te-fname" hint="Optional — falls back to the Email channel's default sender.">
                  <Input id="te-fname" value={draft.fromName} disabled={locked} onChange={(e) => set("fromName")(e.target.value)} placeholder="Halcyon Studio" />
                </Field>
                <Field label="From address" htmlFor="te-femail">
                  <Input id="te-femail" type="email" value={draft.fromEmail} disabled={locked} onChange={(e) => set("fromEmail")(e.target.value.trim())} placeholder="receipts@halcyon.studio" />
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Active"
                  description="Only active templates can be sent through the API; drafts and inactive ones answer 409."
                  control={
                    <Button
                      variant="outline"
                      size="sm"
                      className={OUTLINE_BUTTON}
                      disabled={locked}
                      onClick={() => set("status")(draft.status === "active" ? "inactive" : "active")}
                    >
                      {draft.status === "active" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      {draft.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  }
                />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "content" ? (
            <SectionCard bare title="Message" description="The subject, preheader and the HTML or block design." contentClassName="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Subject" htmlFor="te-subject" hint="Merge tags allowed: {{order_id}}.">
                  <Input id="te-subject" value={draft.subject} disabled={locked} onChange={(e) => set("subject")(e.target.value)} />
                </Field>
                <Field label="Preheader" htmlFor="te-pre" hint="Inbox preview text after the subject.">
                  <Input id="te-pre" value={draft.preheader} disabled={locked} onChange={(e) => set("preheader")(e.target.value)} />
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SegmentedTabs
                  tabs={[
                    { value: "html", label: "HTML" },
                    { value: "blocks", label: "Email Builder blocks" },
                  ]}
                  value={draft.format}
                  onChange={locked ? undefined : set("format")}
                />
                {canManage ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setImportOpen(true)}>
                      <Download className="h-4 w-4" /> Use a campaign design
                    </Button>
                    {draft.format === "blocks" && draft.content?.blocks?.length ? (
                      <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={convertToHtml}>
                        <Code className="h-4 w-4" /> Convert to HTML
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {draft.format === "html" ? (
                <Field label="HTML" htmlFor="te-html" hint="Values sent in `data` are HTML-escaped when merged.">
                  <Textarea id="te-html" value={draft.html} disabled={locked} onChange={(e) => set("html")(e.target.value)} className="min-h-80 font-mono text-xs" spellCheck={false} />
                </Field>
              ) : draft.content?.blocks?.length ? (
                <p className="rounded-lg border border-border bg-surface-card px-4 py-3 text-sm text-text-secondary">
                  {draft.content.blocks.length} Email Builder block{draft.content.blocks.length === 1 ? "" : "s"}. Check the Preview section; to edit the
                  markup, convert to HTML.
                </p>
              ) : (
                <p className="rounded-lg border border-border bg-surface-card px-4 py-3 text-sm text-text-secondary">
                  No block design yet — copy one from an email campaign built in the Email Builder.
                </p>
              )}
            </SectionCard>
          ) : null}

          {active === "variables" ? (
            <SectionCard bare title="Merge data" description="The values API callers pass in, with samples used for previews." contentClassName="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-text-secondary">Required variables are checked on every API send; missing ones answer 422.</p>
                {canManage ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={detect}>
                      <Wand2 className="h-4 w-4" /> Detect from content
                    </Button>
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => set("variables")([...draft.variables, { key: "", label: "", required: false, sample: "" }])}>
                      <Plus className="h-4 w-4" /> Add variable
                    </Button>
                  </div>
                ) : null}
              </div>
              {draft.variables.length ? (
                <div className="space-y-2">
                  {draft.variables.map((v, i) => (
                    <div key={i} className="grid items-end gap-3 rounded-lg border border-border bg-surface-card p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
                      <Field label="Key" htmlFor={`tv-k-${i}`}>
                        <Input id={`tv-k-${i}`} value={v.key} disabled={locked} onChange={(e) => updateVar(i, { key: e.target.value.replace(/[^\w.]/g, "") })} className="font-mono" placeholder="order_id" />
                      </Field>
                      <Field label="Label" htmlFor={`tv-l-${i}`}>
                        <Input id={`tv-l-${i}`} value={v.label} disabled={locked} onChange={(e) => updateVar(i, { label: e.target.value })} placeholder="Order number" />
                      </Field>
                      <Field label="Sample" htmlFor={`tv-s-${i}`}>
                        <Input id={`tv-s-${i}`} value={v.sample} disabled={locked} onChange={(e) => updateVar(i, { sample: e.target.value })} placeholder="48213" />
                      </Field>
                      <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox checked={Boolean(v.required)} disabled={locked} onCheckedChange={(on) => updateVar(i, { required: Boolean(on) })} aria-label={`${v.key || "Variable"} required`} />
                        Required
                      </label>
                      {canManage ? (
                        <Button variant="ghost" size="icon" aria-label={`Remove ${v.key || "variable"}`} className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => set("variables")(draft.variables.filter((_, j) => j !== i))}>
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No variables yet. Detect them from the merge tags in the content, or add them by hand.</p>
              )}
            </SectionCard>
          ) : null}

          {active === "preview" ? (
            <SectionCard contentClassName="space-y-3">
              <div className="text-sm">
                <span className="text-text-secondary">Subject </span>
                <span className="font-medium text-foreground">{preview.subject || "—"}</span>
              </div>
              <iframe
                title="Template preview"
                sandbox=""
                srcDoc={`<div style="background:white;min-height:100vh">${preview.html}</div>`}
                className="h-[600px] w-full rounded-lg border border-border"
              />
            </SectionCard>
          ) : null}

          {active === "api" ? (
            <SectionCard contentClassName="space-y-3">
              <p className="text-sm text-text-secondary">Send this template from your server with a secret key that has the messages:send scope.</p>
              <CodeBlock label="request">{curlFor(apiUrl, draft)}</CodeBlock>
            </SectionCard>
          ) : null}
          <ImportDialog open={importOpen} onOpenChange={setImportOpen} projectId={projectId} onImport={importCampaign} />
        </>
      )}
    </EditorShell>
  );
}

export function TransactionalTemplatesScreen() {
  const [templates, setTemplates] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [testTarget, setTestTarget] = useState(null);
  const [myEmail, setMyEmail] = useState("");
  const { recordId, openRecord, closeRecord, projectId } = useWorkspaceUrl();
  const { status } = useChannelStatus();
  const canManage = useCan(TRANSACTIONAL_MANAGE);
  const now = useNow();

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([
      listTransactionalTemplates(projectId),
      listDeliveries(projectId, { sourceType: "transactional", since: new Date(now - 30 * 86_400_000).toISOString(), limit: 5000 }),
    ]).then(([rows, sends]) => {
      if (!alive) return;
      setTemplates(rows ?? []);
      setDeliveries(sends ?? []);
      setLoading(false);
    });
    getUser().then((u) => alive && setMyEmail(u?.email || ""));
    return () => {
      alive = false;
    };
  }, [projectId, now]);

  const sendsByTemplate = useMemo(() => {
    const map = new Map();
    for (const d of deliveries) if (d.sourceId) map.set(d.sourceId, (map.get(d.sourceId) || 0) + 1);
    return map;
  }, [deliveries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (typeFilter !== "all" && t.category !== typeFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !`${t.name} ${t.key} ${t.subject}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, query, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const failed = deliveries.filter((d) => ["failed", "bounced", "not_sent"].includes(d.status)).length;
    return [
      { label: "Templates", value: templates.length.toLocaleString("en-US") },
      { label: "Active", value: templates.filter((t) => t.status === "active").length.toLocaleString("en-US"), footer: "callable from the API" },
      { label: "API sends", value: deliveries.length.toLocaleString("en-US"), footer: "last 30 days" },
      { label: "Failed", value: failed.toLocaleString("en-US"), footer: deliveries.length ? `${Math.round((failed / deliveries.length) * 100)}% of sends` : "no sends yet" },
    ];
  }, [templates, deliveries]);

  const pager = usePagination(filtered, { resetKey: `${query}|${typeFilter}|${statusFilter}` });
  const replace = (row) => setTemplates((prev) => prev.map((t) => (t.id === row.id ? row : t)));

  const handleCreate = async (form) => {
    const optimistic = {
      id: crypto.randomUUID(),
      ...form,
      status: "draft",
      format: "html",
      html: STARTER_HTML,
      preheader: "",
      fromName: "",
      fromEmail: "",
      content: {},
      variables: [
        { key: "first_name", label: "First name", required: false, sample: "Ava" },
        { key: "order_id", label: "Order number", required: true, sample: "48213" },
      ],
      version: 1,
    };
    setTemplates((prev) => [{ ...optimistic, updatedAt: new Date().toISOString() }, ...prev]);
    const created = await createTransactionalTemplate(projectId, optimistic);
    if (!created) {
      setTemplates((prev) => prev.filter((t) => t.id !== optimistic.id));
      toast.error("Couldn't create the template — that API key may already be in use.");
      return false;
    }
    replace(created);
    openRecord(created.id);
    return true;
  };

  const handleSave = async (id, patch) => {
    const previous = templates.find((t) => t.id === id);
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const saved = await updateTransactionalTemplate(id, patch);
    if (!saved) {
      setTemplates((prev) => prev.map((t) => (t.id === id ? previous : t)));
      toast.error("Couldn't save — the API key may already be used by another template.");
      return;
    }
    replace(saved);
    toast.success("Template saved.");
  };

  const handleDuplicate = async (t) => {
    const copy = { ...t, id: crypto.randomUUID(), name: `${t.name} (copy)`, key: `${t.key}_copy`.slice(0, 64), status: "draft", version: 1 };
    setTemplates((prev) => [{ ...copy, updatedAt: new Date().toISOString() }, ...prev]);
    const created = await createTransactionalTemplate(projectId, copy);
    if (!created) {
      setTemplates((prev) => prev.filter((x) => x.id !== copy.id));
      toast.error("Couldn't duplicate — the copy's API key is taken.");
      return;
    }
    replace(created);
    toast.success("Template duplicated as a draft.");
  };

  const setStatus = async (t, next) => {
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    const saved = await updateTransactionalTemplate(t.id, { status: next });
    if (!saved) {
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      return toast.error("Couldn't change the status.");
    }
    replace(saved);
    toast.success(`“${t.name}” ${next === "active" ? "activated" : "deactivated"}.`);
  };

  const handleDelete = async (t) => {
    setDeleteTarget(null);
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    if (t.id === recordId) closeRecord();
    if (!(await softDeleteTransactionalTemplate(t.id))) {
      setTemplates((prev) => [t, ...prev]);
      return toast.error("Couldn't delete the template.");
    }
    toast.success(`Deleted “${t.name}”.`);
  };

  const sendTest = async (t, to) => {
    const res = await apiPost(`/api/projects/${projectId}/transactional/templates/${t.id}/test`, { to });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (res.data.status === "sent") toast.success(`Test sent to ${to}.`);
    else toast.error(res.data.error || "The test wasn't sent.");
    return res.data.status === "sent";
  };

  const dialogs = (
    <>
      <DeleteConfirmDialog target={deleteTarget} title="Delete template" name={deleteTarget?.name} description="API sends that reference its key will answer 404." onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      <TestDialog key={testTarget?.id || "none"} template={testTarget} defaultTo={myEmail} onOpenChange={(o) => !o && setTestTarget(null)} onSend={sendTest} />
    </>
  );

  const open = templates.find((t) => t.id === recordId);
  if (open) {
    return (
      <>
        <TemplateEditor
          key={`${open.id}:${open.updatedAt}`}
          record={open}
          projectId={projectId}
          canManage={canManage}
          now={now}
          apiUrl={status?.urls?.messagesApi}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onTest={setTestTarget}
        />
        {dialogs}
      </>
    );
  }

  const filtersActive = query || typeFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "template",
      header: "Template",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <FileCode className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{t.name}</span>
            <span className="truncate font-mono text-xs text-text-secondary">{t.key}</span>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (t) => <Badge variant={CATEGORIES[t.category]?.tone || "neutral"}>{CATEGORIES[t.category]?.label || t.category}</Badge> },
    { key: "format", header: "Format", className: "whitespace-nowrap text-muted-foreground", render: (t) => (t.format === "blocks" ? "Blocks" : "HTML") },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (t) => <StatusPill status={t.status} map={STATUS_MAP} /> },
    { key: "sends", header: "Sends (30d)", align: "right", className: "tabular-nums text-muted-foreground", render: (t) => (sendsByTemplate.get(t.id) || 0).toLocaleString("en-US") },
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (t) => `v${t.version} · ${formatRelative(t.updatedAt, now)}` },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.name}`}
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openRecord(t.id) },
            { label: "Send test", icon: Send, onSelect: () => setTestTarget(t) },
            canManage && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(t) },
            canManage &&
              (t.status === "active"
                ? { label: "Deactivate", icon: PowerOff, onSelect: () => setStatus(t, "inactive") }
                : { label: "Activate", icon: Power, onSelect: () => setStatus(t, "active") }),
            canManage && { separator: true },
            canManage && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(t) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Transactional Templates"
        description="Receipts, password resets and other system email your servers send through the Email API."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New template
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates…" />
      </Toolbar>

      {loading ? (
        <SectionLoading label="Loading templates" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(t) => t.id}
            onRowClick={(t) => openRecord(t.id)}
            empty={
              <ListEmptyState
                icon={FileCode}
                filtersActive={filtersActive}
                onClear={clearFilters}
                title="No templates yet"
                description="Create a template for receipts, password resets or any other email your app sends."
                action={
                  canManage ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> New template
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="templates" />
        </div>
      )}

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {dialogs}
    </MainScreenWrapper>
  );
}

export default TransactionalTemplatesScreen;
