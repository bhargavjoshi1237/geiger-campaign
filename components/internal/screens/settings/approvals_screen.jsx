"use client";

import React, { useState } from "react";
import { ShieldCheck, Check, X, Eye, Users } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_TONE = {
  Pending: "amber",
  Approved: "green",
  Rejected: "red",
};

const APPROVERS = ["Jordan Vance", "Priya Nair", "Marcus Holt"];

const INITIAL_REQUESTS = [
  { id: 1, campaign: "Summer Sale — Final Call", requestedBy: "Marcus Holt", recipients: 48200, requested: "Jun 6, 2026", status: "Pending" },
  { id: 2, campaign: "Product Update v4.2", requestedBy: "Elena Sokolova", recipients: 12640, requested: "Jun 5, 2026", status: "Pending" },
  { id: 3, campaign: "Weekly Digest #214", requestedBy: "Elena Sokolova", recipients: 38200, requested: "Jun 4, 2026", status: "Approved" },
  { id: 4, campaign: "Win-back Lapsed Customers", requestedBy: "Marcus Holt", recipients: 9100, requested: "Jun 3, 2026", status: "Rejected" },
  { id: 5, campaign: "Beta Invite — Power Users", requestedBy: "Priya Nair", recipients: 2300, requested: "Jun 2, 2026", status: "Approved" },
];

export function ApprovalsScreen() {
  const [requireApproval, setRequireApproval] = useState(true);
  const [threshold, setThreshold] = useState("all");
  const [requests, setRequests] = useState(INITIAL_REQUESTS);

  const setStatus = (id, status) => setRequests((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Approvals"
        description="Require sign-off before campaigns go out."
      />

      <div className="space-y-4 border-t border-surface-active pt-4">
        {/* Config */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Approval policy</h2>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Require approval for sends</p>
              <p className="text-xs text-text-secondary">Campaigns must be approved before they can be scheduled.</p>
            </div>
            <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
          </div>

          <Field label="Approval threshold" hint="Which campaigns need an approver's sign-off.">
            <Select value={threshold} onValueChange={setThreshold}>
              <SelectTrigger className="sm:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                <SelectItem value="10k">Over 10k recipients</SelectItem>
                <SelectItem value="50k">Over 50k recipients</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-card px-4 py-3">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Approvers</p>
              <p className="text-xs text-text-secondary">{APPROVERS.join(", ")}</p>
            </div>
          </div>
        </div>

        {/* Pending requests */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Pending requests</h2>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                  <TableHead>Campaign</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id} className="border-border">
                    <TableCell className="font-medium text-foreground">{r.campaign}</TableCell>
                    <TableCell className="text-muted-foreground">{r.requestedBy}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.recipients.toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.requested}</TableCell>
                    <TableCell><Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill></TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        items={[
                          { label: "Approve", icon: Check, onSelect: () => setStatus(r.id, "Approved") },
                          { label: "Reject", icon: X, danger: true, onSelect: () => setStatus(r.id, "Rejected") },
                          { label: "View campaign", icon: Eye, separatorBefore: true },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {requests.length === 0 && (
                  <TableRow className="border-border hover:bg-transparent">
                    <TableCell colSpan={6} className="py-14 text-center text-sm text-text-secondary">No approval requests found.</TableCell>
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

export default ApprovalsScreen;
