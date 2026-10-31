"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  LoadingArea,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatusPill,
  Switch,
  Textarea,
} from "@geiger/ui";
import { CHANNEL_META, defaultSettings, LIMITS, META_SCOPES } from "@/lib/social/accounts/catalog";
import { listRecentMessages } from "@/lib/social/accounts/activity";
import { socialApi } from "@/lib/social/accounts/api";
import {
  formatDateTime,
  healthIssues,
  relativeTime,
  tokenLabel,
  untilLabel,
  webhookLabel,
  windowCopy,
  windowState,
} from "./view_model";

// Sections of the social account editor: overview + health, automation guardrails, conversation starters,
// recent activity and a real test send. Each section owns its draft and saves through the social routes.

const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";
const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

export const MESSAGE_STATUS_MAP = {
  received: { label: "Received", variant: "neutral" },
  queued: { label: "Queued", variant: "neutral" },
  sent: { label: "Sent", variant: "info" },
  delivered: { label: "Delivered", variant: "success" },
  read: { label: "Read", variant: "success" },
  opened: { label: "Read", variant: "success" },
  replied: { label: "Replied", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  not_sent: { label: "Blocked", variant: "warning" },
};

const BLOCKED_COPY = {
  window: "Outside the messaging window",
  cap: "24h automated DM cap",
  private_reply: "Private reply limit",
  region: "Region not supported",
  blocked: "Bot blocked",
  capability: "No RCS on this number",
};

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-foreground">{children}</span>
    </div>
  );
}

// Overview ----------------------------------------------------------------

