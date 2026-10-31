"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeDomain } from "@/lib/crm/domains";

// Data layer for campaign.companies — the organizations behind contacts and deals. The only place that
// talks to the table. Pure: console.error on failure and return null / false / [] — never throw, never toast.
// Contacts link through the core contacts.company_id column (read via lib/supabase/contacts.js).

const TABLE = "companies";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function normalizeCompany(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled company",
    domain: row.domain ?? "",
    industry: row.industry ?? "",
    size: row.size ?? "",
    ownerId: row.owner_id ?? null,
    website: row.website ?? "",
    address: row.address ?? "",
    autoAssociate: row.auto_associate ?? true,
    attributes: bag(row.attributes),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// camelCase patch -> snake_case columns; a column is emitted only when its key is present.
export function companyToRow(input) {
  const row = {};
  const map = { industry: "industry", size: "size", website: "website", address: "address" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = String(input[key] ?? "").trim();
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled company";
  if ("domain" in input) row.domain = normalizeDomain(input.domain) || null;
  if ("ownerId" in input) row.owner_id = input.ownerId || null;
  if ("autoAssociate" in input) row.auto_associate = Boolean(input.autoAssociate);
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("attributes" in input) row.attributes = bag(input.attributes);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listCompanies(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) {
      console.error("[companies.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCompany);
  } catch (e) {
    console.error("[companies.list]", e);
    return null;
  }
}

export async function getCompany(projectId, id) {
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
      console.error("[companies.get]", error.message);
      return null;
    }
    return normalizeCompany(data);
  } catch (e) {
    console.error("[companies.get]", e);
    return null;
  }
}

export async function createCompany(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      name: "Untitled company",
      industry: "",
      size: "",
      website: "",
      address: "",
      auto_associate: true,
      attributes: {},
      ...companyToRow(input),
      project_id: projectId,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[companies.create]", error.message);
      return null;
    }
    return normalizeCompany(data);
  } catch (e) {
    console.error("[companies.create]", e);
    return null;
  }
}

export async function updateCompany(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(companyToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[companies.update]", error.message);
      return null;
    }
    return normalizeCompany(data);
  } catch (e) {
    console.error("[companies.update]", e);
    return null;
  }
}

export async function softDeleteCompany(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[companies.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[companies.delete]", e);
    return false;
  }
}
