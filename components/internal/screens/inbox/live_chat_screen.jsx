"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, LogIn, CircleStop, Trash2, Pencil, Send, RotateCcw, CheckCircle2, MessagesSquare, User, UserCheck } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SearchInput,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  StatsBar,
  StatusPill,
  SectionCard,
  SettingsList,
  SettingRow,
  cn,
} from "@geiger/ui";

const STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Waiting: { label: "Waiting", variant: "warning" },
  Resolved: { label: "Resolved", variant: "neutral" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.keys(STATUS_MAP).map((s) => ({ value: s, label: s })),
];

const UNASSIGNED = "—";
const AGENTS = ["Ava", "Priya", "Marcus", "You"];
const TEAMS = [
  { value: "support", label: "Support team" },
  { value: "sales", label: "Sales team" },
  { value: "success", label: "Customer success" },
];

const INITIAL_SESSIONS = [
  {
    id: 1, visitor: "Ava Cole", anonymous: false, email: "ava.cole@northwind.co", location: "San Francisco, US", page: "/pricing",
    status: "Active", duration: "4m 12s", agent: "Ava", team: "sales", startedAt: "2:14 PM", firstResponse: 28,
    browser: "Chrome 128", device: "macOS · Desktop", previousChats: 2,
    messages: [
      { id: "m1", from: "visitor", text: "Hi! Does the Growth plan include SMS sends?", at: "2:14 PM" },
      { id: "m2", from: "agent", author: "Ava", text: "Hey Ava — yes, Growth includes 5,000 SMS credits a month.", at: "2:14 PM" },
      { id: "m3", from: "visitor", text: "Great. Can we roll unused credits over?", at: "2:16 PM" },
    ],
  },
  {
    id: 2, visitor: null, anonymous: true, email: null, location: "Toronto, CA", page: "/products/starter-kit",
    status: "Waiting", duration: "0m 38s", agent: UNASSIGNED, team: "support", startedAt: "2:21 PM", firstResponse: null,
    browser: "Safari 17", device: "iOS · Mobile", previousChats: 0,
    messages: [{ id: "m1", from: "visitor", text: "Is the starter kit back in stock?", at: "2:21 PM" }],
  },
  {
    id: 3, visitor: "Liam O'Brien", anonymous: false, email: "liam@obrien.ie", location: "London, UK", page: "/checkout",
    status: "Active", duration: "7m 50s", agent: "Priya", team: "support", startedAt: "2:03 PM", firstResponse: 41,
    browser: "Firefox 130", device: "Windows · Desktop", previousChats: 1,
    messages: [
      { id: "m1", from: "visitor", text: "My card keeps getting declined at checkout.", at: "2:03 PM" },
      { id: "m2", from: "agent", author: "Priya", text: "Sorry about that! Is it showing a specific error?", at: "2:04 PM" },
      { id: "m3", from: "visitor", text: "It just says “payment failed”.", at: "2:05 PM" },
      { id: "m4", from: "agent", author: "Priya", text: "Thanks — I'm checking the payment logs on our side now.", at: "2:06 PM" },
    ],
  },
  {
    id: 4, visitor: null, anonymous: true, email: null, location: "Berlin, DE", page: "/features",
    status: "Waiting", duration: "1m 05s", agent: UNASSIGNED, team: "sales", startedAt: "2:19 PM", firstResponse: null,
    browser: "Chrome 128", device: "Android · Mobile", previousChats: 0,
    messages: [{ id: "m1", from: "visitor", text: "Do you integrate with Shopify?", at: "2:19 PM" }],
  },
  {
    id: 5, visitor: "Maria Gomez", anonymous: false, email: "maria.gomez@brightlabs.io", location: "Madrid, ES", page: "/docs/getting-started",
    status: "Resolved", duration: "12m 24s", agent: "Ava", team: "success", startedAt: "11:42 AM", firstResponse: 19,
    browser: "Edge 128", device: "Windows · Desktop", previousChats: 4,
    messages: [
      { id: "m1", from: "visitor", text: "How do I verify my sending domain?", at: "11:42 AM" },
      { id: "m2", from: "agent", author: "Ava", text: "Head to Deliverability → Sending Domains and add the three DNS records shown there.", at: "11:42 AM" },
      { id: "m3", from: "visitor", text: "Done — it's showing verified now. Thanks!", at: "11:53 AM" },
    ],
  },
  {
    id: 6, visitor: "Noah Schmidt", anonymous: false, email: "noah.schmidt@halcyon.studio", location: "Hamburg, DE", page: "/blog/summer-sale",
    status: "Resolved", duration: "3m 41s", agent: "Priya", team: "support", startedAt: "10:08 AM", firstResponse: 52,
    browser: "Chrome 128", device: "macOS · Desktop", previousChats: 1,
    messages: [
      { id: "m1", from: "visitor", text: "When does the summer sale end?", at: "10:08 AM" },
      { id: "m2", from: "agent", author: "Priya", text: "It runs until Sunday at midnight CET.", at: "10:09 AM" },
    ],
  },
];

