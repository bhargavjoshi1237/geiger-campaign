"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  MessageCircle,
  Pencil,
  Copy,
  Trash2,
  FileText,
  Settings2,
  ListChecks,
  MousePointerClick,
  Loader2,
  RefreshCw,
  KeyRound,
  Unplug,
  PlugZap,
  Send,
  UploadCloud,
  X,
  Link2,
  Phone,
  Reply,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import { apiDelete, apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { normalizeConnection } from "@/lib/supabase/channel_connections";
import {
  createMessageTemplate,
  listMessageTemplates,
  normalizeMessageTemplate,
  softDeleteMessageTemplate,
  updateMessageTemplate,
} from "@/lib/supabase/message_templates";
import {
  EMPTY_TEMPLATE_DRAFT,
  QUALITY_RATINGS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  componentsFromDraft,
  draftFromTemplate,
  languageLabel,
  messagingTierLabel,
  rejectionCopy,
  renderTemplatePreview,
  sampleVariables,
  validateTemplateDraft,
  variableCount,
} from "@/lib/channels/whatsapp_templates";
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
  Switch,
  InlineTitleInput,
} from "@geiger/ui";
import {
  CHANNEL_MANAGE,
  CONNECTION_STATUS_MAP,
  DANGER_ICON_BUTTON,
  DeleteConfirmDialog,
  DisconnectDialog,
  ListEmptyState,
  NotConnectedCard,
  OUTLINE_BUTTON,
  PRIMARY_BUTTON,
  RecentDeliveries,
  SectionLoading,
  formatDate,
  formatRelative,
  useChannelConnection,
  useNow,
} from "./channels_kit";

// WhatsApp Business Platform (Meta Cloud API): number health fetched live, and the template composer —
// header/body/footer/buttons with sample values, category and language — submitted to Meta for review,
// synced back with rejection reasons. Free-form messages are only allowed inside the 24-hour window.

const CATEGORY_TONE = { marketing: "info", utility: "neutral", authentication: "purple" };
const categoryLabel = (c) => TEMPLATE_CATEGORIES.find((x) => x.value === c)?.label || c;

const STATUS_MAP = {
  draft: { label: "Draft", variant: "neutral" },
  pending: { label: "In review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
  paused: { label: "Paused", variant: "warning" },
  disabled: { label: "Disabled", variant: "danger" },
};

const CATEGORY_FILTER_OPTIONS = [{ value: "all", label: "All categories" }, ...TEMPLATE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))];
const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_MAP).map(([value, s]) => ({ value, label: s.label }))];

const TEMPLATE_NAV = [
  { key: "content", label: "Content", icon: FileText, desc: "Header, body with variables and sample values, and footer." },
  { key: "buttons", label: "Buttons", icon: MousePointerClick, desc: "Quick replies, website and call buttons." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "Category and language Meta reviews it under." },
  { key: "review", label: "Review", icon: ListChecks, desc: "Policy checks, submission and Meta's decision." },
];

const BUTTON_TYPES = [
  { value: "quick_reply", label: "Quick reply", icon: Reply },
  { value: "url", label: "Website", icon: Link2 },
  { value: "phone", label: "Call", icon: Phone },
];

// Template names are lowercase with underscores.
const toTemplateName = (name) => name.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");

function OptionSelect({ value, onValueChange, options, disabled, placeholder }) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const LANGUAGE_OPTIONS = TEMPLATE_LANGUAGES.map((l) => ({ value: l.code, label: l.label }));
const CATEGORY_OPTIONS = TEMPLATE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));

