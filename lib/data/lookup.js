// Personalization lookups over custom objects and catalogs (pure, no DB). Accepts raw snake_case rows or
// the camelCase view models, so merge tags (server) and previews (client) share one implementation.
//
//   const ctx = buildDataContext({ objectTypes, records, catalogs, catalogItems });
//   lookupPath(ctx, "objects.subscription.plan")         // one-to-one object -> field
//   lookupPath(ctx, "objects.booking.0.reference")       // one-to-many -> index -> field
//   lookupPath(ctx, "catalogs.products.SKU-4821.price")  // catalog item by external id

const pick = (row, snake, camel) => row?.[snake] ?? row?.[camel];

function isLive(row) {
  return !pick(row, "deleted_at", "deletedAt");
}

// Records belonging to one contact, newest first.
export function recordsForContact(records, contactId, typeId = null) {
  return (records || [])
    .filter((r) => isLive(r) && pick(r, "contact_id", "contactId") === contactId && (!typeId || pick(r, "type_id", "typeId") === typeId))
    .sort((a, b) => String(pick(b, "created_at", "createdAt") || "").localeCompare(String(pick(a, "created_at", "createdAt") || "")));
}

export function findCatalogItem(items, externalId, catalogId = null) {
  return (
    (items || []).find(
      (i) => isLive(i) && String(pick(i, "external_id", "externalId")) === String(externalId) && (!catalogId || pick(i, "catalog_id", "catalogId") === catalogId),
    ) || null
  );
}

// { objects: { <typeKey>: data | [data] }, catalogs: { <catalogKey>: { <externalId>: data } } }
export function buildDataContext({ objectTypes = [], records = [], catalogs = [], catalogItems = [] } = {}) {
  const objects = {};
  for (const type of objectTypes) {
    if (!isLive(type)) continue;
    const typeRecords = records.filter((r) => isLive(r) && pick(r, "type_id", "typeId") === type.id);
    const datas = typeRecords.map((r) => ({ ...(r.data || {}), _id: r.id, _external_id: pick(r, "external_id", "externalId") ?? null }));
    objects[type.key] = type.relationship === "one" ? datas[0] ?? null : datas;
  }
  const catalogMap = {};
  for (const catalog of catalogs) {
    if (!isLive(catalog)) continue;
    const entries = {};
    for (const item of catalogItems) {
      if (!isLive(item) || pick(item, "catalog_id", "catalogId") !== catalog.id) continue;
      entries[pick(item, "external_id", "externalId")] = { ...(item.data || {}), _external_id: pick(item, "external_id", "externalId") };
    }
    catalogMap[catalog.key] = entries;
  }
  return { objects, catalogs: catalogMap };
}

// Dot path into the context; numeric segments index arrays. Missing -> undefined.
export function lookupPath(context, path) {
  if (!context || !path) return undefined;
  let value = context;
  for (const segment of String(path).split(".")) {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value) && /^\d+$/.test(segment)) value = value[Number(segment)];
    else value = value[segment];
  }
  return value;
}

// Every lookup path a schema offers, for merge-tag pickers: [{ path, label }].
export function availablePaths({ objectTypes = [], catalogs = [] } = {}) {
  const paths = [];
  for (const type of objectTypes) {
    if (!isLive(type)) continue;
    const base = type.relationship === "one" ? `objects.${type.key}` : `objects.${type.key}.0`;
    for (const field of type.fields || []) paths.push({ path: `${base}.${field.key}`, label: `${type.name} · ${field.label}` });
  }
  for (const catalog of catalogs) {
    if (!isLive(catalog)) continue;
    for (const field of catalog.fields || []) paths.push({ path: `catalogs.${catalog.key}.<id>.${field.key}`, label: `${catalog.name} · ${field.label}` });
  }
  return paths;
}
