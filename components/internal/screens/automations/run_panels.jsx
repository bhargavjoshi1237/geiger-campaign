"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, History, Loader2, LogOut, RefreshCw, Search, Users } from "lucide-react";
import {
  ActionMenu,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EditorSectionHeader,
  EmptyState,
  Field,
  Input,
  LogoLoading,
  SearchInput,
  StatusPill,
  Switch,
  Toolbar,
  cn,
} from "@geiger/ui";

import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { listContacts } from "@/lib/supabase/contacts";
import { listEnrollments, listStepLogs } from "@/lib/supabase/automations";
import { exitEnrollment, testEnrollContact } from "@/lib/automations/client";
import { getNode } from "@/lib/automations/graph";
import { summarizeNode } from "@/lib/automations/steps";
import { nodeTitle } from "./canvas/automation_nodes";
import {
  ENROLLMENT_FILTER_OPTIONS,
  ENROLLMENT_STATUS_MAP,
  LOG_FILTER_OPTIONS,
  LOG_STATUS_MAP,
  OUTLINE_BUTTON,
  actionLabel,
  formatDateTime,
  formatRelative,
} from "./constants";

const RUNNING = new Set(["active", "waiting"]);

function Loading() {
  return (
    <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
      <LogoLoading size={48} aria-label="Loading" />
    </div>
  );
}

function stepLabel(graph, nodeId) {
  const node = getNode(graph, nodeId);
  return node ? nodeTitle(node) : nodeId ? "Removed step" : "—";
}

// What a step-log row's detail says, in one line.
export function detailText(detail = {}) {
  if (detail.error) return String(detail.error);
  if (detail.reason) return String(detail.reason).replace(/_/g, " ");
  if (detail.subject) return `“${detail.subject}”`;
  if (detail.until) return `Until ${formatDateTime(detail.until)}`;
  if (detail.to) return `To ${detail.to}`;
  if (detail.handle) return `Path: ${detail.handle}`;
  if (detail.status) return String(detail.status);
  return "";
}

// ---------------------------------------------------------------- test enroll

