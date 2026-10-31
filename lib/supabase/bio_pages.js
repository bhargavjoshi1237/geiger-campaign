"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.bio_pages + campaign.bio_links — link-in-bio pages served publicly at /bio/<slug>,
// with click counts written by the public redirect (the theme comes from the brand kit, read through
// lib/supabase/brand_kits.js). Pure: console.error on failure and return null / false / [].

const PAGES = "bio_pages";
const LINKS = "bio_links";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function normalizeBioPage(row) {
  if (!row) return null;
  const theme = bag(row.theme);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    slug: row.slug ?? "",
    title: row.title ?? "",
    bio: row.bio ?? "",
    avatarUrl: row.avatar_url ?? "",
    theme: { useBrandKit: theme.useBrandKit !== false, buttonStyle: theme.buttonStyle === "outline" ? "outline" : "solid" },
    status: row.status ?? "draft",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function bioPageToRow(input) {
  const row = {};
  if ("slug" in input) row.slug = slugify(input.slug);
  if ("title" in input) row.title = String(input.title || "");
  if ("bio" in input) row.bio = String(input.bio || "");
  if ("avatarUrl" in input) row.avatar_url = String(input.avatarUrl || "");
  if ("theme" in input) row.theme = bag(input.theme);
  if ("status" in input) row.status = input.status === "published" ? "published" : "draft";
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeBioLink(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    pageId: row.page_id,
    label: row.label ?? "",
    url: row.url ?? "",
    position: Number(row.position ?? 0),
    active: row.active !== false,
    clicks: Number(row.clicks ?? 0),
    createdAt: row.created_at ?? null,
  };
}

export function bioLinkToRow(input) {
  const row = {};
  if ("label" in input) row.label = String(input.label || "");
  if ("url" in input) row.url = String(input.url || "").trim();
  if ("position" in input) row.position = Number(input.position) || 0;
  if ("active" in input) row.active = Boolean(input.active);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listBioPages(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(PAGES)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[bio_pages.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeBioPage);
  } catch (e) {
    console.error("[bio_pages.list]", e);
    return null;
  }
}

export async function createBioPage(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...bioPageToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(PAGES).insert(payload).select("*").single();
    if (error) {
      console.error("[bio_pages.create]", error.message);
      return null;
    }
    return normalizeBioPage(data);
  } catch (e) {
    console.error("[bio_pages.create]", e);
    return null;
  }
}

export async function updateBioPage(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(PAGES)
      .update(bioPageToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[bio_pages.update]", error.message);
      return null;
    }
    return normalizeBioPage(data);
  } catch (e) {
    console.error("[bio_pages.update]", e);
    return null;
  }
}

export async function softDeleteBioPage(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const now = new Date().toISOString();
    const { error } = await schemaClient().from(PAGES).update({ deleted_at: now }).eq("id", id);
    if (error) {
      console.error("[bio_pages.delete]", error.message);
      return false;
    }
    await schemaClient().from(LINKS).update({ deleted_at: now }).eq("page_id", id).is("deleted_at", null);
    return true;
  } catch (e) {
    console.error("[bio_pages.delete]", e);
    return false;
  }
}

// False when a page this member can see already uses the slug; the global unique index is the final check.
export async function isSlugAvailable(slug, exceptId = null) {
  if (!slug || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient().from(PAGES).select("id").eq("slug", slugify(slug)).is("deleted_at", null).limit(1);
    if (exceptId) query = query.neq("id", exceptId);
    const { data, error } = await query;
    if (error) {
      console.error("[bio_pages.slug]", error.message);
      return null;
    }
    return !(data || []).length;
  } catch (e) {
    console.error("[bio_pages.slug]", e);
    return null;
  }
}

export async function listBioLinks(projectId, { pageId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(LINKS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("position", { ascending: true });
    if (pageId) query = query.eq("page_id", pageId);
    const { data, error } = await query;
    if (error) {
      console.error("[bio_pages.links]", error.message);
      return null;
    }
    return (data || []).map(normalizeBioLink);
  } catch (e) {
    console.error("[bio_pages.links]", e);
    return null;
  }
}

export async function createBioLink(projectId, pageId, input) {
  if (!projectId || !pageId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...bioLinkToRow(input), project_id: projectId, page_id: pageId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(LINKS).insert(payload).select("*").single();
    if (error) {
      console.error("[bio_pages.createLink]", error.message);
      return null;
    }
    return normalizeBioLink(data);
  } catch (e) {
    console.error("[bio_pages.createLink]", e);
    return null;
  }
}

export async function updateBioLink(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(LINKS)
      .update(bioLinkToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[bio_pages.updateLink]", error.message);
      return null;
    }
    return normalizeBioLink(data);
  } catch (e) {
    console.error("[bio_pages.updateLink]", e);
    return null;
  }
}

export async function softDeleteBioLink(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(LINKS).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[bio_pages.deleteLink]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[bio_pages.deleteLink]", e);
    return false;
  }
}
