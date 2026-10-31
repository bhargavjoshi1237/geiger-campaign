"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Read-only data layer for campaign.deliveries — the append-only send log every channel writes through
// lib/messaging/dispatch.js on the server. Screens read it for message logs, reports and timelines;
// clients never write it (no client write policy). Pure: null / [] on failure, never throws or toasts.

const TABLE = "deliveries";

export function normalizeDelivery(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    channel: row.channel ?? "email",
    status: row.status ?? "queued",
    contactId: row.contact_id ?? null,
    to: row.to_address ?? "",
    sourceType: row.source_type ?? "campaign",
    sourceId: row.source_id ?? null,
    campaignId: row.campaign_id ?? null,
    variant: row.variant ?? null,
    subject: row.subject ?? "",
    provider: row.provider ?? "",
    providerId: row.provider_id ?? null,
    connectionId: row.connection_id ?? null,
    error: row.error ?? "",
    cost: Number(row.cost ?? 0),
    currency: row.currency ?? "USD",
    openCount: Number(row.open_count ?? 0),
    clickCount: Number(row.click_count ?? 0),
    sentAt: row.sent_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    openedAt: row.opened_at ?? null,
    clickedAt: row.clicked_at ?? null,
    bouncedAt: row.bounced_at ?? null,
    unsubscribedAt: row.unsubscribed_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

// Filters: { campaignId, contactId, channel, sourceType, sourceId, since, limit }.
export async function listDeliveries(projectId, filters = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const { campaignId, contactId, channel, sourceType, sourceId, since, limit = 1000 } = filters;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (contactId) query = query.eq("contact_id", contactId);
    if (channel) query = query.eq("channel", channel);
    if (sourceType) query = query.eq("source_type", sourceType);
    if (sourceId) query = query.eq("source_id", sourceId);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[deliveries.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDelivery);
  } catch (e) {
    console.error("[deliveries.list]", e);
    return null;
  }
}
