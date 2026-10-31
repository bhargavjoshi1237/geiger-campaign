"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.email_validations — the latest validation result per address. Validation runs
// server-side (POST /api/projects/:projectId/deliverability/validations[/contacts]); the browser reads
// results and can delete them. Pure: console.error on failure and return null / false / [].

const TABLE = "email_validations";

export function normalizeEmailValidation(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    email: row.email ?? "",
    domain: row.domain ?? "",
    result: row.result ?? "unknown",
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
    suggestion: row.suggestion ?? null,
    mx: Array.isArray(row.mx) ? row.mx : [],
    checkedAt: row.checked_at ?? null,
    contactId: row.contact_id ?? null,
    source: row.source ?? "manual",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function listEmailValidations(projectId, { result, limit = 5000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("checked_at", { ascending: false })
      .limit(limit);
    if (result) query = query.eq("result", result);
    const { data, error } = await query;
    if (error) {
      console.error("[email_validations.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeEmailValidation);
  } catch (e) {
    console.error("[email_validations.list]", e);
    return null;
  }
}

export async function softDeleteEmailValidation(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[email_validations.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email_validations.delete]", e);
    return false;
  }
}
