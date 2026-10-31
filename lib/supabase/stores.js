"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.stores — connected storefronts that stream products, carts and orders in
// through the public ingest route. Signing secrets live server-side (store_secrets) and are only ever
// set through the store connection route. Pure: console.error and null / false / [] — never throws.

const TABLE = "stores";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export const DEFAULT_STORE_SETTINGS = { syncProducts: true, syncOrders: true, syncCustomers: true };

export function normalizeStore(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled store",
    platform: row.platform ?? "custom",
    domain: row.domain ?? "",
    currency: row.currency ?? "USD",
    status: row.status ?? "pending",
    abandonAfterMinutes: Number(row.abandon_after_minutes ?? 60),
    settings: { ...DEFAULT_STORE_SETTINGS, ...bag(row.settings) },
    secretHint: row.secret_hint ?? "",
    secretRotatedAt: row.secret_rotated_at ?? null,
    lastEventAt: row.last_event_at ?? null,
    lastEventType: row.last_event_type ?? "",
    lastError: row.last_error ?? "",
    lastErrorAt: row.last_error_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// camelCase patch -> snake_case columns, emitting only the keys present.
export function storeToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled store";
  if ("platform" in input) row.platform = input.platform || "custom";
  if ("domain" in input) row.domain = String(input.domain || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if ("currency" in input) row.currency = String(input.currency || "USD").toUpperCase();
  if ("status" in input) row.status = input.status || "pending";
  if ("abandonAfterMinutes" in input) row.abandon_after_minutes = Math.min(10080, Math.max(5, Number(input.abandonAfterMinutes) || 60));
  if ("settings" in input) row.settings = bag(input.settings);
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listStores(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[stores.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeStore);
  } catch (e) {
    console.error("[stores.list]", e);
    return null;
  }
}

export async function getStore(projectId, id) {
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
      console.error("[stores.get]", error.message);
      return null;
    }
    return normalizeStore(data);
  } catch (e) {
    console.error("[stores.get]", e);
    return null;
  }
}

export async function createStore(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      status: "pending",
      settings: DEFAULT_STORE_SETTINGS,
      ...storeToRow(input),
      project_id: projectId,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[stores.create]", error.message);
      return null;
    }
    return normalizeStore(data);
  } catch (e) {
    console.error("[stores.create]", e);
    return null;
  }
}

export async function updateStore(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(storeToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[stores.update]", error.message);
      return null;
    }
    return normalizeStore(data);
  } catch (e) {
    console.error("[stores.update]", e);
    return null;
  }
}

// Disconnecting a store soft-deletes it; the ingest route then rejects its webhooks.
export async function softDeleteStore(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[stores.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[stores.delete]", e);
    return false;
  }
}
