"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.api_keys — key metadata only. The sha256 lives in the server-only
// api_key_secrets table; issuing, rolling and revoking go through /api/projects/:id/integrations/api-keys.
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "api_keys";

export function apiKeyStatus(row) {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) return "expired";
  return "active";
}

export function normalizeApiKey(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const key = {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled key",
    kind: row.kind === "public" ? "public" : "secret",
    prefix: row.prefix ?? "",
    displayKey: row.display_key ?? null,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    expiresAt: row.expires_at ?? null,
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
  return { ...key, status: apiKeyStatus(key) };
}

// Only the client-editable columns (name, scopes, expiry, metadata).
export function apiKeyToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled key";
  if ("scopes" in input) row.scopes = Array.isArray(input.scopes) ? input.scopes : [];
  if ("expiresAt" in input) row.expires_at = input.expiresAt || null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export async function listApiKeys(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[api_keys.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeApiKey);
  } catch (e) {
    console.error("[api_keys.list]", e);
    return null;
  }
}

export async function updateApiKey(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(apiKeyToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[api_keys.update]", error.message);
      return null;
    }
    return normalizeApiKey(data);
  } catch (e) {
    console.error("[api_keys.update]", e);
    return null;
  }
}

// Hides a key from the list (revoke it first — removal alone doesn't stop it working).
export async function softDeleteApiKey(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[api_keys.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[api_keys.delete]", e);
    return false;
  }
}
