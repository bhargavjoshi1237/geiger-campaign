"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { scheduleMs } from "@/lib/data/sync_catalog";

// Data layer for campaign.warehouse_syncs and campaign.warehouse_sync_runs (run history, server-written).
// Creating a sync (webhook syncs get a signing secret), rotating, running and exporting go through
// /api/projects/:id/data/syncs. Pure: null / false / [] on failure, never throws or toasts.

const SYNCS = "warehouse_syncs";
const RUNS = "warehouse_sync_runs";

export function normalizeWarehouseSync(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled sync",
    destination: row.destination ?? "webhook",
    source: row.source ?? "contacts",
    config: row.config && typeof row.config === "object" ? row.config : {},
    schedule: row.schedule ?? "manual",
    status: row.status === "paused" ? "paused" : "active",
    cursor: row.sync_cursor ?? null,
    rowsSynced: Number(row.rows_synced ?? 0),
    secretHint: row.secret_hint ?? "",
    lastRunAt: row.last_run_at ?? null,
    lastStatus: row.last_status ?? null,
    lastError: row.last_error ?? null,
    nextRunAt: row.next_run_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function warehouseSyncToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled sync";
  if ("source" in input) row.source = input.source;
  if ("config" in input) row.config = input.config && typeof input.config === "object" ? input.config : {};
  if ("status" in input) row.status = input.status === "paused" ? "paused" : "active";
  if ("schedule" in input) row.schedule = input.schedule || "manual";
  if ("cursor" in input) row.sync_cursor = input.cursor || null;
  if ("nextRunAt" in input) row.next_run_at = input.nextRunAt || null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export function normalizeSyncRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    syncId: row.sync_id ?? null,
    trigger: row.trigger ?? "manual",
    status: row.status ?? "running",
    rowCount: Number(row.row_count ?? 0),
    batchCount: Number(row.batch_count ?? 0),
    cursorFrom: row.cursor_from ?? null,
    cursorTo: row.cursor_to ?? null,
    error: row.error ?? null,
    startedAt: row.started_at ?? row.created_at ?? null,
    finishedAt: row.finished_at ?? null,
  };
}

export async function listWarehouseSyncs(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(SYNCS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[warehouse_syncs.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeWarehouseSync);
  } catch (e) {
    console.error("[warehouse_syncs.list]", e);
    return null;
  }
}

// A schedule change (or resume) also books the next run so the worker picks it up.
export async function updateWarehouseSync(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const row = warehouseSyncToRow(patch);
    if ("schedule" in patch || "status" in patch) {
      const schedule = patch.schedule;
      if (schedule !== undefined) row.next_run_at = scheduleMs(schedule) ? new Date().toISOString() : null;
      if (patch.status === "active" && schedule === undefined) row.next_run_at = new Date().toISOString();
    }
    const { data, error } = await schemaClient().from(SYNCS).update(row).eq("id", id).is("deleted_at", null).select("*").single();
    if (error) {
      console.error("[warehouse_syncs.update]", error.message);
      return null;
    }
    return normalizeWarehouseSync(data);
  } catch (e) {
    console.error("[warehouse_syncs.update]", e);
    return null;
  }
}

export async function softDeleteWarehouseSync(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(SYNCS).update({ deleted_at: new Date().toISOString(), status: "paused" }).eq("id", id);
    if (error) {
      console.error("[warehouse_syncs.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[warehouse_syncs.delete]", e);
    return false;
  }
}

// Filters: { syncId, since, limit }.
export async function listSyncRuns(projectId, { syncId, since, limit = 200 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient().from(RUNS).select("*").eq("project_id", projectId).order("started_at", { ascending: false }).limit(limit);
    if (syncId) query = query.eq("sync_id", syncId);
    if (since) query = query.gte("started_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[warehouse_syncs.runs]", error.message);
      return null;
    }
    return (data || []).map(normalizeSyncRun);
  } catch (e) {
    console.error("[warehouse_syncs.runs]", e);
    return null;
  }
}