function ConnectWhatsAppDialog({ open, onOpenChange, onConnect, updating }) {
  const [form, setForm] = useState({ accessToken: "", phoneNumberId: "", wabaId: "" });
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setPending(true);
    const ok = await onConnect({
      accessToken: form.accessToken.trim(),
      phoneNumberId: form.phoneNumberId.trim(),
      wabaId: form.wabaId.trim(),
    });
    setPending(false);
    if (ok) {
      setForm({ accessToken: "", phoneNumberId: "", wabaId: "" });
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{updating ? "Update WhatsApp credentials" : "Connect WhatsApp"}</DialogTitle>
          <DialogDescription>
            Use a system user token from Meta Business Settings with whatsapp_business_messaging and whatsapp_business_management. It&apos;s checked against
            the Cloud API and stored server-side.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Access token" htmlFor="wa-token">
            <Input id="wa-token" type="password" value={form.accessToken} onChange={(e) => set("accessToken")(e.target.value)} className="font-mono" autoComplete="off" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone number ID" htmlFor="wa-phone" hint="WhatsApp Manager → Phone numbers.">
              <Input id="wa-phone" inputMode="numeric" value={form.phoneNumberId} onChange={(e) => set("phoneNumberId")(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Business account ID" htmlFor="wa-waba" hint="The WABA that owns the number.">
              <Input id="wa-waba" inputMode="numeric" value={form.wabaId} onChange={(e) => set("wabaId")(e.target.value)} className="font-mono" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !form.accessToken.trim() || !form.phoneNumberId.trim() || !form.wabaId.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} {updating ? "Verify and save" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTemplateDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", category: "utility", language: "en_US" });
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    const name = toTemplateName(form.name);
    if (!name) {
      toast.error("Give the template a name first.");
      return;
    }
    setPending(true);
    const ok = await onCreate({ ...form, name });
    setPending(false);
    if (ok) {
      setForm({ name: "", category: "utility", language: "en_US" });
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create template</DialogTitle>
          <DialogDescription>Start a draft. You&apos;ll write the content, then submit it to Meta for review.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Template name" htmlFor="wa-name" hint={form.name ? `Saved as ${toTemplateName(form.name) || "—"}` : "Lowercase letters, numbers and underscores."}>
            <Input
              id="wa-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. order_confirmation"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" hint={TEMPLATE_CATEGORIES.find((c) => c.value === form.category)?.hint}>
              <OptionSelect value={form.category} onValueChange={set("category")} options={CATEGORY_OPTIONS} />
            </Field>
            <Field label="Language">
              <OptionSelect value={form.language} onValueChange={set("language")} options={LANGUAGE_OPTIONS} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !form.name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestTemplateDialog({ open, onOpenChange, templates, onSend, defaultTo }) {
  const approved = templates.filter((t) => t.status === "approved");
  const [templateId, setTemplateId] = useState(approved[0]?.id || "");
  const [to, setTo] = useState(defaultTo || "");
  const [pending, setPending] = useState(false);
  const template = approved.find((t) => t.id === templateId);
  const [values, setValues] = useState(() => (approved[0] ? sampleVariables(approved[0]).body || [] : []));
  const bodyCount = template ? (template.category === "authentication" ? 1 : variableCount(template.components.find((c) => c.type === "BODY")?.text)) : 0;

  const pick = (id) => {
    setTemplateId(id);
    const next = approved.find((t) => t.id === id);
    setValues(next ? sampleVariables(next).body || [] : []);
  };
  const send = async () => {
    if (!template) return;
    setPending(true);
    const samples = sampleVariables(template);
    const ok = await onSend({ to: to.trim(), templateId, variables: { ...samples, body: values } });
    setPending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test template</DialogTitle>
          <DialogDescription>Outside a 24-hour window only approved templates can be sent. Meta bills test sends like any other.</DialogDescription>
        </DialogHeader>
        {approved.length ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="To" htmlFor="wa-test-to">
                <Input id="wa-test-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+351912345678" className="font-mono" autoFocus />
              </Field>
              <Field label="Template">
                <OptionSelect value={templateId} onValueChange={pick} options={approved.map((t) => ({ value: t.id, label: `${t.name} · ${t.language}` }))} />
              </Field>
            </div>
            {Array.from({ length: bodyCount }, (_, i) => (
              <Field key={i} label={`Body {{${i + 1}}}`} htmlFor={`wa-test-v${i}`}>
                <Input
                  id={`wa-test-v${i}`}
                  value={values[i] || ""}
                  onChange={(e) => setValues((v) => Object.assign([...v], { [i]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No approved templates yet — submit one and sync its status first.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={pending || !template || !to.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// What the recipient sees, styled as a plain message card (no faux phone chrome).
function TemplatePreview({ draft }) {
  const preview = renderTemplatePreview(draft);
  return (
    <SectionCard title="Preview" description="Sample values filled in.">
      <div className="rounded-lg border border-border bg-surface-card p-3 text-sm text-foreground">
        {preview.header ? <p className="mb-1.5 font-semibold">{preview.header}</p> : null}
        <p className="whitespace-pre-wrap break-words">{preview.body || <span className="text-text-tertiary">The body appears here.</span>}</p>
        {preview.footer ? <p className="mt-2 text-xs text-text-secondary">{preview.footer}</p> : null}
      </div>
      {preview.buttons.length ? (
        <div className="mt-2 grid gap-1.5">
          {preview.buttons.map((b, i) => (
            <div key={i} className="rounded-md border border-border bg-surface-card px-3 py-1.5 text-center text-xs font-medium text-foreground">
              {b.text || <span className="text-text-tertiary">Button {i + 1}</span>}
            </div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function SampleInputs({ count, values, onChange, label, idPrefix, disabled }) {
  if (!count) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <Field key={i} label={`${label} {{${i + 1}}} sample`} htmlFor={`${idPrefix}-${i}`}>
          <Input id={`${idPrefix}-${i}`} value={values?.[i] || ""} disabled={disabled} onChange={(e) => onChange(Object.assign([...(values || [])], { [i]: e.target.value }))} />
        </Field>
      ))}
    </div>
  );
}

function TemplateEditor({ record, connected, canManage, now, onBack, onSave, onSubmit, onDelete }) {
  const initial = useMemo(() => draftFromTemplate(record), [record]);
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(null);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const issues = useMemo(() => validateTemplateDraft(draft), [draft]);
  const isAuth = draft.category === "authentication";
  const locked = !canManage;
  const unsubmitted =
    record.status !== "draft" && record.submitted && JSON.stringify(record.submitted.components) !== JSON.stringify(record.components);

  const persist = async () => {
    const patch = { name: toTemplateName(draft.name), language: draft.language, category: draft.category, components: componentsFromDraft(draft) };
    return onSave(record.id, patch);
  };
  const save = async () => {
    setPending("save");
    await persist();
    setPending(null);
  };
  const submit = async () => {
    if (issues.length) {
      toast.error(issues[0].message);
      return;
    }
    setPending("submit");
    const saved = dirty ? await persist() : true;
    if (saved) await onSubmit(record);
    setPending(null);
  };

  const updateButton = (i, patch) => setDraft((d) => ({ ...d, buttons: d.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const addButton = (type) =>
    setDraft((d) => ({ ...d, buttons: [...d.buttons, { id: crypto.randomUUID(), type, text: "", url: "", urlSample: "", phone: "" }] }));
  const removeButton = (i) => setDraft((d) => ({ ...d, buttons: d.buttons.filter((_, j) => j !== i) }));

  const headerCount = variableCount(draft.headerText);
  const bodyCount = variableCount(draft.body);
  const canSubmitStatus = ["draft", "rejected", "paused", "approved"].includes(record.status);

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value.toLowerCase().replace(/\s/g, "_"))}
          aria-label="Template name"
          placeholder="untitled_template"
          disabled={locked || record.status !== "draft"}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={STATUS_MAP}
      badges={
        <>
          <Badge variant={CATEGORY_TONE[draft.category]}>{categoryLabel(draft.category)}</Badge>
          <Badge variant="neutral">{languageLabel(draft.language)}</Badge>
          {unsubmitted ? <Badge variant="warning">Edits not submitted</Badge> : null}
          <span className="text-xs text-text-tertiary">Updated {formatRelative(record.updatedAt, now)}</span>
        </>
      }
      actions={
        canManage ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete template" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || Boolean(pending)} onClick={save}>
              {pending === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
            {canSubmitStatus ? (
              <Button className={PRIMARY_BUTTON} disabled={!connected || Boolean(pending) || (!dirty && !unsubmitted && record.status !== "draft" && record.status !== "rejected")} onClick={submit}>
                {pending === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {record.status === "draft" ? "Submit for review" : "Resubmit"}
              </Button>
            ) : null}
          </>
        ) : null
      }
      nav={TEMPLATE_NAV}
      defaultSection="content"
    >
      {({ active }) => (
        <>
          {active === "content" ? (
            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              <SectionCard
                bare
                title="Message text"
                description={isAuth ? "The security note, expiry line and copy-code button around Meta's passcode text." : "The header, body and footer Meta reviews, with a sample for each variable."}
                contentClassName="space-y-4"
              >
                {isAuth ? (
                  <>
                    <p className="text-sm text-text-secondary">
                      Authentication templates use Meta&apos;s fixed one-time-passcode text. You choose the security note, the expiry line and the copy-code button.
                    </p>
                    <SettingsList>
                      <SettingRow
                        title="Security recommendation"
                        description="Adds “For your security, do not share this code.”"
                        control={<Switch checked={draft.securityRecommendation} disabled={locked} aria-label="Security recommendation" onCheckedChange={set("securityRecommendation")} />}
                      />
                    </SettingsList>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Code expires after (minutes)" htmlFor="wae-exp" hint="Optional, 1–90.">
                        <Input id="wae-exp" type="number" min={1} max={90} value={draft.codeExpirationMinutes} disabled={locked} onChange={(e) => set("codeExpirationMinutes")(e.target.value)} />
                      </Field>
                      <Field label="Copy-code button text" htmlFor="wae-otp">
                        <Input id="wae-otp" value={draft.otpButtonText} disabled={locked} onChange={(e) => set("otpButtonText")(e.target.value)} />
                      </Field>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                      <Field label="Header">
                        <OptionSelect
                          value={draft.headerType}
                          onValueChange={set("headerType")}
                          disabled={locked}
                          options={[
                            { value: "none", label: "None" },
                            { value: "text", label: "Text" },
                          ]}
                        />
                      </Field>
                      {draft.headerType === "text" ? (
                        <Field label="Header text" htmlFor="wae-header" hint={`${draft.headerText.length}/60 · one {{1}} variable allowed`}>
                          <Input id="wae-header" value={draft.headerText} disabled={locked} onChange={(e) => set("headerText")(e.target.value)} placeholder="Your order {{1}}" />
                        </Field>
                      ) : (
                        <p className="self-end pb-2 text-xs text-text-tertiary">Image, video and document headers need media uploads to Meta and aren&apos;t supported here yet.</p>
                      )}
                    </div>
                    {draft.headerType === "text" ? (
                      <SampleInputs count={headerCount} values={draft.headerSamples} onChange={set("headerSamples")} label="Header" idPrefix="wae-hs" disabled={locked} />
                    ) : null}
                    <Field label="Body" htmlFor="wae-body" hint={`${draft.body.length}/1024 · variables {{1}}, {{2}}… in order; Meta needs a sample for each.`}>
                      <Textarea id="wae-body" rows={6} value={draft.body} disabled={locked} onChange={(e) => set("body")(e.target.value)} placeholder="Hi {{1}}, your order {{2}} is on its way." />
                    </Field>
                    <SampleInputs count={bodyCount} values={draft.bodySamples} onChange={set("bodySamples")} label="Body" idPrefix="wae-bs" disabled={locked} />
                    <Field label="Footer" htmlFor="wae-footer" hint={`${draft.footer.length}/60 · no variables`}>
                      <Input id="wae-footer" value={draft.footer} disabled={locked} onChange={(e) => set("footer")(e.target.value)} placeholder="Reply STOP to opt out" />
                    </Field>
                  </>
                )}
              </SectionCard>
              <TemplatePreview draft={draft} />
            </div>
          ) : null}

          {active === "buttons" ? (
            <SectionCard bare title="Reply & link buttons" description="The actions recipients can tap under the message." contentClassName="space-y-4">
              {isAuth ? (
                <p className="text-sm text-text-secondary">Authentication templates carry one copy-code button, set under Content.</p>
              ) : (
                <>
                  {draft.buttons.length ? (
                    <div className="space-y-3">
                      {draft.buttons.map((b, i) => (
                        <div key={b.id || i} className="grid gap-3 rounded-lg border border-border bg-surface-card p-3 sm:grid-cols-[150px_1fr_1fr_auto] sm:items-end">
                          <Field label="Type">
                            <OptionSelect value={b.type} onValueChange={(type) => updateButton(i, { type })} options={BUTTON_TYPES} disabled={locked} />
                          </Field>
                          <Field label="Text" htmlFor={`wae-bt-${i}`}>
                            <Input id={`wae-bt-${i}`} value={b.text} disabled={locked} onChange={(e) => updateButton(i, { text: e.target.value })} placeholder="e.g. Track order" />
                          </Field>
                          {b.type === "url" ? (
                            <Field label="URL" htmlFor={`wae-bu-${i}`} hint="May end with {{1}}.">
                              <Input id={`wae-bu-${i}`} value={b.url} disabled={locked} onChange={(e) => updateButton(i, { url: e.target.value })} placeholder="https://halcyon.studio/orders/{{1}}" className="font-mono" />
                            </Field>
                          ) : b.type === "phone" ? (
                            <Field label="Phone" htmlFor={`wae-bp-${i}`}>
                              <Input id={`wae-bp-${i}`} value={b.phone} disabled={locked} onChange={(e) => updateButton(i, { phone: e.target.value })} placeholder="+351912345678" className="font-mono" />
                            </Field>
                          ) : (
                            <p className="pb-2 text-xs text-text-tertiary">Replies come back to the inbox as the button text.</p>
                          )}
                          {canManage ? (
                            <Button variant="ghost" size="icon" aria-label={`Remove button ${i + 1}`} className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => removeButton(i)}>
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {b.type === "url" && variableCount(b.url) ? (
                            <Field label="URL {{1}} sample" htmlFor={`wae-bs-${i}`} className="sm:col-span-4">
                              <Input id={`wae-bs-${i}`} value={b.urlSample} disabled={locked} onChange={(e) => updateButton(i, { urlSample: e.target.value })} placeholder="e.g. 48213" />
                            </Field>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">No buttons. Add up to 10 quick replies, two website buttons and one call button.</p>
                  )}
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {BUTTON_TYPES.map((t) => (
                        <Button key={t.value} variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={draft.buttons.length >= 10} onClick={() => addButton(t.value)}>
                          <t.icon className="h-4 w-4" /> {t.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </SectionCard>
          ) : null}

          {active === "settings" ? (
            <SectionCard bare title="Category & language" description="How Meta classifies, prices and reviews this template.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" hint={TEMPLATE_CATEGORIES.find((c) => c.value === draft.category)?.hint}>
                  <OptionSelect value={draft.category} onValueChange={set("category")} options={CATEGORY_OPTIONS} disabled={locked || record.status === "approved"} />
                </Field>
                <Field label="Language" hint="A template name can exist once per language.">
                  <OptionSelect value={draft.language} onValueChange={set("language")} options={LANGUAGE_OPTIONS} disabled={locked || record.status !== "draft"} />
                </Field>
              </div>
              <p className="mt-4 text-xs text-text-secondary">
                Meta bills each delivered template message by category. Marketing is the most expensive and has no volume discount; replies inside the
                24-hour customer service window are free.
              </p>
            </SectionCard>
          ) : null}

          {active === "review" ? (
            <SectionCard bare title="Submission status" description="Format checks and where this version stands with Meta." contentClassName="space-y-5">
              {record.status === "rejected" ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  Rejected by Meta: {rejectionCopy(record.rejectionReason) || "no reason given."} Edit the content and resubmit.
                </div>
              ) : null}
              {record.lastSubmitError?.message ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                  Last submission failed: {record.lastSubmitError.message}
                </div>
              ) : null}
              <div>
                <h4 className="mb-2 text-sm font-medium text-foreground">Policy checks</h4>
                {issues.length ? (
                  <ul className="space-y-1.5">
                    {issues.map((issue, i) => (
                      <li key={i} className="text-sm text-red-600 dark:text-red-400">{issue.message}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">Ready to submit — no format problems found.</p>
                )}
              </div>
              <SettingsList>
                <SettingRow title="Submitted" description="When this version went to Meta." control={<span className="text-sm text-muted-foreground">{record.submittedAt ? formatDate(record.submittedAt) : "Not yet"}</span>} />
                <SettingRow title="Last synced" description="Status pulled from Meta with “Sync statuses”." control={<span className="text-sm text-muted-foreground">{formatRelative(record.lastSyncedAt, now)}</span>} />
                <SettingRow
                  title="Quality"
                  description="Meta's rating from recipient feedback on approved templates."
                  control={record.qualityScore ? <StatusPill status={record.qualityScore} map={QUALITY_RATINGS} /> : <span className="text-sm text-muted-foreground">—</span>}
                />
                <SettingRow title="Meta template ID" description="Reference for support with Meta." control={<span className="font-mono text-xs text-muted-foreground">{record.externalId || "—"}</span>} />
              </SettingsList>
              {!connected ? <p className="text-xs text-text-secondary">Connect a WhatsApp number to submit templates.</p> : null}
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function WhatsAppScreen() {
  const { projectId, connection, setConnection, loading: connectionLoading } = useChannelConnection("whatsapp");
  const canManage = useCan(CHANNEL_MANAGE);
  const now = useNow();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pending, setPending] = useState(null);
  const [myPhone, setMyPhone] = useState("");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listMessageTemplates(projectId, { channel: "whatsapp" }).then((rows) => {
      if (!alive) return;
      setTemplates(rows ?? []);
      setLoading(false);
    });
    getUser().then((u) => alive && setMyPhone(u?.phone || ""));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const connected = connection?.status === "connected";
  const health = connection?.health || {};

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, query, categoryFilter, statusFilter]);
  const pager = usePagination(filtered, { resetKey: `${query}|${categoryFilter}|${statusFilter}` });

  const stats = useMemo(() => {
    const count = (...s) => templates.filter((t) => s.includes(t.status)).length.toLocaleString("en-US");
    return [
      { label: "Approved", value: count("approved"), footer: "ready to send" },
      { label: "In review", value: count("pending"), footer: "waiting on Meta" },
      { label: "Rejected", value: count("rejected", "disabled"), footer: "edit and resubmit" },
      { label: "Drafts", value: count("draft"), footer: "not submitted" },
    ];
  }, [templates]);

  const applyConnection = (row) => setConnection(normalizeConnection(row));
  const replaceTemplate = (row) => setTemplates((prev) => prev.map((t) => (t.id === row.id ? row : t)));

  const connect = async (credentials) => {
    const res = await apiPost(`/api/projects/${projectId}/channels/connect`, { channel: "whatsapp", credentials });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    applyConnection(res.data.connection);
    toast.success(`Connected ${res.data.connection.display_handle || "WhatsApp"}.`);
    return true;
  };

  const refreshHealth = async () => {
    setPending("verify");
    const res = await apiPost(`/api/projects/${projectId}/channels/${connection.id}/verify`, {});
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    applyConnection(res.data.connection);
    if (res.data.connection.status === "connected") toast.success("Number health refreshed from Meta.");
    else toast.error(res.data.connection.health?.lastError || "Meta reported a problem.");
  };

  const disconnect = async () => {
    setPending("disconnect");
    const res = await apiDelete(`/api/projects/${projectId}/channels/${connection.id}`);
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    setDisconnectOpen(false);
    setConnection(null);
    toast.success("WhatsApp disconnected.");
  };

  const syncStatuses = async () => {
    setPending("sync");
    const res = await apiPost(`/api/projects/${projectId}/channels/whatsapp/templates/sync`, {});
    if (!res.ok) {
      setPending(null);
      return toast.error(res.error);
    }
    const rows = await listMessageTemplates(projectId, { channel: "whatsapp" });
    setPending(null);
    if (rows) setTemplates(rows);
    const { updated, imported, errors } = res.data;
    if (errors?.length) toast.error(errors[0]);
    else toast.success(`Synced with Meta — ${updated} updated${imported ? `, ${imported} imported` : ""}.`);
  };

  const handleCreate = async (form) => {
    const draft = { ...EMPTY_TEMPLATE_DRAFT, ...form };
    const optimistic = {
      id: crypto.randomUUID(),
      connectionId: connection?.id || null,
      channel: "whatsapp",
      name: form.name,
      language: form.language,
      category: form.category,
      status: "draft",
      components: componentsFromDraft(draft),
    };
    setTemplates((prev) => [{ ...optimistic, updatedAt: new Date().toISOString() }, ...prev]);
    const created = await createMessageTemplate(projectId, optimistic);
    if (!created) {
      setTemplates((prev) => prev.filter((t) => t.id !== optimistic.id));
      toast.error("Couldn't create the template — the name may already exist in that language.");
      return false;
    }
    replaceTemplate(created);
    openRecord(created.id);
    return true;
  };

  const handleSave = async (id, patch) => {
    const previous = templates.find((t) => t.id === id);
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const saved = await updateMessageTemplate(id, patch);
    if (!saved) {
      setTemplates((prev) => prev.map((t) => (t.id === id ? previous : t)));
      toast.error("Couldn't save the template.");
      return false;
    }
    replaceTemplate(saved);
    toast.success("Template saved.");
    return true;
  };

  const handleSubmit = async (t) => {
    const res = await apiPost(`/api/projects/${projectId}/channels/whatsapp/templates/${t.id}/submit`, {});
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    replaceTemplate(normalizeMessageTemplate(res.data.template));
    toast.success(`Submitted ${t.name} — Meta usually reviews within minutes to a day.`);
    return true;
  };

  const handleDuplicate = async (t) => {
    const copy = {
      id: crypto.randomUUID(),
      connectionId: t.connectionId,
      channel: "whatsapp",
      name: `${t.name}_copy`.slice(0, 512),
      language: t.language,
      category: t.category,
      status: "draft",
      components: t.components,
    };
    setTemplates((prev) => [{ ...copy, updatedAt: new Date().toISOString() }, ...prev]);
    const created = await createMessageTemplate(projectId, copy);
    if (!created) {
      setTemplates((prev) => prev.filter((x) => x.id !== copy.id));
      toast.error("Couldn't duplicate — a template with that name may already exist.");
      return;
    }
    replaceTemplate(created);
    toast.success(`Duplicated as ${created.name}.`);
  };

  const handleDelete = async (t) => {
    setPending("delete");
    const ok = t.externalId
      ? (await apiDelete(`/api/projects/${projectId}/channels/whatsapp/templates/${t.id}`)).ok
      : await softDeleteMessageTemplate(t.id);
    setPending(null);
    setDeleteTarget(null);
    if (!ok) return toast.error("Couldn't delete the template.");
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    if (t.id === recordId) closeRecord();
    toast.success(`Deleted ${t.name}.`);
  };

  const sendTest = async (body) => {
    const res = await apiPost(`/api/projects/${projectId}/channels/${connection.id}/test`, body);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (res.data.status === "sent") toast.success(`Test sent to ${body.to}.`);
    else toast.error(res.data.error || "The test wasn't sent.");
    return res.data.status === "sent";
  };

  const dialogs = (
    <>
      <ConnectWhatsAppDialog open={connectOpen} onOpenChange={setConnectOpen} onConnect={connect} updating={Boolean(connection)} />
      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <TestTemplateDialog key={testOpen ? "open" : "closed"} open={testOpen} onOpenChange={setTestOpen} templates={templates} onSend={sendTest} defaultTo={myPhone} />
      <DisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        name="WhatsApp"
        consequence="Broadcasts and automations on this number stop sending. Templates stay here and on Meta."
        pending={pending === "disconnect"}
        onConfirm={disconnect}
      />
      <DeleteConfirmDialog
        target={deleteTarget}
        title="Delete template"
        name={deleteTarget?.name}
        pending={pending === "delete"}
        description={deleteTarget?.externalId ? "It's also deleted on Meta, and the name can't be reused for 30 days." : "This draft can't be recovered."}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );

  const open = templates.find((t) => t.id === recordId);
  if (open) {
    return (
      <>
        <TemplateEditor
          key={`${open.id}:${open.updatedAt}`}
          record={open}
          connected={connected}
          canManage={canManage}
          now={now}
          onBack={closeRecord}
          onSave={handleSave}
          onSubmit={handleSubmit}
          onDelete={setDeleteTarget}
        />
        {dialogs}
      </>
    );
  }

  const filtersActive = query || categoryFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "template",
      header: "Template",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{t.name}</span>
            <span className="truncate text-xs text-text-secondary">{languageLabel(t.language)}</span>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (t) => <Badge variant={CATEGORY_TONE[t.category]}>{categoryLabel(t.category)}</Badge> },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (t) => <StatusPill status={t.status} map={STATUS_MAP} /> },
    {
      key: "quality",
      header: "Quality",
      className: "whitespace-nowrap",
      render: (t) => (t.qualityScore ? <StatusPill status={t.qualityScore} map={QUALITY_RATINGS} /> : <span className="text-text-tertiary">—</span>),
    },
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (t) => formatRelative(t.updatedAt, now) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.name}`}
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openRecord(t.id) },
            canManage && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(t) },
            canManage && connected && (t.status === "draft" || t.status === "rejected") && {
              label: t.status === "draft" ? "Submit for review" : "Resubmit",
              icon: UploadCloud,
              onSelect: () => handleSubmit(t),
            },
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
        title="WhatsApp"
        description="Your WhatsApp Business number, its health, and the message templates Meta approves."
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              {connected ? (
                <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setTestOpen(true)}>
                  <Send className="h-4 w-4" /> Send test
                </Button>
              ) : null}
              {connected ? (
                <Button variant="outline" className={OUTLINE_BUTTON} disabled={pending === "sync"} onClick={syncStatuses}>
                  {pending === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync statuses
                </Button>
              ) : null}
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create template
              </Button>
            </div>
          ) : null
        }
      />

      {connectionLoading ? (
        <SectionLoading label="Loading WhatsApp" />
      ) : connection ? (
        <SectionCard>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  {connection.config?.verifiedName || connection.name} <StatusPill status={connection.status} map={CONNECTION_STATUS_MAP} />
                </span>
                <span className="font-mono text-xs text-text-secondary">{connection.handle}</span>
                <span className="text-xs text-text-tertiary">
                  {health.lastError || `${connection.config?.wabaName ? `${connection.config.wabaName} · ` : ""}Checked ${formatRelative(connection.lastCheckedAt, now)}`}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                Quality <StatusPill status={health.qualityRating || "UNKNOWN"} map={QUALITY_RATINGS} />
              </span>
              <span className="tabular-nums">Messaging limit · {messagingTierLabel(health.messagingLimitTier)}</span>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={pending === "verify"} onClick={refreshHealth}>
                    {pending === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
                  </Button>
                  <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setConnectOpen(true)}>
                    <KeyRound className="h-4 w-4" /> Credentials
                  </Button>
                  <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setDisconnectOpen(true)}>
                    <Unplug className="h-4 w-4" /> Disconnect
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>
      ) : (
        <NotConnectedCard
          icon={MessageCircle}
          title="Connect a WhatsApp Business number"
          description="Messages go through Meta's official Cloud API on your own business account. You can draft templates now and submit them once connected."
          action={
            canManage ? (
              <Button onClick={() => setConnectOpen(true)}>
                <PlugZap className="h-4 w-4" /> Connect WhatsApp
              </Button>
            ) : null
          }
        />
      )}

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={categoryFilter} onValueChange={setCategoryFilter} options={CATEGORY_FILTER_OPTIONS} height="h-9" />
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
                icon={MessageCircle}
                filtersActive={filtersActive}
                onClear={clearFilters}
                title="No templates yet"
                description="Business-initiated WhatsApp messages need a template Meta has approved. Create one, then submit it."
                action={
                  canManage ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> Create template
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="templates" />
        </div>
      )}

      <RecentDeliveries channel="whatsapp" description="The latest WhatsApp messages from every source." />
      {dialogs}
    </MainScreenWrapper>
  );
}

export default WhatsAppScreen;
