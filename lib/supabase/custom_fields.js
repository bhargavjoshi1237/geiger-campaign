"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.custom_fields — contact field definitions whose values live in
// contacts.attributes[key]. Used by contact forms, imports and the segment builder. Pure: null / false / [].

const TABLE = "custom_fields";

export const FIELD_TYPES = ["text", "number", "date", "boolean", "select"];

export const FIELD_TYPE_LABELS = { text: "Text", number: "Number", date: "Date", boolean: "Yes / no", select: "Dropdown" };

// Lowercase snake_case API key from any label ("Plan tier" -> "plan_tier"), always starting with a letter.
export function toFieldKey(label) {
  const key = String(label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(key) ? key : key ? `f_${key}` : "";
}

export function normalizeCustomField(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    key: row.key ?? "",
    label: row.label || row.key || "",
    type: FIELD_TYPES.includes(row.type) ? row.type : "text",
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    required: Boolean(row.required),
    description: row.description ?? "",
    position: Number(row.position ?? 0),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function customFieldToRow(input) {
  const row = {};
  if ("key" in input) row.key = toFieldKey(input.key);
  if ("label" in input) row.label = String(input.label || "").trim();
  if ("type" in input) row.type = FIELD_TYPES.includes(input.type) ? input.type : "text";
  if ("options" in input) row.options = (Array.isArray(input.options) ? input.options : []).map((o) => String(o).trim()).filter(Boolean);
  if ("required" in input) row.required = Boolean(input.required);
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("position" in input) row.position = Number(input.position) || 0;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  return row;
}

// listCustomFields(projectId) -> [{ id, key, label, type, options, required, … }] in display order.
export async function listCustomFields(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[custom_fields.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCustomField);
  } catch (e) {
    console.error("[custom_fields.list]", e);
    return null;
  }
}

export async function createCustomField(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...customFieldToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[custom_fields.create]", error.message);
      return null;
    }
    return normalizeCustomField(data);
  } catch (e) {
    console.error("[custom_fields.create]", e);
    return null;
  }
}

export async function updateCustomField(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { key: _key, ...rest } = patch;
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(customFieldToRow(rest))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[custom_fields.update]", error.message);
      return null;
    }
    return normalizeCustomField(data);
  } catch (e) {
    console.error("[custom_fields.update]", e);
    return null;
  }
}

export async function softDeleteCustomField(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[custom_fields.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[custom_fields.delete]", e);
    return false;
  }
}
