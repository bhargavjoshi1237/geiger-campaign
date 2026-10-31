"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.email_templates — saved builder documents campaigns start from. The only place
// that talks to the table. Pure: console.error on failure and return null / false / [] — never throw or toast.

const TABLE = "email_templates";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function normalizeEmailTemplate(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled template",
    category: row.category ?? "newsletter",
    subject: row.subject ?? "",
    preheader: row.preheader ?? "",
    content: bag(row.content),
    previewHtml: row.preview_html ?? "",
    thumbnailUrl: row.thumbnail_url ?? "",
    isStarter: !!row.is_starter,
    starterKey: row.starter_key ?? null,
    usageCount: Number(row.usage_count ?? 0),
    lastUsedAt: row.last_used_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function emailTemplateToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    category: "category",
    subject: "subject",
    preheader: "preheader",
    previewHtml: "preview_html",
    starterKey: "starter_key",
    lastUsedAt: "last_used_at",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled template";
  if ("content" in input) row.content = bag(input.content);
  if ("isStarter" in input) row.is_starter = !!input.isStarter;
  if ("usageCount" in input) row.usage_count = Number(input.usageCount) || 0;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  if ("thumbnailUrl" in input) row.thumbnail_url = input.thumbnailUrl || "";
  return row;
}

export async function listEmailTemplates(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[email_templates.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeEmailTemplate);
  } catch (e) {
    console.error("[email_templates.list]", e);
    return null;
  }
}

export async function getEmailTemplate(projectId, id) {
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
      console.error("[email_templates.get]", error.message);
      return null;
    }
    return normalizeEmailTemplate(data);
  } catch (e) {
    console.error("[email_templates.get]", e);
    return null;
  }
}

export async function createEmailTemplate(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...emailTemplateToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[email_templates.create]", error.message);
      return null;
    }
    return normalizeEmailTemplate(data);
  } catch (e) {
    console.error("[email_templates.create]", e);
    return null;
  }
}

export async function updateEmailTemplate(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(emailTemplateToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[email_templates.update]", error.message);
      return null;
    }
    return normalizeEmailTemplate(data);
  } catch (e) {
    console.error("[email_templates.update]", e);
    return null;
  }
}

export async function softDeleteEmailTemplate(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[email_templates.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email_templates.delete]", e);
    return false;
  }
}

// Bumps the template's usage counter when a campaign is created from it.
export async function markEmailTemplateUsed(template) {
  if (!template?.id) return null;
  return updateEmailTemplate(template.id, { usageCount: (template.usageCount || 0) + 1, lastUsedAt: new Date().toISOString() });
}
