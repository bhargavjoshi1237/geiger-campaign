"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.community_posts — Telegram posts the bot publishes (mode "automated") and
// WhatsApp / Instagram channel posts a person publishes after a reminder (mode "manual_assist").
// Publishing to Telegram goes through the communities API; plans, edits and "mark as posted" are
// written here. Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "community_posts";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeCommunityPost(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    channelId: row.channel_id ?? null,
    body: row.body ?? "",
    media: list(row.media),
    buttons: list(row.buttons),
    options: bag(row.options),
    status: row.status ?? "draft",
    mode: row.mode ?? "automated",
    scheduledAt: row.scheduled_at ?? null,
    postedAt: row.posted_at ?? null,
    externalMessageId: row.external_message_id ?? null,
    assigneeId: row.assignee_id ?? null,
    views: Number(row.views ?? 0),
    reactions: Number(row.reactions ?? 0),
    error: row.error ?? null,
    reminderSentAt: row.reminder_sent_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function communityPostToRow(input) {
  const row = {};
  const map = {
    channelId: "channel_id",
    status: "status",
    mode: "mode",
    externalMessageId: "external_message_id",
    assigneeId: "assignee_id",
    error: "error",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("body" in input) row.body = String(input.body ?? "");
  if ("media" in input) row.media = list(input.media);
  if ("buttons" in input) row.buttons = list(input.buttons);
  if ("options" in input) row.options = bag(input.options);
  if ("scheduledAt" in input) row.scheduled_at = input.scheduledAt || null;
  if ("postedAt" in input) row.posted_at = input.postedAt || null;
  if ("reminderSentAt" in input) row.reminder_sent_at = input.reminderSentAt || null;
  if ("views" in input) row.views = Math.max(0, Math.round(Number(input.views) || 0));
  if ("reactions" in input) row.reactions = Math.max(0, Math.round(Number(input.reactions) || 0));
  if ("metadata" in input) row.metadata = bag(input.metadata);
  // A re-planned post must be claimable by the worker again.
  if ("status" in input || "scheduledAt" in input) row.claimed_at = null;
  return row;
}

// Filters: { channelId, channelIds, statuses, limit }.
export async function listCommunityPosts(projectId, { channelId, channelIds, statuses, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (channelId) query = query.eq("channel_id", channelId);
    if (Array.isArray(channelIds) && channelIds.length) query = query.in("channel_id", channelIds);
    if (Array.isArray(statuses) && statuses.length) query = query.in("status", statuses);
    const { data, error } = await query;
    if (error) {
      console.error("[community_posts.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCommunityPost);
  } catch (e) {
    console.error("[community_posts.list]", e);
    return null;
  }
}

export async function createCommunityPost(projectId, input) {
  if (!projectId || !input?.channelId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      status: "draft",
      mode: "automated",
      media: [],
      buttons: [],
      options: {},
      views: 0,
      reactions: 0,
      ...communityPostToRow(input),
      project_id: projectId,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[community_posts.create]", error.message);
      return null;
    }
    return normalizeCommunityPost(data);
  } catch (e) {
    console.error("[community_posts.create]", e);
    return null;
  }
}

export async function updateCommunityPost(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(communityPostToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[community_posts.update]", error.message);
      return null;
    }
    return normalizeCommunityPost(data);
  } catch (e) {
    console.error("[community_posts.update]", e);
    return null;
  }
}

// Shallow-merges keys into the post's metadata bag (e.g. the live post URL once a person published it).
export async function mergeCommunityPostMeta(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("merge_meta", { p_table: TABLE, p_id: id, p_patch: bag(patch) });
    if (error) {
      console.error("[community_posts.mergeMeta]", error.message);
      return null;
    }
    return bag(data);
  } catch (e) {
    console.error("[community_posts.mergeMeta]", e);
    return null;
  }
}

export async function softDeleteCommunityPost(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[community_posts.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[community_posts.delete]", e);
    return false;
  }
}
