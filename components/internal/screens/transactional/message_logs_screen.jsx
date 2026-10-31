"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AppWindow,
  ArrowUpRight,
  Bell,
  Braces,
  Camera,
  Copy,
  Download,
  Eye,
  FileText,
  History,
  Mail,
  MessageCircle,
  MessageSquare,
  Radio,
  ScrollText,
  Send,
  Smartphone,
  UserRound,
  Video,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { getDelivery, listDeliveryEvents } from "@/lib/supabase/message_logs";
import { listApiKeys } from "@/lib/supabase/api_keys";
import {
  ActionMenu,
  Badge,
  Button,
  DataTable,
  ScreenHeader,
  SearchInput,
  SectionCard,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@geiger/ui";
import {
  CHANNEL_LABEL,
  DELIVERY_STATUS_MAP,
  ListEmptyState,
  OUTLINE_BUTTON,
  SOURCE_LABEL,
  SectionLoading,
  copyText,
  formatDateTime,
  formatRelative,
  isDelivered,
  isFailed,
  useNow,
} from "@/components/internal/screens/channels/channels_kit";

// Every message any channel sent (campaign, automation, API, test…) from campaign.deliveries, with filters,
// CSV export and a read-only detail: delivery fields plus the lifecycle and tracked events behind it.

const CHANNEL_ICON = {
  email: Mail,
  sms: Smartphone,
  whatsapp: MessageCircle,
  push: Bell,
  in_app: AppWindow,
  instagram: Camera,
  messenger: MessageSquare,
  telegram: Send,
  tiktok: Video,
  rcs: Radio,
};

const PROVIDER_LABEL = {
  geiger_email: "Geiger Dash",
  twilio: "Twilio",
  meta_cloud: "WhatsApp Cloud API",
  web_push: "Web Push",
  geiger_sdk: "In-app SDK",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram Bot API",
  tiktok: "TikTok",
  rcs: "RCS Business Messaging",
};

const ENGAGED = new Set(["opened", "read", "clicked", "replied"]);

const STATUS_GROUPS = {
  delivered: { label: "Delivered or engaged", test: (s) => isDelivered(s) },
  sent: { label: "Sent, no receipt yet", test: (s) => s === "sent" },
  queued: { label: "Queued", test: (s) => s === "queued" },
  failed: { label: "Bounced or failed", test: (s) => isFailed(s) },
  not_sent: { label: "Not sent", test: (s) => s === "not_sent" },
  unsubscribed: { label: "Unsubscribed", test: (s) => s === "unsubscribed" },
};

const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_GROUPS).map(([value, g]) => ({ value, label: g.label }))];

const RANGES = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const LOG_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Who it went to, how it was sent and what came back." },
  { key: "events", label: "Events", icon: History, desc: "The delivery lifecycle and every event recorded against it." },
  { key: "raw", label: "Raw record", icon: Braces, desc: "The delivery row as stored, for debugging and support." },
];

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const num = (n) => Number(n || 0).toLocaleString("en-US");

function ChannelCell({ channel }) {
  const Icon = CHANNEL_ICON[channel] || Mail;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-text-secondary">
      <Icon className="h-3.5 w-3.5" /> {CHANNEL_LABEL[channel] || channel}
    </span>
  );
}

