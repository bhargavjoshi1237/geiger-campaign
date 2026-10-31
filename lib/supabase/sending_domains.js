"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.sending_domains — domains registered with the sending provider, their
// expected/found DNS records and the last authentication analysis. DNS checks run server-side
// (POST /api/projects/:projectId/deliverability/domains/:id/verify); this file owns plain CRUD.
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "sending_domains";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeSendingDomain(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    domain: row.domain ?? "",
    provider: row.provider ?? "resend",
    region: row.region ?? "us-east-1",
    status: row.status ?? "pending",
    records: Array.isArray(row.records) ? row.records : [],
    auth: bag(row.auth),
    settings: bag(row.settings),
    lastCheckedAt: row.last_checked_at ?? null,
    verifiedAt: row.verified_at ?? null,
    blocklistCheckedAt: row.blocklist_checked_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function sendingDomainToRow(input) {
  const row = {};
  const map = { provider: "provider", region: "region", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("domain" in input) row.domain = String(input.domain || "").trim().toLowerCase();
  if ("records" in input) row.records = Array.isArray(input.records) ? input.records : [];
  if ("auth" in input) row.auth = bag(input.auth);
  if ("settings" in input) row.settings = bag(input.settings);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  if ("lastCheckedAt" in input) row.last_checked_at = input.lastCheckedAt || null;
  if ("verifiedAt" in input) row.verified_at = input.verifiedAt || null;
  return row;
}

export async function listSendingDomains(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[sending_domains.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSendingDomain);
  } catch (e) {
    console.error("[sending_domains.list]", e);
    return null;
  }
}

export async function getSendingDomain(projectId, id) {
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
      console.error("[sending_domains.get]", error.message);
      return null;
    }
    return normalizeSendingDomain(data);
  } catch (e) {
    console.error("[sending_domains.get]", e);
    return null;
  }
}

export async function createSendingDomain(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...sendingDomainToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[sending_domains.create]", error.message);
      return null;
    }
    return normalizeSendingDomain(data);
  } catch (e) {
    console.error("[sending_domains.create]", e);
    return null;
  }
}

export async function updateSendingDomain(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(sendingDomainToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[sending_domains.update]", error.message);
      return null;
    }
    return normalizeSendingDomain(data);
  } catch (e) {
    console.error("[sending_domains.update]", e);
    return null;
  }
}

export async function softDeleteSendingDomain(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[sending_domains.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[sending_domains.delete]", e);
    return false;
  }
}
