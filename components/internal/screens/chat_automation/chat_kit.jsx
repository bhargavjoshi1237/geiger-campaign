"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Lock, Loader2, Pause, Play, Plus, Trash2, X, TriangleAlert, Info } from "lucide-react";
import {
  Badge,
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
  LogoLoading,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listConnections } from "@/lib/supabase/channel_connections";
import { setChatStatus } from "@/lib/chat/api";
import { CHAT_CHANNELS, DEFAULT_HANDOVER_LABEL, QUICK_REPLY_TITLE_MAX, guardrailsFor, quietHoursState } from "@/lib/chat/rules";
import { MATCH_MODES, matchKeyword, personalize } from "@/lib/chat/matching";
import { CHANNEL_META, CHAT_EDIT } from "./constants";

// Shared pieces for the Chat Automation screens: permissions, connected social accounts, channel / keyword /
// reply / button editors, the DM preview, the guardrail panel (each rule with the platform policy it
// implements), funnel bars, publish / pause and delete flows.

export const PRIMARY_BUTTON = "bg-primary text-primary-foreground hover:bg-primary/90";
export const OUTLINE_BUTTON = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const DANGER_ICON_BUTTON =
  "text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400";

export const SAMPLE_PERSON = { firstName: "Maya", name: "Maya Chen", username: "maya.makes" };

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

export function useChatEdit() {
  return useCan(CHAT_EDIT);
}

// Social / chat connections for the project, grouped by channel.
export function useChatConnections() {
  const { projectId } = useProject();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listConnections(projectId, { channel: CHAT_CHANNELS }).then((rows) => {
      if (!alive) return;
      setConnections(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  const byChannel = useMemo(() => {
    const map = {};
    for (const c of connections) (map[c.channel] ||= []).push(c);
    return map;
  }, [connections]);
  const connectedChannels = useMemo(
    () => new Set(connections.filter((c) => c.status === "connected").map((c) => c.channel)),
    [connections],
  );
  return { connections, byChannel, connectedChannels, loading };
}

export function LoadingPanel({ size = 48, label = "Loading" }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
      <LogoLoading size={size} aria-label={label} />
    </div>
  );
}

export function EmptyPanel(props) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState {...props} />
    </div>
  );
}

export function ChannelBadges({ channels = [], className }) {
  if (!channels.length) return <span className="text-xs text-text-tertiary">No channel</span>;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {channels.map((c) => {
        const meta = CHANNEL_META[c];
        const Icon = meta?.icon;
        return (
          <Badge key={c} variant="outline" className="gap-1">
            {Icon ? <Icon className="h-3 w-3" /> : null}
            {meta?.label || c}
          </Badge>
        );
      })}
    </div>
  );
}

// Inline note: what's missing and the one thing that fixes it.
export function Notice({ tone = "info", children, action, className }) {
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm",
        tone === "warning"
          ? "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200"
          : "border-border bg-surface-card text-text-secondary",
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// Warns when none of the chosen channels has a connected account (the automation saves but can't run).
export function ConnectionNotice({ channels = [], connectedChannels }) {
  const { setTab } = useWorkspaceUrl();
  const missing = channels.filter((c) => !connectedChannels.has(c));
  if (!channels.length || !missing.length) return null;
  const names = missing.map((c) => CHANNEL_META[c]?.label || c).join(", ");
  return (
    <Notice
      tone="warning"
      action={
        <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => setTab("Social Accounts")}>
          <Link2 className="h-3.5 w-3.5" /> Connect
        </Button>
      }
    >
      {names} {missing.length === 1 ? "isn't" : "aren't"} connected. This saves and can be published, but nothing is sent on{" "}
      {missing.length === 1 ? "that channel" : "those channels"} until the account is connected.
    </Notice>
  );
}

export function ChannelPicker({ value = [], onChange, allowed = CHAT_CHANNELS, connectedChannels = new Set(), disabled = false }) {
  const toggle = (c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {CHAT_CHANNELS.map((c) => {
        const meta = CHANNEL_META[c];
        const Icon = meta.icon;
        const supported = allowed.includes(c);
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            disabled={disabled || !supported}
            onClick={() => toggle(c)}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed",
              on ? "border-foreground bg-surface-card" : "border-border bg-surface-subtle hover:bg-surface-hover",
              !supported && "opacity-50",
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{meta.label}</span>
              <span className="block truncate text-xs text-text-tertiary">
                {!supported ? "Not available for this trigger" : connectedChannels.has(c) ? "Connected" : "Not connected"}
              </span>
            </span>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", on ? "bg-foreground" : "bg-border-strong")} />
          </button>
        );
      })}
    </div>
  );
}

