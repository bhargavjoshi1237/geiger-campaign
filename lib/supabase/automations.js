"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import {
  automationToRow,
  normalizeAutomation,
  normalizeEnrollment,
  normalizeStepLog,
} from "@/lib/automations/model";

export { automationToRow, normalizeAutomation, normalizeEnrollment, normalizeStepLog };

// Data layer for campaign.automations (workflows + journeys) and the read-only run tables the engine
// writes (automation_enrollments, automation_step_logs, automation_cursors). Pure: console.error on
// failure and return null / false / [] — never throw, never toast. Mapping lives in lib/automations/model.js.

const TABLE = "automations";
const CONTACT_REF = "contact:contact_id(id, email, phone, first_name, last_name, status)";

export async function listAutomations(projectId, { kind } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (kind) query = query.eq("kind", kind);
    const { data, error } = await query;
    if (error) {
      console.error("[automations.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAutomation);
  } catch (e) {
    console.error("[automations.list]", e);
    return null;
  }
}

export async function getAutomation(projectId, id) {
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
      console.error("[automations.get]", error.message);
      return null;
    }
    return normalizeAutomation(data);
  } catch (e) {
    console.error("[automations.get]", e);
    return null;
  }
}

export async function createAutomation(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...automationToRow({ status: "draft", ...input }), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[automations.create]", error.message);
      return null;
    }
    return normalizeAutomation(data);
  } catch (e) {
    console.error("[automations.create]", e);
    return null;
  }
}

export async function updateAutomation(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(automationToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[automations.update]", error.message);
      return null;
    }
    return normalizeAutomation(data);
  } catch (e) {
    console.error("[automations.update]", e);
    return null;
  }
}

// Shallow-merges into the metadata bag (recipe key, editor prefs) without touching other keys.
export async function updateAutomationMeta(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("merge_meta", { p_table: TABLE, p_id: id, p_patch: patch || {} });
    if (error) {
      console.error("[automations.updateMeta]", error.message);
      return null;
    }
    return data ?? {};
  } catch (e) {
    console.error("[automations.updateMeta]", e);
    return null;
  }
}

export async function softDeleteAutomation(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[automations.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[automations.delete]", e);
    return false;
  }
}

// Filters: { automationId, contactId, status (string | string[]), limit }.
export async function listEnrollments(projectId, { automationId, contactId, status, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from("automation_enrollments")
      .select(`*, ${CONTACT_REF}`)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("entered_at", { ascending: false })
      .limit(limit);
    if (automationId) query = query.eq("automation_id", automationId);
    if (contactId) query = query.eq("contact_id", contactId);
    if (Array.isArray(status) && status.length) query = query.in("status", status);
    else if (typeof status === "string" && status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[automations.listEnrollments]", error.message);
      return null;
    }
    return (data || []).map(normalizeEnrollment);
  } catch (e) {
    console.error("[automations.listEnrollments]", e);
    return null;
  }
}

// Filters: { automationId, enrollmentId, status, since, limit }.
export async function listStepLogs(projectId, { automationId, enrollmentId, status, since, limit = 300 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from("automation_step_logs")
      .select(`*, ${CONTACT_REF}`)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (automationId) query = query.eq("automation_id", automationId);
    if (enrollmentId) query = query.eq("enrollment_id", enrollmentId);
    if (status) query = query.eq("status", status);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[automations.listStepLogs]", error.message);
      return null;
    }
    return (data || []).map(normalizeStepLog);
  } catch (e) {
    console.error("[automations.listStepLogs]", e);
    return null;
  }
}

// Recent enrollments across every automation, for trigger activity (id, automation, when, what enrolled them).
export async function listRecentEnrollments(projectId, { since, limit = 1000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from("automation_enrollments")
      .select("id, automation_id, contact_id, status, trigger_key, entered_at, context")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("entered_at", { ascending: false })
      .limit(limit);
    if (since) query = query.gte("entered_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[automations.listRecentEnrollments]", error.message);
      return null;
    }
    return (data || []).map(normalizeEnrollment);
  } catch (e) {
    console.error("[automations.listRecentEnrollments]", e);
    return null;
  }
}

// The worker's trigger cursor for the project (null when the worker hasn't run yet).
export async function getAutomationCursor(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("automation_cursors")
      .select("project_id, last_event_at, last_scan_at, updated_at")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) {
      console.error("[automations.getCursor]", error.message);
      return null;
    }
    return data ? { lastEventAt: data.last_event_at ?? null, lastScanAt: data.last_scan_at ?? null, updatedAt: data.updated_at ?? null } : null;
  } catch (e) {
    console.error("[automations.getCursor]", e);
    return null;
  }
}

// Lists for pickers (list trigger, list membership step). Read-only: lists are owned by the Audience area.
export async function listListOptions(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("lists")
      .select("id, name")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) {
      console.error("[automations.listListOptions]", error.message);
      return null;
    }
    return (data || []).map((l) => ({ id: l.id, name: l.name || "Untitled list" }));
  } catch (e) {
    console.error("[automations.listListOptions]", e);
    return null;
  }
}
