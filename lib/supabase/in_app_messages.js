"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.in_app_messages — the per-contact in-app inbox the SDK reads. Messages are
// queued server-side through dispatch (channel in_app); the screen lists them and can expire or delete
// them. Pure: null / false / [] on failure, never throws or toasts.

const TABLE = "in_app_messages";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeInAppMessage(row) {
  if (!row) return null;
  const expired = row.status === "unread" && row.expires_at && new Date(row.expires_at) < new Date();
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    contactId: row.contact_id ?? null,
    deliveryId: row.delivery_id ?? null,
    campaignId: row.campaign_id ?? null,
    sourceType: row.source_type ?? "manual",
    sourceId: row.source_id ?? null,
    format: row.format ?? "inbox",
    title: row.title ?? "",
    body: row.body ?? "",
    cta: bag(row.cta),
    // Past expires_at the SDK no longer returns it, whatever the stored status says.
    status: expired ? "expired" : row.status ?? "unread",
    expiresAt: row.expires_at ?? null,
    readAt: row.read_at ?? null,
    clickedAt: row.clicked_at ?? null,
    dismissedAt: row.dismissed_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

// Filters: { contactId, status, since, limit }.
export async function listInAppMessages(projectId, { contactId, status, since, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (contactId) query = query.eq("contact_id", contactId);
    if (status) query = query.eq("status", status);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[in_app_messages.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeInAppMessage);
  } catch (e) {
    console.error("[in_app_messages.list]", e);
    return null;
  }
}

// Withdraws a message the user hasn't seen yet: the SDK stops returning it.
export async function expireInAppMessage(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update({ status: "expired", expires_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[in_app_messages.expire]", error.message);
      return null;
    }
    return normalizeInAppMessage(data);
  } catch (e) {
    console.error("[in_app_messages.expire]", e);
    return null;
  }
}

export async function softDeleteInAppMessage(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[in_app_messages.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[in_app_messages.delete]", e);
    return false;
  }
}
