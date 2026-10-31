"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.lead_forms — Meta Lead Ads instant forms synced from connected pages, with the
// question -> contact field mapping, consent mapping and list/tag routing the leadgen webhook applies.
// Form sync and backfill run server-side (ads routes). Pure: null / false / [].

const TABLE = "lead_forms";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeLeadForm(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    externalFormId: row.external_form_id ?? "",
    pageId: row.fb_page_id ?? "",
    pageName: row.page_name ?? "",
    name: row.name ?? "Untitled form",
    formStatus: row.form_status ?? "ACTIVE",
    locale: row.locale ?? "",
    questions: Array.isArray(row.questions) ? row.questions : [],
    consentCheckboxes: Array.isArray(row.consent_checkboxes) ? row.consent_checkboxes : [],
    mapping: bag(row.mapping),
    consentMapping: Array.isArray(row.consent_mapping) ? row.consent_mapping : [],
    listIds: Array.isArray(row.list_ids) ? row.list_ids : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status ?? "active",
    leadsCount: Number(row.leads_count ?? 0),
    lastLeadAt: row.last_lead_at ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    lastBackfillAt: row.last_backfill_at ?? null,
    lastError: row.last_error ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function leadFormToRow(input) {
  const row = {};
  const map = {
    adAccountId: "ad_account_id",
    externalFormId: "external_form_id",
    pageId: "fb_page_id",
    pageName: "page_name",
    name: "name",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("mapping" in input) row.mapping = bag(input.mapping);
  if ("consentMapping" in input) row.consent_mapping = Array.isArray(input.consentMapping) ? input.consentMapping : [];
  if ("listIds" in input) row.list_ids = Array.isArray(input.listIds) ? input.listIds : [];
  if ("tags" in input) row.tags = Array.isArray(input.tags) ? input.tags : [];
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listLeadForms(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[lead_forms.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeLeadForm);
  } catch (e) {
    console.error("[lead_forms.list]", e);
    return null;
  }
}

export async function updateLeadForm(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(leadFormToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[lead_forms.update]", error.message);
      return null;
    }
    return normalizeLeadForm(data);
  } catch (e) {
    console.error("[lead_forms.update]", e);
    return null;
  }
}

// Removes the form from Campaign only; the instant form on Meta is untouched.
export async function softDeleteLeadForm(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[lead_forms.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[lead_forms.delete]", e);
    return false;
  }
}
