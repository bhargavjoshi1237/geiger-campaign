"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.approval_policies (one per project) and campaign.approval_requests (one per
// "submit for review"). The only place that talks to these tables. Pure: console.error on failure and
// return null / false / [] — never throw, never toast. Decision logic lives in lib/campaigns/approval_rules.js.

const POLICIES = "approval_policies";
const REQUESTS = "approval_requests";
const bag = (v) => (v && typeof v === "object" ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeApprovalPolicy(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    required: !!row.required,
    approverRoles: list(row.approver_roles),
    approverIds: list(row.approver_ids),
    minApprovals: Number(row.min_approvals ?? 1) || 1,
    channels: list(row.channels),
    allowSelfApproval: !!row.allow_self_approval,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function approvalPolicyToRow(input) {
  const row = {};
  if ("required" in input) row.required = !!input.required;
  if ("approverRoles" in input) row.approver_roles = list(input.approverRoles);
  if ("approverIds" in input) row.approver_ids = list(input.approverIds);
  if ("minApprovals" in input) row.min_approvals = Math.min(5, Math.max(1, Number(input.minApprovals) || 1));
  if ("channels" in input) row.channels = list(input.channels);
  if ("allowSelfApproval" in input) row.allow_self_approval = !!input.allowSelfApproval;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeApprovalRequest(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    campaignId: row.campaign_id ?? null,
    status: row.status ?? "pending",
    requestedBy: row.requested_by ?? null,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ?? null,
    note: row.note ?? "",
    decisionNote: row.decision_note ?? "",
    decisions: list(row.decisions),
    fingerprint: row.fingerprint ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function approvalRequestToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    campaignId: "campaign_id",
    status: "status",
    requestedBy: "requested_by",
    decidedBy: "decided_by",
    decidedAt: "decided_at",
    fingerprint: "fingerprint",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("note" in input) row.note = String(input.note || "");
  if ("decisionNote" in input) row.decision_note = String(input.decisionNote || "");
  if ("decisions" in input) row.decisions = list(input.decisions);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// The project's policy; null when none is saved yet (or the read failed).
export async function getApprovalPolicy(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(POLICIES)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[approvals.getPolicy]", error.message);
      return null;
    }
    return normalizeApprovalPolicy(data);
  } catch (e) {
    console.error("[approvals.getPolicy]", e);
    return null;
  }
}

// Creates or updates the project's single policy row.
export async function saveApprovalPolicy(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...approvalPolicyToRow(input), project_id: projectId, deleted_at: null };
    const { data, error } = await schemaClient()
      .from(POLICIES)
      .upsert(payload, { onConflict: "project_id" })
      .select("*")
      .single();
    if (error) {
      console.error("[approvals.savePolicy]", error.message);
      return null;
    }
    return normalizeApprovalPolicy(data);
  } catch (e) {
    console.error("[approvals.savePolicy]", e);
    return null;
  }
}

// Filters: { campaignId, status }. Newest first.
export async function listApprovalRequests(projectId, { campaignId, status } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(REQUESTS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[approvals.listRequests]", error.message);
      return null;
    }
    return (data || []).map(normalizeApprovalRequest);
  } catch (e) {
    console.error("[approvals.listRequests]", e);
    return null;
  }
}

export async function createApprovalRequest(projectId, input) {
  if (!projectId || !input?.campaignId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...approvalRequestToRow({ status: "pending", ...input }), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(REQUESTS).insert(payload).select("*").single();
    if (error) {
      console.error("[approvals.createRequest]", error.message);
      return null;
    }
    return normalizeApprovalRequest(data);
  } catch (e) {
    console.error("[approvals.createRequest]", e);
    return null;
  }
}

export async function updateApprovalRequest(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(REQUESTS)
      .update(approvalRequestToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[approvals.updateRequest]", error.message);
      return null;
    }
    return normalizeApprovalRequest(data);
  } catch (e) {
    console.error("[approvals.updateRequest]", e);
    return null;
  }
}

export async function softDeleteApprovalRequest(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(REQUESTS)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[approvals.deleteRequest]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[approvals.deleteRequest]", e);
    return false;
  }
}
