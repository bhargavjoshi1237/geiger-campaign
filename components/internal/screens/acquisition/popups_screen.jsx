"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AppWindow,
  BarChart3,
  Code2,
  Copy,
  Crosshair,
  Eye,
  ImageIcon,
  Loader2,
  MousePointerClick,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  Rocket,
  Target,
  Trash2,
  X,
  Zap,
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
  cn,
} from "@geiger/ui";
import { createPopup, listPopups, softDeletePopup, updatePopup } from "@/lib/supabase/popups";
import { listForms } from "@/lib/supabase/forms";
import { getBrandKit } from "@/lib/supabase/brand_kits";
import { getUser } from "@/lib/supabase/user";
import {
  LAYOUT_LABEL,
  POPUP_DEVICES,
  POPUP_FREQUENCIES,
  POPUP_LAYOUTS,
  POPUP_POSITIONS,
  POPUP_TRIGGERS,
  URL_MODES,
  defaultDesign,
  defaultTargeting,
  defaultTrigger,
  frequencySummary,
  triggerSummary,
} from "@/lib/acquisition/popups";
import { publicFormView } from "@/lib/acquisition/models";
import { brandCssVars } from "@/lib/content/brand";
import { PublicForm } from "@/lib/acquisition/ui/public_form";
import { AssetPicker } from "@/components/internal/screens/content/asset_picker";
import {
  DESTRUCTIVE_ICON_BUTTON,
  OUTLINE_BUTTON,
  POPUP_STATUS_MAP,
  filterOptions,
  formatNumber,
  percent,
} from "./constants";
import { ConfigNotice, CopyField, DeleteDialog, copyText, useAcquisitionStatus } from "./shared";

const STATUS_FILTER_OPTIONS = filterOptions("All statuses", POPUP_STATUS_MAP);
const TRIGGER_FILTER_OPTIONS = [{ value: "all", label: "All triggers" }, ...POPUP_TRIGGERS.map((t) => ({ value: t.value, label: t.label }))];

const POPUP_NAV = [
  { key: "performance", label: "Performance", icon: BarChart3, desc: "How often it was shown and how many visitors signed up from it." },
  { key: "design", label: "Design", icon: Palette, desc: "Layout, copy and the form it shows. The preview uses your brand kit." },
  { key: "trigger", label: "Trigger", icon: Zap, desc: "The visitor behaviour that opens it." },
  { key: "targeting", label: "Targeting", icon: Crosshair, desc: "Which pages and devices it appears on, and how often one visitor sees it." },
  { key: "install", label: "Install", icon: Code2, desc: "Add one script tag to your site. It follows these settings automatically." },
];

const STATUS_ACTION = {
  active: { label: "Pause", icon: Pause, next: "paused", toast: "Popup paused. It stops showing right away." },
  paused: { label: "Resume", icon: Play, next: "active", toast: "Popup resumed." },
  draft: { label: "Activate", icon: Rocket, next: "active", toast: "Popup is live on every page with the script." },
};

const toDraft = (p) => ({ name: p.name, formId: p.formId || null, trigger: p.trigger, targeting: p.targeting, design: p.design });

