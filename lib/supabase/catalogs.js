"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { sanitizeFields } from "@/lib/data/fields";

// Data layer for campaign.catalogs and campaign.catalog_items (products, content, events… keyed by an
// external id such as a SKU). item_count is kept by a DB trigger. Pure: null / false / [] on failure.

const CATALOGS = "catalogs";
const ITEMS = "catalog_items";
const IMPORT_CHUNK = 500;

export function normalizeCatalog(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    key: row.key ?? "",
    name: row.name ?? "Untitled catalog",
    description: row.description ?? "",
    kind: row.kind ?? "products",
    fields: Array.isArray(row.fields) ? row.fields : [],
    source: row.source ?? "manual",
    itemCount: Number(row.item_count ?? 0),
    lastImportedAt: row.last_imported_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function catalogToRow(input) {
  const row = {};
  const map = { key: "key", kind: "kind", source: "source", createdBy: "created_by", lastImportedAt: "last_imported_at" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled catalog";
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("fields" in input) row.fields = sanitizeFields(input.fields);
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export function normalizeCatalogItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    catalogId: row.catalog_id ?? null,
    externalId: row.external_id ?? "",
    data: row.data && typeof row.data === "object" ? row.data : {},
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function listCatalogs(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(CATALOGS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[catalogs.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCatalog);
  } catch (e) {
    console.error("[catalogs.list]", e);
    return null;
  }
}

export async function createCatalog(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...catalogToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(CATALOGS).insert(payload).select("*").single();
    if (error) {
      console.error("[catalogs.create]", error.message);
      return null;
    }
    return normalizeCatalog(data);
  } catch (e) {
    console.error("[catalogs.create]", e);
    return null;
  }
}

export async function updateCatalog(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().from(CATALOGS).update(catalogToRow(patch)).eq("id", id).is("deleted_at", null).select("*").single();
    if (error) {
      console.error("[catalogs.update]", error.message);
      return null;
    }
    return normalizeCatalog(data);
  } catch (e) {
    console.error("[catalogs.update]", e);
    return null;
  }
}

export async function softDeleteCatalog(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(CATALOGS).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[catalogs.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[catalogs.delete]", e);
    return false;
  }
}

export async function listCatalogItems(projectId, catalogId, { limit = 1000 } = {}) {
  if (!projectId || !catalogId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(ITEMS)
      .select("*")
      .eq("project_id", projectId)
      .eq("catalog_id", catalogId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[catalogs.listItems]", error.message);
      return null;
    }
    return (data || []).map(normalizeCatalogItem);
  } catch (e) {
    console.error("[catalogs.listItems]", e);
    return null;
  }
}

// Insert or update one item by external id.
export async function saveCatalogItem(projectId, catalogId, { id, externalId, data }) {
  if (!projectId || !catalogId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const row = { external_id: String(externalId || "").trim(), data: data || {} };
    const query = id
      ? sb.from(ITEMS).update(row).eq("id", id).is("deleted_at", null)
      : sb.from(ITEMS).upsert({ ...row, project_id: projectId, catalog_id: catalogId, deleted_at: null }, { onConflict: "catalog_id,external_id" });
    const { data: saved, error } = await query.select("*").single();
    if (error) {
      console.error("[catalogs.saveItem]", error.message);
      return null;
    }
    return normalizeCatalogItem(saved);
  } catch (e) {
    console.error("[catalogs.saveItem]", e);
    return null;
  }
}

export async function softDeleteCatalogItem(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(ITEMS).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[catalogs.deleteItem]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[catalogs.deleteItem]", e);
    return false;
  }
}

// CSV import: upserts on (catalog_id, external_id) in chunks. rows = [{ externalId, data }].
export async function importCatalogItems(projectId, catalogId, rows, { createdBy = null } = {}) {
  if (!projectId || !catalogId || !isSupabaseConfigured()) return null;
  let imported = 0;
  let failed = 0;
  const sb = schemaClient();
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK).map((r) => ({
      project_id: projectId,
      catalog_id: catalogId,
      external_id: String(r.externalId),
      data: r.data || {},
      created_by: createdBy,
      deleted_at: null,
    }));
    try {
      const { error } = await sb.from(ITEMS).upsert(chunk, { onConflict: "catalog_id,external_id" });
      if (error) {
        console.error("[catalogs.import]", error.message);
        failed += chunk.length;
      } else {
        imported += chunk.length;
      }
    } catch (e) {
      console.error("[catalogs.import]", e);
      failed += chunk.length;
    }
  }
  if (imported) await sb.from(CATALOGS).update({ source: "csv", last_imported_at: new Date().toISOString() }).eq("id", catalogId);
  return { imported, failed };
}
