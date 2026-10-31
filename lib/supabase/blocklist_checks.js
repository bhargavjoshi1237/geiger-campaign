"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.blocklist_checks — append-only DNSBL history. Checks run server-side
// (POST /api/projects/:projectId/deliverability/blocklists/check and the daily worker); the browser
// reads history and can drop a one-off target. Pure: null / false / [] on failure.

const TABLE = "blocklist_checks";

export function normalizeBlocklistCheck(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    target: row.target ?? "",
    targetType: row.target_type ?? "ip",
    checkedValue: row.checked_value ?? row.target ?? "",
    list: row.list ?? "",
    listName: row.list_name ?? row.list ?? "",
    status: row.status ?? (row.listed ? "listed" : "clear"),
    listed: Boolean(row.listed),
    detail: row.detail ?? "",
    codes: Array.isArray(row.codes) ? row.codes : [],
    runId: row.run_id ?? null,
    sendingDomainId: row.sending_domain_id ?? null,
    dedicatedIpId: row.dedicated_ip_id ?? null,
    checkedAt: row.checked_at ?? row.created_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

// Filters: { target, since, limit } — newest first.
export async function listBlocklistChecks(projectId, { target, since, limit = 2000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("checked_at", { ascending: false })
      .limit(limit);
    if (target) query = query.eq("target", target);
    if (since) query = query.gte("checked_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[blocklist_checks.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeBlocklistCheck);
  } catch (e) {
    console.error("[blocklist_checks.list]", e);
    return null;
  }
}

// Soft-deletes a target's whole history (used to stop showing a one-off target).
export async function softDeleteBlocklistTarget(projectId, target) {
  if (!projectId || !target || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("target", target)
      .is("deleted_at", null);
    if (error) {
      console.error("[blocklist_checks.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[blocklist_checks.delete]", e);
    return false;
  }
}
