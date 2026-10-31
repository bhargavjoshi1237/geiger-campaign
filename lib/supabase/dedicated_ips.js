"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.dedicated_ips — provider-assigned sending IPs recorded so their reverse DNS,
// blocklist status and warm-up plan can be tracked. Live checks run server-side
// (POST /api/projects/:projectId/deliverability/ips/:id/check). Pure: null / false / [] on failure.

const TABLE = "dedicated_ips";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeDedicatedIp(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    ip: row.ip ?? "",
    pool: row.pool ?? "default",
    provider: row.provider ?? "resend",
    status: row.status ?? "warming",
    expectedRdns: row.expected_rdns ?? "",
    reverseDns: row.reverse_dns ?? "",
    rdnsStatus: row.rdns_status ?? "pending",
    rdnsCheckedAt: row.rdns_checked_at ?? null,
    blocklistCheckedAt: row.blocklist_checked_at ?? null,
    warmupPlanId: row.warmup_plan_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function dedicatedIpToRow(input) {
  const row = {};
  const map = { pool: "pool", provider: "provider", status: "status", warmupPlanId: "warmup_plan_id", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("ip" in input) row.ip = String(input.ip || "").trim().toLowerCase();
  if ("expectedRdns" in input) row.expected_rdns = String(input.expectedRdns || "").trim().toLowerCase() || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listDedicatedIps(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[dedicated_ips.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDedicatedIp);
  } catch (e) {
    console.error("[dedicated_ips.list]", e);
    return null;
  }
}

export async function getDedicatedIp(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[dedicated_ips.get]", error.message);
      return null;
    }
    return normalizeDedicatedIp(data);
  } catch (e) {
    console.error("[dedicated_ips.get]", e);
    return null;
  }
}

export async function createDedicatedIp(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...dedicatedIpToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[dedicated_ips.create]", error.message);
      return null;
    }
    return normalizeDedicatedIp(data);
  } catch (e) {
    console.error("[dedicated_ips.create]", e);
    return null;
  }
}

export async function updateDedicatedIp(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(dedicatedIpToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[dedicated_ips.update]", error.message);
      return null;
    }
    return normalizeDedicatedIp(data);
  } catch (e) {
    console.error("[dedicated_ips.update]", e);
    return null;
  }
}

export async function softDeleteDedicatedIp(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[dedicated_ips.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[dedicated_ips.delete]", e);
    return false;
  }
}
