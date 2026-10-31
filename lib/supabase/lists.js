"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeContact } from "@/lib/supabase/contacts";

// Data layer for campaign.lists and campaign.list_members. Memberships are never hard-deleted: removal sets
// status "removed" + deleted_at, re-adding upserts on (list_id, contact_id). Pure: null / false / [] on failure.

const LISTS = "lists";
const MEMBERS = "list_members";
const PAGE = 1000;
const DAY = 86_400_000;

export function normalizeList(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled list",
    description: row.description ?? "",
    doubleOptIn: Boolean(row.double_opt_in),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function listToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled list";
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("doubleOptIn" in input) row.double_opt_in = Boolean(input.doubleOptIn);
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export function normalizeListMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    listId: row.list_id,
    contactId: row.contact_id,
    status: row.status ?? "subscribed",
    source: row.source ?? "manual",
    contact: row.contact ? normalizeContact(row.contact) : null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

export async function listLists(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(LISTS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[lists.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeList);
  } catch (e) {
    console.error("[lists.list]", e);
    return null;
  }
}

export async function getList(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(LISTS)
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[lists.get]", error.message);
      return null;
    }
    return normalizeList(data);
  } catch (e) {
    console.error("[lists.get]", e);
    return null;
  }
}

export async function createList(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...listToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(LISTS).insert(payload).select("*").single();
    if (error) {
      console.error("[lists.create]", error.message);
      return null;
    }
    return normalizeList(data);
  } catch (e) {
    console.error("[lists.create]", e);
    return null;
  }
}

export async function updateList(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(LISTS)
      .update(listToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[lists.update]", error.message);
      return null;
    }
    return normalizeList(data);
  } catch (e) {
    console.error("[lists.update]", e);
    return null;
  }
}

export async function softDeleteList(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(LISTS).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[lists.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[lists.delete]", e);
    return false;
  }
}

// Every membership row in the project, removed ones included (growth math needs them).
export async function listAllMemberships(projectId, { includeRemoved = false } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      let query = schemaClient()
        .from(MEMBERS)
        .select("id, project_id, list_id, contact_id, status, source, created_at, updated_at, deleted_at")
        .eq("project_id", projectId);
      if (!includeRemoved) query = query.is("deleted_at", null);
      const { data, error } = await query.order("id", { ascending: true }).range(from, from + PAGE - 1);
      if (error) {
        console.error("[lists.memberships]", error.message);
        return null;
      }
      out.push(...(data || []).map(normalizeListMember));
      if (!data || data.length < PAGE) break;
    }
    return out;
  } catch (e) {
    console.error("[lists.memberships]", e);
    return null;
  }
}

// Per-list counts from membership rows: { [listId]: { subscribed, pending, unsubscribed, joined30, left30 } }.
export function membershipStats(memberships, now = Date.now()) {
  const stats = {};
  const cutoff = now - 30 * DAY;
  for (const m of memberships || []) {
    const s = (stats[m.listId] ??= { subscribed: 0, pending: 0, unsubscribed: 0, joined30: 0, left30: 0 });
    const live = !m.deletedAt;
    if (live && m.status === "subscribed") s.subscribed += 1;
    else if (live && m.status === "pending") s.pending += 1;
    else if (live && m.status === "unsubscribed") s.unsubscribed += 1;
    const joined = Date.parse(m.createdAt) >= cutoff;
    const leftAt = m.deletedAt ? Date.parse(m.deletedAt) : m.status === "unsubscribed" ? Date.parse(m.updatedAt) : null;
    if (joined && live && m.status !== "unsubscribed") s.joined30 += 1;
    if (leftAt && leftAt >= cutoff && !joined) s.left30 += 1;
  }
  return stats;
}

// Members of one list with their contact embedded.
export async function listListMembers(projectId, listId) {
  if (!projectId || !listId || !isSupabaseConfigured()) return null;
  try {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await schemaClient()
        .from(MEMBERS)
        .select("*, contact:contacts(*)")
        .eq("project_id", projectId)
        .eq("list_id", listId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("[lists.members]", error.message);
        return null;
      }
      out.push(...(data || []).filter((r) => r.contact && !r.contact.deleted_at).map(normalizeListMember));
      if (!data || data.length < PAGE) break;
    }
    return out;
  } catch (e) {
    console.error("[lists.members]", e);
    return null;
  }
}

export async function listContactMemberships(projectId, contactId) {
  if (!projectId || !contactId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(MEMBERS)
      .select("*")
      .eq("project_id", projectId)
      .eq("contact_id", contactId)
      .is("deleted_at", null);
    if (error) {
      console.error("[lists.contactMemberships]", error.message);
      return null;
    }
    return (data || []).map(normalizeListMember);
  } catch (e) {
    console.error("[lists.contactMemberships]", e);
    return null;
  }
}

// Live memberships for a page of contacts -> { [contactId]: [membership] }.
export async function listMembershipsForContacts(projectId, contactIds) {
  const unique = [...new Set((contactIds || []).filter(Boolean))];
  if (!projectId || !isSupabaseConfigured()) return null;
  if (!unique.length) return {};
  try {
    const out = {};
    for (let i = 0; i < unique.length; i += 150) {
      const { data, error } = await schemaClient()
        .from(MEMBERS)
        .select("*")
        .eq("project_id", projectId)
        .in("contact_id", unique.slice(i, i + 150))
        .is("deleted_at", null);
      if (error) {
        console.error("[lists.membershipsFor]", error.message);
        return null;
      }
      for (const m of (data || []).map(normalizeListMember)) (out[m.contactId] ??= []).push(m);
    }
    return out;
  } catch (e) {
    console.error("[lists.membershipsFor]", e);
    return null;
  }
}

// Adds (or revives) memberships -> true / false. status: subscribed | pending | unsubscribed.
export async function addListMembers(projectId, listId, contactIds, { status = "subscribed", source = "manual", createdBy = null } = {}) {
  const unique = [...new Set((contactIds || []).filter(Boolean))];
  if (!projectId || !listId || !unique.length || !isSupabaseConfigured()) return false;
  try {
    for (let i = 0; i < unique.length; i += 500) {
      const rows = unique.slice(i, i + 500).map((contactId) => ({
        project_id: projectId,
        list_id: listId,
        contact_id: contactId,
        status,
        source,
        created_by: createdBy,
        deleted_at: null,
      }));
      const { error } = await schemaClient().from(MEMBERS).upsert(rows, { onConflict: "list_id,contact_id" });
      if (error) {
        console.error("[lists.addMembers]", error.message);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[lists.addMembers]", e);
    return false;
  }
}

export async function updateListMemberStatus(listId, contactIds, status) {
  const unique = [...new Set((contactIds || []).filter(Boolean))];
  if (!listId || !unique.length || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(MEMBERS)
      .update({ status })
      .eq("list_id", listId)
      .in("contact_id", unique)
      .is("deleted_at", null);
    if (error) {
      console.error("[lists.memberStatus]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[lists.memberStatus]", e);
    return false;
  }
}

export async function removeListMembers(listId, contactIds) {
  const unique = [...new Set((contactIds || []).filter(Boolean))];
  if (!listId || !unique.length || !isSupabaseConfigured()) return false;
  try {
    for (let i = 0; i < unique.length; i += 150) {
      const { error } = await schemaClient()
        .from(MEMBERS)
        .update({ status: "removed", deleted_at: new Date().toISOString() })
        .eq("list_id", listId)
        .in("contact_id", unique.slice(i, i + 150))
        .is("deleted_at", null);
      if (error) {
        console.error("[lists.removeMembers]", error.message);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[lists.removeMembers]", e);
    return false;
  }
}
