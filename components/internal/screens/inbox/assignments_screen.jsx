"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Inbox, Loader2, Shuffle, UserCheck, UserPlus, Users } from "lucide-react";
import {
  ActionMenu,
  Button,
  DataTable,
  EmptyState,
  LogoLoading,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { listAssignmentRules } from "@/lib/supabase/assignment_rules";
import { listSlaPolicies } from "@/lib/supabase/sla_policies";
import { slaState } from "@/lib/inbox/sla";
import { formatDuration, formatListTime } from "@/lib/inbox/format";
import { Avatar, SlaChip, useInboxData, useNow } from "./inbox_kit";
import { RoutingRulesPanel } from "./routing_rules_panel";
import { SlaPoliciesPanel } from "./sla_policies_panel";
import { SavedRepliesManager } from "./saved_replies_manager";
import { CONVERSATION_STATUS_MAP, PRIORITY_MAP, channelMeta, conversationName } from "./constants";

// Assignments: my queue, the unassigned queue, team workload, and the routing-rule, SLA-policy and
// saved-reply editors that drive them.

const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const ACTIVE = new Set(["open", "pending"]);
const WEEK = 7 * 86_400_000;

function QueueTable({ rows, contactsById, membersById, messageIndex, now, onOpen, actions, emptyIcon, emptyTitle, emptyDescription, filtersActive, onClear }) {
  const pager = usePagination(rows, { resetKey: rows.length });
  const columns = [
    {
      key: "who",
      header: "Conversation",
      render: (c) => {
        const contact = contactsById.get(c.contactId);
        const name = conversationName(c, contact);
        const preview = messageIndex.get(c.id)?.preview?.body || c.preview || "";
        return (
          <div className="flex min-w-0 max-w-md items-center gap-3">
            <Avatar name={name} channel={c.channel} />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{name}</p>
              <p className="truncate text-xs text-text-secondary">{preview || "No messages yet"}</p>
            </div>
          </div>
        );
      },
    },
    { key: "channel", header: "Channel", className: "whitespace-nowrap text-muted-foreground", render: (c) => `${channelMeta(c.channel).label}${c.kind === "comment" ? " comment" : ""}` },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (c) => <StatusPill status={c.status} map={CONVERSATION_STATUS_MAP} /> },
    { key: "priority", header: "Priority", className: "whitespace-nowrap", render: (c) => (c.priority === "normal" ? <span className="text-sm text-text-tertiary">Normal</span> : <StatusPill status={c.priority} map={PRIORITY_MAP} />) },
    {
      key: "sla",
      header: "SLA",
      className: "whitespace-nowrap",
      render: (c) => (["none", "met"].includes(slaState(c, now).state) ? <span className="text-text-tertiary">—</span> : <SlaChip conversation={c} now={now} />),
    },
    { key: "waiting", header: "Last message", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (c) => formatListTime(c.lastMessageAt || c.createdAt, now) },
    { key: "assignee", header: "Assignee", className: "whitespace-nowrap text-muted-foreground", render: (c) => membersById.get(c.assigneeId)?.name || (c.assigneeId ? "Former member" : "Unassigned") },
    ...(actions ? [{ key: "actions", header: "", align: "right", render: actions }] : []),
  ];
  return (
    <div className="space-y-5">
      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(c) => c.id}
        onRowClick={(c) => onOpen(c)}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={emptyIcon}
              title={filtersActive ? "No matches" : emptyTitle}
              description={filtersActive ? "Try a different search or channel." : emptyDescription}
              action={filtersActive ? <Button variant="outline" className={OUTLINE} onClick={onClear}>Clear filters</Button> : null}
            />
          </div>
        }
      />
      <ListPagination {...pager} itemLabel="conversations" />
    </div>
  );
}

