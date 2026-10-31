import { buildDataContext } from "./lookup";

// Server loaders for personalization (any db: admin or user-scoped). Pair with lookupPath() from ./lookup:
//   const ctx = await loadContactDataContext(db, projectId, contactId);
//   lookupPath(ctx, "objects.subscription.plan")

export async function loadContactDataContext(db, projectId, contactId, { catalogKeys = [] } = {}) {
  if (!db || !projectId) return { objects: {}, catalogs: {} };
  const [typesRes, recordsRes, catalogsRes] = await Promise.all([
    db.from("custom_object_types").select("id, key, name, relationship, fields").eq("project_id", projectId).is("deleted_at", null),
    contactId
      ? db.from("custom_object_records").select("id, type_id, contact_id, external_id, data, created_at").eq("project_id", projectId).eq("contact_id", contactId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500)
      : { data: [] },
    catalogKeys.length ? db.from("catalogs").select("id, key, name, fields").eq("project_id", projectId).in("key", catalogKeys).is("deleted_at", null) : { data: [] },
  ]);
  const catalogs = catalogsRes.data || [];
  let catalogItems = [];
  if (catalogs.length) {
    const { data } = await db.from("catalog_items").select("id, catalog_id, external_id, data").in("catalog_id", catalogs.map((c) => c.id)).is("deleted_at", null).limit(5000);
    catalogItems = data || [];
  }
  return buildDataContext({ objectTypes: typesRes.data || [], records: recordsRes.data || [], catalogs, catalogItems });
}

// Specific catalog items by external id: { <externalId>: data }.
export async function loadCatalogItems(db, projectId, catalogKey, externalIds = []) {
  if (!db || !projectId || !catalogKey || !externalIds.length) return {};
  const { data: catalog } = await db.from("catalogs").select("id").eq("project_id", projectId).eq("key", catalogKey).is("deleted_at", null).maybeSingle();
  if (!catalog) return {};
  const { data } = await db.from("catalog_items").select("external_id, data").eq("catalog_id", catalog.id).in("external_id", externalIds.map(String)).is("deleted_at", null);
  return Object.fromEntries((data || []).map((i) => [i.external_id, i.data || {}]));
}
