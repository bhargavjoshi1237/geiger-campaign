"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Read-only data layer for campaign.social_metric_snapshots — point-in-time insights pulled from the platform
// APIs by the social worker (account scope per connection, post scope per published target). Pure: null / [].

const TABLE = "social_metric_snapshots";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeMetricSnapshot(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    connectionId: row.connection_id ?? null,
    targetId: row.target_id ?? null,
    network: row.network ?? "",
    scope: row.scope ?? "account",
    metrics: bag(row.metrics),
    capturedAt: row.captured_at ?? row.created_at ?? null,
  };
}

// Filters: { scope, connectionId, since, limit }.
export async function listMetricSnapshots(projectId, { scope, connectionId, since, limit = 5000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("captured_at", { ascending: true })
      .limit(limit);
    if (scope) query = query.eq("scope", scope);
    if (connectionId) query = query.eq("connection_id", connectionId);
    if (since) query = query.gte("captured_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[social_metrics.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeMetricSnapshot);
  } catch (e) {
    console.error("[social_metrics.list]", e);
    return null;
  }
}
