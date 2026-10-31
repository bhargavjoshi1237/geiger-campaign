"use client";

import React from "react";
import { Field, Input, SectionCard, Textarea } from "@geiger/ui";
import { applyMergeTags } from "@/lib/email/merge_tags";
import { MergeTextField } from "../builder/merge_tag_picker";
import { PREHEADER_LIMIT, SUBJECT_LIMIT } from "../constants";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sender, subject and preheader (email), plus the internal note every channel has.
export function InboxSection({ draft, set, groups, readOnly, noteReadOnly = readOnly, isEmail }) {
  const fromInvalid = draft.fromEmail && !EMAIL_PATTERN.test(draft.fromEmail);
  const replyInvalid = draft.replyTo && !EMAIL_PATTERN.test(draft.replyTo);
  return (
    <div className="space-y-6">
      {isEmail ? (
        <>
          <SectionCard bare title="Sender" description="Who the email comes from. The from address must be on a verified sending domain.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From name" htmlFor="cmp-from-name">
                <Input id="cmp-from-name" value={draft.fromName} onChange={(e) => set("fromName")(e.target.value)} placeholder="e.g. Halcyon Studio" disabled={readOnly} />
              </Field>
              <Field label="From email" htmlFor="cmp-from-email" hint={fromInvalid ? "Enter a valid email address." : undefined}>
                <Input id="cmp-from-email" type="email" value={draft.fromEmail} onChange={(e) => set("fromEmail")(e.target.value.trim())} placeholder="hello@yourdomain.com" aria-invalid={fromInvalid || undefined} disabled={readOnly} />
              </Field>
              <Field label="Reply-to" htmlFor="cmp-reply-to" hint={replyInvalid ? "Enter a valid email address." : "Optional. Replies go here instead of the from address."} className="sm:col-span-2">
                <Input id="cmp-reply-to" type="email" value={draft.replyTo} onChange={(e) => set("replyTo")(e.target.value.trim())} placeholder="replies@yourdomain.com" aria-invalid={replyInvalid || undefined} disabled={readOnly} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard bare title="Subject and preheader" description="What recipients see in the inbox before they open.">
            <div className="grid gap-4">
              <MergeTextField
                id="cmp-subject"
                label="Subject"
                value={draft.subject}
                onChange={set("subject")}
                groups={groups}
                limit={SUBJECT_LIMIT}
                placeholder="e.g. {{first_name|Hi}}, the Aero is here"
                disabled={readOnly}
                hint={draft.subject.length > SUBJECT_LIMIT ? "Most inboxes cut subjects off around 60 characters." : undefined}
              />
              <MergeTextField
                id="cmp-preheader"
                label="Preheader"
                value={draft.preheader}
                onChange={set("preheader")}
                groups={groups}
                limit={PREHEADER_LIMIT}
                placeholder="The line shown after the subject"
                disabled={readOnly}
              />
              <div className="rounded-lg border border-border bg-surface-card px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Inbox preview (no contact data)</p>
                <p className="mt-1.5 truncate text-sm font-medium text-foreground">{draft.fromName || "From name"}</p>
                <p className="truncate text-sm text-foreground">{applyMergeTags(draft.subject, {}) || "No subject yet"}</p>
                <p className="truncate text-xs text-text-secondary">{applyMergeTags(draft.preheader, {}) || "No preheader"}</p>
              </div>
            </div>
          </SectionCard>
        </>
      ) : null}

      <SectionCard bare title="Internal note" description="Only your team sees this.">
        <Textarea rows={3} value={draft.description} onChange={(e) => set("description")(e.target.value)} placeholder="What this campaign is for, who asked for it, anything reviewers should know." disabled={noteReadOnly} aria-label="Internal note" />
      </SectionCard>
    </div>
  );
}

export default InboxSection;
