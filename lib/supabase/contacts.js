"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeEmail, normalizePhone, toContactModel } from "@/lib/audience/contact_model";

// Data layer for campaign.contacts — the audience every channel sends to. The only place that talks to
// the table. Pure: console.error on failure and return null / false / [] — never throw, never toast.
// DB is snake_case; screens get camelCase view models (normalizeContact), mapped at this boundary.

const TABLE = "contacts";
const PAGE = 1000;

export function normalizeContact(row) {
  return toContactModel(row);
}

// camelCase patch -> snake_case columns; a column is emitted only when its key is present, so one
// updateContact() serves both a full form save and a single-field inline edit.
export function contactToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    status: "status",
    source: "source",
    timezone: "timezone",
    locale: "locale",
    companyId: "company_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("email" in input) row.email = normalizeEmail(input.email) || null;
  if ("phone" in input) row.phone = normalizePhone(input.phone) || null;
  if ("firstName" in input) row.first_name = String(input.firstName || "").trim();
  if ("lastName" in input) row.last_name = String(input.lastName || "").trim();
  if ("tags" in input) row.tags = Array.isArray(input.tags) ? input.tags : [];
  if ("attributes" in input) row.attributes = input.attributes && typeof input.attributes === "object" ? input.attributes : {};
  if ("leadScore" in input) row.lead_score = Number(input.leadScore) || 0;
  if ("lastActivityAt" in input) row.last_activity_at = input.lastActivityAt || null;
  if ("unsubscribedAt" in input) row.unsubscribed_at = input.unsubscribedAt || null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

const searchTerm = (search) => String(search || "").trim().replace(/[%,()*]/g, "");

export async function listContacts(projectId, { search = "", limit = 1000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    const term = searchTerm(search);
    if (term) query = query.or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`);
    const { data, error } = await query;
    if (error) {
      console.error("[contacts.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeContact);
  } catch (e) {
    console.error("[contacts.list]", e);
    return null;
  }
}

const SORTS = {
  newest: ["created_at", false],
  oldest: ["created_at", true],
  score: ["lead_score", false],
  name: ["first_name", true],
};

// Applies the contacts screen filters to a query: { search, status, tag, listId }.
function applyFilters(query, { search, status, tag, listId } = {}) {
  let q = query;
  const term = searchTerm(search);
  if (term) q = q.or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`);
  if (status && status !== "all") q = q.eq("status", status);
  if (tag && tag !== "all") q = q.contains("tags", [tag]);
  if (listId && listId !== "all") q = q.eq("list_members.list_id", listId).eq("list_members.status", "subscribed").is("list_members.deleted_at", null);
  return q;
}

// One server-side page for the contacts table -> { rows, total } (null on failure).
export async function listContactsPage(projectId, { page = 1, pageSize = 25, sort = "newest", ...filters } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const [column, ascending] = SORTS[sort] || SORTS.newest;
    const select = filters.listId && filters.listId !== "all" ? "*, list_members!inner(list_id, status, deleted_at)" : "*";
    const from = (Math.max(1, page) - 1) * pageSize;
    const query = applyFilters(
      schemaClient().from(TABLE).select(select, { count: "exact" }).eq("project_id", projectId).is("deleted_at", null),
      filters,
    )
      .order(column, { ascending })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    const { data, error, count } = await query;
    if (error) {
      console.error("[contacts.page]", error.message);
      return null;
    }
    return {
      rows: (data || []).map(({ list_members: _members, ...row }) => normalizeContact(row)),
      total: count ?? (data || []).length,
    };
  } catch (e) {
    console.error("[contacts.page]", e);
    return null;
  }
}