export function OverviewSection({ connection, now, canManage, checking, onCheck, onReconnect }) {
  const h = connection.health || {};
  const issues = healthIssues(connection);
  const required = META_SCOPES[connection.channel]?.required || [];
  const scopes = Array.isArray(h.scopes) ? h.scopes : [];
  const webhook = h.webhook || {};

  return (
    <div className="space-y-5">
      {issues.length ? (
        <div className="space-y-2">
          {issues.map((issue, i) => (
            <div
              key={`${issue.message}-${i}`}
              className={
                issue.level === "error"
                  ? "flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3"
                  : "flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3"
              }
            >
              <p className={issue.level === "error" ? "text-sm text-red-700 dark:text-red-300" : "text-sm text-amber-700 dark:text-amber-300"}>{issue.message}</p>
              {issue.action === "reconnect" && canManage ? (
                <Button size="sm" variant="outline" className={OUTLINE} onClick={onReconnect}>
                  Reconnect
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Connection"
          action={
            canManage ? (
              <Button size="sm" variant="outline" className={OUTLINE} disabled={checking} onClick={onCheck}>
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Check now
              </Button>
            ) : null
          }
        >
          <div className="divide-y divide-border">
            <Row label="Account">{connection.name || "—"}</Row>
            <Row label="Handle">{connection.handle || "—"}</Row>
            <Row label={`${CHANNEL_META[connection.channel]?.label} id`}>
              <span className="font-mono text-xs">{connection.externalId || "—"}</span>
            </Row>
            {connection.config?.pageName && connection.channel === "instagram" ? <Row label="Linked Page">{connection.config.pageName}</Row> : null}
            {connection.config?.region ? <Row label="Region">{connection.config.region}</Row> : null}
            <Row label="Brand">{connection.config?.brand || "—"}</Row>
            <Row label="Connected">{formatDateTime(connection.connectedAt)}</Row>
            <Row label="Last checked">{relativeTime(h.checkedAt || connection.lastCheckedAt, now)}</Row>
          </div>
        </SectionCard>

        <SectionCard title="Token & webhook">
          <div className="divide-y divide-border">
            <Row label="Token">{tokenLabel(connection, now)}</Row>
            {h.dataAccessExpiresAt ? <Row label="Data access">{`Expires ${untilLabel(h.dataAccessExpiresAt, now)}`}</Row> : null}
            {h.refreshExpiresAt ? <Row label="Refresh token">{`Expires ${untilLabel(h.refreshExpiresAt, now)}`}</Row> : null}
            <Row label="Webhook">{webhookLabel(connection)}</Row>
            {webhook.missingFields?.length ? <Row label="Missing fields">{webhook.missingFields.join(", ")}</Row> : null}
            {webhook.pendingUpdates != null ? <Row label="Pending updates">{webhook.pendingUpdates}</Row> : null}
            {webhook.lastError ? <Row label="Last webhook error">{webhook.lastError}</Row> : null}
            <Row label="Last event received">{relativeTime(webhook.lastEventAt, now)}</Row>
            {webhook.url ? (
              <Row label="Callback URL">
                <span className="break-all font-mono text-xs">{webhook.url}</span>
              </Row>
            ) : null}
          </div>
        </SectionCard>
      </div>

      {required.length || scopes.length ? (
        <SectionCard title="Permissions" description="Granted on the Page token, checked against what messaging and comments need.">
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...required, ...scopes])].map((scope) => {
              const granted = scopes.includes(scope);
              const needed = required.includes(scope);
              return (
                <Badge key={scope} variant={granted ? "success" : needed ? "danger" : "neutral"} className="font-mono">
                  {scope}
                  {!granted && needed ? " · missing" : ""}
                </Badge>
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      {h.profile && Object.keys(h.profile).length ? (
        <SectionCard title="Profile" description="As the platform reported it on the last check.">
          <div className="divide-y divide-border">
            {h.profile.username ? <Row label="Username">@{h.profile.username}</Row> : null}
            {h.profile.followers != null ? <Row label="Followers">{Number(h.profile.followers).toLocaleString("en-US")}</Row> : null}
            {h.profile.mediaCount != null ? <Row label="Posts">{Number(h.profile.mediaCount).toLocaleString("en-US")}</Row> : null}
          </div>
        </SectionCard>
      ) : null}

      {h.bot ? (
        <SectionCard title="Bot">
          <div className="divide-y divide-border">
            <Row label="Username">@{h.bot.username}</Row>
            <Row label="Can join groups">{h.bot.canJoinGroups ? "Yes" : "No"}</Row>
            <Row label="Reads all group messages">{h.bot.canReadAllGroupMessages ? "Yes (privacy mode off)" : "No (privacy mode on)"}</Row>
          </div>
        </SectionCard>
      ) : null}

      {h.launch?.regions?.length ? (
        <SectionCard title="Launch state" description="Carrier launch per region from the Business Communications API.">
          <div className="divide-y divide-border">
            {h.launch.regions.map((r) => (
              <Row key={r.region} label={r.region}>{r.state.replace("LAUNCH_STATE_", "").toLowerCase().replace(/_/g, " ")}</Row>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

// Guardrails --------------------------------------------------------------

const list = (value) => (Array.isArray(value) ? value.join(", ") : "");
const toList = (text) => String(text || "").split(",").map((k) => k.trim()).filter(Boolean);

function guardrailDraft(connection) {
  const s = { ...defaultSettings(connection.channel), ...(connection.config?.settings || {}) };
  return {
    handoverKeywords: list(s.handover?.keywords),
    handoverMessage: s.handover?.message || "",
    pauseHours: String(s.handover?.pauseAutomationHours ?? 24),
    quietEnabled: Boolean(s.quietHours?.enabled),
    quietStart: s.quietHours?.start || "21:00",
    quietEnd: s.quietHours?.end || "08:00",
    quietTimezone: s.quietHours?.timezone || "UTC",
    optOut: list(s.optOutKeywords),
    optIn: list(s.optInKeywords),
  };
}

export function GuardrailsSection({ connection, canManage, onSave }) {
  const initial = useMemo(() => guardrailDraft(connection), [connection]);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    const ok = await onSave({
      handover: { keywords: toList(draft.handoverKeywords), message: draft.handoverMessage, pauseAutomationHours: Number(draft.pauseHours) || 0 },
      quietHours: { enabled: draft.quietEnabled, start: draft.quietStart, end: draft.quietEnd, timezone: draft.quietTimezone },
      optOutKeywords: toList(draft.optOut),
      optInKeywords: toList(draft.optIn),
    });
    setSaving(false);
    if (ok) toast.success("Guardrails saved.");
  };

  return (
    <div className="space-y-6">
      <SectionCard bare title="Human handover" description="Every automated conversation must offer a person. These words hand the thread to your team and pause automation.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Handover keywords" htmlFor="ho-keywords" hint="Comma-separated, matched case-insensitively.">
            <Input id="ho-keywords" disabled={!canManage} value={draft.handoverKeywords} onChange={(e) => set("handoverKeywords")(e.target.value)} />
          </Field>
          <Field label="Pause automation for (hours)" htmlFor="ho-pause" stepper value={draft.pauseHours} onValueChange={set("pauseHours")} min={0} max={168}>
            <Input id="ho-pause" inputMode="numeric" disabled={!canManage} value={draft.pauseHours} onChange={(e) => set("pauseHours")(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Handover reply" htmlFor="ho-message" className="sm:col-span-2">
            <Textarea id="ho-message" disabled={!canManage} value={draft.handoverMessage} onChange={(e) => set("handoverMessage")(e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard bare title="Quiet hours" description="Automated messages wait until quiet hours end. Replies from your team still send.">
        <SettingsList>
          <SettingRow title="Hold automated messages overnight" checked={draft.quietEnabled} onCheckedChange={canManage ? set("quietEnabled") : undefined} />
        </SettingsList>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="From" htmlFor="qh-start">
            <Input id="qh-start" type="time" disabled={!canManage || !draft.quietEnabled} value={draft.quietStart} onChange={(e) => set("quietStart")(e.target.value)} />
          </Field>
          <Field label="Until" htmlFor="qh-end">
            <Input id="qh-end" type="time" disabled={!canManage || !draft.quietEnabled} value={draft.quietEnd} onChange={(e) => set("quietEnd")(e.target.value)} />
          </Field>
          <Field label="Time zone" htmlFor="qh-tz" hint="IANA name, e.g. Europe/Lisbon.">
            <Input id="qh-tz" disabled={!canManage || !draft.quietEnabled} value={draft.quietTimezone} onChange={(e) => set("quietTimezone")(e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard bare title="Opt-out keywords" description="A message that is exactly one of these opts the person out of this channel and is logged to the consent ledger.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opt out" htmlFor="kw-out">
            <Input id="kw-out" disabled={!canManage} value={draft.optOut} onChange={(e) => set("optOut")(e.target.value)} />
          </Field>
          <Field label="Opt back in" htmlFor="kw-in">
            <Input id="kw-in" disabled={!canManage} value={draft.optIn} onChange={(e) => set("optIn")(e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      {canManage ? (
        <div className="flex justify-end">
          <Button className={PRIMARY} disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save guardrails"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Conversation starters -----------------------------------------------------

function startersDraft(connection) {
  const s = { ...defaultSettings(connection.channel), ...(connection.config?.settings || {}) };
  return {
    iceBreakers: s.iceBreakers || [],
    persistentMenu: s.persistentMenu || [],
    greeting: s.greeting || "",
    commands: s.commands || [],
    description: s.description || "",
    shortDescription: s.shortDescription || "",
  };
}

function ListEditor({ items, max, addLabel, onChange, render, blank, disabled }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">{render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}</div>
          <Button variant="ghost" size="icon" aria-label="Remove" disabled={disabled} className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {items.length < max && !disabled ? (
        <Button variant="outline" size="sm" className={OUTLINE} onClick={() => onChange([...items, blank()])}>
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </Button>
      ) : null}
      {!items.length && disabled ? <p className="text-sm text-text-tertiary">None set.</p> : null}
    </div>
  );
}

export function StartersSection({ connection, now, canManage, onSave }) {
  const channel = connection.channel;
  const initial = useMemo(() => startersDraft(connection), [connection]);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const sync = connection.health?.profileSync;
  const meta = channel === "instagram" || channel === "messenger";

  const save = async () => {
    setSaving(true);
    const settings = meta
      ? { iceBreakers: draft.iceBreakers, persistentMenu: draft.persistentMenu, ...(channel === "messenger" ? { greeting: draft.greeting } : {}) }
      : { commands: draft.commands, description: draft.description, shortDescription: draft.shortDescription };
    const ok = await onSave(settings, { starters: true });
    setSaving(false);
    return ok;
  };

  return (
    <div className="space-y-6">
      {sync ? (
        <p className={sync.ok ? "text-sm text-text-secondary" : "text-sm text-red-600 dark:text-red-400"}>
          {sync.ok ? `Live on ${CHANNEL_META[channel].label} · synced ${relativeTime(sync.syncedAt, now)}` : `Last sync failed: ${sync.error}`}
        </p>
      ) : null}

      {meta ? (
        <>
          <SectionCard bare title="Ice breakers" description={`Up to ${LIMITS.iceBreakers} questions shown before someone sends their first message. The payload is what your automations match.`}>
            <ListEditor
              items={draft.iceBreakers}
              max={LIMITS.iceBreakers}
              addLabel="Add question"
              disabled={!canManage}
              blank={() => ({ question: "", payload: "" })}
              onChange={set("iceBreakers")}
              render={(item, patch) => (
                <>
                  <Input aria-label="Question" disabled={!canManage} maxLength={LIMITS.iceBreakerQuestion} value={item.question} onChange={(e) => patch({ question: e.target.value })} placeholder="What are your opening hours?" />
                  <Input aria-label="Payload" disabled={!canManage} value={item.payload} onChange={(e) => patch({ payload: e.target.value })} placeholder="HOURS" className="font-mono text-xs" />
                </>
              )}
            />
          </SectionCard>

          <SectionCard bare title="Persistent menu" description="Always available from the composer. Postbacks trigger automations; links open in the browser.">
            <ListEditor
              items={draft.persistentMenu}
              max={LIMITS.persistentMenu}
              addLabel="Add menu item"
              disabled={!canManage}
              blank={() => ({ type: "postback", title: "", payload: "" })}
              onChange={set("persistentMenu")}
              render={(item, patch) => (
                <>
                  <div className="flex gap-2">
                    <Select value={item.type} onValueChange={(type) => patch({ type })} disabled={!canManage}>
                      <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="postback">Postback</SelectItem>
                        <SelectItem value="web_url">Link</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input aria-label="Title" disabled={!canManage} maxLength={LIMITS.menuTitle} value={item.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Talk to a person" />
                  </div>
                  {item.type === "web_url" ? (
                    <Input aria-label="Link" disabled={!canManage} value={item.url || ""} onChange={(e) => patch({ url: e.target.value })} placeholder="https://halcyon.studio/contact" />
                  ) : (
                    <Input aria-label="Payload" disabled={!canManage} value={item.payload || ""} onChange={(e) => patch({ payload: e.target.value })} placeholder="HUMAN" className="font-mono text-xs" />
                  )}
                </>
              )}
            />
          </SectionCard>

          {channel === "messenger" ? (
            <SectionCard bare title="Greeting" description="Shown on the Messenger welcome screen. Use {{user_first_name}} to personalise.">
              <Field hint={`${draft.greeting.length}/${LIMITS.greeting}`}>
                <Textarea aria-label="Greeting" disabled={!canManage} maxLength={LIMITS.greeting} value={draft.greeting} onChange={(e) => set("greeting")(e.target.value)} />
              </Field>
            </SectionCard>
          ) : null}
        </>
      ) : (
        <>
          <SectionCard bare title="Bot commands" description="The / menu people see in the chat. Your automations match the command text.">
            <ListEditor
              items={draft.commands}
              max={LIMITS.telegramCommands}
              addLabel="Add command"
              disabled={!canManage}
              blank={() => ({ command: "", description: "" })}
              onChange={set("commands")}
              render={(item, patch) => (
                <>
                  <Input aria-label="Command" disabled={!canManage} value={item.command} onChange={(e) => patch({ command: e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase() })} placeholder="pricing" className="font-mono text-xs" />
                  <Input aria-label="Description" disabled={!canManage} value={item.description} onChange={(e) => patch({ description: e.target.value })} placeholder="See packages and prices" />
                </>
              )}
            />
          </SectionCard>
          <SectionCard bare title="Bot profile" description="What people see before they press Start.">
            <div className="grid gap-4">
              <Field label="Description" htmlFor="tg-desc" hint={`${draft.description.length}/${LIMITS.telegramDescription}`}>
                <Textarea id="tg-desc" disabled={!canManage} maxLength={LIMITS.telegramDescription} value={draft.description} onChange={(e) => set("description")(e.target.value)} />
              </Field>
              <Field label="Short description" htmlFor="tg-short" hint={`${draft.shortDescription.length}/${LIMITS.telegramShortDescription}`}>
                <Input id="tg-short" disabled={!canManage} maxLength={LIMITS.telegramShortDescription} value={draft.shortDescription} onChange={(e) => set("shortDescription")(e.target.value)} />
              </Field>
            </div>
          </SectionCard>
        </>
      )}

      {canManage ? (
        <div className="flex justify-end">
          <Button className={PRIMARY} disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Syncing…" : `Save and sync to ${CHANNEL_META[channel].label}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Activity ----------------------------------------------------------------

export function ActivitySection({ projectId, conversations, deliveries, now }) {
  const ids = useMemo(() => conversations.map((c) => c.id), [conversations]);
  const idKey = ids.join(",");
  const [messages, setMessages] = useState(null);
  useEffect(() => {
    let alive = true;
    listRecentMessages(projectId, idKey ? idKey.split(",") : [], { limit: 50 }).then((rows) => alive && setMessages(rows ?? []));
    return () => {
      alive = false;
    };
  }, [projectId, idKey]);

  const byId = useMemo(() => new Map(conversations.map((c) => [c.id, c])), [conversations]);
  const recentDeliveries = useMemo(() => deliveries.slice(0, 50), [deliveries]);

  const messageColumns = [
    { key: "when", header: "When", className: "whitespace-nowrap text-muted-foreground tabular-nums", render: (m) => relativeTime(m.sentAt, now) },
    { key: "person", header: "Person", className: "whitespace-nowrap", render: (m) => byId.get(m.conversationId)?.title || "Unknown" },
    {
      key: "direction",
      header: "Direction",
      render: (m) => <Badge variant={m.direction === "inbound" ? "neutral" : "info"}>{m.direction === "inbound" ? (byId.get(m.conversationId)?.kind === "comment" ? "Comment" : "Inbound") : "Outbound"}</Badge>,
    },
    { key: "body", header: "Message", className: "max-w-md", render: (m) => <span className="line-clamp-2 text-sm text-foreground">{m.body || (m.attachments.length ? `${m.attachments.length} attachment` : "—")}</span> },
    { key: "status", header: "Status", render: (m) => <StatusPill status={m.status} map={MESSAGE_STATUS_MAP} /> },
  ];

  const deliveryColumns = [
    { key: "when", header: "Sent", className: "whitespace-nowrap text-muted-foreground tabular-nums", render: (d) => relativeTime(d.sentAt || d.createdAt, now) },
    { key: "to", header: "To", className: "whitespace-nowrap font-mono text-xs", render: (d) => d.to },
    { key: "source", header: "Source", className: "whitespace-nowrap capitalize text-muted-foreground", render: (d) => d.sourceType },
    { key: "status", header: "Status", render: (d) => <StatusPill status={d.status} map={MESSAGE_STATUS_MAP} /> },
    { key: "detail", header: "Detail", className: "max-w-xs text-xs text-text-secondary", render: (d) => (d.blockedBy ? BLOCKED_COPY[d.blockedBy] || d.blockedBy : d.error || (d.tag ? `Tag ${d.tag}` : "—")) },
    { key: "cost", header: "Cost", align: "right", className: "tabular-nums text-muted-foreground", render: (d) => (d.cost ? `${d.cost.toFixed(4)} ${d.currency}` : "—") },
  ];

  return (
    <div className="space-y-5">
      <SectionCard title="Recent messages" bodyPadding={false}>
        {messages === null ? (
          <LoadingArea size={40} label="Loading messages" />
        ) : (
          <DataTable
            className="rounded-none border-0"
            columns={messageColumns}
            data={messages}
            getRowKey={(m) => m.id}
            empty={<EmptyState title="No messages yet" description="Messages appear here as soon as the webhook delivers them." />}
          />
        )}
      </SectionCard>
      <SectionCard title="Deliveries" description="Every send through this account, including ones a platform rule blocked." bodyPadding={false}>
        <DataTable
          className="rounded-none border-0"
          columns={deliveryColumns}
          data={recentDeliveries}
          getRowKey={(d) => d.id}
          empty={<EmptyState title="Nothing sent yet" description="Replies, automations and broadcasts sent from this account are logged here." />}
        />
      </SectionCard>
    </div>
  );
}

// Test message --------------------------------------------------------------

const MANUAL = "__manual__";

export function TestSection({ projectId, connection, conversations, now, canManage, onSent }) {
  const channel = connection.channel;
  const manualAllowed = channel === "telegram" || channel === "rcs";
  const recipients = useMemo(
    () =>
      conversations
        .filter((c) => c.kind !== "comment" && c.externalThreadId)
        .sort((a, b) => String(b.lastInboundAt || "").localeCompare(String(a.lastInboundAt || "")))
        .slice(0, 50)
        .map((c) => ({ id: c.externalThreadId, title: c.title || c.externalThreadId, window: windowState(c, channel, now) })),
    [conversations, channel, now],
  );
  const firstOpen = recipients.find((r) => r.window.state === "open" || r.window.state === "none");
  const [to, setTo] = useState(firstOpen?.id || (manualAllowed ? MANUAL : ""));
  const [manual, setManual] = useState("");
  const [text, setText] = useState(`Test message from ${connection.config?.brand || connection.name}.`);
  const [pending, setPending] = useState(false);
  const target = to === MANUAL ? manual.trim() : to;
  const chosen = recipients.find((r) => r.id === to);
  const closed = chosen && (chosen.window.state === "closed" || chosen.window.state === "human");

  const send = async () => {
    setPending(true);
    const res = await socialApi.sendTest(projectId, connection.id, { to: target, text });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't send the test message.");
      return;
    }
    if (res.data.status === "sent" || res.data.status === "delivered") toast.success("Test message sent.");
    else toast.error(res.data.error || `The message wasn't sent (${res.data.status}).`);
    onSent?.();
  };

  return (
    <SectionCard bare title="Send a test message" description="A real message through this account. Platform rules apply, so a closed window is refused with the reason.">
      <div className="grid gap-4">
        <Field label="Recipient">
          <Select value={to} onValueChange={setTo} disabled={!canManage}>
            <SelectTrigger className="w-full"><SelectValue placeholder={recipients.length ? "Choose a recent conversation" : "No conversations yet"} /></SelectTrigger>
            <SelectContent>
              {recipients.map((r) => (
                <SelectItem key={r.id} value={r.id} disabled={r.window.state === "closed"}>
                  {r.title} — {windowCopy(r.window, now)}
                </SelectItem>
              ))}
              {manualAllowed ? <SelectItem value={MANUAL}>{channel === "telegram" ? "Enter a chat id" : "Enter a phone number"}</SelectItem> : null}
            </SelectContent>
          </Select>
        </Field>
        {to === MANUAL ? (
          <Field
            label={channel === "telegram" ? "Chat id" : "Phone number"}
            htmlFor="test-manual"
            hint={channel === "telegram" ? "The person must have started the bot first." : "E.164 format. Unlaunched agents only reach registered test devices."}
          >
            <Input id="test-manual" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={channel === "telegram" ? "123456789" : "+14155550142"} />
          </Field>
        ) : null}
        {!recipients.length && !manualAllowed ? (
          <p className="text-sm text-text-secondary">Message the {CHANNEL_META[channel].label} account from a test profile first — the platform only lets a business reply to people who wrote in.</p>
        ) : null}
        {closed ? <p className="text-sm text-amber-700 dark:text-amber-300">This person&apos;s 24-hour window is closed, so automated and test messages are blocked.</p> : null}
        <Field label="Message" htmlFor="test-text">
          <Textarea id="test-text" disabled={!canManage} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {canManage ? (
          <div className="flex justify-end">
            <Button className={PRIMARY} disabled={pending || !target || !text.trim()} onClick={send}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send test
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
