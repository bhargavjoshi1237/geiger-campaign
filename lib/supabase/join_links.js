"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.join_links — /j/<slug> growth CTAs for community channels. Links are created
// and revoked through the communities API (slugs are deployment-unique and Telegram links are real
// invite links); renames and UTM edits are written here. Click / join counters are server-written.
// Pure: console.error on failure and return null / false / [] — never throw, never toast.

const TABLE = "join_links";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// The public short URL people click (absolute in the browser).
export function joinLinkUrl(slug) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${BASE_PATH}/j/${slug}`;
}

export function normalizeJoinLink(row) {
  if (!row) return null;
  const utm = bag(row.utm);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    channelId: row.channel_id ?? null,
    slug: row.slug ?? "",
    name: row.name || row.slug || "Join link",
    platformUrl: row.platform_url ?? "",
    utm,
    source: utm.source ?? "",
    clicks: Number(row.clicks ?? 0),
    joins: Number(row.joins ?? 0),
    lastClickAt: row.last_click_at ?? null,
    lastJoinAt: row.last_join_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    shortUrl: row.slug ? joinLinkUrl(row.slug) : "",
  };
}

export function joinLinkToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim();
  if ("utm" in input) row.utm = bag(input.utm);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { channelId, channelIds }.
export async function listJoinLinks(projectId, { channelId, channelIds } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (channelId) query = query.eq("channel_id", channelId);
    if (Array.isArray(channelIds) && channelIds.length) query = query.in("channel_id", channelIds);
    const { data, error } = await query;
    if (error) {
      console.error("[join_links.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeJoinLink);
  } catch (e) {
    console.error("[join_links.list]", e);
    return null;
  }
}

export async function updateJoinLink(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(joinLinkToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[join_links.update]", error.message);
      return null;
    }
    return normalizeJoinLink(data);
  } catch (e) {
    console.error("[join_links.update]", e);
    return null;
  }
}