// Head count with the same filters plus score bounds: { status, tag, listId, search, minScore, maxScore }.
export async function countContacts(projectId, { minScore, maxScore, ...filters } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const select = filters.listId && filters.listId !== "all" ? "id, list_members!inner(list_id, status, deleted_at)" : "id";
    let query = applyFilters(
      schemaClient().from(TABLE).select(select, { count: "exact", head: true }).eq("project_id", projectId).is("deleted_at", null),
      filters,
    );
    if (minScore !== undefined) query = query.gte("lead_score", minScore);
    if (maxScore !== undefined) query = query.lte("lead_score", maxScore);
    const { count, error } = await query;
    if (error) {
      console.error("[contacts.count]", error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[contacts.count]", e);
    return null;
  }
}

// Every contact in the project (paged reads, capped) — for exports and in-browser segment previews.
export async function listAllContacts(projectId, { max = 20000, filters = {} } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const out = [];
    const select = filters.listId && filters.listId !== "all" ? "*, list_members!inner(list_id, status, deleted_at)" : "*";
    for (let from = 0; from < max; from += PAGE) {
      const { data, error } = await applyFilters(
        schemaClient().from(TABLE).select(select).eq("project_id", projectId).is("deleted_at", null),
        filters,
      )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, Math.min(from + PAGE, max) - 1);
      if (error) {
        console.error("[contacts.all]", error.message);
        return null;
      }
      out.push(...(data || []).map(({ list_members: _members, ...row }) => normalizeContact(row)));
      if (!data || data.length < PAGE) break;
    }
    return out;
  } catch (e) {
    console.error("[contacts.all]", e);
    return null;
  }
}

export async function listContactsByIds(projectId, ids = []) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  try {
    const out = [];
    for (let i = 0; i < unique.length; i += 150) {
      const { data, error } = await schemaClient()
        .from(TABLE)
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .in("id", unique.slice(i, i + 150));
      if (error) {
        console.error("[contacts.byIds]", error.message);
        return null;
      }
      out.push(...(data || []).map(normalizeContact));
    }
    return out;
  } catch (e) {
    console.error("[contacts.byIds]", e);
    return null;
  }
}

export async function findContactByEmail(projectId, email) {
  const value = normalizeEmail(email);
  if (!projectId || !value || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .eq("email", value)
      .is("deleted_at", null)
      .limit(1);
    if (error) {
      console.error("[contacts.findByEmail]", error.message);
      return null;
    }
    return data?.[0] ? normalizeContact(data[0]) : null;
  } catch (e) {
    console.error("[contacts.findByEmail]", e);
    return null;
  }
}

// One pass over every contact's tags, attributes and score -> usage tallies for Tags & Fields and Lead Scoring.
export async function scanContactFacets(projectId, { max = 50000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const facets = { total: 0, tagged: 0, truncated: false, tagCounts: {}, fieldFilled: {}, scores: [] };
    for (let from = 0; from < max; from += PAGE) {
      const { data, error } = await schemaClient()
        .from(TABLE)
        .select("id, tags, attributes, lead_score")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("[contacts.facets]", error.message);
        return null;
      }
      for (const row of data || []) {
        facets.total += 1;
        const tags = Array.isArray(row.tags) ? row.tags : [];
        if (tags.length) facets.tagged += 1;
        for (const tag of tags) facets.tagCounts[tag] = (facets.tagCounts[tag] || 0) + 1;
        for (const [key, value] of Object.entries(row.attributes || {})) {
          if (value !== null && value !== undefined && String(value).trim() !== "") facets.fieldFilled[key] = (facets.fieldFilled[key] || 0) + 1;
        }
        facets.scores.push(Number(row.lead_score) || 0);
      }
      if (!data || data.length < PAGE) break;
      if (from + PAGE >= max) facets.truncated = true;
    }
    return facets;
  } catch (e) {
    console.error("[contacts.facets]", e);
    return null;
  }
}

export async function getContact(projectId, id) {
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
      console.error("[contacts.get]", error.message);
      return null;
    }
    return normalizeContact(data);
  } catch (e) {
    console.error("[contacts.get]", e);
    return null;
  }
}

export async function createContact(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...contactToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[contacts.create]", error.message);
      return null;
    }
    return normalizeContact(data);
  } catch (e) {
    console.error("[contacts.create]", e);
    return null;
  }
}