const SESSION_NAV = [
  { key: "transcript", label: "Transcript", icon: MessagesSquare, desc: "The conversation so far — reply straight from here." },
  { key: "visitor", label: "Visitor", icon: User, desc: "Who you're talking to and where they are on your site." },
  { key: "assignment", label: "Assignment", icon: UserCheck, desc: "The agent and team responsible for this chat." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const initials = (name) => name.split(" ").map((n) => n[0]).join("").slice(0, 2);

const visitorName = (s) => (s.anonymous ? "Anonymous visitor" : s.visitor);

const teamLabel = (value) => TEAMS.find((t) => t.value === value)?.label ?? value;

const formatSeconds = (sec) => (sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`);

const nowTime = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const ReadOut = ({ children, className }) => (
  <span className={cn("text-sm text-foreground", className)}>{children}</span>
);

function Transcript({ session, onReply }) {
  const [reply, setReply] = useState("");
  const resolved = session.status === "Resolved";

  const send = () => {
    const text = reply.trim();
    if (!text) return;
    onReply(session, text);
    setReply("");
  };

  return (
    <SectionCard contentClassName="space-y-4">
      <div className="space-y-3">
        {session.messages.map((m) => {
          const agent = m.from === "agent";
          return (
            <div key={m.id} className={cn("flex flex-col gap-1", agent ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  agent
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border bg-surface-card text-foreground",
                )}
              >
                {m.text}
              </div>
              <span className="px-1 text-[11px] text-text-tertiary">
                {agent ? m.author : visitorName(session)} · {m.at}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder={resolved ? "Reopen the chat to reply." : `Reply to ${visitorName(session)}…`}
          aria-label="Reply"
          disabled={resolved}
          className="border-border"
        />
        <Button onClick={send} disabled={resolved || !reply.trim()}>
          <Send className="h-4 w-4" /> Send
        </Button>
      </div>
    </SectionCard>
  );
}

// Editable slice of a session; compared against the row to derive dirty state.
const toDraft = (s) => ({ agent: s.agent, team: s.team });

function SessionEditor({ record, onBack, onSave, onReply, onToggleResolved, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const resolved = record.status === "Resolved";

  const save = () => {
    onSave(record.id, draft);
    setDraft(toDraft({ ...record, ...draft }));
  };

  // Replying claims an unassigned chat, so keep an untouched draft in step.
  const reply = (session, text) => {
    onReply(session, text);
    if (session.agent === UNASSIGNED) setDraft((d) => (d.agent === UNASSIGNED ? { ...d, agent: "You" } : d));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={visitorName(record)}
      status={record.status}
      statusMap={STATUS_MAP}
      badges={
        <span className="text-xs text-text-tertiary">
          {record.agent === UNASSIGNED ? "Unassigned" : `Assigned to ${record.agent}`} · {record.duration}
        </span>
      }
      meta={
        <span>
          <span className="font-mono text-xs">{record.page}</span> · {record.location} · started {record.startedAt}
        </span>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete session" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onToggleResolved(record)}>
            {resolved ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {resolved ? "Reopen" : "Resolve"}
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={SESSION_NAV}
      defaultSection="transcript"
    >
      {({ active }) => (
        <>
          {active === "transcript" ? <Transcript session={record} onReply={reply} /> : null}

          {active === "visitor" ? (
            <SectionCard bare title="Visitor details" description="What we know about the visitor and the page they're on.">
              <SettingsList>
                <SettingRow title="Email" description="Shared by the visitor or matched to a contact." control={<ReadOut className={!record.email && "text-text-tertiary"}>{record.email || "Not shared"}</ReadOut>} />
                <SettingRow title="Location" description="Estimated from the visitor's IP address." control={<ReadOut>{record.location}</ReadOut>} />
                <SettingRow title="Current page" description="Where the visitor opened the widget." control={<ReadOut className="font-mono text-xs text-muted-foreground">{record.page}</ReadOut>} />
                <SettingRow title="Browser" description="Reported by the visitor's browser." control={<ReadOut>{record.browser}</ReadOut>} />
                <SettingRow title="Device" description="Operating system and form factor." control={<ReadOut>{record.device}</ReadOut>} />
                <SettingRow title="Previous chats" description="Earlier conversations from this visitor." control={<ReadOut className="tabular-nums">{record.previousChats.toLocaleString("en-US")}</ReadOut>} />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "assignment" ? (
            <SectionCard bare title="Agent & team" description="Who's answering this chat and the queue it routes through.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Agent" hint="The teammate answering this chat.">
                  <Select value={draft.agent} onValueChange={set("agent")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Team" hint="The queue this chat routes through.">
                  <Select value={draft.team} onValueChange={set("team")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TEAMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function LiveChatScreen() {
  const [enabled, setEnabled] = useState(true);
  const [position, setPosition] = useState("bottom-right");
  const [greeting, setGreeting] = useState("Hi there! 👋 How can we help you today?");
  const [team, setTeam] = useState("support");
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q && !`${visitorName(s)} ${s.location} ${s.page} ${s.agent}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sessions, query, statusFilter]);

  const stats = useMemo(() => {
    const count = (st) => sessions.filter((s) => s.status === st).length;
    const responded = sessions.filter((s) => s.firstResponse != null);
    const avg = responded.length ? Math.round(responded.reduce((n, s) => n + s.firstResponse, 0) / responded.length) : null;
    return [
      { label: "Active", value: count("Active").toLocaleString("en-US") },
      { label: "Waiting", value: count("Waiting").toLocaleString("en-US") },
      { label: "Resolved today", value: count("Resolved").toLocaleString("en-US") },
      { label: "Avg first response", value: avg == null ? "—" : formatSeconds(avg) },
    ];
  }, [sessions]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}` });

  const patchSession = (id, patch) => setSessions((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const joinChat = (s) => {
    patchSession(s.id, { status: "Active", agent: s.agent === UNASSIGNED ? "You" : s.agent });
    toast.success(`Joined the chat with ${visitorName(s)}.`);
  };

  const toggleResolved = (s) => {
    if (s.status === "Resolved") {
      patchSession(s.id, { status: s.agent === UNASSIGNED ? "Waiting" : "Active" });
      toast.success(`Reopened the chat with ${visitorName(s)}.`);
    } else {
      patchSession(s.id, { status: "Resolved" });
      toast.success(`Resolved the chat with ${visitorName(s)}.`);
    }
  };

  // Replying claims an unassigned chat and makes it active.
  const handleReply = (s, text) => {
    setSessions((p) =>
      p.map((x) => {
        if (x.id !== s.id) return x;
        const agent = x.agent === UNASSIGNED ? "You" : x.agent;
        return {
          ...x,
          agent,
          status: "Active",
          messages: [...x.messages, { id: crypto.randomUUID(), from: "agent", author: agent, text, at: nowTime() }],
        };
      }),
    );
  };

  const handleSave = (id, patch) => {
    setSessions((p) =>
      p.map((x) => {
        if (x.id !== id) return x;
        // Assigning a waiting chat starts it; unassigning an active one puts it back in the queue.
        let status = x.status;
        if (x.status === "Waiting" && patch.agent !== UNASSIGNED) status = "Active";
        if (x.status === "Active" && patch.agent === UNASSIGNED) status = "Waiting";
        return { ...x, ...patch, status };
      }),
    );
    toast.success("Assignment saved.");
  };

  const handleDelete = (s) => {
    setDeleteTarget(null);
    setSessions((p) => p.filter((x) => x.id !== s.id));
    if (String(s.id) === recordId) closeRecord();
    toast.success(`Deleted the session with ${visitorName(s)}.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete session</DialogTitle>
          <DialogDescription>
            Delete the chat with <span className="font-medium text-foreground">{deleteTarget && visitorName(deleteTarget)}</span>? Its transcript is removed too. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = sessions.find((s) => String(s.id) === recordId);
  if (open) {
    return (
      <>
        <SessionEditor
          key={open.id}
          record={open}
          onBack={closeRecord}
          onSave={handleSave}
          onReply={handleReply}
          onToggleResolved={toggleResolved}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

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
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (s) => <StatusPill status={s.status} map={STATUS_MAP} />,
    },
    { key: "duration", header: "Duration", className: "tabular-nums text-muted-foreground", render: (s) => s.duration },
    { key: "agent", header: "Agent", className: "text-muted-foreground", render: (s) => s.agent },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <ActionMenu
          label={`Actions for ${visitorName(s)}`}
          items={[
            { label: "Open chat", icon: Pencil, onSelect: () => openRecord(String(s.id)) },
            s.status !== "Resolved" && s.agent !== "You" && { label: "Join chat", icon: LogIn, onSelect: () => joinChat(s) },
            s.status !== "Resolved"
              ? { label: "Resolve chat", icon: CircleStop, onSelect: () => toggleResolved(s) }
              : { label: "Reopen chat", icon: RotateCcw, onSelect: () => toggleResolved(s) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(s) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Live Chat" description="Live website chat sessions and your chat widget settings." />

      <StatsBar stats={stats} columns={4} />

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

          <Field label="Assign to" hint={`New chats route to ${teamLabel(team).toLowerCase()}.`}>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TEAMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </SectionCard>

        {/* Sessions table */}
        <div className="min-w-0 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Active &amp; recent sessions</h2>

          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search visitors or pages…" />
          </Toolbar>

          <div className="space-y-5">
            <DataTable
              columns={columns}
              data={pager.pageItems}
              getRowKey={(s) => s.id}
              onRowClick={(s) => openRecord(String(s.id))}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState
                    icon={MessageSquare}
                    title={filtersActive ? "No matches" : "No sessions yet"}
                    description={
                      filtersActive
                        ? "Try a different search or filter."
                        : enabled
                          ? "Chats appear here as soon as a visitor opens the widget."
                          : "Turn on the chat widget to start receiving chats."
                    }
                    action={
                      filtersActive ? (
                        <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : null
                    }
                  />
                </div>
              }
            />
            <ListPagination {...pager} itemLabel="sessions" />
          </div>
        </div>
      </div>

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default LiveChatScreen;
