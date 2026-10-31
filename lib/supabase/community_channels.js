"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.community_channels — Telegram channels/groups (linked to a bot connection) and
// manual-assist WhatsApp Channels / Instagram broadcast channels. Telegram rows are linked through the
// communities API (the server verifies the bot's admin rights); manual rows are written here directly.
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "community_channels";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeCommunityChannel(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    platform: row.platform ?? "telegram_channel",
    connectionId: row.connection_id ?? null,
    externalChatId: row.external_chat_id ?? null,
    name: row.name || "Untitled channel",
    handle: row.handle ?? "",
    inviteUrl: row.invite_url ?? "",
    followerCount: Number(row.follower_count ?? 0),
    status: row.status ?? "active",
    settings: bag(row.settings),
    lastSyncedAt: row.last_synced_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// camelCase patch -> snake_case columns; a column is emitted only when its key is present.
export function communityChannelToRow(input) {
  const row = {};
  const map = {
    platform: "platform",
    connectionId: "connection_id",
    externalChatId: "external_chat_id",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("name" in input) row.name = String(input.name || "").trim();
  if ("handle" in input) row.handle = String(input.handle || "").trim();
  if ("inviteUrl" in input) row.invite_url = String(input.inviteUrl || "").trim();
  if ("followerCount" in input) row.follower_count = Math.max(0, Math.round(Number(input.followerCount) || 0));
  if ("settings" in input) row.settings = bag(input.settings);
  if ("lastSyncedAt" in input) row.last_synced_at = input.lastSyncedAt || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { platform | platforms, includePending }. Pending rows are chats a bot was added to but nobody linked yet.
export async function listCommunityChannels(projectId, { platform, platforms, includePending = false } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (platform) query = query.eq("platform", platform);
    if (Array.isArray(platforms) && platforms.length) query = query.in("platform", platforms);
    if (!includePending) query = query.in("status", ["active", "error"]);
    const { data, error } = await query;
    if (error) {
      console.error("[community_channels.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCommunityChannel);
  } catch (e) {
    console.error("[community_channels.list]", e);
    return null;
  }
}

export async function getCommunityChannel(projectId, id) {
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
      console.error("[community_channels.get]", error.message);
      return null;
    }
    return normalizeCommunityChannel(data);
  } catch (e) {
    console.error("[community_channels.get]", e);
    return null;
  }
}

export async function createCommunityChannel(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { status: "active", settings: {}, follower_count: 0, ...communityChannelToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[community_channels.create]", error.message);
      return null;
    }
    return normalizeCommunityChannel(data);
  } catch (e) {
    console.error("[community_channels.create]", e);
    return null;
  }
}

export async function updateCommunityChannel(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(communityChannelToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[community_channels.update]", error.message);
      return null;
    }
    return normalizeCommunityChannel(data);
  } catch (e) {
    console.error("[community_channels.update]", e);
    return null;
  }
}

export async function softDeleteCommunityChannel(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[community_channels.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[community_channels.delete]", e);
    return false;
  }
}
