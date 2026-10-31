"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  AtSign,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Hourglass,
  Loader2,
  Mail,
  MessageSquareText,
  Save,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Progress,
  SectionCard,
  StatusPill,
  Textarea,
  cn,
} from "@geiger/ui";
import { documentIsEmpty, hasUnsubscribeLink } from "@/lib/email/blocks";
import { abProblems } from "./ab_section";
import { EMAIL_PATTERN } from "./inbox_section";
import { scheduleProblems, scheduleSummary } from "./schedule_section";
import { APPROVAL_STATE_LABEL, APPROVAL_STATUS_MAP, OUTLINE_BUTTON, formatDateTime, formatNumber } from "../constants";

const plural = (n, one, many) => `${formatNumber(n)} ${n === 1 ? one : many}`;

// Recipients dropped by unsubscribes, suppressions, missing addresses or consent.
const excludedCount = (estimate) => Object.values(estimate.data?.excluded || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

// The pre-send checks over the saved campaign; each failing item names the section that fixes it.
export function reviewChecklist({ campaign, dirty, estimate }) {
  const isEmail = campaign.channel === "email";
  const a = campaign.audience || {};
  const content = campaign.content || {};
  const items = [];
  const add = (key, label, ok, detail, { target = null, fix = null, level = "block" } = {}) =>
    items.push({ key, label, ok, detail, target, fix, level: ok ? "ok" : level });

  add("saved", dirty ? "Unsaved changes" : "All changes saved", !dirty, dirty ? "The send uses the saved version, so save first." : null, { fix: "Save changes" });
  if (isEmail) {
    add("subject", "Subject line", !!campaign.subject.trim(), campaign.subject.trim() ? campaign.subject : "Recipients see this first in their inbox.", { target: "inbox", fix: "Add a subject" });
    const fromOk = !!campaign.fromName.trim() && EMAIL_PATTERN.test(campaign.fromEmail);
    add("from", "Sender", fromOk, fromOk ? `${campaign.fromName} <${campaign.fromEmail}>` : "Add a from name and a valid from email.", { target: "inbox", fix: "Set the sender" });
    add("content", "Content", !documentIsEmpty(content), documentIsEmpty(content) ? "The email has no blocks yet." : plural(content.blocks.length, "block", "blocks"), { target: "content", fix: "Add content" });
    add("unsubscribe", "Unsubscribe link", hasUnsubscribeLink(content), hasUnsubscribeLink(content) ? "Included in the footer." : "Turn on the footer in the builder or add {{unsubscribe_url}}.", { target: "content", fix: "Add an unsubscribe link" });
  } else {
    const body = String(content.body || "").trim();
    add("content", "Message", !!body, body ? plural(body.length, "character", "characters") : "Write the message first.", { target: "content", fix: "Write the message" });
  }
  const included = (a.listIds || []).length + (a.segmentIds || []).length;
  add("audience", "Audience", included > 0, included ? `${plural(included, "list or segment", "lists and segments")} included` : "Choose who receives it.", { target: "audience", fix: "Choose an audience" });
  if (included) {
    const excluded = excludedCount(estimate);
    const note = excluded ? ` · ${formatNumber(excluded)} excluded` : "";
    if (estimate.loading) add("recipients", "Recipients", true, "Counting…", { target: "audience" });
    else if (estimate.error) add("recipients", "Recipients", false, `Couldn't estimate: ${estimate.error}`, { target: "audience", level: "warn" });
    else add("recipients", "Recipients", Number(estimate.data?.recipients) > 0, `${formatNumber(estimate.data?.recipients)} will receive it${note}`, { target: "audience", fix: "Review the audience" });
  }
  const sched = scheduleProblems(campaign.sendStrategy, campaign.scheduledAt);
  add("schedule", "Schedule", !sched.length, sched[0] || scheduleSummary(campaign.sendStrategy, campaign.scheduledAt), { target: "schedule", fix: "Fix the schedule" });
  if (campaign.ab?.enabled) {
    const abp = abProblems(campaign.ab);
    add("ab", "A/B test", !abp.length, abp[0] || "Both variants are ready.", { target: "ab", fix: "Finish the A/B test" });
  }
  (estimate.data?.warnings || []).forEach((w, i) => add(`warning-${i}`, "Worth checking", false, w, { level: "warn" }));
  return items;
}

const ICON = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />,
  warn: <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />,
  block: <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />,
};

