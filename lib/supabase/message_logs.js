"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeDelivery } from "./deliveries";
import { normalizeTrackedEvent } from "./tracked_events";

// Read-only data layer for the Message Logs detail: one delivery by id (deep links into older messages)
// and the tracked events recorded against it (opens, clicks, replies). campaign.deliveries and
// campaign.tracked_events are server-written; this only reads. Pure: null / [] on failure, never throws.

export async function getDelivery(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("deliveries")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[message_logs.get]", error.message);
      return null;
    }
    return normalizeDelivery(data);
  } catch (e) {
    console.error("[message_logs.get]", e);
    return null;
  }
}

// Oldest first, so the detail timeline reads top to bottom.
export async function listDeliveryEvents(projectId, deliveryId, { limit = 200 } = {}) {
  if (!projectId || !deliveryId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("tracked_events")
      .select("*")
      .eq("project_id", projectId)
      .eq("delivery_id", deliveryId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("[message_logs.events]", error.message);
      return null;
    }
    return (data || []).map(normalizeTrackedEvent);
  } catch (e) {
    console.error("[message_logs.events]", e);
    return null;
  }
}
