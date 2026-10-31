"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.transactional_templates — API-triggered email templates referenced by `key`
// from POST /api/v1/messages. HTML or an Email Builder block document; the variable schema documents
// (and validates) the data callers send. Pure: null / false / [] on failure, never throws or toasts.

const TABLE = "transactional_templates";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeTransactionalTemplate(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    key: row.key ?? "",
    name: row.name ?? "Untitled template",
    category: row.category ?? "other",
    subject: row.subject ?? "",
    preheader: row.preheader ?? "",
    format: row.format === "blocks" ? "blocks" : "html",
    content: bag(row.content),
    html: row.html ?? "",
    fromName: row.from_name ?? "",
    fromEmail: row.from_email ?? "",
    variables: Array.isArray(row.variables) ? row.variables : [],
    version: Number(row.version ?? 1),
    status: row.status ?? "draft",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function transactionalTemplateToRow(input) {
  const row = {};
  const map = {
    key: "key",
    name: "name",
    category: "category",
    subject: "subject",
    preheader: "preheader",
    format: "format",
    html: "html",
    fromName: "from_name",
    fromEmail: "from_email",
    status: "status",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? "";
  if ("content" in input) row.content = bag(input.content);
  if ("variables" in input) row.variables = Array.isArray(input.variables) ? input.variables : [];
  if ("version" in input) row.version = Number(input.version) || 1;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  return row;
}

export async function listTransactionalTemplates(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[transactional_templates.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeTransactionalTemplate);
  } catch (e) {
    console.error("[transactional_templates.list]", e);
    return null;
  }
}

export async function getTransactionalTemplate(projectId, id) {
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
      console.error("[transactional_templates.get]", error.message);
      return null;
    }
    return normalizeTransactionalTemplate(data);
  } catch (e) {
    console.error("[transactional_templates.get]", e);
    return null;
  }
}

export async function createTransactionalTemplate(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...transactionalTemplateToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[transactional_templates.create]", error.message);
      return null;
    }
    return normalizeTransactionalTemplate(data);
  } catch (e) {
    console.error("[transactional_templates.create]", e);
    return null;
  }
}

export async function updateTransactionalTemplate(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(transactionalTemplateToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[transactional_templates.update]", error.message);
      return null;
    }
    return normalizeTransactionalTemplate(data);
  } catch (e) {
    console.error("[transactional_templates.update]", e);
    return null;
  }
}

export async function softDeleteTransactionalTemplate(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[transactional_templates.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[transactional_templates.delete]", e);
    return false;
  }
}
