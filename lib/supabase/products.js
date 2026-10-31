"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.products — the catalogue synced from connected stores (or added by hand),
// used by product blocks and recommendation rules. Pure: console.error and null / false / [].

const TABLE = "products";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const num = (v) => (v == null || v === "" ? null : Number(v));

export function normalizeProduct(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    storeId: row.store_id ?? null,
    externalId: row.external_id ?? null,
    title: row.title ?? "Untitled product",
    handle: row.handle ?? "",
    sku: row.sku ?? "",
    price: Number(row.price ?? 0),
    compareAtPrice: num(row.compare_at_price),
    currency: row.currency ?? "USD",
    imageUrl: row.image_url ?? "",
    url: row.url ?? "",
    inventory: num(row.inventory),
    categories: Array.isArray(row.categories) ? row.categories : [],
    status: row.status ?? "active",
    publishedAt: row.published_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function productToRow(input) {
  const row = {};
  if ("storeId" in input) row.store_id = input.storeId || null;
  if ("title" in input) row.title = String(input.title || "").trim() || "Untitled product";
  if ("handle" in input) row.handle = String(input.handle || "").trim();
  if ("sku" in input) row.sku = String(input.sku || "").trim().toUpperCase();
  if ("price" in input) row.price = Math.max(0, Number(input.price) || 0);
  if ("compareAtPrice" in input) row.compare_at_price = num(input.compareAtPrice);
  if ("currency" in input) row.currency = String(input.currency || "USD").toUpperCase();
  if ("imageUrl" in input) row.image_url = String(input.imageUrl || "").trim() || null;
  if ("url" in input) row.url = String(input.url || "").trim() || null;
  if ("inventory" in input) row.inventory = input.inventory == null || input.inventory === "" ? null : Math.trunc(Number(input.inventory) || 0);
  if ("categories" in input) {
    row.categories = (Array.isArray(input.categories) ? input.categories : [])
      .map((c) => String(c).trim())
      .filter(Boolean);
  }
  if ("status" in input) row.status = input.status || "active";
  if ("publishedAt" in input) row.published_at = input.publishedAt || null;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listProducts(projectId, { storeId, status, limit = 1000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (storeId) query = query.eq("store_id", storeId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[products.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeProduct);
  } catch (e) {
    console.error("[products.list]", e);
    return null;
  }
}

// Row count only (no rows transferred); null on failure.
export async function countProducts(projectId, { storeId, status } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    if (storeId) query = query.eq("store_id", storeId);
    if (status) query = query.eq("status", status);
    const { count, error } = await query;
    if (error) {
      console.error("[products.count]", error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[products.count]", e);
    return null;
  }
}

export async function getProduct(projectId, id) {
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
      console.error("[products.get]", error.message);
      return null;
    }
    return normalizeProduct(data);
  } catch (e) {
    console.error("[products.get]", e);
    return null;
  }
}

export async function createProduct(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { status: "draft", categories: [], ...productToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[products.create]", error.message);
      return null;
    }
    return normalizeProduct(data);
  } catch (e) {
    console.error("[products.create]", e);
    return null;
  }
}

export async function updateProduct(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(productToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[products.update]", error.message);
      return null;
    }
    return normalizeProduct(data);
  } catch (e) {
    console.error("[products.update]", e);
    return null;
  }
}

export async function softDeleteProduct(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[products.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[products.delete]", e);
    return false;
  }
}
