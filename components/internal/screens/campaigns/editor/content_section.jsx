"use client";

import React, { useMemo, useState } from "react";
import { Check, LayoutTemplate, Mail, PencilRuler, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  SectionCard,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
} from "@geiger/ui";
import { documentIsEmpty, hasUnsubscribeLink, renderEmailDocument, walkBlocks, blockRule } from "@/lib/email/blocks";
import { extractMergeTags } from "@/lib/email/merge_tags";
import { EMAIL_STARTERS } from "@/lib/email/starters";
import { EmailPreviewFrame } from "../builder/email_preview";
import { MergeTextField } from "../builder/merge_tag_picker";
import { SMS_SEGMENT } from "../constants";

// GSM-7 texts split at 153 chars per part, anything with other characters at 67 (70 for a single part).
function smsSegments(text) {
  const t = String(text || "");
  if (!t) return { chars: 0, parts: 0, unicode: false };
  const unicode = /[^\n\r\x20-\x7E£¥èéùìòÇØøÅå_ÆæßÉ¡ÄÖÑÜ§¿äöñüà€^{}\\[~\]|]/.test(t);
  const single = unicode ? 70 : SMS_SEGMENT;
  const multi = unicode ? 67 : 153;
  return { chars: t.length, parts: t.length <= single ? 1 : Math.ceil(t.length / multi), unicode };
}

function docStats(doc) {
  let blocks = 0;
  let rules = 0;
  const tags = new Set();
  walkBlocks(doc, (b) => {
    blocks += 1;
    if (blockRule(b)) rules += 1;
    for (const k of extractMergeTags(JSON.stringify(b.props || {}))) tags.add(k);
  });
  return { blocks, rules, tags: [...tags] };
}

const Yes = ({ ok, children }) => (
  <span className={ok ? "inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400" : "inline-flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400"}>
    {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {children}
  </span>
);

function TemplatePicker({ templates, onPick, disabled }) {
  const [pending, setPending] = useState(null);
  const choose = (value) => {
    const [kind, id] = value.split(":");
    const source = kind === "starter" ? EMAIL_STARTERS.find((s) => s.key === id) : templates.find((t) => t.id === id);
    if (source) setPending({ kind, source });
  };
  return (
    <>
      <Select value="" onValueChange={choose} disabled={disabled}>
        <SelectTrigger className="h-9 w-48 bg-surface-card" aria-label="Start from a template">
          <SelectValue placeholder="Use a template" />
        </SelectTrigger>
        <SelectContent>
          {templates.length ? (
            <SelectGroup>
              <SelectLabel>Saved templates</SelectLabel>
              {templates.map((t) => (
                <SelectItem key={t.id} value={`saved:${t.id}`}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          <SelectGroup>
            <SelectLabel>Starter layouts</SelectLabel>
            {EMAIL_STARTERS.map((s) => (
              <SelectItem key={s.key} value={`starter:${s.key}`}>
                {s.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replace the email content?</DialogTitle>
            <DialogDescription>
              The current design is replaced with <span className="font-medium text-foreground">{pending?.source?.name}</span>. Empty subject and preheader fields are filled from it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button
              onClick={() => {
                onPick(pending);
                setPending(null);
              }}
            >
              Replace content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ContentSection({ draft, setContent, applyTemplate, channel, groups, readOnly, brand, onOpenBuilder, templates }) {
  const isEmail = channel === "email";
  const content = useMemo(() => draft.content || {}, [draft.content]);
  const preview = useMemo(
    () => (isEmail && !documentIsEmpty(content) ? renderEmailDocument(content, { brand, preheader: draft.preheader, subject: draft.subject, placeholders: true }).html : ""),
    [isEmail, content, brand, draft.preheader, draft.subject],
  );
  const stats = useMemo(() => (isEmail ? docStats(content) : null), [isEmail, content]);

  if (!isEmail) {
    const isPush = channel === "push";
    const seg = smsSegments(content.body);
    return (
      <SectionCard bare title="Message" description={isPush ? "Title and body of the notification." : "Keep it short; carriers bill per segment."}>
        <div className="grid gap-4">
          {isPush ? (
            <MergeTextField id="cmp-push-title" label="Title" value={content.title || ""} onChange={(v) => setContent({ ...content, title: v })} groups={groups} limit={65} disabled={readOnly} />
          ) : null}
          <MergeTextField
            id="cmp-body"
            label={isPush ? "Body" : "Message"}
            value={content.body || ""}
            onChange={(v) => setContent({ ...content, body: v })}
            groups={groups}
            multiline
            rows={isPush ? 3 : 5}
            placeholder={isPush ? "Short push message…" : "Your message… recipients can reply STOP to opt out."}
            disabled={readOnly}
            hint={isPush ? undefined : `${seg.chars} characters · ${seg.parts} ${seg.parts === 1 ? "segment" : "segments"}${seg.unicode ? " · contains non-GSM characters (70 per segment)" : ""}`}
          />
          {isPush ? (
            <Field label="Open URL" htmlFor="cmp-push-url" hint="Where tapping the notification goes (optional).">
              <Input id="cmp-push-url" value={content.url || ""} onChange={(e) => setContent({ ...content, url: e.target.value })} placeholder="https://…" disabled={readOnly} />
            </Field>
          ) : null}
        </div>
      </SectionCard>
    );
  }

  const empty = documentIsEmpty(content);
  return (
    <div className="space-y-6">
      <SectionCard
        title="Email design"
        description={empty ? undefined : "A preview of the saved design. Open the builder to change it."}
        action={
          !readOnly ? (
            <div className="flex items-center gap-2">
              <TemplatePicker templates={templates} onPick={applyTemplate} disabled={readOnly} />
              <Button onClick={onOpenBuilder}>
                <PencilRuler className="h-4 w-4" /> Open builder
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="bg-surface-card" onClick={onOpenBuilder}>
              <Mail className="h-4 w-4" /> View in builder
            </Button>
          )
        }
        bodyPadding={!empty}
      >
        {empty ? (
          <EmptyState
            icon={LayoutTemplate}
            title="No content yet"
            description="Design the email in the builder, or start from a template."
            action={!readOnly ? <Button onClick={onOpenBuilder}><PencilRuler className="h-4 w-4" /> Open builder</Button> : null}
          />
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-lg border border-border bg-surface-card p-3">
            <EmailPreviewFrame html={preview} width={640} minHeight={360} className="border-0" />
          </div>
        )}
      </SectionCard>

      {!empty ? (
        <SectionCard bare title="Content check" description="What the design contains and whether it's ready to send.">
          <SettingsList>
            <SettingRow title="Blocks" description="Including blocks inside columns." control={<span className="text-sm tabular-nums text-foreground">{stats.blocks}</span>} />
            <SettingRow title="Display rules" description="Blocks only some recipients see." control={<span className="text-sm tabular-nums text-foreground">{stats.rules}</span>} />
            <SettingRow
              title="Merge tags"
              description={stats.tags.length ? stats.tags.map((t) => `{{${t}}}`).join(", ") : "No personalization in the body."}
              control={<span className="text-sm tabular-nums text-foreground">{stats.tags.length}</span>}
            />
            <SettingRow
              title="Unsubscribe link"
              description="Marketing email must let recipients opt out."
              control={<Yes ok={hasUnsubscribeLink(content)}>{hasUnsubscribeLink(content) ? "Included" : "Missing"}</Yes>}
            />
          </SettingsList>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default ContentSection;
