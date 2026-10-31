"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.push_subscriptions — browser push endpoints registered by the web push SDK
// (POST /api/public/push/subscribe). The screen lists them and can retire one. Endpoint keys are never
// surfaced to the view model. Pure: null / false / [] on failure, never throws or toasts.

const TABLE = "push_subscriptions";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// "Chrome on macOS" from a user agent string, for the subscriptions table.
export function describeUserAgent(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function normalizePushSubscription(row) {
  if (!row) return null;
  let host = "";
  try {
    host = new URL(row.endpoint).host;
  } catch {
    host = "";
  }
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    connectionId: row.connection_id ?? null,
    contactId: row.contact_id ?? null,
    anonymousId: row.anonymous_id ?? null,
    platform: row.platform ?? "web",
    pushService: host,
    device: describeUserAgent(row.user_agent || ""),
    status: row.status ?? "active",
    lastSeenAt: row.last_seen_at ?? null,
    lastSentAt: row.last_sent_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function listPushSubscriptions(projectId, { status, limit = 1000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[push_subscriptions.list]", error.message);
      return null;
    }
    return (data || []).map(normalizePushSubscription);
  } catch (e) {
    console.error("[push_subscriptions.list]", e);
    return null;
  }
}

export async function softDeletePushSubscription(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "unsubscribed" })
      .eq("id", id);
    if (error) {
      console.error("[push_subscriptions.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[push_subscriptions.delete]", e);
    return false;
  }
}
