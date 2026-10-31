"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AtSign,
  BarChart3,
  CalendarClock,
  Copy,
  FlaskConical,
  Loader2,
  Mail,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";

import { EditorShell } from "@/components/internal/shared/editor_shell";
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
  InlineTitleInput,
  StatusPill,
} from "@geiger/ui";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getCampaign, updateCampaign, updateCampaignMeta } from "@/lib/supabase/campaigns";
import { createApprovalRequest } from "@/lib/supabase/approvals";
import { listEmailTemplates, markEmailTemplateUsed } from "@/lib/supabase/email_templates";
import { getUser } from "@/lib/supabase/user";
import { cancelCampaign, sendCampaign } from "@/lib/campaigns/api";
import { normalizeAb } from "@/lib/campaigns/ab";
import { campaignFingerprint } from "@/lib/campaigns/fingerprint";
import { emptyDocument } from "@/lib/email/blocks";
import { useBuilderResources } from "./builder/use_builder_resources";
import { AbSection } from "./editor/ab_section";
import { AudienceSection } from "./editor/audience_section";
import { ContentSection } from "./editor/content_section";
import { InboxSection } from "./editor/inbox_section";
import { ResultsSection } from "./editor/results_section";
import { ReviewSection } from "./editor/review_section";
import { ScheduleSection, resolveSchedule } from "./editor/schedule_section";
import { SendTestDialog } from "./editor/send_test_dialog";
import { useAudienceOptions, useCampaignApproval, useMemberNames, useRecipientEstimate } from "./editor/use_campaign_support";
import {
  CAMPAIGN_STATUS_MAP,
  CHANNEL_MAP,
  EDITABLE_STATUSES,
  OUTLINE_BUTTON,
  REPORTABLE_STATUSES,
  TYPE_MAP,
  formatDateTime,
  formatNumber,
} from "./constants";

const NAV = [
  { key: "results", label: "Results", icon: BarChart3, desc: "Delivery and engagement, from the send log and tracked events.", showIf: (s) => s.reportable },
  { key: "content", label: "Content", icon: Mail, desc: "What recipients receive. Merge tags like {{first_name|there}} personalize it." },
  { key: "audience", label: "Audience", icon: Users, desc: "Who receives the campaign and who's left out." },
  { key: "inbox", label: "Sender and subject", icon: AtSign, desc: "How the campaign appears in the inbox.", showIf: (s) => s.isEmail },
  { key: "details", label: "Details", icon: AtSign, desc: "Internal notes for your team.", showIf: (s) => !s.isEmail },
  { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "When it goes out: now, at a set time, in each contact's time zone, or at their best time." },
  { key: "ab", label: "A/B testing", icon: FlaskConical, desc: "Test two subject lines or designs, then send the winner.", showIf: (s) => s.isEmail },
  { key: "review", label: "Review and send", icon: ShieldCheck, desc: "Final checks, approval, test sends and the send itself.", showIf: (s) => s.sendable },
];

const SENDABLE = new Set(["draft", "in_review", "approved", "cancelled", "failed"]);

