"use client";

import React, { useMemo, useState } from "react";
import { Download, Mail, Smartphone, Eye } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  SectionCard,
  Toolbar,
  DataTable,
  EmptyState,
} from "@geiger/ui";

const STATUS_TONE = {
  Delivered: "success",
  Opened: "info",
  Deferred: "warning",
  Bounced: "danger",
  Failed: "danger",
};

const STATUSES = ["Delivered", "Opened", "Deferred", "Bounced", "Failed"];
const CHANNELS = ["Email", "SMS"];

const EVENT_DOT = {
  Queued: "bg-neutral-500",
  Sent: "bg-blue-500",
  Delivered: "bg-emerald-500",
  Opened: "bg-blue-500",
  Deferred: "bg-amber-500",
  Bounced: "bg-red-500",
  Failed: "bg-red-500",
};

// Build a realistic event timeline for a given status.
function eventsFor(status, sentAt) {
  const base = [
    { label: "Queued", time: "14:22:01" },
    { label: "Sent", time: "14:22:02" },
  ];
  switch (status) {
    case "Opened":
      return [...base, { label: "Delivered", time: "14:22:04" }, { label: "Opened", time: "14:48:31" }];
    case "Delivered":
      return [...base, { label: "Delivered", time: "14:22:05" }];
    case "Deferred":
      return [...base, { label: "Deferred", time: "14:22:09" }];
    case "Bounced":
      return [...base, { label: "Bounced", time: "14:22:03" }];
    case "Failed":
      return [{ label: "Queued", time: "14:22:01" }, { label: "Failed", time: "14:22:02" }];
    default:
      return base;
  }
}

const INITIAL = [
  { id: 1, time: "Jun 7, 14:22", recipient: "ava.cole@northwind.io", subject: "Your receipt for order #48213", channel: "Email", status: "Opened", msgId: "msg_8f2a14c9" },
  { id: 2, time: "Jun 7, 13:58", recipient: "+1 (415) 555-0142", subject: "Your Geiger code is 884213", channel: "SMS", status: "Delivered", msgId: "msg_2b71e0aa" },
  { id: 3, time: "Jun 7, 13:40", recipient: "liam@obrien.dev", subject: "Reset your password", channel: "Email", status: "Delivered", msgId: "msg_c4d9f1e2" },
  { id: 4, time: "Jun 7, 12:11", recipient: "bounce@deadhost.io", subject: "Confirm your email address", channel: "Email", status: "Bounced", msgId: "msg_77aa3b18" },
  { id: 5, time: "Jun 7, 11:47", recipient: "noah.schmidt@hverk.de", subject: "Welcome to Geiger!", channel: "Email", status: "Opened", msgId: "msg_19c8e44d" },
  { id: 6, time: "Jun 7, 11:02", recipient: "+44 7700 900812", subject: "Your order #48199 has shipped", channel: "SMS", status: "Delivered", msgId: "msg_5e2f90b1" },
  { id: 7, time: "Jun 7, 10:30", recipient: "maria.gomez@lumen.co", subject: "Your receipt for order #48190", channel: "Email", status: "Deferred", msgId: "msg_a3b6c2d7" },
  { id: 8, time: "Jun 7, 09:55", recipient: "test.unsub@mail.com", subject: "Subscription renews soon", channel: "Email", status: "Failed", msgId: "msg_d81f02ac" },
  { id: 9, time: "Jun 7, 09:14", recipient: "+1 (212) 555-0177", subject: "Your delivery is arriving today", channel: "SMS", status: "Delivered", msgId: "msg_6c1a73fb" },
  { id: 10, time: "Jun 7, 08:42", recipient: "jordan.lee@brightpath.app", subject: "Confirm your email address", channel: "Email", status: "Opened", msgId: "msg_b92e51da" },
  { id: 11, time: "Jun 7, 08:05", recipient: "old.address@legacy.co", subject: "Your password was changed", channel: "Email", status: "Bounced", msgId: "msg_4f70d9c3" },
  { id: 12, time: "Jun 6, 23:31", recipient: "+61 491 570 156", subject: "Your verification code is 552901", channel: "SMS", status: "Delivered", msgId: "msg_e07b3a26" },
];

