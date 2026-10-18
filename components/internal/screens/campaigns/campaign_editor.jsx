"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarClock,
  FlaskConical,
  Loader2,
  Mail,
  Pause,
  Play,
  Send,
  Undo2,
  Users,
} from "lucide-react";

import { EditorShell } from "@/components/internal/shared/editor_shell";
import {
  Badge,
  Button,
  Field,
  InlineTitleInput,
  Input,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
  Textarea,
} from "@geiger/ui";
import {
  AB_METRIC_OPTIONS,
  AUDIENCE_LISTS,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUS_MAP,
  CAMPAIGN_TYPES,
  CHANNEL_MAP,
  LIST_SIZE,
  TYPE_MAP,
  defaultAb,
  formatDate,
} from "./constants";

const SMS_SEGMENT = 160;

const SCHEDULE_MODES = [
  { value: "now", label: "Send now", icon: Send },
  { value: "scheduled", label: "Schedule for later", icon: CalendarClock },
];

const CAMPAIGN_NAV = [
  { key: "audience", label: "Audience", icon: Users, desc: "Who this campaign goes to. The recipient estimate updates as you change the list." },
  { key: "content", label: "Content", icon: Mail, desc: "What your audience receives. Use merge tags like {{ first_name }} to personalize." },
  { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "Send immediately or queue it for later." },
  {
    key: "ab",
    label: "A/B testing",
    icon: FlaskConical,
    desc: "Send two variants to a split of your audience and compare results.",
    showIf: (subject) => subject.abAvailable,
  },
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Delivery and engagement for this campaign." },
];

const OUTLINE_BTN =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const PRIMARY_BTN = "bg-primary text-primary-foreground hover:bg-primary/90";

// Editable slice of a campaign row; drives both the form and the dirty check.
function toDraft(c) {
  return {
    name: c.name || "",
    description: c.description || "",
    type: c.type || "Broadcast",
    channel: c.channel || "Email",
    list: c.list || AUDIENCE_LISTS[0],
    subject: c.subject || "",
    previewText: c.previewText || "",
    body: c.body || "",
    scheduleMode: c.scheduledAt ? "scheduled" : "now",
    scheduledAt: c.scheduledAt || "",
    ab: { ...defaultAb(), ...c.ab, variantB: { ...defaultAb().variantB, ...c.ab?.variantB } },
  };
}