// Editable slice of a campaign; drives both the form and the dirty check.
function toDraft(c) {
  return {
    name: c.name || "",
    description: c.description || "",
    subject: c.subject || "",
    preheader: c.preheader || "",
    fromName: c.fromName || "",
    fromEmail: c.fromEmail || "",
    replyTo: c.replyTo || "",
    content: c.content && Object.keys(c.content).length ? c.content : c.channel === "email" ? emptyDocument() : { body: "" },
    templateId: c.templateId || null,
    audience: { listIds: [], segmentIds: [], excludeListIds: [], excludeSegmentIds: [], ...(c.audience || {}) },
    sendStrategy: { mode: "now", ...(c.sendStrategy || {}) },
    scheduledAt: c.scheduledAt || null,
    ab: normalizeAb(c.ab),
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function CampaignEditor({ campaign, projectId, onBack, onSaved, onDelete, onDuplicate }) {
  const { can } = useRbac();
  const url = useWorkspaceUrl();
  const [saved, setSaved] = useState(campaign);
  const baseline = useMemo(() => toDraft(saved), [saved]);
  const [draft, setDraft] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [testOpen, setTestOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [userEmail, setUserEmail] = useState("");

  const resources = useBuilderResources(projectId);
  const audienceOptions = useAudienceOptions(projectId);
  const estimate = useRecipientEstimate(projectId, saved.id, saved.updatedAt);
  const approval = useCampaignApproval(projectId, saved);
  const { nameOf } = useMemberNames(projectId);

  useEffect(() => {
    let alive = true;
    listEmailTemplates(projectId).then((rows) => alive && setTemplates(rows ?? []));
    getUser().then((u) => alive && setUserEmail(u?.email || ""));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const canEdit = can("campaign.campaign.edit");
  const canSend = can("campaign.campaign.send");
  const canDelete = can("campaign.campaign.delete");
  const status = saved.status;
  const isEmail = saved.channel === "email";
  const readOnly = !canEdit || !EDITABLE_STATUSES.has(status);
  const dirty = !same(draft, baseline);
  const channelMeta = CHANNEL_MAP[saved.channel] || CHANNEL_MAP.email;
  const typeMeta = TYPE_MAP[saved.type] || TYPE_MAP.regular;

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const sync = (updated) => {
    setSaved(updated);
    setDraft(toDraft(updated));
    onSaved?.(updated);
  };

  const refetch = async () => {
    const fresh = await getCampaign(projectId, saved.id);
    if (fresh) sync(fresh);
    return fresh;
  };

  const save = async () => {
    if (!dirty) return saved;
    setSaving(true);
    const fields = {
      name: draft.name.trim() || "Untitled campaign",
      subject: draft.subject,
      preheader: draft.preheader,
      fromName: draft.fromName,
      fromEmail: draft.fromEmail,
      replyTo: draft.replyTo,
      content: draft.content,
      templateId: draft.templateId,
      audience: draft.audience,
      sendStrategy: draft.sendStrategy,
      scheduledAt: draft.sendStrategy.mode === "scheduled" ? draft.scheduledAt : null,
      ab: draft.ab,
    };
    if (saved.type !== "automated") fields.type = draft.ab.enabled ? "ab_test" : "regular";
    // Editing reviewed content pulls the campaign back to draft so it gets a fresh review.
    const reviewed = approval.latest?.fingerprint;
    if ((status === "in_review" || status === "approved") && reviewed && campaignFingerprint({ ...saved, ...fields }) !== reviewed) {
      fields.status = "draft";
    }
    const updated = await updateCampaign(saved.id, fields);
    if (!updated) {
      setSaving(false);
      toast.error("Couldn't save the campaign.");
      return null;
    }
    let result = updated;
    if (draft.description !== baseline.description) {
      const meta = await updateCampaignMeta(saved.id, { description: draft.description });
      if (meta) result = { ...updated, ...meta, description: draft.description };
      else toast.error("Saved, but the internal note didn't save.");
    }
    setSaving(false);
    sync(result);
    toast.success(fields.status === "draft" && status !== "draft" ? "Saved. The campaign needs a new review." : "Campaign saved.");
    return result;
  };

  const openBuilder = async (variant) => {
    if (dirty && !(await save())) return;
    url.openRecordInTab(variant ? `${saved.id}~${variant}` : saved.id, "Email Builder");
  };

  const applyTemplate = ({ kind, source }) => {
    const doc = kind === "starter" ? source.doc() : source.content;
    setDraft((d) => ({
      ...d,
      content: JSON.parse(JSON.stringify(doc || emptyDocument())),
      subject: d.subject || source.subject || "",
      preheader: d.preheader || source.preheader || "",
      templateId: kind === "saved" ? source.id : d.templateId,
    }));
    if (kind === "saved") markEmailTemplateUsed(source);
    toast.success(`Loaded “${source.name}”. Save to keep it.`);
  };

  const send = async () => {
    setBusy("send");
    const plan = resolveSchedule(saved.sendStrategy, saved.scheduledAt);
    const res = await sendCampaign(projectId, saved.id, plan);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.status === 409 ? res.error || "This campaign needs approval before it can send." : res.error || "Couldn't send the campaign.");
      return;
    }
    const n = res.data?.recipients;
    toast.success(plan.mode === "now" ? `Sending to ${formatNumber(n)} recipients.` : `Scheduled for ${formatDateTime(res.data?.scheduledAt || plan.scheduledAt)}.`);
    const fresh = await refetch();
    if (fresh && REPORTABLE_STATUSES.has(fresh.status)) url.setSection("results");
  };

  const submitReview = async (note) => {
    setBusy("review");
    const user = await getUser();
    const request = await createApprovalRequest(projectId, {
      id: crypto.randomUUID(),
      campaignId: saved.id,
      requestedBy: user?.id ?? null,
      createdBy: user?.id ?? null,
      note,
      fingerprint: campaignFingerprint(saved),
      metadata: {
        campaignName: saved.name,
        channel: saved.channel,
        subject: saved.subject,
        recipients: estimate.data?.recipients ?? null,
        scheduledAt: resolveSchedule(saved.sendStrategy, saved.scheduledAt).scheduledAt,
      },
    });
    if (!request) {
      setBusy(null);
      toast.error("Couldn't submit the campaign for review.");
      return false;
    }
    approval.setRequests([request, ...approval.requests]);
    const updated = await updateCampaign(saved.id, { status: "in_review" });
    setBusy(null);
    if (updated) sync(updated);
    toast.success("Submitted for review. Approvers see it in Settings → Approvals.");
    return true;
  };

  const cancel = async () => {
    setBusy("cancel");
    const res = await cancelCampaign(projectId, saved.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't cancel the send.");
      return;
    }
    toast.success("Send cancelled. The campaign is back to editable.");
    refetch();
  };

  const pause = async () => {
    setBusy("pause");
    const updated = await updateCampaign(saved.id, { status: "paused" });
    setBusy(null);
    if (!updated) {
      toast.error("Couldn't pause the campaign.");
      return;
    }
    sync(updated);
    toast.success("Paused. Remaining recipients won't receive it until you resume.");
  };

  const resume = async () => {
    setBusy("resume");
    const res = await sendCampaign(projectId, saved.id, { mode: "now", strategy: { mode: "now" } });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't resume the campaign.");
      return;
    }
    toast.success("Resumed.");
    refetch();
  };

  const spin = (key, Icon) => (busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />);

  const primary = () => {
    if (SENDABLE.has(status)) {
      // The review section carries its own launch action.
      if (url.section === "review") return null;
      return (
        <Button onClick={() => url.setSection("review")}>
          <ShieldCheck className="h-4 w-4" /> {status === "in_review" ? "View review" : "Review and send"}
        </Button>
      );
    }
    if (status === "scheduled" && canSend) {
      return (
        <Button variant="outline" className={OUTLINE_BUTTON} disabled={!!busy} onClick={cancel}>
          {spin("cancel", Undo2)} Cancel schedule
        </Button>
      );
    }
    if (status === "sending" && canSend) {
      return (
        <Button disabled={!!busy} onClick={pause}>
          {spin("pause", Pause)} Pause
        </Button>
      );
    }
    if (status === "paused" && canSend) {
      return (
        <>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!!busy} onClick={cancel}>
            {spin("cancel", Undo2)} Cancel
          </Button>
          <Button disabled={!!busy} onClick={resume}>
            {spin("resume", Play)} Resume
          </Button>
        </>
      );
    }
    return null;
  };

  const dateLine =
    status === "sent" && saved.sentAt
      ? `Sent ${formatDateTime(saved.sentAt)}`
      : status === "scheduled" && saved.scheduledAt
        ? `Scheduled ${formatDateTime(saved.scheduledAt)}`
        : saved.updatedAt
          ? `Edited ${formatDateTime(saved.updatedAt)}`
          : null;

  const reportable = REPORTABLE_STATUSES.has(status);

  return (
    <>
      <EditorShell
        back={{ label: "Back", onClick: () => (dirty ? setLeaveOpen(true) : onBack()) }}
        title={
          <InlineTitleInput
            value={draft.name}
            onChange={(e) => set("name")(e.target.value)}
            aria-label="Campaign name"
            placeholder="Untitled campaign"
            disabled={!canEdit}
            className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          />
        }
        badges={
          <>
            <StatusPill status={status} map={CAMPAIGN_STATUS_MAP} />
            <Badge variant={channelMeta.variant}>
              <channelMeta.icon className="h-3 w-3" /> {channelMeta.label}
            </Badge>
            <Badge variant={typeMeta.variant}>{typeMeta.label}</Badge>
            {dateLine ? <span className="text-xs text-text-tertiary">{dateLine}</span> : null}
          </>
        }
        actions={
          <>
            <ActionMenu
              label="More campaign actions"
              triggerClassName="size-9"
              items={[
                canEdit && { label: "Duplicate", icon: Copy, onSelect: () => onDuplicate(saved) },
                isEmail && canEdit && { label: "Send test", icon: Send, onSelect: () => setTestOpen(true) },
                { separator: true },
                canDelete && status !== "sending" && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDelete(saved) },
              ]}
            />
            {canEdit ? (
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            ) : null}
            {primary()}
          </>
        }
        nav={NAV}
        subject={{ reportable, isEmail, sendable: SENDABLE.has(status) }}
        defaultSection={reportable ? "results" : "content"}
      >
        {({ active }) => (
          <>
            {active === "results" ? <ResultsSection projectId={projectId} campaign={saved} /> : null}
            {active === "content" ? (
              <ContentSection
                draft={draft}
                setContent={set("content")}
                applyTemplate={applyTemplate}
                channel={saved.channel}
                groups={resources.groups}
                readOnly={readOnly}
                brand={resources.brand}
                templates={templates}
                onOpenBuilder={() => openBuilder()}
              />
            ) : null}
            {active === "audience" ? (
              <AudienceSection audience={draft.audience} setAudience={set("audience")} options={audienceOptions} estimate={estimate} dirty={!same(draft.audience, baseline.audience)} readOnly={readOnly} />
            ) : null}
            {active === "inbox" || active === "details" ? <InboxSection draft={draft} set={set} groups={resources.groups} readOnly={readOnly} noteReadOnly={!canEdit} isEmail={isEmail && active === "inbox"} /> : null}
            {active === "schedule" ? (
              <ScheduleSection strategy={draft.sendStrategy} scheduledAt={draft.scheduledAt} setStrategy={set("sendStrategy")} setScheduledAt={set("scheduledAt")} readOnly={readOnly} />
            ) : null}
            {active === "ab" ? (
              <AbSection ab={draft.ab} setAb={set("ab")} draft={draft} groups={resources.groups} readOnly={readOnly} onEditVariantContent={() => openBuilder("b")} />
            ) : null}
            {active === "review" ? (
              <ReviewSection
                campaign={saved}
                dirty={dirty}
                estimate={estimate}
                approval={approval}
                nameOf={nameOf}
                canSend={canSend}
                canEdit={canEdit}
                saving={saving}
                sending={busy === "send"}
                submitting={busy === "review"}
                onSave={save}
                onNavigate={(key) => url.setSection(key)}
                onSend={send}
                onSubmitReview={submitReview}
                onSendTest={() => setTestOpen(true)}
              />
            ) : null}
          </>
        )}
      </EditorShell>

      <SendTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        projectId={projectId}
        campaignId={saved.id}
        defaultTo={userEmail}
        beforeSend={async () => (dirty ? !!(await save()) : true)}
      />

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>Your edits to this campaign haven&apos;t been saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button
              variant="outline"
              className={OUTLINE_BUTTON}
              onClick={() => {
                setLeaveOpen(false);
                onBack();
              }}
            >
              Discard
            </Button>
            <Button
              onClick={async () => {
                if (await save()) {
                  setLeaveOpen(false);
                  onBack();
                }
              }}
            >
              Save and leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CampaignEditor;
