"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeDefinition } from "@/lib/reporting/query";
import { normalizeSchedule } from "@/lib/reporting/schedule";

// Data layer for campaign.reports — saved report definitions (metric × dimension × filters × range × chart)
// with an optional email schedule that the report worker (lib/reporting/worker.js) delivers. Run history
// lives in metadata.runs. Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "reports";
const bag = (v) => (v && typeof v === "object" ? v : {});
const MAX_RUNS = 10;

export function normalizeReport(row) {
  if (!row) return null;
  const meta = bag(row.metadata);
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled report",
    description: row.description ?? "",
    definition: normalizeDefinition(bag(row.definition)),
    schedule: normalizeSchedule(bag(row.schedule)),
    lastRunAt: row.last_run_at ?? null,
    runs: Array.isArray(meta.runs) ? meta.runs : [],
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

export function reportToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled report";
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("definition" in input) row.definition = normalizeDefinition(bag(input.definition));
  if ("schedule" in input) row.schedule = normalizeSchedule(bag(input.schedule));
  if ("lastRunAt" in input) row.last_run_at = input.lastRunAt || null;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listReports(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[reports.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeReport);
  } catch (e) {
    console.error("[reports.list]", e);
    return null;
  }
}

export async function getReport(projectId, id) {
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
      console.error("[reports.get]", error.message);
      return null;
    }
    return normalizeReport(data);
  } catch (e) {
    console.error("[reports.get]", e);
    return null;
  }
}

export async function createReport(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...reportToRow({ definition: {}, schedule: {}, ...input }), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[reports.create]", error.message);
      return null;
    }
    return normalizeReport(data);
  } catch (e) {
    console.error("[reports.create]", e);
    return null;
  }
}

export async function updateReport(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(reportToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[reports.update]", error.message);
      return null;
    }
    return normalizeReport(data);
  } catch (e) {
    console.error("[reports.update]", e);
    return null;
  }
}

// Records a manual run: stamps last_run_at and prepends { at, trigger, rows, value } to metadata.runs.
export async function recordReportRun(report, run) {
  if (!report?.id || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const at = run.at || new Date().toISOString();
    const runs = [{ trigger: "manual", ...run, at }, ...(report.runs || [])].slice(0, MAX_RUNS);
    const merged = await sb.rpc("merge_meta", { p_table: TABLE, p_id: report.id, p_patch: { runs } });
    if (merged.error) {
      console.error("[reports.run]", merged.error.message);
      return null;
    }
    return await updateReport(report.id, { lastRunAt: at });
  } catch (e) {
    console.error("[reports.run]", e);
    return null;
  }
}

export async function softDeleteReport(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[reports.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[reports.delete]", e);
    return false;
  }
}
