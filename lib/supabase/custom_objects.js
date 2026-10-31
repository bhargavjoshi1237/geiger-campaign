"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { sanitizeFields } from "@/lib/data/fields";

// Data layer for campaign.custom_object_types (schemas) and campaign.custom_object_records (rows, optionally
// linked to a contact). record_count is kept by a DB trigger. Pure: null / false / [] on failure.

const TYPES = "custom_object_types";
const RECORDS = "custom_object_records";
const RECORD_SELECT = "*, contact:contact_id(id, email, first_name, last_name)";
const IMPORT_CHUNK = 500;

export function normalizeObjectType(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const name = row.name ?? "Untitled object";
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    key: row.key ?? "",
    name,
    pluralName: row.plural_name || `${name}s`,
    description: row.description ?? "",
    primaryField: row.primary_field ?? "",
    fields: Array.isArray(row.fields) ? row.fields : [],
    relationship: row.relationship === "one" ? "one" : "many",
    recordCount: Number(row.record_count ?? 0),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function objectTypeToRow(input) {
  const row = {};
  const map = { key: "key", primaryField: "primary_field", relationship: "relationship", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled object";
  if ("pluralName" in input) row.plural_name = String(input.pluralName || "").trim();
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("fields" in input) row.fields = sanitizeFields(input.fields);
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export function normalizeObjectRecord(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const contact = row.contact && typeof row.contact === "object" ? row.contact : null;
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    typeId: row.type_id ?? null,
    contactId: row.contact_id ?? null,
    contact: contact
      ? { id: contact.id, email: contact.email ?? "", name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || "Contact" }
      : null,
    externalId: row.external_id ?? "",
    data: row.data && typeof row.data === "object" ? row.data : {},
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function recordToRow(input) {
  const row = {};
  if ("typeId" in input) row.type_id = input.typeId;
  if ("contactId" in input) row.contact_id = input.contactId || null;
  if ("externalId" in input) row.external_id = String(input.externalId || "").trim() || null;
  if ("data" in input) row.data = input.data && typeof input.data === "object" ? input.data : {};
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  return row;
}

export async function listObjectTypes(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TYPES)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[custom_objects.listTypes]", error.message);
      return null;
    }
    return (data || []).map(normalizeObjectType);
  } catch (e) {
    console.error("[custom_objects.listTypes]", e);
    return null;
  }
}

export async function createObjectType(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...objectTypeToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TYPES).insert(payload).select("*").single();
    if (error) {
      console.error("[custom_objects.createType]", error.message);
      return null;
    }
    return normalizeObjectType(data);
  } catch (e) {
    console.error("[custom_objects.createType]", e);
    return null;
  }
}

export async function updateObjectType(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().from(TYPES).update(objectTypeToRow(patch)).eq("id", id).is("deleted_at", null).select("*").single();
    if (error) {
      console.error("[custom_objects.updateType]", error.message);
      return null;
    }
    return normalizeObjectType(data);
  } catch (e) {
    console.error("[custom_objects.updateType]", e);
    return null;
  }
}

export async function softDeleteObjectType(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TYPES).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[custom_objects.deleteType]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[custom_objects.deleteType]", e);
    return false;
  }
}

export async function listObjectRecords(projectId, typeId, { limit = 1000 } = {}) {
  if (!projectId || !typeId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(RECORDS)
      .select(RECORD_SELECT)
      .eq("project_id", projectId)
      .eq("type_id", typeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[custom_objects.listRecords]", error.message);
      return null;
    }
    return (data || []).map(normalizeObjectRecord);
  } catch (e) {
    console.error("[custom_objects.listRecords]", e);
    return null;
  }
}

export async function createObjectRecord(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...recordToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(RECORDS).insert(payload).select(RECORD_SELECT).single();
    if (error) {
      console.error("[custom_objects.createRecord]", error.message);
      return null;
    }
    return normalizeObjectRecord(data);
  } catch (e) {
    console.error("[custom_objects.createRecord]", e);
    return null;
  }
}

export async function updateObjectRecord(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().from(RECORDS).update(recordToRow(patch)).eq("id", id).is("deleted_at", null).select(RECORD_SELECT).single();
    if (error) {
      console.error("[custom_objects.updateRecord]", error.message);
      return null;
    }
    return normalizeObjectRecord(data);
  } catch (e) {
    console.error("[custom_objects.updateRecord]", e);
    return null;
  }
}

export async function softDeleteObjectRecord(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(RECORDS).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[custom_objects.deleteRecord]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[custom_objects.deleteRecord]", e);
    return false;
  }
}

// Email -> contact id for linking imported records (a lookup only; contacts are owned by lib/supabase/contacts).
export async function contactIdsByEmail(projectId, emails) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const list = [...new Set((emails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
  const out = {};
  try {
    for (let i = 0; i < list.length; i += IMPORT_CHUNK) {
      const { data, error } = await schemaClient()
        .from("contacts")
        .select("id, email")
        .eq("project_id", projectId)
        .in("email", list.slice(i, i + IMPORT_CHUNK))
        .is("deleted_at", null);
      if (error) {
        console.error("[custom_objects.contactIds]", error.message);
        return null;
      }
      for (const c of data || []) out[c.email] = c.id;
    }
    return out;
  } catch (e) {
    console.error("[custom_objects.contactIds]", e);
    return null;
  }
}

// CSV import: upserts on (type_id, external_id) in chunks. rows = [{ externalId, contactId, data }].
// Returns { imported, failed } or null when the DB isn't configured.
export async function importObjectRecords(projectId, typeId, rows, { createdBy = null } = {}) {
  if (!projectId || !typeId || !isSupabaseConfigured()) return null;
  let imported = 0;
  let failed = 0;
  const sb = schemaClient();
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK).map((r) => ({
      project_id: projectId,
      type_id: typeId,
      external_id: r.externalId || null,
      contact_id: r.contactId || null,
      data: r.data || {},
      created_by: createdBy,
      deleted_at: null,
    }));
    try {
      const keyed = chunk.filter((r) => r.external_id);
      const unkeyed = chunk.filter((r) => !r.external_id);
      const results = await Promise.all([
        keyed.length ? sb.from(RECORDS).upsert(keyed, { onConflict: "type_id,external_id" }) : { error: null },
        unkeyed.length ? sb.from(RECORDS).insert(unkeyed) : { error: null },
      ]);
      const failure = results.find((r) => r.error);
      if (failure) {
        console.error("[custom_objects.import]", failure.error.message);
        failed += chunk.length;
      } else {
        imported += chunk.length;
      }
    } catch (e) {
      console.error("[custom_objects.import]", e);
      failed += chunk.length;
    }
  }
  return { imported, failed };
}