function ChannelCell({ channel }) {
  const Icon = channel === "SMS" ? Smartphone : Mail;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
      <Icon className="h-3.5 w-3.5" /> {channel}
    </span>
  );
}

function LabeledRow({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">{label}</span>
      <div className="min-w-0 text-sm text-foreground">{children}</div>
    </div>
  );
}

function MessageDetailDialog({ log, onOpenChange }) {
  if (!log) return null;
  const events = eventsFor(log.status, log.time);
  return (
    <Dialog open={!!log} onOpenChange={(o) => { if (!o) onOpenChange(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message details</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <SectionCard contentClassName="p-4">
            <LabeledRow label="To"><span className="break-all">{log.recipient}</span></LabeledRow>
            <LabeledRow label="Channel"><ChannelCell channel={log.channel} /></LabeledRow>
            <LabeledRow label="Subject"><span className="break-words">{log.subject}</span></LabeledRow>
            <LabeledRow label="Status"><Badge variant={STATUS_TONE[log.status]}>{log.status}</Badge></LabeledRow>
            <LabeledRow label="Message ID"><span className="font-mono text-muted-foreground">{log.msgId}</span></LabeledRow>
            <LabeledRow label="Sent at"><span className="text-muted-foreground">{log.time}</span></LabeledRow>
          </SectionCard>

          <div className="mt-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Events</h3>
            <ol className="space-y-3">
              {events.map((ev, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className={cn("h-2 w-2 rounded-full", EVENT_DOT[ev.label])} />
                  <span className="flex-1 text-sm text-foreground">{ev.label}</span>
                  <span className="font-mono text-xs text-text-secondary">{ev.time}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(null)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MessageLogsScreen() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [channelFilter, setChannelFilter] = useState("All");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INITIAL.filter((l) =>
      (statusFilter === "All" || l.status === statusFilter) &&
      (channelFilter === "All" || l.channel === channelFilter) &&
      (!q || l.recipient.toLowerCase().includes(q) || l.subject.toLowerCase().includes(q)),
    );
  }, [query, statusFilter, channelFilter]);

  const columns = [
    { key: "time", header: "Time", className: "whitespace-nowrap text-muted-foreground" },
    { key: "recipient", header: "Recipient", className: "font-medium text-foreground" },
    { key: "subject", header: "Subject", className: "max-w-xs truncate text-muted-foreground" },
    { key: "channel", header: "Channel", render: (l) => <ChannelCell channel={l.channel} /> },
    { key: "status", header: "Status", render: (l) => <Badge variant={STATUS_TONE[l.status]}>{l.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (l) => (
        <ActionMenu
          items={[
            { label: "View", icon: Eye, onSelect: () => setSelected(l) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Message Logs"
        description="A searchable record of every transactional message and its delivery events."
        actions={
          <Button variant="outline" className="bg-surface-card hover:bg-surface-subtle">
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
                {statusFilter === "All" ? "All statuses" : statusFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44 bg-surface-card">
              <DropdownMenuLabel className="text-text-secondary">Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-surface-hover" />
              {["All", ...STATUSES].map((s) => (
                <DropdownMenuItem key={s} onSelect={() => setStatusFilter(s)} className={cn("cursor-pointer focus:bg-surface-hover", statusFilter === s && "font-medium")}>
                  {s === "All" ? "All statuses" : s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
                {channelFilter === "All" ? "All channels" : channelFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44 bg-surface-card">
              <DropdownMenuLabel className="text-text-secondary">Filter by channel</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-surface-hover" />
              {["All", ...CHANNELS].map((c) => (
                <DropdownMenuItem key={c} onSelect={() => setChannelFilter(c)} className={cn("cursor-pointer focus:bg-surface-hover", channelFilter === c && "font-medium")}>
                  {c === "All" ? "All channels" : c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search recipient or subject…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(l) => l.id}
        empty={
          <EmptyState
            icon={Mail}
            title="No messages found"
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />

      <MessageDetailDialog log={selected} onOpenChange={setSelected} />
    </MainScreenWrapper>
  );
}

export default MessageLogsScreen;
