"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.member_snapshots — a channel's follower count over time. Telegram counts are
// captured by the server (getChatMemberCount); WhatsApp and Instagram counts are entered by hand here,
// since neither platform exposes channel follower counts through an API.
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "member_snapshots";

export function normalizeMemberSnapshot(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    channelId: row.channel_id ?? null,
    count: Number(row.count ?? 0),
    capturedAt: row.captured_at ?? row.created_at ?? null,
    source: row.source ?? "manual",
    note: row.note ?? "",
    createdBy: row.created_by ?? null,
  };
}

// Oldest first. Filters: { channelId, channelIds, since, limit }.
export async function listMemberSnapshots(projectId, { channelId, channelIds, since, limit = 5000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("captured_at", { ascending: true })
      .limit(limit);
    if (channelId) query = query.eq("channel_id", channelId);
    if (Array.isArray(channelIds) && channelIds.length) query = query.in("channel_id", channelIds);
    if (since) query = query.gte("captured_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[member_snapshots.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeMemberSnapshot);
  } catch (e) {
    console.error("[member_snapshots.list]", e);
    return null;
  }
}

export async function createMemberSnapshot(projectId, input) {
  if (!projectId || !input?.channelId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      project_id: projectId,
      channel_id: input.channelId,
      count: Math.max(0, Math.round(Number(input.count) || 0)),
      captured_at: input.capturedAt || new Date().toISOString(),
      source: "manual",
      note: String(input.note || "").trim(),
      created_by: input.createdBy ?? null,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[member_snapshots.create]", error.message);
      return null;
    }
    return normalizeMemberSnapshot(data);
  } catch (e) {
    console.error("[member_snapshots.create]", e);
    return null;
  }
}

export async function softDeleteMemberSnapshot(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[member_snapshots.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[member_snapshots.delete]", e);
    return false;
  }
}