const sourceLabel = (d) => (d.sourceType === "transactional" && d.templateKey ? `API · ${d.templateKey}` : SOURCE_LABEL[d.sourceType] || d.sourceType);

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportCsv(rows) {
  const header = ["created_at", "channel", "to", "subject", "source", "template", "status", "provider", "provider_id", "error", "opens", "clicks", "id"];
  const lines = rows.map((d) =>
    [d.createdAt, d.channel, d.to, d.subject, d.sourceType, d.templateKey || "", d.status, d.provider, d.providerId || "", d.error, d.openCount, d.clickCount, d.id].map(csvCell).join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `message-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// "email.clicked" -> "clicked"; anything else keeps its name.
const eventStatus = (name) => {
  const tail = String(name || "").split(".").pop();
  return DELIVERY_STATUS_MAP[tail] ? tail : null;
};

// Lifecycle from the delivery's timestamps, plus tracked events; timestamps fill in where no event was recorded.
function buildTimeline(d, events) {
  const items = [{ id: "queued", status: "queued", at: d.createdAt, detail: `${sourceLabel(d)} · ${CHANNEL_LABEL[d.channel] || d.channel}` }];
  if (d.sentAt) items.push({ id: "sent", status: "sent", at: d.sentAt, detail: [PROVIDER_LABEL[d.provider] || d.provider, d.providerId].filter(Boolean).join(" · ") });
  if (d.deliveredAt) items.push({ id: "delivered", status: "delivered", at: d.deliveredAt });
  const seen = new Set();
  for (const e of events) {
    const status = eventStatus(e.name);
    if (status) seen.add(status);
    const detail = e.properties?.url || e.url || e.properties?.body || e.properties?.userAgent || "";
    items.push({ id: e.id, status, name: e.name, at: e.occurredAt, detail: String(detail).slice(0, 140) });
  }
  if (d.openedAt && !seen.has("opened") && !seen.has("read")) items.push({ id: "opened", status: d.channel === "email" ? "opened" : "read", at: d.openedAt });
  if (d.clickedAt && !seen.has("clicked")) items.push({ id: "clicked", status: "clicked", at: d.clickedAt });
  if (d.bouncedAt && !seen.has("bounced")) items.push({ id: "bounced", status: "bounced", at: d.bouncedAt, detail: d.error });
  if (d.unsubscribedAt && !seen.has("unsubscribed")) items.push({ id: "unsubscribed", status: "unsubscribed", at: d.unsubscribedAt });
  if (["failed", "not_sent", "complained"].includes(d.status) && !seen.has(d.status)) {
    items.push({ id: "terminal", status: d.status, at: d.sentAt || d.createdAt, detail: d.error });
  }
  return items.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
}

const value = (text, mono = false) => <span className={`max-w-[360px] break-all text-right text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>{text || "—"}</span>;

function MessageDetail({ delivery, projectId, onBack }) {
  const { openRecordInTab } = useWorkspaceUrl();
  const [events, setEvents] = useState(null);
  const [keyName, setKeyName] = useState("");
  const now = useNow();

  useEffect(() => {
    let alive = true;
    listDeliveryEvents(projectId, delivery.id).then((rows) => alive && setEvents(rows ?? []));
    if (delivery.apiKeyId) {
      listApiKeys(projectId).then((keys) => alive && setKeyName((keys || []).find((k) => k.id === delivery.apiKeyId)?.name || ""));
    }
    return () => {
      alive = false;
    };
  }, [projectId, delivery.id, delivery.apiKeyId]);

  const timeline = useMemo(() => (events ? buildTimeline(delivery, events) : []), [delivery, events]);
  const d = delivery;
  const links = [
    d.contactId && { label: "Contact", icon: UserRound, onClick: () => openRecordInTab(d.contactId, "Contacts") },
    d.campaignId && { label: "Campaign", icon: Mail, onClick: () => openRecordInTab(d.campaignId, "All Campaigns") },
    d.sourceType === "transactional" && d.sourceId && { label: "Template", icon: ScrollText, onClick: () => openRecordInTab(d.sourceId, "Transactional Templates") },
  ].filter(Boolean);

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={d.subject || d.to}
      status={d.status}
      statusMap={DELIVERY_STATUS_MAP}
      badges={
        <>
          <ChannelCell channel={d.channel} />
          <span className="text-xs text-text-tertiary">
            {sourceLabel(d)} · {formatRelative(d.createdAt, now)}
          </span>
        </>
      }
      actions={
        <>
          {links.map((l) => (
            <Button key={l.label} variant="outline" className={OUTLINE_BUTTON} onClick={l.onClick}>
              <l.icon className="h-4 w-4" /> {l.label}
            </Button>
          ))}
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => copyText(d.id, "Message ID copied")}>
            <Copy className="h-4 w-4" /> Copy ID
          </Button>
        </>
      }
      nav={LOG_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Delivery record" description="Where the message went, what sent it and how the provider handled it.">
              <SettingsList>
                <SettingRow title="To" description="The address, number or contact the message was sent to." control={value(d.to, d.channel !== "email")} />
                {d.subject ? <SettingRow title={d.channel === "email" ? "Subject" : "Title"} description="As handed to the provider." control={value(d.subject)} /> : null}
                <SettingRow title="Channel" description="How the message was delivered." control={<ChannelCell channel={d.channel} />} />
                <SettingRow
                  title="Source"
                  description="What sent it."
                  control={value(`${SOURCE_LABEL[d.sourceType] || d.sourceType}${d.templateKey ? ` · ${d.templateKey}${d.templateVersion ? ` v${d.templateVersion}` : ""}` : ""}${d.variant ? ` · variant ${d.variant}` : ""}`)}
                />
                {d.apiKeyId ? <SettingRow title="API key" description="The secret key that authenticated the request." control={value(keyName || d.apiKeyId, !keyName)} /> : null}
                <SettingRow title="Provider" description="Who accepted the message and their reference for it." control={value([PROVIDER_LABEL[d.provider] || d.provider, d.providerId].filter(Boolean).join(" · "), Boolean(d.providerId))} />
                <SettingRow title="Message ID" description="Reference this when debugging or contacting support." control={value(d.id, true)} />
                <SettingRow title="Queued" description="When the message was logged." control={value(formatDateTime(d.createdAt))} />
                {d.sentAt ? <SettingRow title="Sent" description="When the provider accepted it." control={value(formatDateTime(d.sentAt))} /> : null}
                {d.channel === "email" ? <SettingRow title="Opens · clicks" description="Tracked opens and link clicks." control={value(`${num(d.openCount)} · ${num(d.clickCount)}`)} /> : null}
                {d.cost > 0 ? <SettingRow title="Cost" description="As reported by the provider." control={value(`${d.cost.toFixed(4)} ${d.currency}`)} /> : null}
                {d.error ? (
                  <SettingRow title="Error" description="Why the message didn't go through." control={<span className="max-w-[360px] text-right text-sm text-red-600 dark:text-red-400">{d.error}</span>} />
                ) : null}
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "events" ? (
            <SectionCard>
              {events === null ? (
                <SectionLoading label="Loading events" size={36} />
              ) : (
                <ol className="divide-y divide-border">
                  {timeline.map((ev) => (
                    <li key={ev.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {ev.status ? <StatusPill status={ev.status} map={DELIVERY_STATUS_MAP} /> : <Badge variant="neutral">Event</Badge>}
                          {ev.name ? <span className="font-mono text-xs text-text-secondary">{ev.name}</span> : null}
                        </div>
                        {ev.detail ? <span className="truncate text-xs text-text-tertiary">{ev.detail}</span> : null}
                      </div>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-text-secondary">{formatDateTime(ev.at)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          ) : null}

          {active === "raw" ? (
            <SectionCard description="Message bodies aren't stored — only the delivery record and its metadata.">
              <pre className="max-h-[480px] overflow-auto rounded-lg border border-border bg-surface-card p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                {JSON.stringify(d, null, 2)}
              </pre>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function MessageLogsScreen() {
  const { projectId, recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();
  const now = useNow();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("7");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [direct, setDirect] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listDeliveries(projectId, { since: new Date(now - Number(range) * 86_400_000).toISOString(), limit: 5000 }).then((data) => {
      if (!alive) return;
      setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, range, now]);

  const listed = rows.find((d) => d.id === recordId) || null;

  // Deep links (Recent deliveries on channel screens) may point outside the loaded window.
  useEffect(() => {
    if (!projectId || !recordId || loading || listed) return undefined;
    let alive = true;
    getDelivery(projectId, recordId).then((d) => alive && setDirect(d));
    return () => {
      alive = false;
    };
  }, [projectId, recordId, loading, listed]);

  const channelOptions = useMemo(() => {
    const present = [...new Set(rows.map((d) => d.channel))];
    return [{ value: "all", label: "All channels" }, ...present.map((c) => ({ value: c, label: CHANNEL_LABEL[c] || c }))];
  }, [rows]);

  const sourceOptions = useMemo(() => {
    const present = [...new Set(rows.map((d) => d.sourceType))];
    return [{ value: "all", label: "All sources" }, ...present.map((s) => ({ value: s, label: SOURCE_LABEL[s] || s }))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((d) => {
      if (statusFilter !== "all" && !STATUS_GROUPS[statusFilter].test(d.status)) return false;
      if (channelFilter !== "all" && d.channel !== channelFilter) return false;
      if (sourceFilter !== "all" && d.sourceType !== sourceFilter) return false;
      if (q && !`${d.to} ${d.subject} ${d.id} ${d.providerId || ""} ${d.templateKey || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, statusFilter, channelFilter, sourceFilter]);

  const stats = useMemo(() => {
    const attempted = rows.filter((d) => d.status !== "not_sent" && d.status !== "queued");
    const delivered = attempted.filter((d) => isDelivered(d.status)).length;
    const engaged = attempted.filter((d) => ENGAGED.has(d.status)).length;
    const failed = attempted.filter((d) => isFailed(d.status)).length;
    const notSent = rows.filter((d) => d.status === "not_sent").length;
    const period = RANGES.find((r) => r.value === range)?.label.toLowerCase();
    return [
      { label: "Messages", value: num(rows.length), footer: period },
      { label: "Delivered", value: num(delivered), footer: `${pct(delivered, attempted.length)} of attempted` },
      { label: "Engaged", value: num(engaged), footer: `${pct(engaged, delivered)} opened, read or clicked` },
      { label: "Failed", value: num(failed + notSent), footer: `${num(notSent)} blocked before the provider` },
    ];
  }, [rows, range]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${channelFilter}|${sourceFilter}|${range}` });

  const open = listed || (direct?.id === recordId ? direct : null);
  if (open) return <MessageDetail key={open.id} delivery={open} projectId={projectId} onBack={closeRecord} />;

  const filtersActive = query || statusFilter !== "all" || channelFilter !== "all" || sourceFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setChannelFilter("all");
    setSourceFilter("all");
  };

  const columns = [
    { key: "time", header: "Time", className: "whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground", render: (d) => formatDateTime(d.createdAt) },
    {
      key: "recipient",
      header: "Recipient",
      render: (d) => (
        <div className="flex min-w-0 max-w-[340px] flex-col">
          <span className="truncate font-medium text-foreground">{d.to}</span>
          <span className="truncate text-xs text-text-secondary">{d.error && isFailed(d.status) ? d.error : d.subject || "—"}</span>
        </div>
      ),
    },
    { key: "channel", header: "Channel", render: (d) => <ChannelCell channel={d.channel} /> },
    { key: "source", header: "Source", className: "whitespace-nowrap text-muted-foreground", render: sourceLabel },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (d) => <StatusPill status={d.status} map={DELIVERY_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (d) => (
        <ActionMenu
          label={`Actions for message to ${d.to}`}
          items={[
            { label: "View details", icon: Eye, onSelect: () => openRecord(d.id) },
            d.contactId && { label: "Open contact", icon: ArrowUpRight, onSelect: () => openRecordInTab(d.contactId, "Contacts") },
            { label: "Copy message ID", icon: Copy, onSelect: () => copyText(d.id, "Message ID copied") },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Message Logs"
        description="Every message sent on any channel, with its delivery status and events."
        actions={
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!filtered.length} onClick={() => exportCsv(filtered)}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={range} onValueChange={setRange} options={RANGES} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={channelFilter} onValueChange={setChannelFilter} options={channelOptions} height="h-9" />
          <FilterDropdown value={sourceFilter} onValueChange={setSourceFilter} options={sourceOptions} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search recipient, subject or ID…" />
      </Toolbar>

      {loading ? (
        <SectionLoading label="Loading message logs" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(d) => d.id}
            onRowClick={(d) => openRecord(d.id)}
            empty={
              <ListEmptyState
                icon={ScrollText}
                filtersActive={filtersActive}
                onClear={clearFilters}
                title="No messages in this period"
                description="Campaigns, automations, the Email API and channel tests all log here as they send. Try a longer period."
              />
            }
          />
          <ListPagination {...pager} itemLabel="messages" />
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default MessageLogsScreen;