export async function updateContact(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(contactToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[contacts.update]", error.message);
      return null;
    }
    return normalizeContact(data);
  } catch (e) {
    console.error("[contacts.update]", e);
    return null;
  }
}

// The same patch on many contacts (status changes from the bulk bar). true / false.
export async function updateContacts(ids, patch) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length || !isSupabaseConfigured()) return false;
  try {
    for (let i = 0; i < unique.length; i += 150) {
      const { error } = await schemaClient().from(TABLE).update(contactToRow(patch)).in("id", unique.slice(i, i + 150)).is("deleted_at", null);
      if (error) {
        console.error("[contacts.updateMany]", error.message);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[contacts.updateMany]", e);
    return false;
  }
}

export async function softDeleteContact(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[contacts.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[contacts.delete]", e);
    return false;
  }
}

export async function softDeleteContacts(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length || !isSupabaseConfigured()) return false;
  try {
    const deletedAt = new Date().toISOString();
    for (let i = 0; i < unique.length; i += 150) {
      const { error } = await schemaClient().from(TABLE).update({ deleted_at: deletedAt }).in("id", unique.slice(i, i + 150));
      if (error) {
        console.error("[contacts.deleteMany]", error.message);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[contacts.deleteMany]", e);
    return false;
  }
}

const mergeTagList = (current, add, remove) => {
  const drop = new Set(remove.map((t) => t.toLowerCase()));
  const seen = new Map();
  for (const t of [...current, ...add]) {
    const k = String(t).toLowerCase();
    if (!t || drop.has(k) || seen.has(k)) continue;
    seen.set(k, t);
  }
  return [...seen.values()];
};

// Per-row fallback when the retag RPCs aren't available (playground, un-migrated database).
async function rewriteTags(projectId, rows, transform) {
  let touched = 0;
  for (const row of rows) {
    const next = transform(Array.isArray(row.tags) ? row.tags : []);
    if (JSON.stringify(next) === JSON.stringify(row.tags || [])) continue;
    const { error } = await schemaClient().from(TABLE).update({ tags: next }).eq("project_id", projectId).eq("id", row.id);
    if (error) {
      console.error("[contacts.retag]", error.message);
      return null;
    }
    touched += 1;
  }
  return touched;
}

// Adds/removes tags on the given contacts -> number touched, or null on failure.
export async function retagContacts(projectId, ids, { add = [], remove = [] } = {}) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!projectId || !unique.length || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("contacts_retag", { p_project: projectId, p_ids: unique, p_add: add, p_remove: remove });
    if (!error) return Number(data) || 0;
    const rows = [];
    for (let i = 0; i < unique.length; i += 150) {
      const { data: part, error: readError } = await schemaClient()
        .from(TABLE)
        .select("id, tags")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .in("id", unique.slice(i, i + 150));
      if (readError) {
        console.error("[contacts.retag]", readError.message);
        return null;
      }
      rows.push(...(part || []));
    }
    return rewriteTags(projectId, rows, (tags) => mergeTagList(tags, add, remove));
  } catch (e) {
    console.error("[contacts.retag]", e);
    return null;
  }
}

// Renames a tag on every contact in the project (to = null removes it) -> number touched, or null.
export async function renameContactTag(projectId, from, to = null) {
  if (!projectId || !from || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("contacts_rename_tag", { p_project: projectId, p_from: from, p_to: to });
    if (!error) return Number(data) || 0;
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data: part, error: readError } = await schemaClient()
        .from(TABLE)
        .select("id, tags")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .contains("tags", [from])
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (readError) {
        console.error("[contacts.renameTag]", readError.message);
        return null;
      }
      rows.push(...(part || []));
      if (!part || part.length < PAGE) break;
    }
    const lowerFrom = from.toLowerCase();
    return rewriteTags(projectId, rows, (tags) =>
      mergeTagList(tags.map((t) => (String(t).toLowerCase() === lowerFrom ? to : t)).filter(Boolean), [], []),
    );
  } catch (e) {
    console.error("[contacts.renameTag]", e);
    return null;
  }
}