export function TestEnrollDialog({ open, onOpenChange, projectId, automation, graph, dirty = false, onDone }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [contact, setContact] = useState(null);
  const [skipWaits, setSkipWaits] = useState(true);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    if (!open || !projectId) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      listContacts(projectId, { search: query, limit: 8 }).then((rows) => {
        if (!alive) return;
        setResults(rows ?? []);
        setSearching(false);
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, projectId, query]);

  const reset = () => {
    setQuery("");
    setContact(null);
    setOutcome(null);
    setRunning(false);
  };

  const close = (next) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const run = async () => {
    if (!contact) return;
    setRunning(true);
    const res = await testEnrollContact(projectId, automation.id, { contactId: contact.id, skipWaits });
    setRunning(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't enroll the contact.");
      return;
    }
    setOutcome(res.data);
    onDone?.();
    toast.success(`${contact.name} is running through “${automation.name}”.`);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test with a contact</DialogTitle>
          <DialogDescription>
            Runs the real steps for one contact — messages are sent, tags and lists change. Works on drafts too.
            {dirty ? " Unsaved changes aren't included; save first to test them." : ""}
          </DialogDescription>
        </DialogHeader>

        {outcome ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <StatusPill status={outcome.status} map={ENROLLMENT_STATUS_MAP} />
              <span className="text-text-secondary">
                {RUNNING.has(outcome.status) ? `Now at ${stepLabel(graph, outcome.currentNodeId)}` : "Finished the automation"}
              </span>
            </div>
            <ol className="max-h-72 space-y-1.5 overflow-y-auto">
              {(outcome.steps || []).map((s, i) => (
                <li key={`${s.nodeId}-${i}`} className="flex items-start gap-3 rounded-lg border border-border bg-surface-card px-3 py-2">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-text-tertiary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{stepLabel(graph, s.nodeId)}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {actionLabel(s.action)}
                      {detailText(s.detail) ? ` · ${detailText(s.detail)}` : ""}
                    </p>
                  </div>
                  <StatusPill status={s.status} map={LOG_STATUS_MAP} />
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="grid gap-4">
            <Field label="Contact" htmlFor="te-contact">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input id="te-contact" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or phone" className="pl-8" autoFocus />
              </div>
            </Field>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {searching && !results.length ? (
                <div className="flex justify-center py-6">
                  <LogoLoading size={32} aria-label="Searching contacts" />
                </div>
              ) : results.length ? (
                results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setContact(c)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 transition-colors",
                      contact?.id === c.id ? "bg-surface-active" : "hover:bg-surface-hover",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{c.name}</span>
                      <span className="block truncate text-xs text-text-secondary">{c.email || c.phone || "No address"}</span>
                    </span>
                    {c.status !== "subscribed" ? <Badge variant="warning">{c.status}</Badge> : null}
                  </button>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-sm text-text-secondary">No contacts match.</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Skip waits</p>
                <p className="text-xs text-text-secondary">Run the whole path now instead of waiting between steps.</p>
              </div>
              <Switch checked={skipWaits} onCheckedChange={setSkipWaits} aria-label="Skip waits" />
            </div>
          </div>
        )}

        <DialogFooter>
          {outcome ? (
            <>
              <Button variant="ghost" onClick={() => setOutcome(null)}>
                Test another
              </Button>
              <Button onClick={() => close(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button onClick={run} disabled={!contact || running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                {running ? "Running…" : "Enroll contact"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- enrollments

export function EnrollmentsPanel({ projectId, automation, graph, canEdit, onTest, refreshKey, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    listEnrollments(projectId, { automationId: automation.id, limit: 1000 }).then((data) => {
      if (!alive) return;
      if (data === null) toast.error("Couldn't load enrollments.");
      setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, automation.id, refreshKey, reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((e) => {
      if (filter === "running" && !RUNNING.has(e.status)) return false;
      if (filter !== "all" && filter !== "running" && e.status !== filter) return false;
      if (q && !`${e.contact?.name || ""} ${e.contact?.email || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, query]);

  const pager = usePagination(filtered, { resetKey: `${filter}|${query}` });

  const remove = async (e) => {
    const prev = rows;
    setRows((p) => p.map((x) => (x.id === e.id ? { ...x, status: "exited", exitReason: "removed", completedAt: new Date().toISOString() } : x)));
    const res = await exitEnrollment(projectId, automation.id, e.id);
    if (!res.ok) {
      setRows(prev);
      toast.error(res.error || "Couldn't remove the contact.");
      return;
    }
    toast.success(`${e.contact?.name || "Contact"} left the automation.`);
    onChanged?.();
  };

  const filtersActive = query || filter !== "all";

  const columns = [
    {
      key: "contact",
      header: "Contact",
      render: (e) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{e.contact?.name || "Deleted contact"}</span>
          <span className="truncate text-xs text-text-secondary">{e.contact?.email || e.contact?.phone || ""}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (e) => (
        <div className="flex items-center gap-1.5">
          <StatusPill status={e.status} map={ENROLLMENT_STATUS_MAP} />
          {e.converted ? <Badge variant="success">Converted</Badge> : null}
          {e.test ? <Badge variant="outline">Test</Badge> : null}
        </div>
      ),
    },
    {
      key: "step",
      header: "Current step",
      render: (e) => {
        if (!RUNNING.has(e.status)) return <span className="text-sm text-text-secondary">{e.exitReason ? e.exitReason.replace(/_/g, " ") : "Finished"}</span>;
        const node = getNode(graph, e.currentNodeId);
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-foreground">{stepLabel(graph, e.currentNodeId)}</span>
            {node && node.type !== "trigger" ? <span className="truncate text-xs text-text-secondary">{summarizeNode(node)}</span> : null}
          </div>
        );
      },
    },
    { key: "entered", header: "Entered", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (e) => formatRelative(e.enteredAt) },
    {
      key: "next",
      header: "Next / finished",
      className: "whitespace-nowrap tabular-nums text-muted-foreground",
      render: (e) => (RUNNING.has(e.status) ? formatRelative(e.nextRunAt) : formatRelative(e.completedAt)),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (e) =>
        canEdit && RUNNING.has(e.status) ? (
          <ActionMenu label={`Actions for ${e.contact?.name || "contact"}`} items={[{ label: "Remove from automation", icon: LogOut, destructive: true, onSelect: () => remove(e) }]} />
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <EditorSectionHeader
        title="Enrolled contacts"
        description="Everyone who has entered this automation and the step they're on."
        action={
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setReload((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />
      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={filter} onValueChange={setFilter} options={ENROLLMENT_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search contacts…" />
      </Toolbar>
      {loading ? (
        <Loading />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(e) => e.id}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Users}
                  title={filtersActive ? "No matches" : "No one has entered yet"}
                  description={
                    filtersActive
                      ? "Try a different search or filter."
                      : automation.status === "active"
                        ? "Contacts appear here as soon as the trigger fires for them."
                        : "Publish to start enrolling contacts, or test with one now."
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => { setQuery(""); setFilter("all"); }}>
                        Clear filters
                      </Button>
                    ) : canEdit ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={onTest}>
                        <FlaskConical className="h-4 w-4" /> Test with a contact
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="contacts" />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- activity

export function ActivityPanel({ projectId, automation, graph, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    listStepLogs(projectId, { automationId: automation.id, limit: 500 }).then((data) => {
      if (!alive) return;
      if (data === null) toast.error("Couldn't load activity.");
      setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, automation.id, refreshKey, reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((l) => {
      if (filter !== "all" && l.status !== filter) return false;
      if (q && !`${l.contact?.name || ""} ${l.contact?.email || ""} ${l.action} ${stepLabel(graph, l.nodeId)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, query, graph]);

  const pager = usePagination(filtered, { resetKey: `${filter}|${query}` });
  const filtersActive = query || filter !== "all";

  const columns = [
    { key: "when", header: "When", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (l) => formatDateTime(l.createdAt) },
    {
      key: "contact",
      header: "Contact",
      render: (l) => <span className="truncate text-sm text-foreground">{l.contact?.name || "Deleted contact"}</span>,
    },
    { key: "step", header: "Step", className: "text-sm text-foreground", render: (l) => stepLabel(graph, l.nodeId) },
    {
      key: "action",
      header: "What happened",
      render: (l) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-sm text-foreground">{actionLabel(l.action)}</span>
          {detailText(l.detail) ? <span className="max-w-xs truncate text-xs text-text-secondary">{detailText(l.detail)}</span> : null}
        </div>
      ),
    },
    { key: "status", header: "Status", render: (l) => <StatusPill status={l.status} map={LOG_STATUS_MAP} /> },
  ];

  return (
    <div className="space-y-5">
      <EditorSectionHeader
        title="Step log"
        description="Every step contacts have run in this automation, newest first."
        action={
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setReload((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />
      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={filter} onValueChange={setFilter} options={LOG_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search activity…" />
      </Toolbar>
      {loading ? (
        <Loading />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(l) => l.id}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={History}
                  title={filtersActive ? "No matches" : "No activity yet"}
                  description={filtersActive ? "Try a different search or filter." : "Every step a contact runs — sends, waits, branches — is logged here."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => { setQuery(""); setFilter("all"); }}>
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="steps" />
        </>
      )}
    </div>
  );
}
