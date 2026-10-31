"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { pagedSelect } from "@/lib/crm/paging";

// Data layer for campaign.crm_activities — calls, meetings, notes and emails people log, plus the deal
// history the deals trigger writes (kind stage_change / system, details in metadata). Pure: console.error
// on failure and return null / false / [] — never throw, never toast.

const TABLE = "crm_activities";
const bag = (v) => (v && typeof v === "object" ? v : {});
const KINDS = ["note", "call", "meeting", "email", "stage_change", "system"];
const RELATED = ["contact", "company", "deal"];

export function normalizeActivity(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    kind: KINDS.includes(row.kind) ? row.kind : "note",
    subject: row.subject ?? "",
    body: row.body ?? "",
    relatedType: RELATED.includes(row.related_type) ? row.related_type : null,
    relatedId: row.related_id ?? null,
    contactId: row.contact_id ?? null,
    actorId: row.actor_id ?? null,
    occurredAt: row.occurred_at ?? row.created_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function activityToRow(input) {
  const row = {};
  if ("kind" in input) row.kind = KINDS.includes(input.kind) ? input.kind : "note";
  if ("subject" in input) row.subject = String(input.subject || "").trim();
  if ("body" in input) row.body = String(input.body || "").trim();
  if ("relatedType" in input || "relatedId" in input) {
    const type = RELATED.includes(input.relatedType) ? input.relatedType : null;
    row.related_type = type && input.relatedId ? type : null;
    row.related_id = type && input.relatedId ? input.relatedId : null;
  }
  if ("contactId" in input) row.contact_id = input.contactId || null;
  if ("actorId" in input) row.actor_id = input.actorId || null;
  if ("occurredAt" in input) row.occurred_at = input.occurredAt || new Date().toISOString();
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { relatedType, relatedId, relatedIds, contactId, kinds, since, limit }.
export async function listActivities(projectId, filters = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const { relatedType, relatedId, relatedIds, contactId, kinds, since, limit = 1000 } = filters;
  try {
    const build = () => {
      let query = schemaClient()
        .from(TABLE)
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false });
      if (relatedType) query = query.eq("related_type", relatedType);
      if (relatedId) query = query.eq("related_id", relatedId);
      if (Array.isArray(relatedIds) && relatedIds.length) query = query.in("related_id", relatedIds);
      if (contactId) query = query.eq("contact_id", contactId);
      if (Array.isArray(kinds) && kinds.length) query = query.in("kind", kinds);
      if (since) query = query.gte("occurred_at", since);
      return query;
    };
    const { data, error } = await pagedSelect(build, limit);
    if (error) {
      console.error("[crm_activities.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeActivity);
  } catch (e) {
    console.error("[crm_activities.list]", e);
    return null;
  }
}

export async function createActivity(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      kind: "note",
      subject: "",
      body: "",
      related_type: null,
      related_id: null,
      contact_id: null,
      occurred_at: new Date().toISOString(),
      ...activityToRow(input),
      project_id: projectId,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[crm_activities.create]", error.message);
      return null;
    }
    return normalizeActivity(data);
  } catch (e) {
    console.error("[crm_activities.create]", e);
    return null;
  }
}

export async function updateActivity(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(activityToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[crm_activities.update]", error.message);
      return null;
    }
    return normalizeActivity(data);
  } catch (e) {
    console.error("[crm_activities.update]", e);
    return null;
  }
}

export async function softDeleteActivity(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[crm_activities.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[crm_activities.delete]", e);
    return false;
  }
}
