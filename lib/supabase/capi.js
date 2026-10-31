"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for the Conversions API forwarder: campaign.capi_configs (dataset, event mapping, test code)
// and the read-only delivery log campaign.capi_events (server-written by the ads worker). The access token
// is posted to the token route and stored in capi_secrets, which no client can read. Pure: null / false / [].

const CONFIGS = "capi_configs";
const EVENTS = "capi_events";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeCapiConfig(row) {
  if (!row) return null;
  const valueMapping = bag(row.value_mapping);
  const messaging = bag(row.messaging);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    adAccountId: row.ad_account_id ?? null,
    name: row.name ?? "Conversions API",
    datasetId: row.dataset_id ?? "",
    events: Array.isArray(row.events) ? row.events : [],
    valueMapping: { currency: valueMapping.currency || "USD" },
    attributionWindowDays: Number(row.attribution_window_days ?? 7),
    messaging: {
      whatsappBusinessAccountId: messaging.whatsappBusinessAccountId ?? "",
      pageId: messaging.pageId ?? "",
      igAccountId: messaging.igAccountId ?? "",
    },
    testEventCode: row.test_event_code ?? "",
    testMode: Boolean(row.test_mode),
    status: row.status ?? "draft",
    tokenSet: Boolean(row.token_set),
    cursorAt: row.cursor_at ?? null,
    lastSentAt: row.last_sent_at ?? null,
    sentCount: Number(row.sent_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    lastError: row.last_error ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function capiConfigToRow(input) {
  const row = {};
  const map = { adAccountId: "ad_account_id", name: "name", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = /Id$/.test(key) ? input[key] || null : input[key] ?? null;
  if ("name" in input) row.name = String(input.name || "").trim() || "Conversions API";
  if ("datasetId" in input) row.dataset_id = String(input.datasetId || "").trim();
  if ("events" in input) row.events = Array.isArray(input.events) ? input.events : [];
  if ("valueMapping" in input) row.value_mapping = bag(input.valueMapping);
  if ("attributionWindowDays" in input) row.attribution_window_days = Math.min(28, Math.max(1, Number(input.attributionWindowDays) || 7));
  if ("messaging" in input) row.messaging = bag(input.messaging);
  if ("testEventCode" in input) row.test_event_code = String(input.testEventCode || "").trim();
  if ("testMode" in input) row.test_mode = Boolean(input.testMode);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeCapiEvent(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    configId: row.capi_config_id ?? null,
    trackedEventId: row.tracked_event_id ?? null,
    contactId: row.contact_id ?? null,
    eventName: row.event_name ?? "",
    eventId: row.event_id ?? "",
    actionSource: row.action_source ?? "website",
    messagingChannel: row.messaging_channel ?? null,
    status: row.status ?? "queued",
    isTest: Boolean(row.is_test),
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: row.next_attempt_at ?? null,
    value: row.value == null ? null : Number(row.value),
    currency: row.currency ?? null,
    eventTime: row.event_time ?? null,
    payload: bag(row.payload),
    response: bag(row.response),
    error: row.error ?? "",
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function listCapiConfigs(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(CONFIGS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[capi.listConfigs]", error.message);
      return null;
    }
    return (data || []).map(normalizeCapiConfig);
  } catch (e) {
    console.error("[capi.listConfigs]", e);
    return null;
  }
}

export async function createCapiConfig(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...capiConfigToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(CONFIGS).insert(payload).select("*").single();
    if (error) {
      console.error("[capi.createConfig]", error.message);
      return null;
    }
    return normalizeCapiConfig(data);
  } catch (e) {
    console.error("[capi.createConfig]", e);
    return null;
  }
}

export async function updateCapiConfig(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(CONFIGS)
      .update(capiConfigToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[capi.updateConfig]", error.message);
      return null;
    }
    return normalizeCapiConfig(data);
  } catch (e) {
    console.error("[capi.updateConfig]", e);
    return null;
  }
}

export async function softDeleteCapiConfig(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(CONFIGS)
      .update({ deleted_at: new Date().toISOString(), status: "paused" })
      .eq("id", id);
    if (error) {
      console.error("[capi.deleteConfig]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[capi.deleteConfig]", e);
    return false;
  }
}

// Filters: { configId, status, limit }.
export async function listCapiEvents(projectId, { configId, status, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(EVENTS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (configId) query = query.eq("capi_config_id", configId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[capi.listEvents]", error.message);
      return null;
    }
    return (data || []).map(normalizeCapiEvent);
  } catch (e) {
    console.error("[capi.listEvents]", e);
    return null;
  }
}
