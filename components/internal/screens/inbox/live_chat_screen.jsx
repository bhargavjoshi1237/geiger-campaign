"use client";

import React, { useMemo, useState } from "react";
import { Settings, MessageSquare, LogIn, X } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_TONE = { Active: "green", Waiting: "amber", Ended: "zinc" };

const INITIAL_SESSIONS = [
  { id: 1, visitor: "Ava Cole", anonymous: false, location: "San Francisco, US", page: "/pricing", status: "Active", duration: "4m 12s", agent: "Jordan" },
  { id: 2, visitor: null, anonymous: true, location: "Toronto, CA", page: "/products/starter-kit", status: "Waiting", duration: "0m 38s", agent: "—" },
  { id: 3, visitor: "Liam O'Brien", anonymous: false, location: "London, UK", page: "/checkout", status: "Active", duration: "7m 50s", agent: "Priya" },
  { id: 4, visitor: null, anonymous: true, location: "Berlin, DE", page: "/features", status: "Waiting", duration: "1m 05s", agent: "—" },
  { id: 5, visitor: "Maria Gomez", anonymous: false, location: "Madrid, ES", page: "/docs/getting-started", status: "Ended", duration: "12m 24s", agent: "Jordan" },
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Live Chat"
        description="Live website chat sessions and your chat widget settings."
        actions={
          <Button variant="outline" className="h-9 border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a]">
            <Settings className="h-4 w-4" /> Widget settings
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 border-t border-[#242424] pt-4 lg:grid-cols-[360px_1fr]">
        {/* Config card */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#737373]" />
            <h2 className="text-sm font-semibold text-[#ededed]">Chat widget</h2>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Widget enabled</p>
              <p className="text-xs text-[#737373]">Show the chat bubble on your website.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <Field label="Widget position">
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right">Bottom right</SelectItem>
                <SelectItem value="bottom-left">Bottom left</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Greeting message" htmlFor="lc-greeting" hint="Shown when a visitor first opens the widget.">
            <Input id="lc-greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} className="border-[#2a2a2a] bg-[#161616]" />
          </Field>

          <Field label="Assign to">
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="support">Support team</SelectItem>
                <SelectItem value="sales">Sales team</SelectItem>
                <SelectItem value="success">Customer success</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Sessions table */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#ededed]">Active &amp; recent sessions</h2>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <TableHead>Visitor</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSessions.map((s) => (
                  <TableRow key={s.id} className="border-[#2a2a2a]">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#242424] text-xs font-medium text-[#a3a3a3]">
                          {s.anonymous ? "?" : initials(s.visitor)}
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium text-[#ededed]">{s.anonymous ? "Anonymous" : s.visitor}</span>
                          <span className="truncate text-xs text-[#737373]">{s.location}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#a3a3a3]">{s.page}</TableCell>
                    <TableCell><Pill tone={STATUS_TONE[s.status]}>{s.status}</Pill></TableCell>
                    <TableCell className="tabular-nums text-[#a3a3a3]">{s.duration}</TableCell>
                    <TableCell className="text-[#a3a3a3]">{s.agent}</TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        items={[
                          { label: "Join chat", icon: LogIn, onSelect: () => joinChat(s.id) },
                          { label: "End", icon: X, danger: true, separatorBefore: true, onSelect: () => endChat(s.id) },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {sortedSessions.length === 0 && (
                  <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                    <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No sessions found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default LiveChatScreen;
