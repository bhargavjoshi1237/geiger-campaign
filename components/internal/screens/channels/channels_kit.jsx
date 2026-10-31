"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Check, Copy, Loader2, Trash2, Unplug } from "lucide-react";
import {
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
  Input,
  LoadingArea,
  SectionCard,
  SettingRow,
  SettingsList,
  StatusPill,
  Switch,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiGet } from "@/lib/api/client";
import { getChannelConnection } from "@/lib/supabase/channel_connections";
import { listDeliveries } from "@/lib/supabase/deliveries";

// Shared list + editor helpers for the Channels and Transactional screens (mirrors geiger-events campaigns.jsx):
// connection loading, the deployment status route, delivery status maps, copyable fields and settings rows.

export const PRIMARY_BUTTON = "bg-primary text-primary-foreground hover:bg-primary/90";
export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const DANGER_ICON_BUTTON =
  "text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400";
export const CHANNEL_MANAGE = "campaign.channel.manage";
export const TRANSACTIONAL_MANAGE = "campaign.transactional.manage";

export const CONNECTION_STATUS_MAP = {
  connected: { label: "Connected", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  error: { label: "Needs attention", variant: "danger" },
  disconnected: { label: "Disconnected", variant: "neutral" },
  not_connected: { label: "Not connected", variant: "neutral" },
};

export const DELIVERY_STATUS_MAP = {
  queued: { label: "Queued", variant: "neutral" },
  sent: { label: "Sent", variant: "info" },
  delivered: { label: "Delivered", variant: "success" },
  opened: { label: "Opened", variant: "success" },
  read: { label: "Read", variant: "success" },
  clicked: { label: "Clicked", variant: "success" },
  replied: { label: "Replied", variant: "success" },
  bounced: { label: "Bounced", variant: "danger" },
  complained: { label: "Complained", variant: "danger" },
  failed: { label: "Failed", variant: "danger" },
  not_sent: { label: "Not sent", variant: "warning" },
  unsubscribed: { label: "Unsubscribed", variant: "neutral" },
};

export const CHANNEL_LABEL = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
  in_app: "In-app",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  rcs: "RCS",
};

export const SOURCE_LABEL = {
  campaign: "Campaign",
  automation: "Automation",
  broadcast: "Broadcast",
  transactional: "Transactional API",
  flow: "Flow",
  test: "Test",
  inbox: "Inbox reply",
  community: "Community",
  manual: "Manual",
};

const DELIVERED = new Set(["delivered", "opened", "read", "clicked", "replied"]);
const REACHED = new Set(["sent", ...DELIVERED]);
const FAILED = new Set(["bounced", "complained", "failed"]);

export const isDelivered = (status) => DELIVERED.has(status);
export const isFailed = (status) => FAILED.has(status);

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const num = (n) => Number(n || 0).toLocaleString("en-US");

// KPI strip over a list of deliveries (any channel).
export function deliveryStats(deliveries, { label = "Sent" } = {}) {
  const attempted = deliveries.filter((d) => d.status !== "not_sent" && d.status !== "queued");
  const reached = attempted.filter((d) => REACHED.has(d.status)).length;
  const delivered = attempted.filter((d) => DELIVERED.has(d.status)).length;
  const failed = attempted.filter((d) => FAILED.has(d.status)).length;
  return [
    { label, value: num(attempted.length), footer: "last 30 days" },
    { label: "Delivered", value: num(delivered), footer: `${pct(delivered, reached)} of sent` },
    { label: "Failed", value: num(failed), footer: `${pct(failed, attempted.length)} failure rate` },
    { label: "Not sent", value: num(deliveries.filter((d) => d.status === "not_sent").length), footer: "blocked before the provider" },
  ];
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export const formatDateTime = (iso) => (iso ? DATE_TIME.format(new Date(iso)) : "—");
export const formatDate = (iso) => (iso ? DATE.format(new Date(iso)) : "—");

// "5 min ago" relative to `now` (pass a stable timestamp from useNow()).
export function formatRelative(iso, now) {
  if (!iso) return "Never";
  const diff = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86_400 * 30) return `${Math.floor(diff / 86_400)} d ago`;
  return formatDate(iso);
}

// A timestamp fixed at mount, so render stays pure.
export function useNow() {
  const [now] = useState(() => Date.now());
  return now;
}

export async function copyText(value, label = "Copied") {
  try {
    await navigator.clipboard.writeText(String(value ?? ""));
    toast.success(`${label}.`);
  } catch {
    toast.error("Couldn't copy to the clipboard.");
  }
}

