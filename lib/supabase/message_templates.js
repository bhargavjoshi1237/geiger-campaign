"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.message_templates — WhatsApp (and later RCS) templates in Meta's component
// format. Drafts are written here; submitting, syncing review status and remote deletion go through the
// /channels/whatsapp/templates routes. Pure: null / false / [] on failure, never throws or toasts.

const TABLE = "message_templates";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeMessageTemplate(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    connectionId: row.connection_id ?? null,
    channel: row.channel ?? "whatsapp",
    name: row.name ?? "",
    language: row.language ?? "en_US",
    category: row.category ?? "marketing",
    status: row.status ?? "draft",
    components: Array.isArray(row.components) ? row.components : [],
    rejectionReason: row.rejection_reason ?? "",
    externalId: row.external_id ?? null,
    qualityScore: row.quality_score ?? null,
    submittedAt: row.submitted_at ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function messageTemplateToRow(input) {
  const row = {};
  const map = {
    connectionId: "connection_id",
    channel: "channel",
    name: "name",
    language: "language",
    category: "category",
    status: "status",
    rejectionReason: "rejection_reason",
    externalId: "external_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("components" in input) row.components = Array.isArray(input.components) ? input.components : [];
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listMessageTemplates(projectId, { channel = "whatsapp", connectionId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (channel) query = query.eq("channel", channel);
    if (connectionId) query = query.eq("connection_id", connectionId);
    const { data, error } = await query;
    if (error) {
      console.error("[message_templates.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeMessageTemplate);
  } catch (e) {
    console.error("[message_templates.list]", e);
    return null;
  }
}

export async function getMessageTemplate(projectId, id) {
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
      console.error("[message_templates.get]", error.message);
      return null;
    }
    return normalizeMessageTemplate(data);
  } catch (e) {
    console.error("[message_templates.get]", e);
    return null;
  }
}

export async function createMessageTemplate(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...messageTemplateToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[message_templates.create]", error.message);
      return null;
    }
    return normalizeMessageTemplate(data);
  } catch (e) {
    console.error("[message_templates.create]", e);
    return null;
  }
}

export async function updateMessageTemplate(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(messageTemplateToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[message_templates.update]", error.message);
      return null;
    }
    return normalizeMessageTemplate(data);
  } catch (e) {
    console.error("[message_templates.update]", e);
    return null;
  }
}

// Local-only removal (drafts). Submitted templates are deleted through the route so Meta drops them too.
export async function softDeleteMessageTemplate(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[message_templates.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[message_templates.delete]", e);
    return false;
  }
}
