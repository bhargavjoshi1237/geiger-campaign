"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Read-only data layer for campaign.tracked_events — behaviour ingested on the server (JS snippet,
// API, forms, commerce, channels). Screens read it for activity, attribution and trigger previews;
// writes happen only in server routes. Pure: null / [] on failure, never throws or toasts.

const TABLE = "tracked_events";

export function normalizeTrackedEvent(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    contactId: row.contact_id ?? null,
    anonymousId: row.anonymous_id ?? null,
    name: row.name ?? "",
    properties: row.properties && typeof row.properties === "object" ? row.properties : {},
    source: row.source ?? "web",
    deliveryId: row.delivery_id ?? null,
    campaignId: row.campaign_id ?? null,
    revenue: row.revenue == null ? null : Number(row.revenue),
    currency: row.currency ?? null,
    url: row.url ?? "",
    referrer: row.referrer ?? "",
    utm: row.utm && typeof row.utm === "object" ? row.utm : {},
    occurredAt: row.occurred_at ?? row.created_at ?? null,
  };
}

// Filters: { name, names, contactId, campaignId, source, since, limit }.
export async function listTrackedEvents(projectId, filters = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const { name, names, contactId, campaignId, source, since, limit = 1000 } = filters;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (name) query = query.eq("name", name);
    if (Array.isArray(names) && names.length) query = query.in("name", names);
    if (contactId) query = query.eq("contact_id", contactId);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (source) query = query.eq("source", source);
    if (since) query = query.gte("occurred_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[tracked_events.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeTrackedEvent);
  } catch (e) {
    console.error("[tracked_events.list]", e);
    return null;
  }
}