// Deployment-level status: email delivery configuration + the public URLs providers call.
export function useChannelStatus() {
  const { projectId } = useProject();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    apiGet(`/api/projects/${projectId}/channels/status`).then((res) => {
      if (!alive) return;
      setStatus(res.ok ? res.data : null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  return { status, loading };
}

// The project's connection for one channel, plus a setter for optimistic updates and a reload.
export function useChannelConnection(channel) {
  const { projectId } = useProject();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    getChannelConnection(projectId, channel).then((row) => {
      if (!alive) return;
      setConnection(row);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, channel, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { projectId, connection, setConnection, loading, reload };
}

// Delete confirmation, same shape as the campaigns.jsx `deleteTarget` dialog.
export function DeleteConfirmDialog({ target, title, name, description, onCancel, onConfirm, confirmLabel = "Delete", pending = false }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {confirmLabel} <span className="font-medium text-foreground">{name}</span>?{" "}
            {description || "This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" disabled={pending} onClick={() => onConfirm(target)}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DisconnectDialog({ open, onOpenChange, name, consequence, onConfirm, pending }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect {name}</DialogTitle>
          <DialogDescription>{consequence} The stored credentials are deleted.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" disabled={pending} onClick={onConfirm}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />} Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// First-run vs filtered-empty state; filtered offers "Clear filters", first-run the create action.
export function ListEmptyState({ icon, filtersActive, title, description, onClear, action }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState
        icon={icon}
        title={filtersActive ? "No matches" : title}
        description={filtersActive ? "Try a different search or filter." : description}
        action={
          filtersActive ? (
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={onClear}>
              Clear filters
            </Button>
          ) : (
            action
          )
        }
      />
    </div>
  );
}

export function SectionLoading({ label = "Loading", size = 48 }) {
  return <LoadingArea panel size={size} label={label} />;
}

// Settings draft with a saved snapshot: "Save changes" is live only when dirty, and the draft resyncs
// when the persisted value changes underneath (first load, another tab's save).
export function useSettingsDraft(initial, onSave) {
  const key = JSON.stringify(initial);
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [syncedKey, setSyncedKey] = useState(key);
  const [saving, setSaving] = useState(false);
  if (key !== syncedKey) {
    setSyncedKey(key);
    setValues(initial);
    setSaved(initial);
  }
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);
  const set = (patch) => setValues((v) => ({ ...v, ...patch }));
  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    const ok = await onSave(values);
    setSaving(false);
    if (ok) setSaved(values);
  };
  return { values, set, dirty, saving, save };
}

export function SaveChangesButton({ dirty, saving, onClick, label = "Save changes", disabled = false }) {
  return (
    <Button className={PRIMARY_BUTTON} disabled={!dirty || saving || disabled} onClick={onClick}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {saving ? "Saving…" : label}
    </Button>
  );
}

// Editor draft seeded from the record; dirty until the saved row matches the draft again.
export function useRecordDraft(record, pick) {
  const initial = useMemo(() => pick(record), [record, pick]);
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  return { draft, setDraft, set, dirty };
}

// Read-only label/value row for Performance/Overview sections.
export function ValueRow({ title, description, value }) {
  return (
    <SettingRow
      title={title}
      description={description}
      control={<span className="text-sm tabular-nums text-foreground">{value}</span>}
    />
  );
}

// A monospace value with a copy button (endpoints, webhook URLs, public keys).
export function CopyField({ label, value, hint, htmlFor }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(value, `${label || "Value"} copied`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Field label={label} hint={hint} htmlFor={htmlFor}>
      <div className="flex items-center gap-2">
        <div
          id={htmlFor}
          className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-card px-3 py-2 font-mono text-xs text-muted-foreground"
          title={value || ""}
        >
          {value || "—"}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={OUTLINE_BUTTON}
          aria-label={`Copy ${label || "value"}`}
          disabled={!value}
          onClick={copy}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </Field>
  );
}

// Inline code sample block.
export function CodeBlock({ children, label }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-card p-4 pr-12 font-mono text-xs leading-relaxed text-muted-foreground">
        {children}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-7 w-7 text-text-secondary hover:bg-surface-hover hover:text-foreground"
        aria-label={`Copy ${label || "code"}`}
        onClick={() => copyText(children, `${label || "Code"} copied`)}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// Quiet hours + frequency cap rows for a channel settings card.
export function DeliveryRulesFields({ values, set, disabled, idPrefix }) {
  const quiet = values.quietHours;
  const cap = values.frequencyCap;
  return (
    <div className="space-y-4">
      <SettingsList>
        <SettingRow
          title="Quiet hours"
          description="Hold sends inside this window in the contact's time zone (UTC when unknown)."
          control={
            <Switch
              checked={quiet.enabled}
              disabled={disabled}
              aria-label="Quiet hours"
              onCheckedChange={(enabled) => set({ quietHours: { ...quiet, enabled } })}
            />
          }
        />
      </SettingsList>
      {quiet.enabled ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor={`${idPrefix}-quiet-start`}>
            <Input
              id={`${idPrefix}-quiet-start`}
              type="time"
              value={quiet.start}
              disabled={disabled}
              onChange={(e) => set({ quietHours: { ...quiet, start: e.target.value } })}
            />
          </Field>
          <Field label="Until" htmlFor={`${idPrefix}-quiet-end`}>
            <Input
              id={`${idPrefix}-quiet-end`}
              type="time"
              value={quiet.end}
              disabled={disabled}
              onChange={(e) => set({ quietHours: { ...quiet, end: e.target.value } })}
            />
          </Field>
        </div>
      ) : null}
      <SettingsList>
        <SettingRow
          title="Frequency cap"
          description="Limit how many messages one contact receives on this channel."
          control={
            <Switch
              checked={cap.enabled}
              disabled={disabled}
              aria-label="Frequency cap"
              onCheckedChange={(enabled) => set({ frequencyCap: { ...cap, enabled } })}
            />
          }
        />
      </SettingsList>
      {cap.enabled ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Messages" htmlFor={`${idPrefix}-cap-max`}>
            <Input
              id={`${idPrefix}-cap-max`}
              type="number"
              min={1}
              value={cap.max}
              disabled={disabled}
              onChange={(e) => set({ frequencyCap: { ...cap, max: Math.max(1, Number(e.target.value) || 1) } })}
            />
          </Field>
          <Field label="Per days" htmlFor={`${idPrefix}-cap-days`}>
            <Input
              id={`${idPrefix}-cap-days`}
              type="number"
              min={1}
              value={cap.days}
              disabled={disabled}
              onChange={(e) => set({ frequencyCap: { ...cap, days: Math.max(1, Number(e.target.value) || 1) } })}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

// "What's missing and the one action to fix it" card for a channel that isn't connected yet.
export function NotConnectedCard({ icon, title, description, action, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState icon={icon} title={title} description={description} action={action} />
      {children ? <div className="border-t border-border px-5 py-4">{children}</div> : null}
    </div>
  );
}

// Last deliveries on a channel, each row opening its Message Logs detail.
export function RecentDeliveries({ channel, sourceType, title = "Recent deliveries", description, limit = 8, emptyText }) {
  const { projectId } = useProject();
  const { openRecordInTab } = useWorkspaceUrl();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = useNow();

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listDeliveries(projectId, { channel, sourceType, limit }).then((data) => {
      if (!alive) return;
      setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, channel, sourceType, limit]);

  const columns = [
    {
      key: "to",
      header: "Recipient",
      render: (d) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{d.to}</span>
          <span className="truncate text-xs text-text-secondary">{d.subject || SOURCE_LABEL[d.sourceType] || d.sourceType}</span>
        </div>
      ),
    },
    { key: "source", header: "Source", className: "whitespace-nowrap text-muted-foreground", render: (d) => SOURCE_LABEL[d.sourceType] || d.sourceType },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (d) => <StatusPill status={d.status} map={DELIVERY_STATUS_MAP} /> },
    { key: "at", header: "When", align: "right", className: "whitespace-nowrap text-muted-foreground tabular-nums", render: (d) => formatRelative(d.createdAt, now) },
  ];

  return (
    <SectionCard
      bare
      title={title}
      description={description}
      action={
        <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => openRecordInTab(null, "Message Logs")}>
          Message logs <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      }
    >
      {loading ? (
        <SectionLoading label="Loading deliveries" size={40} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(d) => d.id}
          onRowClick={(d) => openRecordInTab(d.id, "Message Logs")}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle px-6 py-10 text-center text-sm text-text-secondary">
              {emptyText || "Nothing sent on this channel yet."}
            </div>
          }
        />
      )}
    </SectionCard>
  );
}
