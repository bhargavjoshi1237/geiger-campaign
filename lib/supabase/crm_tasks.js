"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { pagedSelect } from "@/lib/crm/paging";

// Data layer for campaign.crm_tasks — follow-ups tied to a deal, company or contact (related_type/related_id).
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "crm_tasks";
const bag = (v) => (v && typeof v === "object" ? v : {});
const RELATED = ["contact", "company", "deal"];

export function normalizeTask(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    title: row.title ?? "Untitled task",
    notes: row.notes ?? "",
    dueAt: row.due_at ?? null,
    assigneeId: row.assignee_id ?? null,
    relatedType: RELATED.includes(row.related_type) ? row.related_type : null,
    relatedId: row.related_id ?? null,
    status: row.status === "done" ? "done" : "open",
    priority: ["low", "medium", "high"].includes(row.priority) ? row.priority : "medium",
    completedAt: row.completed_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// camelCase patch -> snake_case columns; a column is emitted only when its key is present. Completing a
// task stamps completed_at here too (the table trigger does the same server-side).
export function taskToRow(input) {
  const row = {};
  if ("title" in input) row.title = String(input.title || "").trim() || "Untitled task";
  if ("notes" in input) row.notes = String(input.notes || "").trim();
  if ("dueAt" in input) row.due_at = input.dueAt || null;
  if ("assigneeId" in input) row.assignee_id = input.assigneeId || null;
  if ("relatedType" in input || "relatedId" in input) {
    const type = RELATED.includes(input.relatedType) ? input.relatedType : null;
    row.related_type = type && input.relatedId ? type : null;
    row.related_id = type && input.relatedId ? input.relatedId : null;
  }
  if ("status" in input) {
    row.status = input.status === "done" ? "done" : "open";
    row.completed_at = row.status === "done" ? input.completedAt || new Date().toISOString() : null;
  }
  if ("priority" in input) row.priority = ["low", "medium", "high"].includes(input.priority) ? input.priority : "medium";
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { relatedType, relatedId, assigneeId, status, limit }.
export async function listTasks(projectId, filters = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const { relatedType, relatedId, assigneeId, status, limit = 5000 } = filters;
  try {
    const build = () => {
      let query = schemaClient()
        .from(TABLE)
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (relatedType) query = query.eq("related_type", relatedType);
      if (relatedId) query = query.eq("related_id", relatedId);
      if (assigneeId) query = query.eq("assignee_id", assigneeId);
      if (status) query = query.eq("status", status);
      return query;
    };
    const { data, error } = await pagedSelect(build, limit);
    if (error) {
      console.error("[crm_tasks.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeTask);
  } catch (e) {
    console.error("[crm_tasks.list]", e);
    return null;
  }
}

export async function createTask(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      title: "Untitled task",
      notes: "",
      status: "open",
      priority: "medium",
      related_type: null,
      related_id: null,
      completed_at: null,
      ...taskToRow(input),
      project_id: projectId,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[crm_tasks.create]", error.message);
      return null;
    }
    return normalizeTask(data);
  } catch (e) {
    console.error("[crm_tasks.create]", e);
    return null;
  }
}

export async function updateTask(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(taskToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[crm_tasks.update]", error.message);
      return null;
    }
    return normalizeTask(data);
  } catch (e) {
    console.error("[crm_tasks.update]", e);
    return null;
  }
}

export async function softDeleteTask(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[crm_tasks.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[crm_tasks.delete]", e);
    return false;
  }
}
