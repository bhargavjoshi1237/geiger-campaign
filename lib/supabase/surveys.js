"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeSurvey, normalizeSurveyResponse, surveyToRow } from "@/lib/acquisition/models";

// Data layer for campaign.surveys (+ read-only campaign.survey_responses, written by the public respond
// route). The only place the workspace talks to these tables. Pure: null / false / [] on failure.

const TABLE = "surveys";

export { normalizeSurvey, surveyToRow, normalizeSurveyResponse };

export async function listSurveys(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[surveys.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSurvey);
  } catch (e) {
    console.error("[surveys.list]", e);
    return null;
  }
}

export async function getSurvey(projectId, id) {
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
      console.error("[surveys.get]", error.message);
      return null;
    }
    return normalizeSurvey(data);
  } catch (e) {
    console.error("[surveys.get]", e);
    return null;
  }
}

export async function createSurvey(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...surveyToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[surveys.create]", error.message);
      return null;
    }
    return normalizeSurvey(data);
  } catch (e) {
    console.error("[surveys.create]", e);
    return null;
  }
}

export async function updateSurvey(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(surveyToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[surveys.update]", error.message);
      return null;
    }
    return normalizeSurvey(data);
  } catch (e) {
    console.error("[surveys.update]", e);
    return null;
  }
}

export async function softDeleteSurvey(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[surveys.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[surveys.delete]", e);
    return false;
  }
}

// Responses, newest first. Filters: { surveyId, limit }.
export async function listSurveyResponses(projectId, { surveyId, limit = 5000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from("survey_responses")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (surveyId) query = query.eq("survey_id", surveyId);
    const { data, error } = await query;
    if (error) {
      console.error("[surveys.responses]", error.message);
      return null;
    }
    return (data || []).map(normalizeSurveyResponse);
  } catch (e) {
    console.error("[surveys.responses]", e);
    return null;
  }
}
