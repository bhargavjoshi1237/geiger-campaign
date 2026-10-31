"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Eye, Users, Gauge, Trash2, Pencil, FileText, ClipboardCheck } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ScreenHeader,
  SectionCard,
  SettingsList,
  SettingRow,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  StatsBar,
  StatusPill,
  Badge,
  ActionMenu,
  Field,
  cn,
} from "@geiger/ui";

const STATUS_MAP = {
  Pending: { label: "Pending", variant: "warning" },
  Approved: { label: "Approved", variant: "success" },
  Rejected: { label: "Rejected", variant: "danger" },
};

// History entries reuse the status pill; "Submitted" is the neutral first step.
const HISTORY_MAP = {
  Submitted: { label: "Submitted", variant: "neutral" },
  ...STATUS_MAP,
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.keys(STATUS_MAP).map((s) => ({ value: s, label: s })),
];

const APPROVERS = ["Maya Chen", "Priya Nair", "Sofia Rossi"];

const CHANNEL_TONE = { Email: "info", SMS: "purple", WhatsApp: "success" };

const INITIAL_REQUESTS = [
  {
    id: 1, campaign: "Summer Sale — Final Call", requestedBy: "Sofia Rossi", recipients: 48200, requested: "Jun 6, 2026", status: "Pending",
    channel: "Email", audience: "Engaged shoppers (90 days)", sendTime: "Jun 8, 2026, 9:00 AM", approver: "Maya Chen",
    note: "Last push before the sale closes. Discount code is already live in Shopify.",
    decisionNote: "", reviewer: null, decidedAt: null,
    history: [{ id: "h1", action: "Submitted", actor: "Sofia Rossi", at: "Jun 6, 2026, 4:12 PM", note: "" }],
  },
  {
    id: 2, campaign: "Product Update v4.2", requestedBy: "Ava Johnson", recipients: 12640, requested: "Jun 5, 2026", status: "Pending",
    channel: "Email", audience: "Active customers", sendTime: "Jun 9, 2026, 10:30 AM", approver: "Priya Nair",
    note: "Release notes are final; legal signed off on the pricing paragraph.",
    decisionNote: "", reviewer: null, decidedAt: null,
    history: [{ id: "h1", action: "Submitted", actor: "Ava Johnson", at: "Jun 5, 2026, 11:40 AM", note: "" }],
  },
  {
    id: 3, campaign: "Weekly Digest #214", requestedBy: "Ava Johnson", recipients: 38200, requested: "Jun 4, 2026", status: "Approved",
    channel: "Email", audience: "Newsletter subscribers", sendTime: "Jun 5, 2026, 8:00 AM", approver: "Maya Chen",
    note: "Standard weekly digest.",
    decisionNote: "Looks good — ship it.", reviewer: "Maya Chen", decidedAt: "Jun 4, 2026, 2:05 PM",
    history: [
      { id: "h1", action: "Submitted", actor: "Ava Johnson", at: "Jun 4, 2026, 9:18 AM", note: "" },
      { id: "h2", action: "Approved", actor: "Maya Chen", at: "Jun 4, 2026, 2:05 PM", note: "Looks good — ship it." },
    ],
  },
  {
    id: 4, campaign: "Win-back Lapsed Customers", requestedBy: "Sofia Rossi", recipients: 9100, requested: "Jun 3, 2026", status: "Rejected",
    channel: "SMS", audience: "Lapsed customers (180+ days)", sendTime: "Jun 4, 2026, 6:00 PM", approver: "Priya Nair",
    note: "20% off to win back anyone who hasn't ordered in six months.",
    decisionNote: "Several contacts never opted in to SMS — rerun against the consented list.", reviewer: "Priya Nair", decidedAt: "Jun 3, 2026, 5:47 PM",
    history: [
      { id: "h1", action: "Submitted", actor: "Sofia Rossi", at: "Jun 3, 2026, 1:02 PM", note: "" },
      { id: "h2", action: "Rejected", actor: "Priya Nair", at: "Jun 3, 2026, 5:47 PM", note: "Several contacts never opted in to SMS — rerun against the consented list." },
    ],
  },
  {
    id: 5, campaign: "Beta Invite — Power Users", requestedBy: "Priya Nair", recipients: 2300, requested: "Jun 2, 2026", status: "Approved",
    channel: "WhatsApp", audience: "Power users", sendTime: "Jun 3, 2026, 11:00 AM", approver: "Sofia Rossi",
    note: "Invite-only beta; template already approved by Meta.",
    decisionNote: "", reviewer: "Sofia Rossi", decidedAt: "Jun 2, 2026, 3:30 PM",
    history: [
      { id: "h1", action: "Submitted", actor: "Priya Nair", at: "Jun 2, 2026, 10:21 AM", note: "" },
      { id: "h2", action: "Approved", actor: "Sofia Rossi", at: "Jun 2, 2026, 3:30 PM", note: "" },
    ],
  },
];