// Chip input: Enter or comma adds, Backspace on an empty field removes the last chip.
export function TagInput({ value = [], onChange, placeholder = "Type and press Enter", id, disabled = false, transform = (v) => v.trim(), max = 50 }) {
  const [draft, setDraft] = useState("");
  const add = (raw) => {
    const next = transform(String(raw || ""));
    if (!next || value.some((v) => v.toLowerCase() === next.toLowerCase()) || value.length >= max) return;
    onChange([...value, next]);
  };
  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-card px-2 py-1.5",
        disabled && "opacity-60",
      )}
    >
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-active px-1.5 py-0.5 text-xs text-foreground">
          {v}
          {!disabled ? (
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="text-text-tertiary hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
      <input
        id={id}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
            setDraft("");
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            add(draft);
            setDraft("");
          }
        }}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text-tertiary"
      />
    </div>
  );
}

export function KeywordEditor({ keywords = [], onKeywordsChange, match = "contains", onMatchChange, allowAny = false, disabled = false, anyLabel }) {
  const [sample, setSample] = useState("");
  const modes = MATCH_MODES.filter((m) => allowAny || m.value !== "any").map((m) => ({
    value: m.value,
    label: m.value === "any" && anyLabel ? anyLabel : m.label,
  }));
  const hit = sample.trim() ? matchKeyword(sample, keywords, match) : null;
  const mode = MATCH_MODES.find((m) => m.value === match);
  return (
    <div className="grid gap-4">
      <Field label="Match" hint={mode?.hint}>
        <SegmentedTabs tabs={modes} value={match} onChange={disabled ? undefined : onMatchChange} />
      </Field>
      {match !== "any" ? (
        <Field label="Keywords" htmlFor="kw-input" hint="Case and accents are ignored. Emoji work too.">
          <TagInput id="kw-input" value={keywords} onChange={onKeywordsChange} placeholder="e.g. price, link, guide" disabled={disabled} />
        </Field>
      ) : null}
      <Field label="Test a message" htmlFor="kw-test">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <Input id="kw-test" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Type what someone might write…" className="sm:max-w-sm" />
          {sample.trim() ? (
            <span className={cn("text-sm font-medium", hit ? "text-emerald-600 dark:text-emerald-400" : "text-text-secondary")}>
              {hit ? (hit === "*" ? "Matches (any message)" : `Matches “${hit}”`) : "No match"}
            </span>
          ) : null}
        </div>
      </Field>
    </div>
  );
}

