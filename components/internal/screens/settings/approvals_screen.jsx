"use client";

import React, { useState } from "react";
import { ShieldCheck, Check, X, Eye, Users, Gauge } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
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
} from "@geiger/ui";

const STATUS_TONE = {
  Pending: "warning",
  Approved: "success",
  Rejected: "danger",
};

const APPROVERS = ["Maya Chen", "Priya Nair", "Sofia Rossi"];

const INITIAL_REQUESTS = [
  { id: 1, campaign: "Summer Sale — Final Call", requestedBy: "Sofia Rossi", recipients: 48200, requested: "Jun 6, 2026", status: "Pending" },
  { id: 2, campaign: "Product Update v4.2", requestedBy: "Ava Johnson", recipients: 12640, requested: "Jun 5, 2026", status: "Pending" },
  { id: 3, campaign: "Weekly Digest #214", requestedBy: "Ava Johnson", recipients: 38200, requested: "Jun 4, 2026", status: "Approved" },
  { id: 4, campaign: "Win-back Lapsed Customers", requestedBy: "Sofia Rossi", recipients: 9100, requested: "Jun 3, 2026", status: "Rejected" },
  { id: 5, campaign: "Beta Invite — Power Users", requestedBy: "Priya Nair", recipients: 2300, requested: "Jun 2, 2026", status: "Approved" },
];

export function ApprovalsScreen() {
  const [requireApproval, setRequireApproval] = useState(true);
  const [threshold, setThreshold] = useState("all");
  const [requests, setRequests] = useState(INITIAL_REQUESTS);

  const setStatus = (id, status) => setRequests((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));

  const columns = [
    { key: "campaign", header: "Campaign", className: "font-medium text-foreground", render: (r) => r.campaign },
    { key: "requestedBy", header: "Requested by", className: "text-muted-foreground", render: (r) => r.requestedBy },
    {
      key: "recipients",
      header: "Recipients",
      align: "right",
      className: "tabular-nums text-muted-foreground",
      render: (r) => r.recipients.toLocaleString(),
    },
    { key: "requested", header: "Requested", className: "whitespace-nowrap text-muted-foreground", render: (r) => r.requested },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_TONE[r.status]}>{r.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <ActionMenu
          items={[
            { label: "Approve", icon: Check, onSelect: () => setStatus(r.id, "Approved") },
            { label: "Reject", icon: X, destructive: true, onSelect: () => setStatus(r.id, "Rejected") },
            { separator: true },
            { label: "View campaign", icon: Eye },
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
          <h2 className="text-sm font-semibold text-foreground">Pending requests</h2>
          <DataTable
            columns={columns}
            data={requests}
            getRowKey={(r) => r.id}
            empty={
              <EmptyState
                icon={ShieldCheck}
                title="No approval requests found"
                className="rounded-xl border border-border bg-surface-subtle"
              />
            }
          />
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default ApprovalsScreen;
