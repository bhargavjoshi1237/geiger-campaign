"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.send_time_settings — one row per project with the send-time optimization
// defaults the delivery engine applies (strategy, fallback hour, optimization window, minimum history).
// Pure: console.error on failure and return null / false — never throw, never toast.

const TABLE = "send_time_settings";

export const SEND_TIME_DEFAULTS = Object.freeze({
  enabled: false,
  strategy: "optimized",
  fallbackHour: 10,
  windowHours: 24,
  minOpens: 2,
  localTime: "09:00",
});

export function normalizeSendTimeSettings(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    enabled: !!row.enabled,
    strategy: row.strategy === "timezone" ? "timezone" : "optimized",
    fallbackHour: Number(row.fallback_hour ?? SEND_TIME_DEFAULTS.fallbackHour),
    windowHours: Number(row.window_hours ?? SEND_TIME_DEFAULTS.windowHours),
    minOpens: Number(row.min_opens ?? SEND_TIME_DEFAULTS.minOpens),
    localTime: row.local_time || SEND_TIME_DEFAULTS.localTime,
    updatedAt: row.updated_at ?? null,
  };
}

export function sendTimeSettingsToRow(input) {
  const row = {};
  if ("enabled" in input) row.enabled = !!input.enabled;
  if ("strategy" in input) row.strategy = input.strategy === "timezone" ? "timezone" : "optimized";
  if ("fallbackHour" in input) row.fallback_hour = Math.min(23, Math.max(0, Math.round(Number(input.fallbackHour) || 0)));
  if ("windowHours" in input) row.window_hours = Math.min(72, Math.max(1, Math.round(Number(input.windowHours) || 24)));
  if ("minOpens" in input) row.min_opens = Math.min(20, Math.max(1, Math.round(Number(input.minOpens) || 2)));
  if ("localTime" in input && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.localTime))) row.local_time = input.localTime;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  return row;
}

// The project's settings, the defaults when none are saved yet, or null when the read failed.
export async function getSendTimeSettings(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[send_time_settings.get]", error.message);
      return null;
    }
    return data ? normalizeSendTimeSettings(data) : { ...SEND_TIME_DEFAULTS, id: null, projectId, updatedAt: null };
  } catch (e) {
    console.error("[send_time_settings.get]", e);
    return null;
  }
}

// Upserts the project's row with a partial patch; returns the saved settings or null.
export async function saveSendTimeSettings(projectId, patch) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .upsert({ ...sendTimeSettingsToRow(patch), project_id: projectId }, { onConflict: "project_id" })
      .select("*")
      .single();
    if (error) {
      console.error("[send_time_settings.save]", error.message);
      return null;
    }
    return normalizeSendTimeSettings(data);
  } catch (e) {
    console.error("[send_time_settings.save]", e);
    return null;
  }
}
