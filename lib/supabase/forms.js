"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { formToRow, normalizeForm, normalizeSubmission } from "@/lib/acquisition/models";

// Data layer for campaign.forms (+ read-only campaign.form_submissions, written by the public submit
// route). The only place the workspace talks to these tables. Pure: null / false / [] on failure.

const TABLE = "forms";

export { normalizeForm, formToRow, normalizeSubmission };

export async function listForms(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[forms.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeForm);
  } catch (e) {
    console.error("[forms.list]", e);
    return null;
  }
}

export async function getForm(projectId, id) {
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
      console.error("[forms.get]", error.message);
      return null;
    }
    return normalizeForm(data);
  } catch (e) {
    console.error("[forms.get]", e);
    return null;
  }
}

export async function createForm(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...formToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[forms.create]", error.message);
      return null;
    }
    return normalizeForm(data);
  } catch (e) {
    console.error("[forms.create]", e);
    return null;
  }
}

export async function updateForm(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(formToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[forms.update]", error.message);
      return null;
    }
    return normalizeForm(data);
  } catch (e) {
    console.error("[forms.update]", e);
    return null;
  }
}

export async function softDeleteForm(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[forms.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[forms.delete]", e);
    return false;
  }
}

// Submissions, newest first. Filters: { formId, since, limit }.
export async function listFormSubmissions(projectId, { formId, since, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from("form_submissions")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (formId) query = query.eq("form_id", formId);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[forms.submissions]", error.message);
      return null;
    }
    return (data || []).map(normalizeSubmission);
  } catch (e) {
    console.error("[forms.submissions]", e);
    return null;
  }
}

// Audience lists a form can subscribe people to, as { id, name, doubleOptIn } (read-only lookup).
export async function listAudienceLists(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("lists")
      .select("id, name, double_opt_in")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) {
      console.error("[forms.lists]", error.message);
      return null;
    }
    return (data || []).map((l) => ({ id: l.id, name: l.name || "Untitled list", doubleOptIn: Boolean(l.double_opt_in) }));
  } catch (e) {
    console.error("[forms.lists]", e);
    return null;
  }
}