const REQUEST_NAV = [
  { key: "request", label: "Request", icon: FileText, desc: "What's being sent, to whom, and when." },
  { key: "review", label: "Review", icon: ClipboardCheck, desc: "Who signs off, their decision note, and the decision history." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const stamp = () =>
  new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Applies a decision to a request: status, reviewer, time, note and a history entry.
const decide = (r, status, reviewer, note) => {
  const at = stamp();
  return {
    ...r,
    status,
    reviewer,
    decidedAt: at,
    approver: reviewer,
    decisionNote: note,
    history: [...r.history, { id: crypto.randomUUID(), action: status, actor: reviewer, at, note }],
  };
};

const ReadOut = ({ children, className }) => (
  <span className={cn("text-sm text-foreground", className)}>{children}</span>
);

// Editable slice of a request; compared against the row to derive dirty state.
const toDraft = (r) => ({ approver: r.approver, decisionNote: r.decisionNote });

function RequestEditor({ record, onBack, onSave, onDecide, onDelete, onViewCampaign }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const pending = record.status === "Pending";

  const save = () => {
    const patch = { ...draft, decisionNote: draft.decisionNote.trim() };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

  const decideWith = (status) => {
    const note = draft.decisionNote.trim();
    onDecide(record, status, draft.approver, note);
    setDraft({ approver: draft.approver, decisionNote: note });
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={record.campaign}
      status={record.status}
      statusMap={STATUS_MAP}
      badges={
        <>
          <Badge variant={CHANNEL_TONE[record.channel]}>{record.channel}</Badge>
          <span className="text-xs text-text-tertiary">{record.recipients.toLocaleString("en-US")} recipients</span>
        </>
      }
      meta={`Requested by ${record.requestedBy} · submitted ${record.requested}`}
      actions={
        pending ? (
          <>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
              Save
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => decideWith("Rejected")}>
              <X className="h-4 w-4" /> Reject
            </Button>
            <Button onClick={() => decideWith("Approved")}>
              <Check className="h-4 w-4" /> Approve
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete request" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
              Save
            </Button>
          </>
        )
      }
      nav={REQUEST_NAV}
      defaultSection="request"
    >
      {({ active }) => (
        <>
          {active === "request" ? (
            <div className="space-y-6">
              <SectionCard bare title="Send details" description="The campaign waiting on sign-off, who it goes to and when.">
                <SettingsList>
                  <SettingRow
                    title="Campaign"
                    description="The campaign waiting on sign-off."
                    control={
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-surface-hover hover:text-foreground" onClick={onViewCampaign}>
                        {record.campaign} <Eye className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                  <SettingRow title="Channel" description="How the campaign is delivered." control={<Badge variant={CHANNEL_TONE[record.channel]}>{record.channel}</Badge>} />
                  <SettingRow title="Audience" description="Who receives it." control={<ReadOut>{record.audience}</ReadOut>} />
                  <SettingRow title="Recipients" description="Contacts in the audience at submission." control={<ReadOut className="tabular-nums">{record.recipients.toLocaleString("en-US")}</ReadOut>} />
                  <SettingRow title="Send time" description="When it goes out once approved." control={<ReadOut className="text-muted-foreground">{record.sendTime}</ReadOut>} />
                </SettingsList>
              </SectionCard>

              <SectionCard title="Requester's note" description={`From ${record.requestedBy}.`}>
                <p className="text-sm text-text-secondary">{record.note || "No note was added."}</p>
              </SectionCard>
            </div>
          ) : null}

          {active === "review" ? (
            <div className="space-y-6">
              <SectionCard bare title="Sign-off" description="Who approves this request and the note that goes with the decision.">
                <div className="grid gap-4">
                  {!pending ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-card px-4 py-3 text-sm text-text-secondary">
                      <StatusPill status={record.status} map={STATUS_MAP} />
                      <span>
                        by <span className="font-medium text-foreground">{record.reviewer}</span> · {record.decidedAt}
                      </span>
                    </div>
                  ) : null}
                  <Field label="Approver" hint={pending ? "The teammate expected to sign this off." : "Who signed this request off."}>
                    <Select value={draft.approver} onValueChange={set("approver")} disabled={!pending}>
                      <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                      <SelectContent>{APPROVERS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Decision note" htmlFor="ap-note" hint="Shared with the requester alongside the decision.">
                    <Textarea
                      id="ap-note"
                      value={draft.decisionNote}
                      onChange={(e) => set("decisionNote")(e.target.value)}
                      placeholder="e.g. Approved — double-check the footer link before sending."
                      className="min-h-24"
                    />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard title="Decision history" description="Every step this request has been through.">
                <ol className="space-y-3">
                  {[...record.history].reverse().map((h) => (
                    <li key={h.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-card px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <StatusPill status={h.action} map={HISTORY_MAP} />
                        <span className="font-medium text-foreground">{h.actor}</span>
                        <span className="text-xs text-text-tertiary">{h.at}</span>
                      </div>
                      {h.note ? <p className="text-sm text-text-secondary">{h.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function ApprovalsScreen() {
  const [requireApproval, setRequireApproval] = useState(true);
  const [threshold, setThreshold] = useState("all");
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { setTab, recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !`${r.campaign} ${r.requestedBy}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [requests, query, statusFilter]);

  const stats = useMemo(() => {
    const count = (s) => requests.filter((r) => r.status === s).length;
    const awaiting = requests.filter((r) => r.status === "Pending").reduce((n, r) => n + r.recipients, 0);
    return [
      { label: "Pending", value: count("Pending").toLocaleString("en-US") },
      { label: "Approved", value: count("Approved").toLocaleString("en-US") },
      { label: "Rejected", value: count("Rejected").toLocaleString("en-US") },
      { label: "Recipients awaiting sign-off", value: awaiting.toLocaleString("en-US") },
    ];
  }, [requests]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}` });

  const handleDecide = (r, status, reviewer = r.approver || APPROVERS[0], note = "") => {
    setRequests((p) => p.map((x) => (x.id === r.id ? decide(x, status, reviewer, note) : x)));
    toast.success(`${status} "${r.campaign}".`);
  };

  const handleSave = (id, patch) => {
    setRequests((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    toast.success("Review saved.");
  };

  const handleDelete = (r) => {
    setDeleteTarget(null);
    setRequests((p) => p.filter((x) => x.id !== r.id));
    if (String(r.id) === recordId) closeRecord();
    toast.success(`Deleted the request for "${r.campaign}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete request</DialogTitle>
          <DialogDescription>
            Delete the approval request for <span className="font-medium text-foreground">{deleteTarget?.campaign}</span>? The campaign itself stays in your workspace. This can&apos;t be undone.
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

  const open = requests.find((r) => String(r.id) === recordId);
  if (open) {
    return (
      <>
        <RequestEditor
          key={open.id}
          record={open}
          onBack={closeRecord}
          onSave={handleSave}
          onDecide={handleDecide}
          onDelete={setDeleteTarget}
          onViewCampaign={() => setTab("All Campaigns")}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all";

  const columns = [
    {
      key: "campaign",
      header: "Campaign",
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{r.campaign}</span>
          <span className="truncate text-xs text-text-secondary">{r.channel} · {r.audience}</span>
        </div>
      ),
    },
    { key: "requestedBy", header: "Requested by", className: "text-muted-foreground" },
    {
      key: "recipients",
      header: "Recipients",
      align: "right",
      className: "tabular-nums text-muted-foreground",
      render: (r) => r.recipients.toLocaleString("en-US"),
    },
    { key: "requested", header: "Requested", className: "whitespace-nowrap text-muted-foreground" },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <ActionMenu
          label={`Actions for ${r.campaign}`}
          items={[
            { label: "Review request", icon: Pencil, onSelect: () => openRecord(String(r.id)) },
            r.status !== "Approved" && { label: "Approve", icon: Check, onSelect: () => handleDecide(r, "Approved") },
            r.status !== "Rejected" && { label: "Reject", icon: X, onSelect: () => handleDecide(r, "Rejected") },
            { separator: true },
            { label: "View campaign", icon: Eye, onSelect: () => setTab("All Campaigns") },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(r) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Approvals"
        description="Require sign-off before campaigns go out."
      />

      <StatsBar stats={stats} columns={4} />

      <div className="space-y-4">
        <SectionCard title="Approval policy">
          <SettingsList>
            <SettingRow
              icon={ShieldCheck}
              title="Require approval for sends"
              description="Campaigns must be approved before they can be scheduled."
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
            />
            <SettingRow
              icon={Gauge}
              title="Approval threshold"
              description="Which campaigns need an approver's sign-off."
              control={
                <Select value={threshold} onValueChange={setThreshold}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All campaigns</SelectItem>
                    <SelectItem value="10k">Over 10k recipients</SelectItem>
                    <SelectItem value="50k">Over 50k recipients</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
            <SettingRow
              icon={Users}
              title="Approvers"
              description={APPROVERS.join(", ")}
              control={null}
            />
          </SettingsList>
        </SectionCard>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Approval requests</h2>

          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search campaign or requester…" />
          </Toolbar>

          <div className="space-y-5">
            <DataTable
              columns={columns}
              data={pager.pageItems}
              getRowKey={(r) => r.id}
              onRowClick={(r) => openRecord(String(r.id))}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle">
                  <EmptyState
                    icon={ShieldCheck}
                    title={filtersActive ? "No matches" : "No approval requests yet"}
                    description={filtersActive ? "Try a different search or filter." : "Campaigns submitted for sign-off will appear here."}
                    action={
                      filtersActive ? (
                        <Button
                          variant="outline"
                          className={OUTLINE_BUTTON}
                          onClick={() => {
                            setQuery("");
                            setStatusFilter("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : null
                    }
                  />
                </div>
              }
            />
            <ListPagination {...pager} itemLabel="requests" />
          </div>
        </div>
      </div>

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ApprovalsScreen;
