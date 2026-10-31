import { badRequest, notFound } from "@/lib/server/http";
import { normalizeEmail, serializeContact, upsertContact } from "@/lib/data/contacts";
import { validateData } from "@/lib/data/fields";

// Developer API v1 (server-only, admin db scoped by the verified key's project). Responses use a stable
// snake_case public shape, decoupled from the app's view models. Lists page with a created_at cursor.

const MAX_LIMIT = 200;
const MAX_UPSERT = 500;

function pageParams(url) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const cursor = url.searchParams.get("cursor");
  if (cursor && Number.isNaN(Date.parse(cursor))) throw badRequest("cursor must be the next_cursor from a previous page.");
  return { limit, cursor };
}

function page(rows, limit, serialize) {
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serialize);
  return { data, has_more: hasMore, next_cursor: hasMore ? rows[limit - 1].created_at : null };
}

export async function listContactsV1(db, projectId, url) {
  const { limit, cursor } = pageParams(url);
  let query = db.from("contacts").select("*").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit + 1);
  if (cursor) query = query.lt("created_at", cursor);
  const email = url.searchParams.get("email");
  if (email) query = query.eq("email", normalizeEmail(email) || "");
  const status = url.searchParams.get("status");
  if (status) query = query.eq("status", status);
  const since = url.searchParams.get("updated_since");
  if (since && !Number.isNaN(Date.parse(since))) query = query.gte("updated_at", new Date(since).toISOString());
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return page(data || [], limit, serializeContact);
}

export async function upsertContactV1(db, projectId, body) {
  const result = await upsertContact(db, projectId, {
    email: body?.email,
    phone: body?.phone,
    firstName: body?.first_name ?? body?.firstName,
    lastName: body?.last_name ?? body?.lastName,
    status: body?.status,
    tags: body?.tags,
    attributes: body?.attributes,
    timezone: body?.timezone,
    locale: body?.locale,
    source: "api",
    defaultStatus: "subscribed",
  });
  if (result.error) throw badRequest(result.error);
  return { data: serializeContact(result.contact), created: result.created };
}

function serializeCampaign(row) {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    type: row.type,
    status: row.status,
    subject: row.subject,
    preheader: row.preheader,
    from_name: row.from_name,
    from_email: row.from_email,
    tags: row.tags || [],
    metrics: row.metrics || {},
    scheduled_at: row.scheduled_at,
    sent_at: row.sent_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listCampaignsV1(db, projectId, url) {
  const { limit, cursor } = pageParams(url);
  let query = db
    .from("campaigns")
    .select("id, name, channel, type, status, subject, preheader, from_name, from_email, tags, metrics, scheduled_at, sent_at, created_at, updated_at")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (cursor) query = query.lt("created_at", cursor);
  const status = url.searchParams.get("status");
  if (status) query = query.eq("status", status);
  const channel = url.searchParams.get("channel");
  if (channel) query = query.eq("channel", channel);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return page(data || [], limit, serializeCampaign);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Catalog by API name or id.
async function findByKeyOrId(db, table, projectId, ref, label) {
  let query = db.from(table).select("*").eq("project_id", projectId).is("deleted_at", null);
  query = UUID.test(ref) ? query.eq("id", ref) : query.eq("key", ref);
  const { data } = await query.maybeSingle();
  if (!data) throw notFound(`No ${label} called "${ref}".`);
  return data;
}

function itemsFrom(body, key) {
  const list = Array.isArray(body) ? body : Array.isArray(body?.[key]) ? body[key] : null;
  if (!list) throw badRequest(`Send { "${key}": [...] }.`);
  if (list.length > MAX_UPSERT) throw badRequest(`Send at most ${MAX_UPSERT} ${key} per request.`);
  return list;
}

// PUT /api/v1/catalogs/:catalog/items — upsert on external id; data is validated against the catalog schema.
export async function upsertCatalogItemsV1(db, projectId, catalogRef, body) {
  const catalog = await findByKeyOrId(db, "catalogs", projectId, catalogRef, "catalog");
  const errors = [];
  const rows = [];
  itemsFrom(body, "items").forEach((item, index) => {
    const externalId = String(item?.external_id ?? item?.id ?? "").trim();
    if (!externalId) return errors.push({ index, error: "external_id is required." });
    const { data, errors: fieldErrors } = validateData(catalog.fields || [], item?.data ?? item);
    delete data.external_id;
    if (fieldErrors.length) return errors.push({ index, error: fieldErrors.join(" ") });
    rows.push({ project_id: projectId, catalog_id: catalog.id, external_id: externalId.slice(0, 200), data, deleted_at: null });
  });
  if (rows.length) {
    const { error } = await db.from("catalog_items").upsert(rows, { onConflict: "catalog_id,external_id" });
    if (error) throw new Error(error.message);
    await db.from("catalogs").update({ source: "api", last_imported_at: new Date().toISOString() }).eq("id", catalog.id);
  }
  return { upserted: rows.length, errors };
}

// PUT /api/v1/objects/:type/records — upsert on external id, linking a contact by contact_id or email.
export async function upsertObjectRecordsV1(db, projectId, typeRef, body) {
  const type = await findByKeyOrId(db, "custom_object_types", projectId, typeRef, "object");
  const records = itemsFrom(body, "records");
  const emails = [...new Set(records.map((r) => normalizeEmail(r?.email)).filter(Boolean))];
  const ids = [...new Set(records.map((r) => r?.contact_id).filter((id) => UUID.test(id || "")))];
  const contactByEmail = new Map();
  const projectContacts = new Set();
  const [byEmail, byId] = await Promise.all([
    emails.length ? db.from("contacts").select("id, email").eq("project_id", projectId).in("email", emails).is("deleted_at", null) : { data: [] },
    ids.length ? db.from("contacts").select("id").eq("project_id", projectId).in("id", ids).is("deleted_at", null) : { data: [] },
  ]);
  for (const c of byEmail.data || []) contactByEmail.set(c.email, c.id);
  for (const c of byId.data || []) projectContacts.add(c.id);
  const errors = [];
  const rows = [];
  records.forEach((record, index) => {
    const externalId = String(record?.external_id ?? "").trim();
    if (!externalId) return errors.push({ index, error: "external_id is required." });
    const { data, errors: fieldErrors } = validateData(type.fields || [], record?.data || {});
    if (fieldErrors.length) return errors.push({ index, error: fieldErrors.join(" ") });
    if (record?.contact_id && !projectContacts.has(record.contact_id)) return errors.push({ index, error: `No contact with id ${record.contact_id}.` });
    const contactId = record?.contact_id || contactByEmail.get(normalizeEmail(record?.email)) || null;
    if (record?.email && !contactId) return errors.push({ index, error: `No contact with email ${record.email}.` });
    rows.push({ project_id: projectId, type_id: type.id, external_id: externalId.slice(0, 200), contact_id: contactId, data, deleted_at: null });
  });
  if (rows.length) {
    const { error } = await db.from("custom_object_records").upsert(rows, { onConflict: "type_id,external_id" });
    if (error) throw new Error(error.message);
  }
  return { upserted: rows.length, errors };
}