export function AssignmentsScreen() {
  const { projectId } = useProject();
  const canReply = useCan("campaign.inbox.reply");
  const canRoute = useCan("campaign.team.assign");
  const { openRecordInTab } = useWorkspaceUrl();
  const now = useNow(30_000);
  const data = useInboxData({ projectId });
  const { conversations, contactsById, members, membersById, me, messageIndex } = data;
  const [rules, setRules] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [tab, setTab] = useState("mine");
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listAssignmentRules(projectId), listSlaPolicies(projectId)]).then(([r, p]) => {
      if (!alive) return;
      setRules(r ?? []);
      setPolicies(p ?? []);
      setConfigLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const active = useMemo(() => conversations.filter((c) => ACTIVE.has(c.status)), [conversations]);
  const mine = useMemo(() => active.filter((c) => me?.id && c.assigneeId === me.id), [active, me]);
  const unassigned = useMemo(() => active.filter((c) => !c.assigneeId), [active]);

  const narrow = (rows) => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) => {
      if (channel !== "all" && c.channel !== channel) return false;
      if (!q) return true;
      const contact = contactsById.get(c.contactId);
      return `${conversationName(c, contact)} ${contact?.email || ""} ${messageIndex.get(c.id)?.text || ""}`.toLowerCase().includes(q);
    });
  };
  const bySla = (rows) => [...rows].sort((a, b) => String(slaState(a, now).dueAt || "9999").localeCompare(String(slaState(b, now).dueAt || "9999")));

  const workload = useMemo(() => {
    const since = new Date(now - WEEK).toISOString();
    const capFor = (userId) => {
      const caps = rules.filter((r) => r.active && r.members.includes(userId) && r.maxOpenPerMember).map((r) => r.maxOpenPerMember);
      return caps.length ? Math.min(...caps) : null;
    };
    return members.map((m) => {
      const owned = conversations.filter((c) => c.assigneeId === m.userId);
      const open = owned.filter((c) => c.status === "open").length;
      const pending = owned.filter((c) => c.status === "pending").length;
      const overdue = owned.filter((c) => ACTIVE.has(c.status) && slaState(c, now).state === "overdue").length;
      const resolved = owned.filter((c) => c.status === "resolved" && (c.resolvedAt || "") >= since).length;
      const answered = owned.filter((c) => c.firstResponseAt && (c.createdAt || "") >= since);
      const avg = answered.length ? answered.reduce((s, c) => s + Math.max(0, new Date(c.firstResponseAt) - new Date(c.createdAt)), 0) / answered.length : null;
      return { ...m, open, pending, overdue, resolved, avg, cap: capFor(m.userId) };
    });
  }, [members, conversations, rules, now]);
  const workloadPager = usePagination(workload);

  const stats = useMemo(() => {
    const since = new Date(now - WEEK).toISOString();
    return [
      { label: "My open", value: mine.length.toLocaleString("en-US") },
      { label: "Unassigned", value: unassigned.length.toLocaleString("en-US") },
      { label: "SLA overdue", value: active.filter((c) => slaState(c, now).state === "overdue").length.toLocaleString("en-US") },
      { label: "Resolved · 7d", value: conversations.filter((c) => c.status === "resolved" && (c.resolvedAt || "") >= since).length.toLocaleString("en-US") },
    ];
  }, [mine, unassigned, active, conversations, now]);

  const assign = async (ids, body, success) => {
    setRouting(true);
    const res = await apiPost(`/api/projects/${projectId}/inbox/assign`, { conversationIds: ids, ...body });
    setRouting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const assigned = res.data?.assigned || [];
    if (body.mode === "auto") {
      toast[assigned.length ? "success" : "error"](
        assigned.length ? `Routed ${assigned.length} of ${ids.length} conversation${ids.length === 1 ? "" : "s"}.` : res.data?.skipped?.[0]?.reason || "No rule matched these conversations.",
      );
    } else {
      toast.success(success);
    }
    for (const a of assigned) data.patchLocal(a.id, { assigneeId: a.assigneeId });
    data.refresh();
  };

  const open = (c) => openRecordInTab(c.id, "Conversations");
  const channelOptions = useMemo(
    () => [{ value: "all", label: "All channels" }, ...[...new Set(conversations.map((c) => c.channel))].map((c) => ({ value: c, label: channelMeta(c).label }))],
    [conversations],
  );
  const filtersActive = Boolean(query) || channel !== "all";
  const clear = () => {
    setQuery("");
    setChannel("all");
  };
  const unassignedRows = bySla(narrow(unassigned));

  const views = [
    { value: "mine", label: mine.length ? `My queue ${mine.length}` : "My queue" },
    { value: "unassigned", label: unassigned.length ? `Unassigned ${unassigned.length}` : "Unassigned" },
    { value: "team", label: "Team workload" },
    { value: "rules", label: "Routing rules" },
    { value: "sla", label: "SLA policies" },
    { value: "replies", label: "Saved replies" },
  ];
  const queueTab = tab === "mine" || tab === "unassigned";

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Assignments"
        description="Who owns which conversation, how loaded the team is, and the rules that route new ones."
        actions={
          canReply && unassigned.length ? (
            <Button disabled={routing} onClick={() => assign(unassigned.map((c) => c.id), { mode: "auto" })} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {routing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />} Auto-assign unassigned
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} columns={4} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={tab} onValueChange={setTab} options={views} height="h-9" />
          {queueTab ? <FilterDropdown value={channel} onValueChange={setChannel} options={channelOptions} height="h-9" /> : null}
        </div>
        {queueTab ? <SearchInput value={query} onChange={setQuery} placeholder="Search people and messages…" /> : null}
      </Toolbar>

      {data.loading || (configLoading && ["team", "rules", "sla"].includes(tab)) ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle py-20">
          <LogoLoading size={56} />
        </div>
      ) : tab === "mine" ? (
        <QueueTable
          rows={bySla(narrow(mine))}
          contactsById={contactsById}
          membersById={membersById}
          messageIndex={messageIndex}
          now={now}
          onOpen={open}
          emptyIcon={UserCheck}
          emptyTitle="Your queue is clear"
          emptyDescription="Conversations assigned to you that are open or pending show up here, most urgent SLA first."
          filtersActive={filtersActive}
          onClear={clear}
        />
      ) : tab === "unassigned" ? (
        <QueueTable
          rows={unassignedRows}
          contactsById={contactsById}
          membersById={membersById}
          messageIndex={messageIndex}
          now={now}
          onOpen={open}
          emptyIcon={Inbox}
          emptyTitle="Nothing waiting for an owner"
          emptyDescription={rules.some((r) => r.active) ? "Routing rules are assigning new conversations as they arrive." : "Add a routing rule to assign new conversations automatically."}
          filtersActive={filtersActive}
          onClear={clear}
          actions={
            canReply
              ? (c) => (
                  <ActionMenu
                    label="Assign conversation"
                    icon={UserPlus}
                    items={[
                      me?.id && { label: "Assign to me", icon: UserCheck, onSelect: () => assign([c.id], { mode: "manual", assigneeId: me.id }, "Assigned to you.") },
                      { label: "Auto-assign by rules", icon: Shuffle, onSelect: () => assign([c.id], { mode: "auto" }) },
                      { separator: true },
                      ...members
                        .filter((m) => m.userId !== me?.id)
                        .map((m) => ({ label: `Assign to ${m.name || m.email}`, onSelect: () => assign([c.id], { mode: "manual", assigneeId: m.userId }, `Assigned to ${m.name || m.email}.`) })),
                    ]}
                  />
                )
              : null
          }
        />
      ) : tab === "team" ? (
        <div className="space-y-5">
          <DataTable
            columns={[
              {
                key: "member",
                header: "Teammate",
                render: (m) => (
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name || m.email} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{m.name || m.email}{m.userId === me?.id ? " (you)" : ""}</p>
                      <p className="truncate text-xs text-text-secondary">{m.roleName}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: "open",
                header: "Open",
                render: (m) => (
                  <div className="w-32">
                    <span className="tabular-nums text-foreground">{m.open}{m.cap ? <span className="text-text-tertiary"> / {m.cap}</span> : null}</span>
                    {m.cap ? (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-active" aria-hidden="true">
                        <div className={m.open >= m.cap ? "h-full bg-red-500" : "h-full bg-primary"} style={{ width: `${Math.min(100, (m.open / m.cap) * 100)}%` }} />
                      </div>
                    ) : null}
                  </div>
                ),
              },
              { key: "pending", header: "Pending", align: "right", className: "tabular-nums text-muted-foreground", render: (m) => m.pending },
              { key: "overdue", header: "SLA overdue", align: "right", className: "tabular-nums", render: (m) => <span className={m.overdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>{m.overdue}</span> },
              { key: "resolved", header: "Resolved · 7d", align: "right", className: "tabular-nums text-muted-foreground", render: (m) => m.resolved },
              { key: "avg", header: "Avg first reply · 7d", align: "right", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (m) => (m.avg == null ? "—" : formatDuration(m.avg)) },
            ]}
            data={workloadPager.pageItems}
            getRowKey={(m) => m.userId}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState icon={Users} title="No teammates yet" description="Add people to this project in Settings → Team to share the inbox." />
              </div>
            }
          />
          <ListPagination {...workloadPager} itemLabel="teammates" />
        </div>
      ) : tab === "rules" ? (
        <RoutingRulesPanel projectId={projectId} rules={rules} setRules={setRules} members={members} membersById={membersById} canEdit={canRoute} now={now} />
      ) : tab === "sla" ? (
        <SlaPoliciesPanel projectId={projectId} policies={policies} setPolicies={setPolicies} canEdit={canRoute} />
      ) : (
        <SavedRepliesManager projectId={projectId} replies={data.savedReplies} setReplies={data.setSavedReplies} canEdit={canReply} now={now} />
      )}
    </MainScreenWrapper>
  );
}

export default AssignmentsScreen;
