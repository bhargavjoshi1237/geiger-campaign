"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.saved_replies — canned inbox replies with merge tags ({{first_name|there}}),
// offered per channel and inserted by /shortcut. Pure: console.error and null / false / [], never toast.

const TABLE = "saved_replies";
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeSavedReply(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    title: row.title ?? "",
    body: row.body ?? "",
    channels: list(row.channels),
    shortcut: row.shortcut ?? "",
    category: row.category ?? "",
    usageCount: Number(row.usage_count ?? 0),
    lastUsedAt: row.last_used_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function savedReplyToRow(input) {
  const row = {};
  if ("title" in input) row.title = String(input.title || "").trim();
  if ("body" in input) row.body = String(input.body || "");
  if ("channels" in input) row.channels = list(input.channels);
  if ("shortcut" in input) row.shortcut = String(input.shortcut || "").trim().replace(/^\/+/, "").replace(/\s+/g, "-").toLowerCase();
  if ("category" in input) row.category = String(input.category || "").trim();
  if ("usageCount" in input) row.usage_count = Number(input.usageCount) || 0;
  if ("lastUsedAt" in input) row.last_used_at = input.lastUsedAt || null;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export async function listSavedReplies(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("title", { ascending: true });
    if (error) {
      console.error("[saved_replies.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSavedReply);
  } catch (e) {
    console.error("[saved_replies.list]", e);
    return null;
  }
}

export async function createSavedReply(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...savedReplyToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[saved_replies.create]", error.message);
      return null;
    }
    return normalizeSavedReply(data);
  } catch (e) {
    console.error("[saved_replies.create]", e);
    return null;
  }
}

export async function updateSavedReply(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(savedReplyToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[saved_replies.update]", error.message);
      return null;
    }
    return normalizeSavedReply(data);
  } catch (e) {
    console.error("[saved_replies.update]", e);
    return null;
  }
}

export async function softDeleteSavedReply(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[saved_replies.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[saved_replies.delete]", e);
    return false;
  }
}
