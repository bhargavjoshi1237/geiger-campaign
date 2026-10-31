"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.creators — the project's own creator database (discovery, outreach,
// collaborations, affiliate links). Audience metrics come from Instagram business discovery (server
// route) or manual entry. Pure: console.error on failure and return null / false / [].

const TABLE = "creators";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function normalizeCreator(row) {
  if (!row) return null;
  const audience = bag(row.audience);
  const rateCard = bag(row.rate_card);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name || "Unnamed creator",
    email: row.email ?? "",
    handles: bag(row.handles),
    niches: Array.isArray(row.niches) ? row.niches : [],
    location: row.location ?? "",
    avatarUrl: row.avatar_url ?? "",
    audience: {
      ...audience,
      network: audience.network || "instagram",
      followers: num(audience.followers),
      engagementRate: num(audience.engagementRate),
      avgLikes: num(audience.avgLikes),
      avgComments: num(audience.avgComments),
      mediaCount: num(audience.mediaCount),
      source: audience.source || null,
      refreshedAt: audience.refreshedAt || null,
      recentPosts: Array.isArray(audience.recentPosts) ? audience.recentPosts : [],
    },
    status: row.status ?? "prospect",
    rateCard: { currency: rateCard.currency || "USD", items: Array.isArray(rateCard.items) ? rateCard.items : [] },
    contactId: row.contact_id ?? null,
    notes: row.notes ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// The primary handle to show in lists: Instagram first, then any other network.
export function primaryHandle(creator) {
  const handles = bag(creator?.handles);
  const network = ["instagram", "tiktok", "youtube", "x", "twitch"].find((n) => handles[n]);
  return network ? { network, handle: handles[network] } : null;
}

export function creatorToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim();
  if ("email" in input) row.email = String(input.email || "").trim().toLowerCase() || null;
  if ("handles" in input) {
    const handles = {};
    for (const [k, v] of Object.entries(bag(input.handles))) {
      const clean = String(v || "").trim().replace(/^@+/, "");
      if (clean) handles[k] = k === "website" ? clean : clean.toLowerCase();
    }
    row.handles = handles;
  }
  if ("niches" in input) {
    row.niches = [...new Set((Array.isArray(input.niches) ? input.niches : []).map((n) => String(n).trim().toLowerCase()).filter(Boolean))];
  }
  if ("location" in input) row.location = String(input.location || "").trim();
  if ("avatarUrl" in input) row.avatar_url = input.avatarUrl || null;
  if ("audience" in input) row.audience = bag(input.audience);
  if ("status" in input) row.status = input.status || "prospect";
  if ("rateCard" in input) row.rate_card = bag(input.rateCard);
  if ("contactId" in input) row.contact_id = input.contactId || null;
  if ("notes" in input) row.notes = String(input.notes ?? "");
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listCreators(projectId, { limit = 2000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[creators.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCreator);
  } catch (e) {
    console.error("[creators.list]", e);
    return null;
  }
}

export async function getCreator(projectId, id) {
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
      console.error("[creators.get]", error.message);
      return null;
    }
    return normalizeCreator(data);
  } catch (e) {
    console.error("[creators.get]", e);
    return null;
  }
}

export async function createCreator(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...creatorToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[creators.create]", error.message);
      return null;
    }
    return normalizeCreator(data);
  } catch (e) {
    console.error("[creators.create]", e);
    return null;
  }
}

export async function updateCreator(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(creatorToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[creators.update]", error.message);
      return null;
    }
    return normalizeCreator(data);
  } catch (e) {
    console.error("[creators.update]", e);
    return null;
  }
}

export async function softDeleteCreator(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[creators.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[creators.delete]", e);
    return false;
  }
}
