"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.recommendation_rules — how a product block picks products (strategy +
// filters + count). The products themselves are computed from orders and views by
// lib/commerce/recommendations.js. Pure: console.error and null / false / [].

const TABLE = "recommendation_rules";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export const DEFAULT_RULE_FILTERS = {
  days: 30,
  categories: [],
  minPrice: null,
  maxPrice: null,
  inStockOnly: true,
  excludePurchased: true,
};

export function normalizeRecommendationRule(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    storeId: row.store_id ?? null,
    name: row.name ?? "Untitled rule",
    strategy: row.strategy ?? "bestsellers",
    filters: { ...DEFAULT_RULE_FILTERS, ...bag(row.filters) },
    limit: Number(row.item_limit ?? 4),
    placement: row.placement ?? "campaign_email",
    status: row.status ?? "active",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function recommendationRuleToRow(input) {
  const row = {};
  if ("storeId" in input) row.store_id = input.storeId || null;
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled rule";
  if ("strategy" in input) row.strategy = input.strategy || "bestsellers";
  if ("filters" in input) row.filters = bag(input.filters);
  if ("limit" in input) row.item_limit = Math.min(12, Math.max(1, Math.trunc(Number(input.limit) || 4)));
  if ("placement" in input) row.placement = input.placement || "campaign_email";
  if ("status" in input) row.status = input.status === "paused" ? "paused" : "active";
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listRecommendationRules(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[recommendation_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeRecommendationRule);
  } catch (e) {
    console.error("[recommendation_rules.list]", e);
    return null;
  }
}

export async function getRecommendationRule(projectId, id) {
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
      console.error("[recommendation_rules.get]", error.message);
      return null;
    }
    return normalizeRecommendationRule(data);
  } catch (e) {
    console.error("[recommendation_rules.get]", e);
    return null;
  }
}

export async function createRecommendationRule(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      status: "active",
      filters: DEFAULT_RULE_FILTERS,
      ...recommendationRuleToRow(input),
      project_id: projectId,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[recommendation_rules.create]", error.message);
      return null;
    }
    return normalizeRecommendationRule(data);
  } catch (e) {
    console.error("[recommendation_rules.create]", e);
    return null;
  }
}

export async function updateRecommendationRule(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(recommendationRuleToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[recommendation_rules.update]", error.message);
      return null;
    }
    return normalizeRecommendationRule(data);
  } catch (e) {
    console.error("[recommendation_rules.update]", e);
    return null;
  }
}

export async function softDeleteRecommendationRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[recommendation_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[recommendation_rules.delete]", e);
    return false;
  }
}
