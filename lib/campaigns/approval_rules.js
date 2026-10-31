// Approval rules (isomorphic, pure): whether a policy covers a campaign, what state its latest review
// request is in, who may decide, and how a decision changes the request. Shared by the editor, the
// Approvals screen and the server gate (lib/campaigns/approvals.js). Accepts snake_case rows or camelCase models.

import { campaignFingerprint } from "./fingerprint";

export const APPROVAL_DECISIONS = ["approved", "rejected", "changes_requested"];

const get = (obj, camel, snake, fallback) => obj?.[camel] ?? obj?.[snake] ?? fallback;

export function policyShape(policy) {
  if (!policy) return { required: false, approverRoles: [], approverIds: [], minApprovals: 1, channels: [], allowSelfApproval: false };
  return {
    required: !!policy.required,
    approverRoles: get(policy, "approverRoles", "approver_roles", []) || [],
    approverIds: get(policy, "approverIds", "approver_ids", []) || [],
    minApprovals: Math.min(5, Math.max(1, Number(get(policy, "minApprovals", "min_approvals", 1)) || 1)),
    channels: get(policy, "channels", "channels", []) || [],
    allowSelfApproval: !!get(policy, "allowSelfApproval", "allow_self_approval", false),
  };
}

export function approvalRequiredFor(policy, campaign) {
  const p = policyShape(policy);
  if (!p.required) return false;
  return !p.channels.length || p.channels.includes(campaign?.channel || "email");
}

function decisionsOf(request) {
  const list = get(request, "decisions", "decisions", []);
  return Array.isArray(list) ? list : [];
}

export function approvalCount(request) {
  const approvers = new Set(decisionsOf(request).filter((d) => d.decision === "approved").map((d) => d.userId));
  return approvers.size;
}

// state: not_required | not_submitted | pending | approved | rejected | changes_requested | stale
export function evaluateApproval({ policy, campaign, request }) {
  const required = approvalRequiredFor(policy, campaign);
  if (!required) return { required: false, approved: true, state: "not_required", request: request || null };
  if (!request) return { required, approved: false, state: "not_submitted", request: null };
  const status = request.status;
  const fingerprint = get(request, "fingerprint", "fingerprint", "");
  const current = campaignFingerprint(campaign);
  if (fingerprint && fingerprint !== current && (status === "approved" || status === "pending")) {
    return { required, approved: false, state: "stale", request };
  }
  if (status === "approved") return { required, approved: true, state: "approved", request };
  if (status === "withdrawn") return { required, approved: false, state: "not_submitted", request };
  return { required, approved: false, state: status || "pending", request };
}

// Whether userId (holding roleKeys) may decide on this request under the policy; the RBAC key
// campaign.approval.decide is checked separately (and by RLS).
export function canDecide({ policy, request, userId, roleKeys = [] }) {
  const p = policyShape(policy);
  if (!request || request.status !== "pending") return { allowed: false, reason: "This request has already been decided." };
  const requester = get(request, "requestedBy", "requested_by", null);
  if (!p.allowSelfApproval && requester && requester === userId) {
    return { allowed: false, reason: "You can't approve a campaign you submitted." };
  }
  if (p.approverIds.length && !p.approverIds.includes(userId)) {
    if (!p.approverRoles.length || !roleKeys.some((k) => p.approverRoles.includes(k))) {
      return { allowed: false, reason: "The approval policy names other approvers." };
    }
  } else if (p.approverRoles.length && !roleKeys.some((k) => p.approverRoles.includes(k))) {
    return { allowed: false, reason: "Your role isn't one of the policy's approver roles." };
  }
  if (decisionsOf(request).some((d) => d.userId === userId && d.decision === "approved")) {
    return { allowed: false, reason: "You've already approved this request." };
  }
  return { allowed: true, reason: null };
}

// The request patch for one decision (camelCase, for lib/supabase/approvals.js).
export function applyDecision(request, { decision, userId, note = "", minApprovals = 1, at = new Date().toISOString() }) {
  const entry = { userId, decision, note: String(note || "").trim(), at };
  const decisions = [...decisionsOf(request), entry];
  let status = "pending";
  if (decision === "rejected") status = "rejected";
  else if (decision === "changes_requested") status = "changes_requested";
  else if (approvalCount({ decisions }) >= Math.max(1, Number(minApprovals) || 1)) status = "approved";
  return {
    status,
    decisions,
    decidedBy: status === "pending" ? get(request, "decidedBy", "decided_by", null) : userId,
    decidedAt: status === "pending" ? get(request, "decidedAt", "decided_at", null) : at,
    decisionNote: entry.note,
  };
}

// The campaign status a request outcome moves the campaign to (null = leave it).
export function campaignStatusAfter(requestStatus) {
  if (requestStatus === "approved") return "approved";
  if (requestStatus === "rejected" || requestStatus === "changes_requested") return "draft";
  return null;
}
