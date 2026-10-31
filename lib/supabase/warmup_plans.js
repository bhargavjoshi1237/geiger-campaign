"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.warmup_plans — daily send-cap schedules for a new IP or messaging number.
// The cap is enforced server-side by lib/deliverability/warmup.js#getDailySendCap; this file owns CRUD.
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "warmup_plans";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeWarmupPlan(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    channel: row.channel ?? "email",
    connectionId: row.connection_id ?? null,
    ip: row.ip ?? "",
    curve: row.curve ?? "standard",
    targetVolume: Number(row.target_volume ?? 0),
    startDate: row.start_date ?? null,
    schedule: Array.isArray(row.schedule) ? row.schedule : [],
    status: row.status ?? "active",
    pausedAt: row.paused_at ?? null,
    completedAt: row.completed_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function warmupPlanToRow(input) {
  const row = {};
  const map = { name: "name", channel: "channel", connectionId: "connection_id", curve: "curve", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("ip" in input) row.ip = String(input.ip || "").trim() || null;
  if ("targetVolume" in input) row.target_volume = Math.max(0, Math.round(Number(input.targetVolume) || 0));
  if ("startDate" in input) row.start_date = input.startDate || null;
  if ("schedule" in input) row.schedule = Array.isArray(input.schedule) ? input.schedule : [];
  if ("pausedAt" in input) row.paused_at = input.pausedAt || null;
  if ("completedAt" in input) row.completed_at = input.completedAt || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listWarmupPlans(projectId, { channel } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (channel) query = query.eq("channel", channel);
    const { data, error } = await query;
    if (error) {
      console.error("[warmup_plans.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeWarmupPlan);
  } catch (e) {
    console.error("[warmup_plans.list]", e);
    return null;
  }
}

export async function getWarmupPlan(projectId, id) {
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
      console.error("[warmup_plans.get]", error.message);
      return null;
    }
    return normalizeWarmupPlan(data);
  } catch (e) {
    console.error("[warmup_plans.get]", e);
    return null;
  }
}

export async function createWarmupPlan(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...warmupPlanToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[warmup_plans.create]", error.message);
      return null;
    }
    return normalizeWarmupPlan(data);
  } catch (e) {
    console.error("[warmup_plans.create]", e);
    return null;
  }
}

export async function updateWarmupPlan(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(warmupPlanToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[warmup_plans.update]", error.message);
      return null;
    }
    return normalizeWarmupPlan(data);
  } catch (e) {
    console.error("[warmup_plans.update]", e);
    return null;
  }
}

export async function softDeleteWarmupPlan(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[warmup_plans.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[warmup_plans.delete]", e);
    return false;
  }
}