const TONE = {
  ready: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  blocked: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approval: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  neutral: "bg-surface-hover text-text-secondary",
};

// Short "when" for the launch summary; scheduleSummary carries the full sentence.
function whenLabel(strategy = {}, scheduledAt) {
  const mode = strategy.mode || "now";
  if (mode === "now") return { value: "Right away", hint: "As soon as you confirm" };
  if (mode === "scheduled") return { value: scheduledAt ? formatDateTime(scheduledAt) : "Not set", hint: "Scheduled send" };
  if (mode === "timezone") return { value: strategy.date ? `${strategy.date}, ${strategy.localTime || "09:00"}` : "Not set", hint: "In each contact's time zone" };
  return { value: strategy.windowStart ? formatDateTime(strategy.windowStart) : "Not set", hint: `Best time within ${strategy.windowHours || 24} hours` };
}

// Where the campaign stands on the way to launch: checks, then approval, then send.
function launchPhase({ blocked, approval, estimate }) {
  if (blocked.length) return "blocked";
  if (approval.loading || estimate.loading) return "checking";
  if (approval.state.required && !approval.state.approved) return approval.state.state === "pending" ? "pending" : "approval";
  return "ready";
}

function SummaryCell({ icon: Icon, label, value, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 bg-surface-subtle px-5 py-3.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="mt-1 block truncate text-sm font-medium text-foreground">{value}</span>
      {hint ? <span className="block truncate text-xs text-text-tertiary">{hint}</span> : null}
    </button>
  );
}

