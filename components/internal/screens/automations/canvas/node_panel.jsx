"use client";

import React, { useId, useMemo, useState } from "react";
import { CircleAlert, Eye, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";

import { WAIT_UNITS, WEEKDAYS, nodeDefinition } from "@/lib/automations/steps";
import { TRIGGER_CATALOG, TRIGGER_CATEGORIES, defaultTrigger, matchesEventTrigger, triggerCatalogEntry } from "@/lib/automations/triggers";
import { ancestorMessageNodes } from "@/lib/automations/graph";
import { composeEmailDocument } from "@/lib/automations/email_doc";
import { renderEmailDocument } from "@/lib/email/blocks";
import { applyMergeTags, CONTACT_MERGE_FIELDS } from "@/lib/email/merge_tags";
import { ACCENT_CLASS, NODE_META, formatNumber } from "../constants";
import { EventNameInput, PropertyFilters, paramFilterValue, setParamFilter } from "../property_filters";
import { RuleBuilder } from "../rule_builder";
import { NodeIcon, nodeTitle } from "./automation_nodes";

const ANY = "__any";
const DAY = 86_400_000;

function Section({ title, children, className }) {
  return (
    <div className={cn("space-y-3", className)}>
      {title ? <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{title}</p> : null}
      {children}
    </div>
  );
}

function Notice({ tone = "neutral", children }) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-xs",
        tone === "warning" ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border bg-surface-card text-text-secondary",
      )}
    >
      {children}
    </p>
  );
}

function NumberInput({ value, onChange, min = 0, className, ...props }) {
  return (
    <Input
      type="number"
      min={min}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className={cn("tabular-nums", className)}
      {...props}
    />
  );
}