export function CampaignEditor({ campaign, onBack, onSave }) {
  const baseline = useMemo(() => toDraft(campaign), [campaign]);
  const [draft, setDraft] = useState(baseline);
  const [saving, setSaving] = useState(false);

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setAb = (patch) => setDraft((d) => ({ ...d, ab: { ...d.ab, ...patch } }));
  const setVariantB = (patch) =>
    setDraft((d) => ({ ...d, ab: { ...d.ab, variantB: { ...d.ab.variantB, ...patch } } }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const status = campaign.status;
  const readOnly = status === "Sent";
  const isEmail = draft.channel === "Email";
  const isText = draft.channel === "SMS";
  const channelMeta = CHANNEL_MAP[draft.channel] || CHANNEL_MAP.Email;
  const recipients = LIST_SIZE[draft.list] ?? 0;
  const bodyLen = draft.body.length;

  const buildPatch = (nextStatus) => {
    const scheduledAt = draft.scheduleMode === "scheduled" ? draft.scheduledAt || null : null;
    const patch = {
      name: draft.name.trim() || "Untitled campaign",
      description: draft.description,
      type: draft.type,
      channel: draft.channel,
      list: draft.list,
      subject: draft.subject,
      previewText: draft.previewText,
      body: draft.body,
      scheduledAt,
      ab: draft.ab,
    };
    if (nextStatus) patch.status = nextStatus;
    if (nextStatus === "Scheduled") patch.date = formatDate(scheduledAt);
    if (nextStatus === "Sent") {
      patch.date = formatDate(new Date().toISOString());
      patch.recipients = recipients;
    }
    if (nextStatus === "Paused") patch.date = `Paused ${formatDate(new Date().toISOString())}`;
    if (nextStatus === "Sending") patch.date = "Ongoing";
    if (nextStatus === "Draft") patch.date = "—";
    return patch;
  };

  const persist = async (nextStatus) => {
    if (nextStatus === "Scheduled" && !draft.scheduledAt) {
      toast.error("Pick a send date and time first.");
      return;
    }
    setSaving(true);
    await onSave(campaign.id, buildPatch(nextStatus));
    setSaving(false);
  };

  const spinnerOr = (Icon) =>
    saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />;

  const primaryAction = () => {
    if (status === "Draft") {
      return draft.scheduleMode === "scheduled" ? (
        <Button className={PRIMARY_BTN} disabled={saving} onClick={() => persist("Scheduled")}>
          {spinnerOr(CalendarClock)} Schedule send
        </Button>
      ) : (
        <Button className={PRIMARY_BTN} disabled={saving} onClick={() => persist("Sent")}>
          {spinnerOr(Send)} Send now
        </Button>
      );
    }
    if (status === "Scheduled") {
      return (
        <>
          <Button variant="outline" className={OUTLINE_BTN} disabled={saving} onClick={() => persist("Draft")}>
            <Undo2 className="h-4 w-4" /> Unschedule
          </Button>
          <Button className={PRIMARY_BTN} disabled={saving} onClick={() => persist("Sent")}>
            {spinnerOr(Send)} Send now
          </Button>
        </>
      );
    }
    if (status === "Sending") {
      return (
        <Button className={PRIMARY_BTN} disabled={saving} onClick={() => persist("Paused")}>
          {spinnerOr(Pause)} Pause
        </Button>
      );
    }
    if (status === "Paused") {
      return (
        <Button className={PRIMARY_BTN} disabled={saving} onClick={() => persist("Sending")}>
          {spinnerOr(Play)} Resume
        </Button>
      );
    }
    return (
      <Button variant="outline" className={OUTLINE_BTN} disabled={saving} onClick={() => persist("Draft")}>
        <Undo2 className="h-4 w-4" /> Back to draft
      </Button>
    );
  };

  const performance = [
    { label: "Recipients", value: campaign.recipients ? campaign.recipients.toLocaleString("en-US") : "—" },
    { label: "Open rate", value: campaign.openRate > 0 ? `${campaign.openRate}%` : "—" },
    {
      label: "Opens",
      value: campaign.openRate > 0
        ? Math.round((campaign.recipients * campaign.openRate) / 100).toLocaleString("en-US")
        : "—",
    },
    { label: "Est. audience", value: recipients.toLocaleString("en-US") },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Campaign name"
          placeholder="Untitled campaign"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <StatusPill status={status} map={CAMPAIGN_STATUS_MAP} />
          <Badge variant={channelMeta.variant}>
            <channelMeta.icon className="h-3 w-3" /> {channelMeta.label}
          </Badge>
          <Badge variant={TYPE_MAP[draft.type]?.variant || "neutral"}>{draft.type}</Badge>
          {campaign.date && campaign.date !== "—" ? (
            <span className="text-xs text-text-tertiary">{campaign.date}</span>
          ) : null}
        </>
      }
      actions={
        <>
          {!readOnly ? (
            <Button variant="outline" className={OUTLINE_BTN} disabled={!dirty || saving} onClick={() => persist(null)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          ) : null}
          {primaryAction()}
        </>
      }
      nav={CAMPAIGN_NAV}
      subject={{ abAvailable: isEmail || isText }}
      defaultSection="audience"
    >
      {({ active }) => (
        <>
          {active === "audience" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Send to" hint="Pick the list this campaign goes to.">
                  <Select value={draft.list} onValueChange={set("list")} disabled={readOnly}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AUDIENCE_LISTS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Estimated recipients">
                  <div className="flex h-9 w-full items-center gap-2.5 rounded-md border border-border bg-surface-card px-3 text-sm">
                    <Users className="h-4 w-4 shrink-0 text-text-tertiary" />
                    <span className="font-semibold tabular-nums text-foreground">{recipients.toLocaleString("en-US")}</span>
                    <span className="truncate text-text-secondary">{recipients === 1 ? "contact" : "contacts"}</span>
                  </div>
                </Field>
                <Field label="Internal description" htmlFor="cmp-desc" className="sm:col-span-2">
                  <Textarea
                    id="cmp-desc"
                    rows={3}
                    value={draft.description}
                    onChange={(e) => set("description")(e.target.value)}
                    placeholder="What is this campaign for?"
                    disabled={readOnly}
                  />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "content" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Channel">
                  <Select value={draft.channel} onValueChange={set("channel")} disabled={readOnly}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Type">
                  <Select value={draft.type} onValueChange={set("type")} disabled={readOnly}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {isEmail ? (
                  <>
                    <Field label="Subject" htmlFor="cmp-subject">
                      <Input
                        id="cmp-subject"
                        value={draft.subject}
                        onChange={(e) => set("subject")(e.target.value)}
                        placeholder="e.g. Early access starts now"
                        disabled={readOnly}
                      />
                    </Field>
                    <Field label="Preview text" htmlFor="cmp-preview" hint="The snippet shown after the subject in most inboxes.">
                      <Input
                        id="cmp-preview"
                        value={draft.previewText}
                        onChange={(e) => set("previewText")(e.target.value)}
                        placeholder="Optional preheader"
                        disabled={readOnly}
                      />
                    </Field>
                  </>
                ) : null}
                <Field
                  label={isEmail ? "Body" : "Message"}
                  htmlFor="cmp-body"
                  className="sm:col-span-2"
                  hint={
                    isText
                      ? `${bodyLen} characters · ${Math.max(1, Math.ceil(bodyLen / SMS_SEGMENT))} segment${bodyLen > SMS_SEGMENT ? "s" : ""}`
                      : undefined
                  }
                >
                  <Textarea
                    id="cmp-body"
                    rows={isEmail ? 8 : 4}
                    value={draft.body}
                    onChange={(e) => set("body")(e.target.value)}
                    placeholder={isEmail ? "Write your email…" : isText ? "Your text message… keep it under 160 characters." : "Short push message…"}
                    disabled={readOnly}
                  />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "schedule" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Timing" className="sm:col-span-2">
                  <SegmentedTabs
                    tabs={SCHEDULE_MODES}
                    value={draft.scheduleMode}
                    onChange={(v) => !readOnly && set("scheduleMode")(v)}
                  />
                </Field>
                {draft.scheduleMode === "scheduled" ? (
                  <Field label="Send at" htmlFor="cmp-send-at">
                    <Input
                      id="cmp-send-at"
                      type="datetime-local"
                      value={draft.scheduledAt}
                      onChange={(e) => set("scheduledAt")(e.target.value)}
                      disabled={readOnly}
                    />
                  </Field>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {active === "ab" && (isEmail || isText) ? (
            <SectionCard>
              <SettingsList>
                <SettingRow
                  title="Run an A/B test"
                  description="Variant B goes to part of your audience; the rest get variant A."
                  checked={!!draft.ab.enabled}
                  onCheckedChange={(v) => !readOnly && setAb({ enabled: v })}
                />
              </SettingsList>
              {draft.ab.enabled ? (
                <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                  <Field label="Variant A split" hint="Percent of recipients on variant A.">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={5}
                        max={95}
                        value={draft.ab.split}
                        onChange={(e) => setAb({ split: Number(e.target.value) || 50 })}
                        className="tabular-nums"
                        disabled={readOnly}
                      />
                      <span className="text-sm text-text-secondary">%</span>
                    </div>
                  </Field>
                  <Field label="Winning metric">
                    <Select value={draft.ab.metric} onValueChange={(v) => setAb({ metric: v })} disabled={readOnly}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AB_METRIC_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {isEmail ? (
                    <Field label="Variant B subject" className="sm:col-span-2">
                      <Input
                        value={draft.ab.variantB.subject}
                        onChange={(e) => setVariantB({ subject: e.target.value })}
                        placeholder="Alternate subject line"
                        disabled={readOnly}
                      />
                    </Field>
                  ) : null}
                  <Field label={isEmail ? "Variant B body" : "Variant B message"} className="sm:col-span-2">
                    <Textarea
                      rows={isEmail ? 5 : 3}
                      value={draft.ab.variantB.body}
                      onChange={(e) => setVariantB({ body: e.target.value })}
                      placeholder="Alternate content for variant B"
                      disabled={readOnly}
                    />
                  </Field>
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {active === "performance" ? <StatGrid stats={performance} columns={4} /> : null}
        </>
      )}
    </EditorShell>
  );
}

export default CampaignEditor;
