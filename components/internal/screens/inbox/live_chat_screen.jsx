"use client";

import React, { useMemo, useState } from "react";
import { Settings, MessageSquare, LogIn, X } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SectionCard,
  SettingsList,
  SettingRow,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const STATUS_TONE = { Active: "success", Waiting: "warning", Ended: "neutral" };

const INITIAL_SESSIONS = [
  { id: 1, visitor: "Ava Cole", anonymous: false, location: "San Francisco, US", page: "/pricing", status: "Active", duration: "4m 12s", agent: "Ava" },
  { id: 2, visitor: null, anonymous: true, location: "Toronto, CA", page: "/products/starter-kit", status: "Waiting", duration: "0m 38s", agent: "—" },
  { id: 3, visitor: "Liam O'Brien", anonymous: false, location: "London, UK", page: "/checkout", status: "Active", duration: "7m 50s", agent: "Priya" },
  { id: 4, visitor: null, anonymous: true, location: "Berlin, DE", page: "/features", status: "Waiting", duration: "1m 05s", agent: "—" },
  { id: 5, visitor: "Maria Gomez", anonymous: false, location: "Madrid, ES", page: "/docs/getting-started", status: "Ended", duration: "12m 24s", agent: "Ava" },
  { id: 6, visitor: "Noah Schmidt", anonymous: false, location: "Hamburg, DE", page: "/blog/summer-sale", status: "Ended", duration: "3m 41s", agent: "Priya" },
];

export function LiveChatScreen() {
  const [enabled, setEnabled] = useState(true);
  const [position, setPosition] = useState("bottom-right");
  const [greeting, setGreeting] = useState("Hi there! 👋 How can we help you today?");
  const [team, setTeam] = useState("support");
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);

  const initials = (name) => name.split(" ").map((n) => n[0]).join("").slice(0, 2);

  const joinChat = (id) =>
    setSessions((p) => p.map((s) => (s.id === id ? { ...s, status: "Active", agent: s.agent === "—" ? "You" : s.agent } : s)));
  const endChat = (id) =>
    setSessions((p) => p.map((s) => (s.id === id ? { ...s, status: "Ended" } : s)));

  const sortedSessions = useMemo(() => sessions, [sessions]);

  const columns = [
    {
      key: "visitor",
      header: "Visitor",
      render: (s) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-active text-xs font-medium text-muted-foreground">
            {s.anonymous ? "?" : initials(s.visitor)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{s.anonymous ? "Anonymous" : s.visitor}</span>
            <span className="truncate text-xs text-text-secondary">{s.location}</span>
          </div>
        </div>
      ),
    },
    { key: "page", header: "Page", className: "font-mono text-xs text-muted-foreground", render: (s) => s.page },
    { key: "status", header: "Status", render: (s) => <Badge variant={STATUS_TONE[s.status]}>{s.status}</Badge> },
    { key: "duration", header: "Duration", className: "tabular-nums text-muted-foreground", render: (s) => s.duration },
    { key: "agent", header: "Agent", className: "text-muted-foreground", render: (s) => s.agent },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (s) => (
        <ActionMenu
          items={[
            { label: "Join chat", icon: LogIn, onSelect: () => joinChat(s.id) },
            { separator: true },
            { label: "End", icon: X, destructive: true, onSelect: () => endChat(s.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Live Chat"
        description="Live website chat sessions and your chat widget settings."
        actions={
          <Button variant="outline" className="bg-surface-card hover:bg-surface-subtle">
            <Settings className="h-4 w-4" /> Widget settings
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Config card */}
        <SectionCard
          title={
            <span className="inline-flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-text-secondary" /> Chat widget
            </span>
          }
          contentClassName="space-y-4"
        >
          <SettingsList>
            <SettingRow
              title="Widget enabled"
              description="Show the chat bubble on your website."
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </SettingsList>

          <Field label="Widget position">
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right">Bottom right</SelectItem>
                <SelectItem value="bottom-left">Bottom left</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Greeting message" htmlFor="lc-greeting" hint="Shown when a visitor first opens the widget.">
            <Input id="lc-greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} className="border-border" />
          </Field>

          <Field label="Assign to">
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="support">Support team</SelectItem>
                <SelectItem value="sales">Sales team</SelectItem>
                <SelectItem value="success">Customer success</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </SectionCard>

        {/* Sessions table */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Active &amp; recent sessions</h2>
          <DataTable
            columns={columns}
            data={sortedSessions}
            getRowKey={(s) => s.id}
            empty={
              <EmptyState
                icon={MessageSquare}
                title="No sessions found."
                className="rounded-xl border border-border bg-surface-subtle"
              />
            }
          />
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default LiveChatScreen;