function CreatePopupDialog({ open, onOpenChange, onCreate, forms, pending }) {
  const empty = { name: "", formId: forms[0]?.id || "", trigger: "exit_intent", layout: "modal" };
  const [draft, setDraft] = useState(empty);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const formId = draft.formId || forms[0]?.id || "";

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error("Give the popup a name first.");
      return;
    }
    if (!formId) {
      toast.error("Create a form first; a popup shows one of your forms.");
      return;
    }
    const ok = await onCreate({ ...draft, formId, name: draft.name.trim() });
    if (ok) {
      setDraft(empty);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create popup</DialogTitle>
          <DialogDescription>Pick the form it shows, when it opens and how it appears.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Popup name" htmlFor="popup-name">
            <Input id="popup-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Exit offer — 10% off" autoFocus />
          </Field>
          <Field label="Form" hint={forms.length ? undefined : "No forms yet — create one in Forms first."}>
            <Select value={formId} onValueChange={set("formId")} disabled={!forms.length}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a form" />
              </SelectTrigger>
              <SelectContent>
                {forms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Trigger">
              <Select value={draft.trigger} onValueChange={set("trigger")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPUP_TRIGGERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Layout">
              <Select value={draft.layout} onValueChange={set("layout")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPUP_LAYOUTS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
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
          <Button onClick={submit} disabled={!draft.name.trim() || !formId || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create popup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// A mock page with the popup placed where the embed script will put it.
function PopupPreview({ design, form, brand }) {
  const layout = design.layout || "modal";
  const card = (
    <div className="relative w-full rounded-xl border border-border bg-background p-5 text-foreground shadow-lg">
      {design.showClose !== false ? (
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-text-secondary" aria-hidden="true">
          <X className="h-4 w-4" />
        </span>
      ) : null}
      {design.imageUrl && layout !== "banner" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={design.imageUrl} alt="" className="mb-4 w-full rounded-lg object-cover" />
      ) : null}
      {design.headline ? <p className="pr-6 text-lg font-semibold tracking-tight">{design.headline}</p> : null}
      {design.body ? <p className="mb-4 mt-1 text-sm text-muted-foreground">{design.body}</p> : null}
      {form ? <PublicForm form={form} preview /> : <p className="text-sm text-text-secondary">Choose a form in Design.</p>}
    </div>
  );
  return (
    <div className="relative min-h-[460px] overflow-hidden rounded-lg border border-border bg-surface-card" style={brandCssVars(brand || {})}>
      <div className="space-y-3 p-5" aria-hidden="true">
        <div className="h-3 w-1/3 rounded bg-surface-active" />
        <div className="h-2.5 w-2/3 rounded bg-surface-hover" />
        <div className="h-2.5 w-1/2 rounded bg-surface-hover" />
        <div className="mt-6 h-24 rounded bg-surface-hover" />
      </div>
      {layout === "modal" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[360px]">{card}</div>
        </div>
      ) : layout === "slide_in" ? (
        <div className={cn("absolute bottom-3 w-[300px] max-w-[calc(100%-24px)]", design.position === "bottom_left" ? "left-3" : "right-3")}>{card}</div>
      ) : (
        <div className={cn("absolute inset-x-0 p-2", design.position === "bottom" ? "bottom-0" : "top-0")}>{card}</div>
      )}
    </div>
  );
}

function PopupEditor({ record, projectId, forms, brand, status, baseUrl, canEdit, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setDesign = (key) => (value) => setDraft((d) => ({ ...d, design: { ...d.design, [key]: value } }));
  const setTargeting = (patch) => setDraft((d) => ({ ...d, targeting: { ...d.targeting, ...patch } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const action = STATUS_ACTION[record.status] || STATUS_ACTION.draft;
  const form = forms.find((f) => f.id === draft.formId);
  const formView = useMemo(() => (form ? publicFormView(form) : null), [form]);
  const t = draft.trigger;
  const tg = draft.targeting;

  const save = async (patch = {}, message) => {
    if (patch.status === "active" && !draft.formId) {
      toast.error("Choose a form in Design before activating.");
      return;
    }
    setSaving(true);
    const ok = await onSave(record.id, { ...draft, ...patch, name: draft.name.trim() || "Untitled popup" }, message);
    setSaving(false);
    if (ok) setDraft((d) => ({ ...d, name: d.name.trim() || "Untitled popup" }));
  };

  const scriptTag = baseUrl ? `<script src="${baseUrl}/embed/v1.js" data-geiger-popup="${record.id}" async></script>` : "";
  const performance = [
    { label: "Impressions", value: record.impressions ? formatNumber(record.impressions) : "—", icon: Eye, hint: "Times it was shown" },
    { label: "Conversions", value: record.conversions ? formatNumber(record.conversions) : "—", icon: MousePointerClick, hint: "Form submissions from the popup" },
    { label: "Conversion rate", value: percent(record.conversions, record.impressions), icon: Target, hint: "Conversions per impression" },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Popup name"
          placeholder="Untitled popup"
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={POPUP_STATUS_MAP}
      badges={
        <>
          <Badge variant="neutral">{triggerSummary(t)}</Badge>
          <span className="text-xs text-text-tertiary">
            {LAYOUT_LABEL[draft.design.layout]} · {form ? form.name : "No form"} · {frequencySummary(tg.frequency)}
          </span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete popup" className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={() => save()}>
              Save
            </Button>
            <Button onClick={() => save({ status: action.next }, action.toast)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <action.icon className="h-4 w-4" />} {action.label}
            </Button>
          </>
        ) : null
      }
      nav={POPUP_NAV}
      defaultSection="performance"
    >
      {({ active }) => (
        <>
          {active === "performance" ? <StatGrid stats={performance} columns={3} /> : null}

          {active === "design" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
              <SectionCard bare title="Content & layout" description="The form it shows, where it sits on the page and the copy around it.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Form" className="sm:col-span-2" hint={form && form.status !== "live" ? "This form isn't live, so the popup won't show until you publish it." : undefined}>
                    <Select value={draft.formId || ""} onValueChange={set("formId")} disabled={!canEdit}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a form" />
                      </SelectTrigger>
                      <SelectContent>
                        {forms.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                            {f.status !== "live" ? " (not live)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Layout">
                    <Select
                      value={draft.design.layout}
                      onValueChange={(v) => setDraft((d) => ({ ...d, design: { ...d.design, layout: v, position: POPUP_POSITIONS[v][0].value } }))}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POPUP_LAYOUTS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Position">
                    <Select value={draft.design.position} onValueChange={setDesign("position")} disabled={!canEdit || POPUP_POSITIONS[draft.design.layout].length < 2}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POPUP_POSITIONS[draft.design.layout].map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Headline" htmlFor="pe-headline" className="sm:col-span-2">
                    <Input id="pe-headline" value={draft.design.headline} onChange={(e) => setDesign("headline")(e.target.value)} disabled={!canEdit} />
                  </Field>
                  <Field label="Body" htmlFor="pe-body" className="sm:col-span-2">
                    <Textarea id="pe-body" rows={3} value={draft.design.body} onChange={(e) => setDesign("body")(e.target.value)} disabled={!canEdit} />
                  </Field>
                  {draft.design.layout !== "banner" ? (
                    <Field label="Image" className="sm:col-span-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-card">
                          {draft.design.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={draft.design.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
                          )}
                        </div>
                        <Button size="sm" variant="outline" className="bg-surface-card" onClick={() => setPicker(true)} disabled={!canEdit}>
                          Choose image
                        </Button>
                        {draft.design.imageUrl ? (
                          <Button size="sm" variant="ghost" onClick={() => setDesign("imageUrl")("")} disabled={!canEdit}>
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </Field>
                  ) : null}
                  <div className="sm:col-span-2">
                    <SettingsList>
                      <SettingRow
                        title="Close button"
                        description="Without it, visitors dismiss a modal only with Escape."
                        control={<Switch checked={draft.design.showClose !== false} onCheckedChange={setDesign("showClose")} disabled={!canEdit} aria-label="Show close button" />}
                      />
                    </SettingsList>
                  </div>
                </div>
              </SectionCard>
              <div className="xl:sticky xl:top-0 xl:self-start">
                <PopupPreview design={draft.design} form={formView} brand={brand} />
              </div>
              <AssetPicker open={picker} onOpenChange={setPicker} projectId={projectId} onPick={(a) => setDesign("imageUrl")(a.url)} title="Choose a popup image" />
            </div>
          ) : null}

          {active === "trigger" ? (
            <SectionCard bare title="When it opens" description="What a visitor has to do before the popup appears.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Open the popup" hint={POPUP_TRIGGERS.find((x) => x.value === t.type)?.hint}>
                  <Select value={t.type} onValueChange={(v) => set("trigger")(defaultTrigger(v))} disabled={!canEdit}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POPUP_TRIGGERS.map((x) => (
                        <SelectItem key={x.value} value={x.value}>
                          {x.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {t.type === "scroll" ? (
                  <Field label="Scroll depth (%)" htmlFor="pe-scroll">
                    <Input id="pe-scroll" type="number" min={1} max={100} value={t.value ?? 50} onChange={(e) => set("trigger")({ ...t, value: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} disabled={!canEdit} />
                  </Field>
                ) : null}
                {t.type === "delay" ? (
                  <Field label="Delay (seconds)" htmlFor="pe-delay">
                    <Input id="pe-delay" type="number" min={0} max={600} value={t.value ?? 8} onChange={(e) => set("trigger")({ ...t, value: Math.min(600, Math.max(0, Number(e.target.value) || 0)) })} disabled={!canEdit} />
                  </Field>
                ) : null}
                {t.type === "click" ? (
                  <Field label="CSS selector" htmlFor="pe-click" hint="Clicks on matching elements open the popup; frequency caps don't apply.">
                    <Input id="pe-click" value={t.value || ""} onChange={(e) => set("trigger")({ ...t, value: e.target.value })} className="font-mono" disabled={!canEdit} />
                  </Field>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {active === "targeting" ? (
            <div className="space-y-6">
              <SectionCard bare title="Pages" description="Which URLs on your site the popup may appear on.">
                <div className="grid gap-4">
                  <Field label="Show on">
                    <Select value={tg.urls.mode} onValueChange={(v) => setTargeting({ urls: { ...tg.urls, mode: v } })} disabled={!canEdit}>
                      <SelectTrigger className="w-full sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {URL_MODES.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {tg.urls.mode !== "all" ? (
                    <Field label="URL patterns" htmlFor="pe-urls" hint="One per line. * matches anything: /blog/*, /pricing, https://shop.example.com/*">
                      <Textarea
                        id="pe-urls"
                        rows={4}
                        value={(tg.urls.patterns || []).join("\n")}
                        onChange={(e) => setTargeting({ urls: { ...tg.urls, patterns: e.target.value.split("\n") } })}
                        onBlur={(e) => setTargeting({ urls: { ...tg.urls, patterns: e.target.value.split("\n").map((p) => p.trim()).filter(Boolean) } })}
                        className="font-mono text-sm"
                        disabled={!canEdit}
                      />
                    </Field>
                  ) : null}
                </div>
              </SectionCard>
              <SectionCard bare title="Devices" description="The device types it shows on. At least one stays on.">
                <SettingsList>
                  {POPUP_DEVICES.map((d) => {
                    const on = tg.devices.includes(d.value);
                    return (
                      <SettingRow
                        key={d.value}
                        title={d.label}
                        control={
                          <Switch
                            checked={on}
                            disabled={!canEdit || (on && tg.devices.length === 1)}
                            aria-label={`Show on ${d.label}`}
                            onCheckedChange={(v) => setTargeting({ devices: v ? [...tg.devices, d.value] : tg.devices.filter((x) => x !== d.value) })}
                          />
                        }
                      />
                    );
                  })}
                </SettingsList>
              </SectionCard>
              <SectionCard bare title="Frequency" description="Stored in the visitor's browser. Anyone who signs up never sees it again.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Show it">
                    <Select value={tg.frequency.type} onValueChange={(v) => setTargeting({ frequency: { ...tg.frequency, type: v } })} disabled={!canEdit}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POPUP_FREQUENCIES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {tg.frequency.type === "days" ? (
                    <Field label="Days between" htmlFor="pe-days">
                      <Input id="pe-days" type="number" min={1} max={365} value={tg.frequency.days ?? 7} onChange={(e) => setTargeting({ frequency: { ...tg.frequency, days: Math.min(365, Math.max(1, Number(e.target.value) || 1)) } })} disabled={!canEdit} />
                    </Field>
                  ) : null}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {active === "install" ? (
            <div className="space-y-5">
              {record.status !== "active" ? <ConfigNotice title="This popup isn't active">The script loads it only while it&apos;s active and its form is live.</ConfigNotice> : null}
              {status && !status.ingestConfigured ? (
                <ConfigNotice title="Popups can't be served on this deployment">Set SUPABASE_SERVICE_ROLE_KEY on the server.</ConfigNotice>
              ) : null}
              <SectionCard title="Script tag" description="Paste before </body> on every page where it may appear. Targeting decides the rest.">
                <CopyField value={scriptTag} copyMessage="Script tag copied." />
              </SectionCard>
              <SectionCard title="Open it from your own code">
                <CopyField value={`GeigerCampaign.showPopup("${record.id}");`} copyMessage="Snippet copied." hint="Ignores trigger and frequency; useful behind your own button." />
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function PopupsScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canEdit = useCan("campaign.acquisition.edit");
  const { status, baseUrl } = useAcquisitionStatus(projectId);
  const [popups, setPopups] = useState([]);
  const [forms, setForms] = useState([]);
  const [brand, setBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [triggerFilter, setTriggerFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    Promise.all([listPopups(projectId), listForms(projectId), getBrandKit(projectId)]).then(([rows, formRows, kit]) => {
      if (cancelled) return;
      if (rows === null) toast.error("Couldn't load popups.");
      setPopups(rows ?? []);
      setForms(formRows ?? []);
      setBrand(kit);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const formName = useMemo(() => Object.fromEntries(forms.map((f) => [f.id, f.name])), [forms]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return popups.filter(
      (p) =>
        (statusFilter === "all" || p.status === statusFilter) &&
        (triggerFilter === "all" || p.trigger.type === triggerFilter) &&
        (!q || p.name.toLowerCase().includes(q) || (formName[p.formId] || "").toLowerCase().includes(q)),
    );
  }, [popups, query, statusFilter, triggerFilter, formName]);

  const stats = useMemo(() => {
    const impressions = popups.reduce((s, p) => s + p.impressions, 0);
    const conversions = popups.reduce((s, p) => s + p.conversions, 0);
    return [
      { label: "Popups", value: formatNumber(popups.length) },
      { label: "Active", value: formatNumber(popups.filter((p) => p.status === "active").length) },
      { label: "Impressions", value: formatNumber(impressions) },
      { label: "Conversion", value: percent(conversions, impressions) },
    ];
  }, [popups]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${triggerFilter}` });

  const handleCreate = async ({ name, formId, trigger, layout }) => {
    setCreating(true);
    const user = await getUser().catch(() => null);
    const row = await createPopup(projectId, {
      id: crypto.randomUUID(),
      name,
      formId,
      status: "draft",
      trigger: defaultTrigger(trigger),
      targeting: defaultTargeting(),
      design: defaultDesign(layout),
      createdBy: user?.id ?? null,
    });
    setCreating(false);
    if (!row) {
      toast.error("Couldn't create the popup.");
      return false;
    }
    setPopups((prev) => [row, ...prev]);
    openRecord(row.id);
    return true;
  };

  const handleSave = async (id, patch, message = "Popup saved.") => {
    const before = popups.find((p) => p.id === id);
    setPopups((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const saved = await updatePopup(id, patch);
    if (!saved) {
      setPopups((prev) => prev.map((p) => (p.id === id ? before : p)));
      toast.error("Couldn't save the popup.");
      return false;
    }
    setPopups((prev) => prev.map((p) => (p.id === id ? saved : p)));
    toast.success(message);
    return true;
  };

  const handleDuplicate = async (p) => {
    const user = await getUser().catch(() => null);
    const copy = await createPopup(projectId, {
      id: crypto.randomUUID(),
      name: `${p.name} (copy)`,
      formId: p.formId,
      status: "draft",
      trigger: p.trigger,
      targeting: p.targeting,
      design: p.design,
      createdBy: user?.id ?? null,
    });
    if (!copy) {
      toast.error("Couldn't duplicate the popup.");
      return;
    }
    setPopups((prev) => [copy, ...prev]);
    toast.success("Popup duplicated as a draft.");
  };

  const handleDelete = async (p) => {
    setDeleting(true);
    const ok = await softDeletePopup(p.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error("Couldn't delete the popup.");
      return;
    }
    setPopups((prev) => prev.filter((x) => x.id !== p.id));
    if (recordId === p.id) closeRecord();
    toast.success(`Deleted "${p.name}".`);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      noun="popup"
      name={deleteTarget?.name}
      consequence="It stops showing on your site immediately. Its form and contacts are kept."
      pending={deleting}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = popups.find((p) => p.id === recordId);
  if (open) {
    return (
      <>
        <PopupEditor
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

  const filtersActive = query || statusFilter !== "all" || triggerFilter !== "all";

  const columns = [
    {
      key: "name",
      header: "Popup",
      render: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{p.name}</span>
          <span className="truncate text-xs text-text-secondary">{formName[p.formId] || "No form"}</span>
        </div>
      ),
    },
    { key: "trigger", header: "Trigger", render: (p) => <Badge variant="neutral">{triggerSummary(p.trigger)}</Badge> },
    { key: "layout", header: "Layout", className: "text-muted-foreground", render: (p) => LAYOUT_LABEL[p.design.layout] || "Modal" },
    { key: "impressions", header: "Impressions", className: "tabular-nums text-muted-foreground", render: (p) => (p.impressions ? formatNumber(p.impressions) : "—") },
    {
      key: "conversion",
      header: "Conversion",
      render: (p) =>
        p.impressions > 0 ? (
          <div className="w-[120px] space-y-1.5">
            <Progress value={Math.min(100, (p.conversions / p.impressions) * 100)} className="h-1.5 bg-surface-hover" />
            <p className="text-xs tabular-nums text-text-secondary">{percent(p.conversions, p.impressions)}</p>
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (p) => <StatusPill status={p.status} map={POPUP_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => {
        const action = STATUS_ACTION[p.status] || STATUS_ACTION.draft;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <ActionMenu
              label={`Actions for ${p.name}`}
              items={[
                { label: canEdit ? "Edit" : "Open", icon: Pencil, onSelect: () => openRecord(p.id) },
                canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(p) },
                canEdit && { label: action.label, icon: action.icon, onSelect: () => (action.next === "active" && !p.formId ? toast.error("Choose a form first.") : handleSave(p.id, { status: action.next }, action.toast)) },
                { label: "Copy script tag", icon: Code2, onSelect: () => copyText(`<script src="${baseUrl}/embed/v1.js" data-geiger-popup="${p.id}" async></script>`, "Script tag copied.") },
                canEdit && { separator: true },
                canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(p) },
              ]}
            />
          </div>
        );
      },
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Popups"
        description="On-site popups that open on visitor behaviour and show one of your forms."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create popup
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={triggerFilter} onValueChange={setTriggerFilter} options={TRIGGER_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search popups…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} panel label="Loading popups" />
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
                  icon={AppWindow}
                  title={filtersActive ? "No matches" : "No popups yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a popup to catch visitors before they leave."}
                  action={
                    filtersActive ? (
                      <Button
                        variant="outline"
                        className={OUTLINE_BUTTON}
                        onClick={() => {
                          setQuery("");
                          setStatusFilter("all");
                          setTriggerFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> Create popup
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="popups" />
        </div>
      )}

      <CreatePopupDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} forms={forms} pending={creating} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default PopupsScreen;
