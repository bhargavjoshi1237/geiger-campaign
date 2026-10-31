"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeLayout } from "@/lib/reporting/query";
import { DEFAULT_RANGE, isRangeKey } from "@/lib/reporting/ranges";

// Data layer for campaign.dashboards — saved widget layouts over the reporting engine (lib/reporting/query.js).
// Private dashboards (shared = false) are visible only to their creator (RLS). Pure: console.error on failure
// and return null / false / [] — never throw, never toast.

const TABLE = "dashboards";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function normalizeDashboard(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled dashboard",
    description: row.description ?? "",
    layout: normalizeLayout(row.layout),
    range: isRangeKey(row.range) ? row.range : DEFAULT_RANGE,
    isDefault: Boolean(row.is_default),
    shared: row.shared !== false,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

export function dashboardToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled dashboard";
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("layout" in input) row.layout = normalizeLayout(input.layout);
  if ("range" in input) row.range = isRangeKey(input.range) ? input.range : DEFAULT_RANGE;
  if ("isDefault" in input) row.is_default = Boolean(input.isDefault);
  if ("shared" in input) row.shared = input.shared !== false;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listDashboards(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[dashboards.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDashboard);
  } catch (e) {
    console.error("[dashboards.list]", e);
    return null;
  }
}

export async function getDashboard(projectId, id) {
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
      console.error("[dashboards.get]", error.message);
      return null;
    }
    return normalizeDashboard(data);
  } catch (e) {
    console.error("[dashboards.get]", e);
    return null;
  }
}

export async function createDashboard(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...dashboardToRow({ layout: [], ...input }), project_id: projectId, is_default: false };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[dashboards.create]", error.message);
      return null;
    }
    return normalizeDashboard(data);
  } catch (e) {
    console.error("[dashboards.create]", e);
    return null;
  }
}

export async function updateDashboard(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(dashboardToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[dashboards.update]", error.message);
      return null;
    }
    return normalizeDashboard(data);
  } catch (e) {
    console.error("[dashboards.update]", e);
    return null;
  }
}

// One default per project (partial unique index): clear the current one, then mark the new one.
export async function setDefaultDashboard(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const cleared = await sb
      .from(TABLE)
      .update({ is_default: false })
      .eq("project_id", projectId)
      .eq("is_default", true)
      .neq("id", id);
    if (cleared.error) {
      console.error("[dashboards.setDefault]", cleared.error.message);
      return false;
    }
    const { error } = await sb.from(TABLE).update({ is_default: true, shared: true }).eq("id", id).is("deleted_at", null);
    if (error) {
      console.error("[dashboards.setDefault]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[dashboards.setDefault]", e);
    return false;
  }
}

export async function softDeleteDashboard(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), is_default: false })
      .eq("id", id);
    if (error) {
      console.error("[dashboards.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[dashboards.delete]", e);
    return false;
  }
}