// Chips + an input that adds on Enter or comma.
function TagInput({ value, onChange, suggestions = [], placeholder, disabled, id }) {
  const [text, setText] = useState("");
  const listId = useId();
  const tags = Array.isArray(value) ? value : [];
  const commit = () => {
    const parts = text.split(",").map((t) => t.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...tags, ...parts])]);
    setText("");
  };
  return (
    <div className="space-y-2">
      {tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="neutral" className="gap-1 pr-1">
              {t}
              {disabled ? null : (
                <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded-sm text-text-tertiary hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      ) : null}
      <Input
        id={id}
        value={text}
        list={listId}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        disabled={disabled}
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !tags.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

function ChannelNotice({ channel, label, connections }) {
  const connected = (connections || []).some((c) => c.channel === channel && c.status === "connected");
  if (connected) return null;
  return <Notice tone="warning">{label} isn&apos;t connected. Contacts reaching this step are skipped until a provider is connected in Settings → Connections.</Notice>;
}

function MergeTagHint({ onInsert, disabled }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[11px] text-text-tertiary">Insert</span>
      {CONTACT_MERGE_FIELDS.slice(0, 5).map((f) => (
        <button
          key={f.key}
          type="button"
          disabled={disabled}
          onClick={() => onInsert(`{{${f.key}${f.key === "first_name" ? "|there" : ""}}}`)}
          className="rounded-md border border-border bg-surface-card px-1.5 py-0.5 font-mono text-[10px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
        >
          {f.key}
        </button>
      ))}
    </div>
  );
}

function EmailPreviewDialog({ open, onOpenChange, subject, doc, preheader }) {
  const rendered = useMemo(() => (open ? renderEmailDocument(doc, { mergeData: {}, preheader, subject, placeholders: true }) : null), [open, doc, preheader, subject]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{applyMergeTags(subject || "No subject", {})}</DialogTitle>
          <DialogDescription>Merge tags show their fallbacks. Tracking and the unsubscribe footer are added when it sends.</DialogDescription>
        </DialogHeader>
        {rendered ? (
          <iframe title="Email preview" srcDoc={rendered.html} sandbox="" className="h-[60vh] w-full rounded-lg border border-border bg-white" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- trigger

function TriggerFields({ config, set, replace, refs, disabled }) {
  const entry = triggerCatalogEntry(config);
  const recent = useMemo(() => {
    if (config.type !== "event" || !config.event) return null;
    const since = (refs.loadedAt || 0) - 7 * DAY;
    return (refs.recentEvents || []).filter((e) => new Date(e.occurredAt).getTime() >= since && matchesEventTrigger(config, e)).length;
  }, [config, refs.recentEvents, refs.loadedAt]);
  const dateFields = useMemo(
    () => [...new Set(["birthday", "anniversary", ...(refs.customFields || []).filter((f) => f.type === "date").map((f) => f.key)])],
    [refs.customFields],
  );
  const dateListId = useId();

  return (
    <>
      <Field label="Starts when">
        <Select value={entry?.key || ""} onValueChange={(key) => replace(defaultTrigger(key))} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a trigger" />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_CATEGORIES.map((cat) => (
              <SelectGroup key={cat}>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">{cat}</SelectLabel>
                {TRIGGER_CATALOG.filter((t) => t.category === cat).map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {entry?.description ? <p className="-mt-1 text-xs text-text-secondary">{entry.description}</p> : null}

      {entry?.key === "custom_event" ? (
        <Field label="Event name" hint="Exactly as it's sent to tracking — for example plan_upgraded or social.comment.">
          <EventNameInput value={config.event} onChange={set("event")} suggestions={refs.eventNames} disabled={disabled} />
        </Field>
      ) : null}

      {config.type === "event"
        ? (entry?.params || []).map((param) => {
            const current = paramFilterValue(config.filters, param.property);
            const update = (v) => set("filters")(setParamFilter(config.filters, param.property, param.operator, v));
            if (param.input === "list" || param.input === "campaign") {
              const rows = param.input === "list" ? refs.lists || [] : (refs.campaigns || []).filter((c) => c.channel === "email");
              return (
                <Field key={param.property} label={param.label}>
                  <Select value={current ? String(current) : ANY} onValueChange={(v) => update(v === ANY ? "" : v)} disabled={disabled}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>{param.anyLabel || "Any"}</SelectItem>
                      {rows.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              );
            }
            return (
              <Field key={param.property} label={param.label}>
                <Input
                  type={param.input === "number" ? "number" : "text"}
                  value={current}
                  onChange={(e) => update(e.target.value)}
                  placeholder={param.placeholder}
                  disabled={disabled}
                />
              </Field>
            );
          })
        : null}

      {config.type === "date" ? (
        <>
          <Field label="Date field" hint="A contact field holding a date like 1990-04-12.">
            <Input value={config.field || ""} onChange={(e) => set("field")(e.target.value.trim())} list={dateListId} placeholder="birthday" className="font-mono text-xs" disabled={disabled} />
            <datalist id={dateListId}>
              {dateFields.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Offset (days)" hint="−3 = three days before">
              <NumberInput value={config.offsetDays ?? 0} onChange={set("offsetDays")} min={-365} disabled={disabled} />
            </Field>
            <Field label="Send from">
              <Input type="time" value={config.time || "09:00"} onChange={(e) => set("time")(e.target.value)} disabled={disabled} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Every year</p>
              <p className="text-xs text-text-secondary">Off matches the exact date once.</p>
            </div>
            <Switch checked={config.recurring !== false} onCheckedChange={set("recurring")} disabled={disabled} aria-label="Every year" />
          </div>
        </>
      ) : null}

      {config.type === "inactivity" ? (
        <Field label="Days without activity" hint="Opens, clicks, visits, orders and any other tracked event count as activity.">
          <NumberInput value={config.days ?? 60} onChange={set("days")} min={1} disabled={disabled} />
        </Field>
      ) : null}

      {config.type === "manual" ? <Notice>Use Test to add a contact, or enroll contacts through the API.</Notice> : null}

      {config.type === "event" ? (
        <Section title="More filters">
          <PropertyFilters
            value={config.filters}
            onChange={set("filters")}
            hiddenProperties={(entry?.params || []).map((p) => p.property)}
            disabled={disabled}
          />
          {recent != null ? (
            <p className="text-xs text-text-secondary">
              <span className="font-medium tabular-nums text-foreground">{formatNumber(recent)}</span> matching {recent === 1 ? "event" : "events"} in the last 7 days.
            </p>
          ) : null}
        </Section>
      ) : null}

      {config.type === "date" || config.type === "inactivity" ? <Notice>Checked hourly. Each contact enters once per occurrence.</Notice> : null}
    </>
  );
}

// ---------------------------------------------------------------- messages

function EmailFields({ config, set, refs, disabled }) {
  const [preview, setPreview] = useState(false);
  const campaigns = (refs.campaigns || []).filter((c) => c.channel === "email");
  const picked = campaigns.find((c) => c.id === config.campaignId);
  const doc = config.source === "campaign" ? picked?.content || { blocks: [] } : composeEmailDocument(config);
  const subject = config.source === "campaign" ? picked?.subject || "" : config.subject;
  const insert = (tag) => set("body")(`${config.body || ""}${config.body && !/\s$/.test(config.body) ? " " : ""}${tag}`);

  return (
    <>
      <SegmentedTabs
        tabs={[
          { value: "compose", label: "Write here" },
          { value: "campaign", label: "Reuse a campaign" },
        ]}
        value={config.source === "campaign" ? "campaign" : "compose"}
        onChange={(v) => !disabled && set("source")(v)}
        fullWidth
      />
      {config.source === "campaign" ? (
        <Field label="Campaign" hint="Sends that campaign's subject and content to each contact.">
          <Select value={config.campaignId || ""} onValueChange={set("campaignId")} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={campaigns.length ? "Choose a campaign" : "No email campaigns yet"} />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <>
          <Field label="Subject">
            <Input value={config.subject || ""} onChange={(e) => set("subject")(e.target.value)} placeholder="e.g. Welcome, {{first_name|there}}" disabled={disabled} />
          </Field>
          <Field label="Preview text" hint="Shown after the subject in most inboxes.">
            <Input value={config.preheader || ""} onChange={(e) => set("preheader")(e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Heading">
            <Input value={config.heading || ""} onChange={(e) => set("heading")(e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Body" hint="Blank lines start paragraphs. **bold** and [link text](https://…) work.">
            <Textarea value={config.body || ""} onChange={(e) => set("body")(e.target.value)} rows={6} disabled={disabled} />
          </Field>
          <MergeTagHint onInsert={insert} disabled={disabled} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Button label">
              <Input value={config.buttonLabel || ""} onChange={(e) => set("buttonLabel")(e.target.value)} disabled={disabled} />
            </Field>
            <Field label="Button link">
              <Input value={config.buttonUrl || ""} onChange={(e) => set("buttonUrl")(e.target.value)} placeholder="https://" disabled={disabled} />
            </Field>
          </div>
        </>
      )}
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setPreview(true)} disabled={config.source === "campaign" && !picked}>
        <Eye className="h-4 w-4" /> Preview email
      </Button>
      <Section title="Sender">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From name">
            <Input value={config.fromName || ""} onChange={(e) => set("fromName")(e.target.value)} placeholder="Workspace default" disabled={disabled} />
          </Field>
          <Field label="From email">
            <Input value={config.fromEmail || ""} onChange={(e) => set("fromEmail")(e.target.value)} placeholder="Workspace default" disabled={disabled} />
          </Field>
        </div>
        <Field label="Reply-to">
          <Input value={config.replyTo || ""} onChange={(e) => set("replyTo")(e.target.value)} placeholder="Workspace default" disabled={disabled} />
        </Field>
      </Section>
      <Notice>Sent only to subscribed contacts with an email address, with open and click tracking and an unsubscribe link.</Notice>
      <EmailPreviewDialog open={preview} onOpenChange={setPreview} subject={subject} doc={doc} preheader={config.source === "campaign" ? picked?.preheader : config.preheader} />
    </>
  );
}

// GSM-7 vs UCS-2 segment maths for the SMS character counter.
const GSM = /^[\n\r @£$¥èéùìòÇØøÅå_ÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
function smsSegments(text) {
  const value = String(text || "");
  if (!value) return { chars: 0, segments: 0, unicode: false };
  const unicode = !GSM.test(value);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { chars: value.length, unicode, segments: value.length <= single ? 1 : Math.ceil(value.length / multi) };
}

function SmsFields({ config, set, refs, disabled }) {
  const seg = smsSegments(config.body);
  return (
    <>
      <ChannelNotice channel="sms" label="SMS" connections={refs.connections} />
      <Field label="Message" hint="Include opt-out wording such as “Reply STOP to opt out”.">
        <Textarea value={config.body || ""} onChange={(e) => set("body")(e.target.value)} rows={5} disabled={disabled} />
      </Field>
      <p className="text-xs tabular-nums text-text-secondary">
        {seg.chars} characters · {seg.segments} {seg.segments === 1 ? "segment" : "segments"}
        {seg.unicode ? " · Unicode" : ""}
      </p>
      <Notice>Sent to the contact&apos;s phone number when their latest SMS consent is opted in.</Notice>
    </>
  );
}

function WhatsAppFields({ config, set, refs, disabled }) {
  return (
    <>
      <ChannelNotice channel="whatsapp" label="WhatsApp" connections={refs.connections} />
      <div className="grid grid-cols-[1fr_88px] gap-3">
        <Field label="Template name" hint="An approved template in your WhatsApp account.">
          <Input value={config.templateName || ""} onChange={(e) => set("templateName")(e.target.value.trim())} placeholder="order_reminder" className="font-mono text-xs" disabled={disabled} />
        </Field>
        <Field label="Language">
          <Input value={config.language || "en"} onChange={(e) => set("language")(e.target.value.trim())} className="font-mono text-xs" disabled={disabled} />
        </Field>
      </div>
      <Field label="Message" hint="Used as the session message when no template is set, or as the template's variables.">
        <Textarea value={config.body || ""} onChange={(e) => set("body")(e.target.value)} rows={4} disabled={disabled} />
      </Field>
      <Notice>Outside the 24-hour reply window WhatsApp only delivers approved templates. Needs WhatsApp opt-in.</Notice>
    </>
  );
}

function PushFields({ config, set, refs, disabled }) {
  return (
    <>
      <ChannelNotice channel="push" label="Push" connections={refs.connections} />
      <Field label="Title">
        <Input value={config.title || ""} onChange={(e) => set("title")(e.target.value)} maxLength={80} disabled={disabled} />
      </Field>
      <Field label="Text">
        <Textarea value={config.body || ""} onChange={(e) => set("body")(e.target.value)} rows={3} maxLength={240} disabled={disabled} />
      </Field>
      <Field label="Opens">
        <Input value={config.url || ""} onChange={(e) => set("url")(e.target.value)} placeholder="https://" disabled={disabled} />
      </Field>
    </>
  );
}

// ---------------------------------------------------------------- timing & logic

function UnitSelect({ value, onChange, disabled }) {
  return (
    <Select value={value || "days"} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {WAIT_UNITS.map((u) => (
          <SelectItem key={u.value} value={u.value}>
            {u.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function WaitFields({ config, set, refs, disabled }) {
  const days = Array.isArray(config.weekdays) ? config.weekdays : [];
  const toggleDay = (d) => set("weekdays")(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
  return (
    <>
      <SegmentedTabs
        tabs={[
          { value: "duration", label: "Duration" },
          { value: "until", label: "Day & time" },
          { value: "event", label: "Event" },
        ]}
        value={config.mode || "duration"}
        onChange={(v) => !disabled && set("mode")(v)}
        fullWidth
      />
      {config.mode === "until" ? (
        <>
          <Field label="Continue on">
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={days.includes(d.value)}
                  disabled={disabled}
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    "h-8 rounded-md border px-2.5 text-xs font-medium transition-colors",
                    days.includes(d.value) ? "border-border-strong bg-surface-active text-foreground" : "border-border bg-surface-card text-text-secondary hover:text-foreground",
                  )}
                >
                  {d.short}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="At">
              <Input type="time" value={config.time || "09:00"} onChange={(e) => set("time")(e.target.value)} disabled={disabled} />
            </Field>
            <Field label="Time zone">
              <Select value={config.timezone || "contact"} onValueChange={set("timezone")} disabled={disabled}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact&apos;s</SelectItem>
                  <SelectItem value="workspace">Workspace</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </>
      ) : config.mode === "event" ? (
        <>
          <Field label="Until the contact does">
            <EventNameInput value={config.event} onChange={set("event")} suggestions={refs.eventNames} disabled={disabled} />
          </Field>
          <PropertyFilters value={config.filters} onChange={set("filters")} disabled={disabled} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Give up after">
              <NumberInput value={config.timeoutAmount ?? 3} onChange={set("timeoutAmount")} min={1} disabled={disabled} />
            </Field>
            <Field label="Unit">
              <UnitSelect value={config.timeoutUnit} onChange={set("timeoutUnit")} disabled={disabled} />
            </Field>
          </div>
          <Notice>Contacts leave through “Happened” the moment the event arrives, or through “Timed out”.</Notice>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wait for">
            <NumberInput value={config.amount ?? 1} onChange={set("amount")} min={1} disabled={disabled} />
          </Field>
          <Field label="Unit">
            <UnitSelect value={config.unit} onChange={set("unit")} disabled={disabled} />
          </Field>
        </div>
      )}
    </>
  );
}

function ConditionFields({ node, graph, config, set, refs, disabled }) {
  const earlier = ancestorMessageNodes(graph, node.id);
  return (
    <>
      <Field label="Check">
        <Select value={config.mode || "rules"} onValueChange={set("mode")} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rules">Contact matches rules</SelectItem>
            <SelectItem value="event">Contact did an event</SelectItem>
            <SelectItem value="message">Contact engaged with an earlier message</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {config.mode === "event" ? (
        <>
          <Field label="Did the contact">
            <Select value={config.performed === false ? "no" : "yes"} onValueChange={(v) => set("performed")(v === "yes")} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Do this event</SelectItem>
                <SelectItem value="no">Not do this event</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Event">
            <EventNameInput value={config.event} onChange={set("event")} suggestions={refs.eventNames} disabled={disabled} />
          </Field>
          <PropertyFilters value={config.filters} onChange={set("filters")} disabled={disabled} />
          <Field label="In the last (days)">
            <NumberInput value={config.withinDays ?? 7} onChange={set("withinDays")} min={1} disabled={disabled} />
          </Field>
        </>
      ) : config.mode === "message" ? (
        <>
          <Field label="Message">
            <Select value={config.messageNodeId || ""} onValueChange={set("messageNodeId")} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={earlier.length ? "Choose an earlier message" : "No earlier messages on this path"} />
              </SelectTrigger>
              <SelectContent>
                {earlier.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {nodeTitle(m)} · {m.data?.config?.subject || m.data?.config?.title || m.data?.config?.templateName || m.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Engagement">
            <Select value={config.engagement || "opened"} onValueChange={set("engagement")} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opened">Opened or read it</SelectItem>
                <SelectItem value="clicked">Clicked a link in it</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      ) : (
        <>
          <SegmentedTabs
            tabs={[
              { value: "inline", label: "Rules here" },
              { value: "saved", label: "Saved condition" },
            ]}
            value={config.source === "saved" ? "saved" : "inline"}
            onChange={(v) => !disabled && set("source")(v)}
            fullWidth
          />
          {config.source === "saved" ? (
            <Field label="Condition" hint="Edit saved conditions under Conditions & Goals.">
              <Select value={config.conditionSetId || ""} onValueChange={set("conditionSetId")} disabled={disabled}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={(refs.conditionSets || []).length ? "Choose a condition" : "No saved conditions yet"} />
                </SelectTrigger>
                <SelectContent>
                  {(refs.conditionSets || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <RuleBuilder
              value={{ match: config.match, conditions: config.conditions }}
              onChange={(v) => set(null)({ match: v.match, conditions: v.conditions })}
              fields={refs.ruleFields || []}
              disabled={disabled}
            />
          )}
        </>
      )}
      <Notice>Contacts who match continue down “Yes”; everyone else goes down “No”.</Notice>
    </>
  );
}

const SPLIT_KEYS = ["a", "b", "c", "d", "e"];

function SplitFields({ config, set, disabled }) {
  const branches = Array.isArray(config.branches) ? config.branches : [];
  const total = branches.reduce((s, b) => s + (Number(b.percent) || 0), 0);
  const patch = (key, next) => set("branches")(branches.map((b) => (b.key === key ? { ...b, ...next } : b)));
  const add = () => {
    const key = SPLIT_KEYS.find((k) => !branches.some((b) => b.key === k));
    if (key) set("branches")([...branches, { key, label: `Path ${key.toUpperCase()}`, percent: 0 }]);
  };
  const even = () => {
    const share = Math.floor(100 / branches.length);
    set("branches")(branches.map((b, i) => ({ ...b, percent: i === 0 ? 100 - share * (branches.length - 1) : share })));
  };
  return (
    <>
      <div className="space-y-2">
        {branches.map((b) => (
          <div key={b.key} className="flex items-center gap-2">
            <Input value={b.label} onChange={(e) => patch(b.key, { label: e.target.value })} aria-label="Path name" className="flex-1" disabled={disabled} />
            <NumberInput value={b.percent} onChange={(v) => patch(b.key, { percent: v })} min={0} aria-label={`${b.label} percent`} className="w-20" disabled={disabled} />
            <span className="text-xs text-text-tertiary">%</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${b.label}`}
              onClick={() => set("branches")(branches.filter((x) => x.key !== b.key))}
              disabled={disabled || branches.length <= 2}
              className="text-text-secondary"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={cn("text-xs tabular-nums", total === 100 ? "text-text-secondary" : "text-red-600 dark:text-red-400")}>Total {total}%</span>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={even} disabled={disabled} className="text-muted-foreground">
            Even split
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={add} disabled={disabled || branches.length >= SPLIT_KEYS.length} className="text-muted-foreground">
            <Plus className="h-4 w-4" /> Add path
          </Button>
        </div>
      </div>
      <Notice>Each contact is assigned a path once, by percentage. Compare paths in Activity.</Notice>
    </>
  );
}

function GoalFields({ config, set, refs, disabled }) {
  return (
    <>
      <SegmentedTabs
        tabs={[
          { value: "inline", label: "Define here" },
          { value: "saved", label: "Saved goal" },
        ]}
        value={config.source === "saved" ? "saved" : "inline"}
        onChange={(v) => !disabled && set("source")(v)}
        fullWidth
      />
      {config.source === "saved" ? (
        <Field label="Goal" hint="Edit saved goals under Conditions & Goals.">
          <Select value={config.goalId || ""} onValueChange={set("goalId")} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={(refs.goals || []).length ? "Choose a goal" : "No saved goals yet"} />
            </SelectTrigger>
            <SelectContent>
              {(refs.goals || []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <>
          <Field label="Reached when the contact does">
            <EventNameInput value={config.event} onChange={set("event")} suggestions={refs.eventNames} disabled={disabled} />
          </Field>
          <PropertyFilters value={config.filters} onChange={set("filters")} disabled={disabled} />
          <Field label="Within (days of entering)" hint="Leave empty to count any time.">
            <NumberInput value={config.windowDays ?? ""} onChange={(v) => set("windowDays")(v === "" ? null : v)} min={1} disabled={disabled} />
          </Field>
        </>
      )}
      <Field label="If a contact gets here first">
        <Select value={config.ifNotMet || "continue"} onValueChange={set("ifNotMet")} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="continue">Continue the path</SelectItem>
            <SelectItem value="wait">Wait for the goal</SelectItem>
            <SelectItem value="exit">Exit the automation</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {config.ifNotMet === "wait" ? (
        <Field label="Wait up to (days)">
          <NumberInput value={config.waitDays ?? 7} onChange={set("waitDays")} min={1} disabled={disabled} />
        </Field>
      ) : null}
      <Notice>Contacts who reach the goal count as converted. With “Exit on goal” on, they leave the moment it happens.</Notice>
    </>
  );
}

// ---------------------------------------------------------------- contact & integrations

function UpdateContactFields({ config, set, refs, disabled }) {
  const fields = Array.isArray(config.fields) ? config.fields : [];
  const tagNames = (refs.tags || []).map((t) => t.name).filter(Boolean);
  const fieldListId = useId();
  const patchField = (i, next) => set("fields")(fields.map((f, idx) => (idx === i ? { ...f, ...next } : f)));
  return (
    <>
      <Field label="Add tags">
        <TagInput value={config.addTags} onChange={set("addTags")} suggestions={tagNames} placeholder="Type a tag and press Enter" disabled={disabled} />
      </Field>
      <Field label="Remove tags">
        <TagInput value={config.removeTags} onChange={set("removeTags")} suggestions={tagNames} placeholder="Type a tag and press Enter" disabled={disabled} />
      </Field>
      <Section title="Set fields">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={f.key} onChange={(e) => patchField(i, { key: e.target.value.trim() })} list={fieldListId} placeholder="field_key" aria-label="Field" className="w-32 font-mono text-xs" disabled={disabled} />
            <Input value={f.value ?? ""} onChange={(e) => patchField(i, { value: e.target.value })} placeholder="value or {{merge_tag}}" aria-label="Value" className="flex-1" disabled={disabled} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove field" onClick={() => set("fields")(fields.filter((_, idx) => idx !== i))} disabled={disabled} className="text-text-secondary">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <datalist id={fieldListId}>
          {(refs.customFields || []).map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </datalist>
        <Button type="button" variant="ghost" size="sm" onClick={() => set("fields")([...fields, { key: "", value: "" }])} disabled={disabled} className="text-muted-foreground">
          <Plus className="h-4 w-4" /> Add field
        </Button>
      </Section>
      <Field label="Change lead score by" hint="Negative numbers lower it.">
        <NumberInput value={config.leadScoreDelta ?? 0} onChange={set("leadScoreDelta")} min={-1000} disabled={disabled} />
      </Field>
      <Notice>Tag changes fire Tag is added / removed, so other automations can pick them up.</Notice>
    </>
  );
}

function ListFields({ config, set, refs, disabled }) {
  const lists = refs.lists || [];
  return (
    <>
      <SegmentedTabs
        tabs={[
          { value: "add", label: "Add to list" },
          { value: "remove", label: "Remove from list" },
        ]}
        value={config.action === "remove" ? "remove" : "add"}
        onChange={(v) => !disabled && set("action")(v)}
        fullWidth
      />
      <Field label="List">
        <Select value={config.listId || ""} onValueChange={set("listId")} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={lists.length ? "Choose a list" : "No lists yet"} />
          </SelectTrigger>
          <SelectContent>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

function WebhookFields({ config, set, disabled }) {
  return (
    <>
      <SegmentedTabs
        tabs={[
          { value: "url", label: "A URL" },
          { value: "endpoints", label: "Webhook endpoints" },
        ]}
        value={config.target === "endpoints" ? "endpoints" : "url"}
        onChange={(v) => !disabled && set("target")(v)}
        fullWidth
      />
      {config.target === "endpoints" ? (
        <Notice>Queued for every endpoint subscribed to this event under Integrations → Webhooks, signed and retried.</Notice>
      ) : (
        <>
          <Field label="URL">
            <Input value={config.url || ""} onChange={(e) => set("url")(e.target.value.trim())} placeholder="https://example.com/hooks/geiger" className="font-mono text-xs" disabled={disabled} />
          </Field>
          <Field label="Signing secret" hint="Optional. Signs each call with an X-Geiger-Signature header (t=…,v1=…).">
            <Input type="password" value={config.secret || ""} onChange={(e) => set("secret")(e.target.value)} autoComplete="new-password" disabled={disabled} />
          </Field>
        </>
      )}
      <Field label="Event name">
        <Input value={config.event || ""} onChange={(e) => set("event")(e.target.value.trim())} placeholder="automation.step" className="font-mono text-xs" disabled={disabled} />
      </Field>
      <Notice>The body is JSON with the contact, the automation and this step. A failed call is logged and the contact moves on.</Notice>
    </>
  );
}

function NotifyFields({ config, set, refs, disabled }) {
  const members = (refs.members || []).filter((m) => m.email);
  return (
    <>
      <Field label="Teammate">
        <Select
          value={config.userId || ""}
          onValueChange={(userId) => {
            const m = members.find((x) => x.userId === userId);
            set(null)({ userId, email: m?.email || "" });
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={members.length ? "Choose a teammate" : config.email || "No teammates found"} />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.name || m.email} {m.name ? <span className="text-text-tertiary">· {m.email}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Subject">
        <Input value={config.subject || ""} onChange={(e) => set("subject")(e.target.value)} placeholder="{{first_name}} reached the demo step" disabled={disabled} />
      </Field>
      <Field label="Message" hint="Merge tags fill in the contact's details.">
        <Textarea value={config.message || ""} onChange={(e) => set("message")(e.target.value)} rows={4} disabled={disabled} />
      </Field>
    </>
  );
}

function ExitFields({ config, set, disabled }) {
  return (
    <>
      <Field label="Reason" hint="Shown in the enrollment history.">
        <Input value={config.reason || ""} onChange={(e) => set("reason")(e.target.value)} placeholder="e.g. Already a customer" disabled={disabled} />
      </Field>
      <Notice>Contacts who reach this step finish the automation.</Notice>
    </>
  );
}

const FIELDS = {
  send_email: EmailFields,
  send_sms: SmsFields,
  send_whatsapp: WhatsAppFields,
  send_push: PushFields,
  wait: WaitFields,
  condition: ConditionFields,
  split: SplitFields,
  goal: GoalFields,
  exit: ExitFields,
  update_contact: UpdateContactFields,
  list: ListFields,
  webhook: WebhookFields,
  notify: NotifyFields,
};

// Side panel for the selected node: header, issues, live counts and the type's config form.
export function NodePanel({ node, graph, refs, issues = [], counts, readOnly, onConfigChange, onDelete }) {
  const config = node.data?.config || {};
  // set("key")(value) patches one key; set(null)(patch) merges several.
  const set = (key) => (value) => onConfigChange(key === null ? { ...config, ...value } : { ...config, [key]: value });
  const replace = (next) => onConfigChange(next);
  const def = nodeDefinition(node.type);
  const Body = FIELDS[node.type];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", ACCENT_CLASS[NODE_META[node.type]?.accent] || ACCENT_CLASS.neutral)}>
          <NodeIcon node={node} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{def?.kindLabel}</p>
          <p className="truncate text-sm font-medium text-foreground">{nodeTitle(node)}</p>
        </div>
        {node.type !== "trigger" && !readOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Delete step"
            onClick={onDelete}
            className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {issues.length ? (
          <ul className="space-y-1.5">
            {issues.map((i) => (
              <li key={i.id} className={cn("flex items-start gap-2 text-xs", i.severity === "error" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300")}>
                {i.severity === "error" ? <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />}
                {i.message}
              </li>
            ))}
          </ul>
        ) : null}

        {counts ? (
          <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface-card text-center">
            {[
              { label: node.type === "trigger" ? "Enrolled" : "Here now", value: node.type === "trigger" ? counts.ok : counts.current },
              { label: "Passed", value: counts.ok },
              { label: "Failed", value: counts.failed },
            ].map((s) => (
              <div key={s.label} className="px-2 py-2">
                <p className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(s.value)}</p>
                <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{s.label}</p>
              </div>
            ))}
          </div>
        ) : null}

        {node.type === "trigger" ? (
          <TriggerFields config={config} set={set} replace={replace} refs={refs} disabled={readOnly} />
        ) : Body ? (
          <Body node={node} graph={graph} config={config} set={set} refs={refs} disabled={readOnly} />
        ) : null}
      </div>
    </div>
  );
}

export default NodePanel;