export function ReplyVariantsEditor({ variants = [], onChange, disabled = false, max = 10 }) {
  const list = variants.length ? variants : [""];
  const update = (i, v) => onChange(list.map((x, j) => (j === i ? v : x)));
  return (
    <div className="grid gap-3">
      {list.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 w-6 shrink-0 text-right text-xs tabular-nums text-text-tertiary">{i + 1}</span>
          <Textarea
            value={v}
            disabled={disabled}
            onChange={(e) => update(i, e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="e.g. Sent you a DM, {first_name}!"
            aria-label={`Public reply variant ${i + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove variant ${i + 1}`}
            disabled={disabled || list.length === 1}
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            className="mt-1 text-text-tertiary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 pl-8">
        <p className="text-xs text-text-secondary">Variants rotate in order, so the same text isn&apos;t posted under every comment.</p>
        <Button type="button" size="sm" variant="outline" className={OUTLINE_BUTTON} disabled={disabled || list.length >= max} onClick={() => onChange([...list, ""])}>
          <Plus className="h-3.5 w-3.5" /> Add variant
        </Button>
      </div>
    </div>
  );
}

// Reply options become quick replies; links become URL buttons.
export function ButtonsEditor({ buttons = [], onChange, allowReply = true, maxReplies = 12, disabled = false }) {
  const update = (id, patch) => onChange(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const replies = buttons.filter((b) => b.type !== "url").length;
  return (
    <div className="grid gap-2">
      {buttons.map((b) => (
        <div key={b.id} className="grid gap-2 rounded-lg border border-border bg-surface-card p-2.5 sm:grid-cols-[9rem_1fr_1.4fr_auto] sm:items-center">
          <Select value={b.type === "url" ? "url" : "reply"} onValueChange={(type) => update(b.id, { type })} disabled={disabled}>
            <SelectTrigger className="w-full" aria-label="Button type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowReply ? <SelectItem value="reply">Reply option</SelectItem> : null}
              <SelectItem value="url">Link</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={b.title || ""}
            onChange={(e) => update(b.id, { title: e.target.value })}
            maxLength={b.type === "url" ? 40 : QUICK_REPLY_TITLE_MAX}
            placeholder={b.type === "url" ? "Button label" : "Option label"}
            aria-label="Button label"
            disabled={disabled}
          />
          {b.type === "url" ? (
            <Input value={b.url || ""} onChange={(e) => update(b.id, { url: e.target.value })} placeholder="https://" aria-label="Button link" disabled={disabled} />
          ) : (
            <span className="text-xs text-text-tertiary sm:px-1">{QUICK_REPLY_TITLE_MAX - String(b.title || "").length} characters left</span>
          )}
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove button" disabled={disabled} onClick={() => onChange(buttons.filter((x) => x.id !== b.id))} className="justify-self-end text-text-tertiary hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">
          {replies ? `“${DEFAULT_HANDOVER_LABEL}” is added after your reply options on every channel.` : "Add a link, or reply options people can tap."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={OUTLINE_BUTTON}
          disabled={disabled || buttons.length >= 13}
          onClick={() => onChange([...buttons, { id: uid().slice(0, 8), type: allowReply && replies < maxReplies ? "reply" : "url", title: "", url: "" }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add button
        </Button>
      </div>
    </div>
  );
}

export function FieldsEditor({ fields = [], onChange, disabled = false }) {
  const update = (i, patch) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="grid gap-2">
      {fields.map((f, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <Input value={f.key || ""} onChange={(e) => update(i, { key: e.target.value })} placeholder="Field key, e.g. interest" aria-label="Field key" disabled={disabled} />
          <Input value={f.value || ""} onChange={(e) => update(i, { value: e.target.value })} placeholder="Value" aria-label="Field value" disabled={disabled} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove field" disabled={disabled} onClick={() => onChange(fields.filter((_, j) => j !== i))} className="text-text-tertiary hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" size="sm" variant="outline" className={OUTLINE_BUTTON} disabled={disabled} onClick={() => onChange([...fields, { key: "", value: "" }])}>
          <Plus className="h-3.5 w-3.5" /> Set a field
        </Button>
      </div>
    </div>
  );
}

const initials = (s) =>
  String(s || "?")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

function Bubble({ children, from = "business" }) {
  return (
    <div className={cn("flex", from === "person" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
          from === "person" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-surface-card text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

// What the person sees: the comment + public reply, then the DM with its buttons and quick replies.
export function DmPreview({ channel = "instagram", accountName = "Your account", comment, publicReply, text, buttons = [], handoverLabel, person = SAMPLE_PERSON, incoming }) {
  const links = buttons.filter((b) => b.type === "url" && String(b.title || "").trim());
  const replies = buttons.filter((b) => b.type !== "url" && String(b.title || "").trim());
  const meta = CHANNEL_META[channel];
  const Icon = meta?.icon;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {Icon ? <Icon className="h-3.5 w-3.5 text-text-secondary" /> : null}
        <span className="text-xs font-medium text-text-secondary">Preview · {meta?.label || channel}</span>
      </div>
      <div className="space-y-4 p-4">
        {comment ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-active text-[10px] font-semibold text-text-secondary">{initials(person.name)}</span>
              <div className="min-w-0 text-sm">
                <span className="font-medium text-foreground">{person.username}</span> <span className="text-foreground">{comment}</span>
              </div>
            </div>
            {publicReply ? (
              <div className="ml-9 flex items-start gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[9px] font-semibold text-background">{initials(accountName)}</span>
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-foreground">{accountName}</span>{" "}
                  <span className="text-foreground">{personalize(publicReply, person)}</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {comment && text ? <div className="border-t border-dashed border-border" /> : null}
        {incoming ? <Bubble from="person">{incoming}</Bubble> : null}
        {text ? (
          <div className="space-y-2">
            <Bubble>
              {personalize(text, person)}
              {links.length ? (
                <div className="mt-2 grid gap-1.5">
                  {links.map((b) => (
                    <span key={b.id} className="rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-center text-xs font-medium text-foreground">
                      {b.title}
                    </span>
                  ))}
                </div>
              ) : null}
            </Bubble>
            {replies.length ? (
              <div className="flex flex-wrap gap-1.5">
                {[...replies.map((b) => b.title), handoverLabel || DEFAULT_HANDOVER_LABEL].map((t, i) => (
                  <span key={`${t}-${i}`} className="rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-foreground">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : !comment ? (
          <p className="py-6 text-center text-sm text-text-tertiary">Write a message to preview it.</p>
        ) : null}
      </div>
    </div>
  );
}

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/London", "Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Asia/Kolkata"];
  }
})();

export function QuietHoursEditor({ value, onChange, disabled = false }) {
  const q = value || {};
  const set = (patch) => onChange({ ...q, ...patch });
  const state = quietHoursState(q);
  return (
    <div className="grid gap-4">
      <SettingsList>
        <SettingRow
          title="Quiet hours"
          description={q.enabled ? (state.inQuiet ? "Quiet now — replies are held until it ends." : "Replies due inside these hours wait until they end.") : "Off — replies go out immediately, any time of day."}
          control={<Switch checked={Boolean(q.enabled)} onCheckedChange={(enabled) => set({ enabled })} disabled={disabled} aria-label="Quiet hours" />}
        />
      </SettingsList>
      {q.enabled ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From" htmlFor="qh-start">
            <Input id="qh-start" type="time" value={q.start || "21:00"} onChange={(e) => set({ start: e.target.value })} disabled={disabled} />
          </Field>
          <Field label="Until" htmlFor="qh-end">
            <Input id="qh-end" type="time" value={q.end || "08:00"} onChange={(e) => set({ end: e.target.value })} disabled={disabled} />
          </Field>
          <Field label="Time zone">
            <Select value={q.timezone || "UTC"} onValueChange={(timezone) => set({ timezone })} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="During quiet hours">
            <Select value={q.behavior || "queue"} onValueChange={(behavior) => set({ behavior })} disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="queue">Hold and send after</SelectItem>
                <SelectItem value="skip">Don&apos;t send</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}
    </div>
  );
}

// Every guardrail that applies, with the rule it implements. Platform rules can't be switched off.
export function GuardrailsPanel({ kind = null, channels = [], guardrails = {}, onChange, disabled = false, extra = null }) {
  const rules = guardrailsFor({ kind, channels });
  return (
    <div className="space-y-6">
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-subtle">
        {rules
          .filter((g) => g.enforcedBy === "platform")
          .map((g) => (
            <div key={g.key} className="flex items-start gap-3 px-4 py-3.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{g.label}</p>
                  <Badge variant="neutral">Always on</Badge>
                </div>
                <p className="mt-0.5 text-xs text-text-secondary">{g.rule}</p>
                <p className="mt-1 text-xs text-text-tertiary">{g.behaviour}</p>
              </div>
            </div>
          ))}
      </div>
      {onChange ? (
        <SectionCard bare title="Timing & limits" description="Rules you set on top of the platform's, like holding replies overnight.">
          <QuietHoursEditor value={guardrails.quietHours} onChange={(quietHours) => onChange({ ...guardrails, quietHours })} disabled={disabled} />
          {extra ? <div className="mt-4 border-t border-border pt-4">{extra}</div> : null}
        </SectionCard>
      ) : null}
    </div>
  );
}

// Funnel rows: each bar relative to the first step, with the step-to-step rate.
export function FunnelBars({ steps = [] }) {
  const top = Number(steps[0]?.value || 0);
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-subtle">
      {steps.map((s, i) => {
        const value = Number(s.value || 0);
        const prev = i ? Number(steps[i - 1].value || 0) : null;
        const width = top ? Math.max(value ? 2 : 0, (value / top) * 100) : 0;
        return (
          <div key={s.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{s.label}</p>
              {s.hint ? <p className="truncate text-[11px] text-text-tertiary">{s.hint}</p> : null}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-active">
              <div className="h-full rounded-full bg-foreground/70" style={{ width: `${width}%` }} />
            </div>
            <div className="w-28 text-right">
              <span className="text-sm font-semibold tabular-nums text-foreground">{value.toLocaleString("en-US")}</span>
              {prev != null ? (
                <span className="ml-2 text-xs tabular-nums text-text-tertiary">{prev ? `${Math.round((value / prev) * 100)}%` : "—"}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StatusActions({ status, pending = false, canEdit = true, onPublish, onPause, publishLabel = "Publish" }) {
  const live = status === "active";
  if (live) {
    return (
      <Button variant="outline" className={OUTLINE_BUTTON} onClick={onPause} disabled={!canEdit || pending} title={canEdit ? undefined : "Your role can't change chat automations."}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Pause
      </Button>
    );
  }
  return (
    <Button className={PRIMARY_BUTTON} onClick={onPublish} disabled={!canEdit || pending} title={canEdit ? undefined : "Your role can't publish chat automations."}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {status === "paused" ? "Resume" : publishLabel}
    </Button>
  );
}

// Publish / pause through the chat status route; returns the normalized row (or null) and owns the toast.
export function useStatusChange({ resource, normalize, label = "Automation" }) {
  const { projectId } = useProject();
  const [pendingId, setPendingId] = useState(null);
  const change = useCallback(
    async (row, action) => {
      setPendingId(row.id);
      const res = await setChatStatus(projectId, resource, row.id, action);
      setPendingId(null);
      if (!res.ok) {
        toast.error(res.error || `Couldn't ${action} the ${label.toLowerCase()}.`);
        return null;
      }
      const next = normalize(res.data?.row);
      toast.success(action === "publish" ? `${label} is live.` : action === "pause" ? `${label} paused.` : `${label} archived.`);
      return next;
    },
    [projectId, resource, normalize, label],
  );
  return { pendingId, change };
}

export function DeleteDialog({ target, noun = "automation", description, onCancel, onConfirm, pending = false }) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {noun}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{target?.name}</span>? {description || "It stops immediately. This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" disabled={pending} onClick={() => onConfirm(target)}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
