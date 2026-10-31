"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { pagedSelect } from "@/lib/crm/paging";

// Data layer for campaign.deals. Pure: console.error on failure and return null / false / [] — never throw,
// never toast. Stage moves are plain updates (the deals trigger writes the history into crm_activities);
// won/lost goes through the close route (lib/crm/api.js) so the deal.won webhook fires.

const TABLE = "deals";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function normalizeDeal(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    pipelineId: row.pipeline_id ?? null,
    stageId: row.stage_id ?? "",
    name: row.name ?? "Untitled deal",
    value: Number(row.value ?? 0),
    currency: row.currency ?? "USD",
    contactId: row.contact_id ?? null,
    companyId: row.company_id ?? null,
    ownerId: row.owner_id ?? null,
    expectedCloseDate: row.expected_close_date ? String(row.expected_close_date).slice(0, 10) : "",
    status: row.status ?? "open",
    lostReason: row.lost_reason ?? "",
    wonAt: row.won_at ?? null,
    lostAt: row.lost_at ?? null,
    sourceCampaignId: row.source_campaign_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// camelCase patch -> snake_case columns; a column is emitted only when its key is present.
export function dealToRow(input) {
  const row = {};
  const ids = {
    pipelineId: "pipeline_id",
    contactId: "contact_id",
    companyId: "company_id",
    ownerId: "owner_id",
    sourceCampaignId: "source_campaign_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(ids)) if (key in input) row[col] = input[key] || null;
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled deal";
  if ("stageId" in input) row.stage_id = String(input.stageId || "");
  if ("value" in input) row.value = Math.max(0, Number(input.value) || 0);
  if ("currency" in input) row.currency = String(input.currency || "USD").toUpperCase();
  if ("expectedCloseDate" in input) row.expected_close_date = input.expectedCloseDate || null;
  if ("status" in input) row.status = ["open", "won", "lost"].includes(input.status) ? input.status : "open";
  if ("lostReason" in input) row.lost_reason = String(input.lostReason || "").trim();
  if ("wonAt" in input) row.won_at = input.wonAt || null;
  if ("lostAt" in input) row.lost_at = input.lostAt || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { pipelineId, companyId, contactId, status, limit }.
export async function listDeals(projectId, filters = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const { pipelineId, companyId, contactId, status, limit = 5000 } = filters;
  try {
    const build = () => {
      let query = schemaClient()
        .from(TABLE)
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (pipelineId) query = query.eq("pipeline_id", pipelineId);
      if (companyId) query = query.eq("company_id", companyId);
      if (contactId) query = query.eq("contact_id", contactId);
      if (status) query = query.eq("status", status);
      return query;
    };
    const { data, error } = await pagedSelect(build, limit);
    if (error) {
      console.error("[deals.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDeal);
  } catch (e) {
    console.error("[deals.list]", e);
    return null;
  }
}

export async function getDeal(projectId, id) {
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
      console.error("[deals.get]", error.message);
      return null;
    }
    return normalizeDeal(data);
  } catch (e) {
    console.error("[deals.get]", e);
    return null;
  }
}

export async function createDeal(projectId, input) {
  if (!projectId || !input?.pipelineId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      name: "Untitled deal",
      stage_id: "",
      value: 0,
      currency: "USD",
      status: "open",
      lost_reason: "",
      ...dealToRow(input),
      project_id: projectId,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[deals.create]", error.message);
      return null;
    }
    return normalizeDeal(data);
  } catch (e) {
    console.error("[deals.create]", e);
    return null;
  }
}

export async function updateDeal(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(dealToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[deals.update]", error.message);
      return null;
    }
    return normalizeDeal(data);
  } catch (e) {
    console.error("[deals.update]", e);
    return null;
  }
}

// Re-homes every deal of one pipeline (before that pipeline is deleted) into another pipeline's stage.
export async function moveDealsToPipeline(projectId, fromPipelineId, toPipelineId, stageId) {
  if (!projectId || !fromPipelineId || !toPipelineId || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ pipeline_id: toPipelineId, stage_id: stageId || "" })
      .eq("project_id", projectId)
      .eq("pipeline_id", fromPipelineId)
      .is("deleted_at", null);
    if (error) {
      console.error("[deals.movePipeline]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[deals.movePipeline]", e);
    return false;
  }
}

export async function softDeleteDeal(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[deals.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[deals.delete]", e);
    return false;
  }
}