// The launch panel: where things stand, what will go out, and the one next step.
function LaunchPanel({ phase, headline, subline, cells, action, secondary }) {
  const tone = phase === "ready" ? TONE.ready : phase === "blocked" ? TONE.blocked : phase === "checking" ? TONE.neutral : TONE.approval;
  const Icon = phase === "ready" ? CheckCircle2 : phase === "blocked" ? CircleAlert : phase === "pending" ? Hourglass : phase === "checking" ? Loader2 : ShieldCheck;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tone)}>
            <Icon className={cn("h-5 w-5", phase === "checking" && "animate-spin")} />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{headline}</p>
            {subline ? <p className="mt-0.5 text-sm text-text-secondary">{subline}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondary}
          {action}
        </div>
      </div>
      <div className={cn("grid gap-px border-t border-border bg-border", cells.length === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-3")}>
        {cells.map((c) => (
          <SummaryCell key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}

function ChecklistCard({ items, saving, onSave, onNavigate }) {
  const passed = items.filter((i) => i.level === "ok").length;
  return (
    <SectionCard
      title="Pre-send checks"
      description={passed === items.length ? "Everything checks out." : `${passed} of ${items.length} passed. Fix the rest from here.`}
      action={
        <div className="flex items-center gap-2 pt-1.5 text-xs tabular-nums text-text-secondary">
          <Progress value={Math.round((passed / Math.max(1, items.length)) * 100)} className="h-1.5 w-24 bg-surface-hover" />
          {passed}/{items.length}
        </div>
      }
      bodyPadding={false}
    >
      <ul className="divide-y divide-border">
        {items.map((i) => {
          const failing = i.level !== "ok";
          const canFix = failing && (i.key === "saved" || i.target);
          return (
            <li key={i.key} className="group flex items-center gap-3 px-5 py-3">
              {ICON[i.level]}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{i.label}</p>
                {i.detail ? <p className="break-words text-xs text-text-secondary">{i.detail}</p> : null}
              </div>
              {canFix ? (
                i.key === "saved" ? (
                  <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={onSave} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => onNavigate(i.target)}>
                    Fix <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )
              ) : i.target ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onNavigate(i.target)}
                  className="text-text-tertiary hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  Edit
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function ApprovalHistory({ approval, nameOf }) {
  const { state, latest } = approval;
  return (
    <SectionCard bare title="Approval" description={state.required ? "Your workspace requires sign-off before this campaign sends." : "No approval is required for this campaign."}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-text-tertiary" />
          <span className="font-medium text-foreground">{APPROVAL_STATE_LABEL[state.state]}</span>
          {latest ? <StatusPill status={latest.status} map={APPROVAL_STATUS_MAP} /> : null}
        </div>
        {latest ? (
          <div className="rounded-lg border border-border bg-surface-card px-4 py-3 text-sm">
            <p className="text-text-secondary">
              Submitted by <span className="text-foreground">{nameOf(latest.requestedBy)}</span> · {formatDateTime(latest.createdAt)}
            </p>
            {latest.note ? <p className="mt-1 text-text-secondary">“{latest.note}”</p> : null}
            {latest.decidedAt ? (
              <p className="mt-2 text-text-secondary">
                {APPROVAL_STATUS_MAP[latest.status]?.label || latest.status} by <span className="text-foreground">{nameOf(latest.decidedBy)}</span> · {formatDateTime(latest.decidedAt)}
                {latest.decisionNote ? <span className="block text-foreground">“{latest.decisionNote}”</span> : null}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Not submitted yet. Submit it once the checks pass.</p>
        )}
      </div>
    </SectionCard>
  );
}

export function ReviewSection({ campaign, dirty, estimate, approval, nameOf, canSend, canEdit, saving, sending, submitting, onSave, onNavigate, onSend, onSubmitReview, onSendTest }) {
  const [confirm, setConfirm] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [note, setNote] = useState("");

  const isEmail = campaign.channel === "email";
  const scheduled = (campaign.sendStrategy?.mode || "now") !== "now";
  const verb = scheduled ? "schedule" : "send";
  const recipients = estimate.data?.recipients;
  const items = reviewChecklist({ campaign, dirty, estimate });
  const blocked = items.filter((i) => i.level === "block");
  const phase = launchPhase({ blocked, approval, estimate });
  const { state, latest } = approval;
  const when = whenLabel(campaign.sendStrategy, campaign.scheduledAt);
  const excluded = excludedCount(estimate);
  const included = (campaign.audience?.listIds || []).length + (campaign.audience?.segmentIds || []).length;

  const cells = [
    {
      icon: Users,
      label: "Recipients",
      value: !included ? "No audience" : estimate.loading ? "Counting…" : recipients != null ? formatNumber(recipients) : "—",
      hint: excluded ? `${formatNumber(excluded)} excluded` : included ? plural(included, "list or segment", "lists and segments") : "Choose who receives it",
      onClick: () => onNavigate("audience"),
    },
    { icon: CalendarClock, label: "Delivery", value: when.value, hint: when.hint, onClick: () => onNavigate("schedule") },
    ...(isEmail
      ? [
          { icon: AtSign, label: "From", value: campaign.fromName.trim() || "Not set", hint: campaign.fromEmail || null, onClick: () => onNavigate("inbox") },
          { icon: Mail, label: "Subject", value: campaign.subject.trim() || "Not set", hint: campaign.ab?.enabled ? "A/B test on" : campaign.preheader || null, onClick: () => onNavigate("inbox") },
        ]
      : [
          {
            icon: MessageSquareText,
            label: "Message",
            value: String(campaign.content?.body || "").trim() || "Not written",
            hint: null,
            onClick: () => onNavigate("content"),
          },
        ]),
  ];

  const sendButton = (
    <Button onClick={() => setConfirm(true)} disabled={phase !== "ready" || !canSend || sending}>
      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduled ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
      {scheduled ? "Schedule send" : "Send now"}
    </Button>
  );

  let headline;
  let subline;
  let action = sendButton;
  if (phase === "blocked") {
    const first = blocked[0];
    headline = `${plural(blocked.length, "thing", "things")} to fix before you ${verb}`;
    subline = blocked.map((i) => i.label).join(", ");
    action =
      first.key === "saved" ? (
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
        </Button>
      ) : (
        <Button onClick={() => onNavigate(first.target)}>
          {first.fix} <ArrowRight className="h-4 w-4" />
        </Button>
      );
  } else if (phase === "checking") {
    headline = "Running final checks…";
    subline = "Counting recipients and checking approval.";
  } else if (phase === "approval") {
    headline = state.state === "not_submitted" ? "Ready for approval" : APPROVAL_STATE_LABEL[state.state] || "Needs approval";
    subline =
      state.state === "stale"
        ? "The campaign changed after it was reviewed. Submit it again."
        : !canEdit
          ? "Ask someone who can edit campaigns to submit it for review."
          : latest?.decisionNote && ["rejected", "changes_requested"].includes(state.state)
            ? `“${latest.decisionNote}” · ${nameOf(latest.decidedBy)}`
            : `All checks pass. Your workspace requires sign-off before this campaign can ${verb}.`;
    action = (
      <Button onClick={() => setSubmitOpen(true)} disabled={!canEdit || submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {state.state === "not_submitted" ? "Submit for review" : "Submit again"}
      </Button>
    );
  } else if (phase === "pending") {
    headline = "Waiting for approval";
    subline = latest ? `Submitted by ${nameOf(latest.requestedBy)} · ${formatDateTime(latest.createdAt)}. You can ${verb} once it's approved.` : `You can ${verb} once it's approved.`;
  } else {
    headline = scheduled ? "Ready to schedule" : "Ready to send";
    subline = canSend ? scheduleSummary(campaign.sendStrategy, campaign.scheduledAt) : "Your role can't send campaigns. Ask someone with send access to launch it.";
  }

  const secondary =
    isEmail && canEdit ? (
      <Button variant="outline" className={OUTLINE_BUTTON} onClick={onSendTest}>
        <Send className="h-4 w-4" /> Send test
      </Button>
    ) : null;

  return (
    <div className="space-y-6">
      <LaunchPanel phase={phase} headline={headline} subline={subline} cells={cells} action={action} secondary={secondary} />

      <ChecklistCard items={items} saving={saving} onSave={onSave} onNavigate={onNavigate} />

      {state.required || latest ? <ApprovalHistory approval={approval} nameOf={nameOf} /> : null}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{scheduled ? "Schedule this campaign?" : "Send this campaign now?"}</DialogTitle>
            <DialogDescription>{scheduleSummary(campaign.sendStrategy, campaign.scheduledAt)}</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 rounded-lg border border-border bg-surface-card px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Recipients</dt>
              <dd className="font-medium text-foreground">{recipients != null ? formatNumber(recipients) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Delivery</dt>
              <dd className="truncate font-medium text-foreground">{when.value}</dd>
            </div>
            {isEmail ? (
              <div className="flex justify-between gap-4">
                <dt className="text-text-secondary">Subject</dt>
                <dd className="truncate font-medium text-foreground">{campaign.subject}</dd>
              </div>
            ) : null}
          </dl>
          {!scheduled ? <p className="text-xs text-text-secondary">Sending starts right away. You can pause it, but delivered messages can&apos;t be recalled.</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                setConfirm(false);
                await onSend();
              }}
            >
              {scheduled ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {scheduled ? "Schedule" : "Send now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit for review?</DialogTitle>
            <DialogDescription>Approvers see it in Settings → Approvals. You can {verb} it once it&apos;s approved.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Note for reviewers" htmlFor="review-note">
              <Textarea id="review-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything reviewers should check (optional)" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button
              disabled={submitting}
              onClick={async () => {
                if (await onSubmitReview(note)) {
                  setNote("");
                  setSubmitOpen(false);
                }
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Submit for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ReviewSection;
